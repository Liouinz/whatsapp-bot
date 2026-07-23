// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.
//
// UPDATE v2: Robusterer RAM-Cache.
// Keys werden sofort in den RAM (keyCache) geschrieben und gelesen.
// Datenbank-Schreibvorgänge werden gebündelt (pendingWrites) und kurz
// zeitverzögert an Turso geschickt, um Rate-Limits zu vermeiden.
//
// Fixes gegenüber v1 (Ursache für "Bad MAC" / beschädigte Sessions):
// 1. flush() wird bei Prozessende (SIGTERM/SIGINT/beforeExit) erzwungen,
//    sonst gehen gepufferte Key-Writes bei jedem Render-Redeploy verloren.
// 2. Delay von 3000ms auf 800ms reduziert — kleineres Zeitfenster, in dem
//    Daten bei einem Crash verloren gehen können.
// 3. pendingWrites werden erst NACH erfolgreichem Batch-Write gelöscht.
//    Schlägt der Batch fehl, bleiben die Einträge erhalten und werden
//    beim nächsten Flush erneut versucht statt stillschweigend verworfen.
// 4. flushPendingWrites() kann jetzt von außen (z.B. vor einem geplanten
//    Reconnect im Watchdog) manuell angestoßen werden: state.flush().

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { getDb } from './db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FLUSH_DELAY_MS = 800; // vorher 3000ms — kleineres Datenverlust-Fenster

/** DB-Operation mit kurzem Retry (transiente Netz-/Turso-Aussetzer abfangen). */
async function withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(250 * (i + 1)); // 250 → 500 → 750 → 1000 ms
    }
  }
  throw lastErr;
}

export async function useTursoAuthState(session = 'main') {
  const db = getDb();
  const exec = (arg) => withRetry(() => db.execute(arg));
  const batch = (stmts) => withRetry(() => db.batch(stmts, 'write'));

  // --- RAM CACHE LOGIK ---
  const keyCache = new Map();
  const pendingWrites = new Map();
  let writeTimeout = null;
  let flushing = false; // verhindert überlappende Flushes

  const flushPendingWrites = async () => {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
    }
    if (pendingWrites.size === 0 || flushing) return;
    flushing = true;

    // WICHTIG: Wir lesen nur (kein clear()!), damit bei einem Fehler
    // im Batch-Write nichts verloren geht — Entfernen passiert erst danach.
    const currentWrites = new Map(pendingWrites);
    const stmts = [];

    for (const [keyId, value] of currentWrites.entries()) {
      stmts.push(
        value
          ? {
              sql: 'INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)',
              args: [`${session}:${keyId}`, JSON.stringify(value, BufferJSON.replacer)],
            }
          : { sql: 'DELETE FROM auth_keys WHERE id = ?', args: [`${session}:${keyId}`] }
      );
    }

    try {
      if (stmts.length) {
        await batch(stmts);
      }
      // Nur die Einträge entfernen, die wir gerade erfolgreich geschrieben haben —
      // falls währenddessen neue Writes reingekommen sind, bleiben die erhalten.
      for (const keyId of currentWrites.keys()) {
        if (pendingWrites.get(keyId) === currentWrites.get(keyId)) {
          pendingWrites.delete(keyId);
        }
      }
    } catch (err) {
      console.error('⚠️ Fehler beim Turso-Batch-Write, Retry beim nächsten Flush:', err);
      // pendingWrites bleibt unverändert -> nächster Flush versucht es erneut
    } finally {
      flushing = false;
    }
  };

  const scheduleFlush = () => {
    if (!writeTimeout) {
      writeTimeout = setTimeout(() => {
        writeTimeout = null;
        flushPendingWrites();
      }, FLUSH_DELAY_MS);
    }
  };

  // Bei Prozessende auf jeden Fall flushen, sonst gehen gepufferte
  // Key-Writes bei Render-Redeploy/Crash/Neustart verloren.
  const flushOnExit = async () => {
    await flushPendingWrites();
  };
  process.on('SIGTERM', async () => {
    await flushOnExit();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await flushOnExit();
    process.exit(0);
  });
  process.on('beforeExit', flushOnExit);
  // ---------------------------------

  const readKeys = async (fullIds) => {
    const out = new Map();
    for (let i = 0; i < fullIds.length; i += 100) {
      const chunk = fullIds.slice(i, i + 100);
      const res = await exec({
        sql: `SELECT id, data FROM auth_keys WHERE id IN (${chunk.map(() => '?').join(', ')})`,
        args: chunk.map((id) => `${session}:${id}`),
      });
      for (const row of res.rows) {
        out.set(String(row.id).slice(session.length + 1), JSON.parse(row.data, BufferJSON.reviver));
      }
    }
    return out;
  };

  const readCreds = async () => {
    const res = await exec({ sql: 'SELECT data FROM auth_creds WHERE id = ?', args: [session] });
    return res.rows.length ? JSON.parse(res.rows[0].data, BufferJSON.reviver) : null;
  };

  const creds = (await readCreds()) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          const missingIds = [];

          // 1. Keys blitzschnell aus dem RAM holen
          for (const id of ids) {
            const keyId = `${type}-${id}`;
            if (keyCache.has(keyId)) {
              let value = keyCache.get(keyId);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            } else {
              missingIds.push(id);
            }
          }

          // 2. Nur fehlende Keys aus Turso nachladen und im RAM abspeichern
          if (missingIds.length > 0) {
            const found = await readKeys(missingIds.map((id) => `${type}-${id}`));
            for (const id of missingIds) {
              const keyId = `${type}-${id}`;
              let value = found.get(keyId) ?? null;

              if (value) keyCache.set(keyId, value);

              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }
          }
          return data;
        },
        set: async (data) => {
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const keyId = `${type}-${id}`;
              const value = data[type][id];

              // Sofort im RAM aktualisieren
              if (value) {
                keyCache.set(keyId, value);
              } else {
                keyCache.delete(keyId);
              }

              // Für Turso vormerken
              pendingWrites.set(keyId, value);
            }
          }

          scheduleFlush();
        },
      },
    },

    saveCreds: async () => {
      await exec({
        sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)',
        args: [session, JSON.stringify(creds, BufferJSON.replacer)],
      });
    },

    // Manuell von außen aufrufbar, z.B. im Watchdog kurz VOR einem geplanten
    // Reconnect-Versuch, damit keine offenen Writes im Buffer stehen bleiben.
    flush: flushPendingWrites,

    clearSession: async () => {
      keyCache.clear();
      pendingWrites.clear();
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }

      await exec({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [session] });
      await exec({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${session}:%`] });
    },
  };
}
