// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.
// 
// UPDATE: Integrierter RAM-Cache! 
// Keys werden sofort in den RAM (keyCache) geschrieben und blitzschnell gelesen.
// Datenbank-Schreibvorgänge werden gebündelt (pendingWrites) und zeitverzögert
// an Turso geschickt, um Rate-Limits und "Bad MAC"-Fehler zu verhindern.

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { getDb } from './db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** DB-Operation mit kurzem Retry (transiente Netz-/Turso-Aussetzer abfangen). */
async function withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(250 * (i + 1)); // 250 → 500 → 750 ms
    }
  }
  throw lastErr;
}

export async function useTursoAuthState(session = 'main') {
  const db = getDb();
  const exec = (arg) => withRetry(() => db.execute(arg));
  const batch = (stmts) => withRetry(() => db.batch(stmts, 'write'));

  // --- RAM CACHE LOGIK ---
  const keyCache = new Map();      // Speichert alle bekannten Keys blitzschnell im RAM
  const pendingWrites = new Map(); // Sammelt alle Keys, die noch in Turso gespeichert werden müssen
  let writeTimeout = null;

  const flushPendingWrites = async () => {
    if (pendingWrites.size === 0) return;
    
    const stmts = [];
    // pendingWrites leeren und in lokale Variable kopieren (verhindert Race-Conditions)
    const currentWrites = new Map(pendingWrites);
    pendingWrites.clear();

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

    if (stmts.length) {
      // Gebündelt an Turso schicken
      await batch(stmts).catch(err => console.error("⚠️ Fehler beim Turso-Batch-Write:", err));
    }
  };
  // -----------------------

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

          // 1. Zuerst schauen, ob der Key schon im RAM (keyCache) liegt
          for (const id of ids) {
            const keyId = `${type}-${id}`;
            if (keyCache.has(keyId)) {
              let value = keyCache.get(keyId);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            } else {
              missingIds.push(id); // Falls nicht, für Datenbankabfrage vormerken
            }
          }

          // 2. Fehlende Keys aus Turso nachladen und im RAM abspeichern
          if (missingIds.length > 0) {
            const found = await readKeys(missingIds.map((id) => `${type}-${id}`));
            for (const id of missingIds) {
              const keyId = `${type}-${id}`;
              let value = found.get(keyId) ?? null;
              
              if (value) keyCache.set(keyId, value); // Direkt für das nächste Mal cachen

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

              // 1. Sofort in den RAM-Cache schreiben oder daraus löschen
              if (value) {
                keyCache.set(keyId, value);
              } else {
                keyCache.delete(keyId);
              }

              // 2. Für den Turso-Batch-Upload vormerken
              pendingWrites.set(keyId, value);
            }
          }

          // 3. Datenbank-Schreibvorgang um 3 Sekunden verzögern (Debounce)
          if (!writeTimeout) {
            writeTimeout = setTimeout(async () => {
              writeTimeout = null;
              await flushPendingWrites();
            }, 3000); // Wartet 3 Sekunden, sammelt alle Updates und feuert sie auf einmal ab
          }
        },
      },
    },

    // Creds nach JEDER Änderung sichern (wird seltener aufgerufen, daher direkt)
    saveCreds: async () => {
      await exec({
        sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)',
        args: [session, JSON.stringify(creds, BufferJSON.replacer)],
      });
    },

    /** Session komplett löschen (401 loggedOut / 500 badSession / 411) → frischer QR. */
    clearSession: async () => {
      keyCache.clear();
      pendingWrites.clear();
      if (writeTimeout) clearTimeout(writeTimeout);
      
      await exec({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [session] });
      await exec({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${session}:%`] });
    },
  };
}
