// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.
// Gotcha: app-state-sync-key muss beim Laden über proto.…fromObject rekonstruiert werden.
//
// STABILITÄT (Ursache der "Bad MAC"-Fehler): Signal-Keys MÜSSEN zuverlässig
// persistiert werden. makeCacheableSignalKeyStore hält Keys im RAM-Cache und
// glaubt einem geworfenen Write nicht an — geht ein Key-Write bei einem
// transienten Turso-Aussetzer verloren, fehlt der Key beim nächsten Reconnect
// → "Bad MAC / Failed to decrypt". Deshalb laufen ALLE Auth-DB-Operationen hier
// über einen kleinen Retry (execute + batch), damit kein Key-Write still verloren geht.

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

  // Alle angefragten Keys in EINER Query holen — Turso ist eine Netzwerk-DB,
  // pro Key eine eigene Query würde jede Ver-/Entschlüsselung um einen vollen
  // Roundtrip pro Gerät ausbremsen (Gruppen-Sends fragen dutzende Keys ab).
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
          const found = await readKeys(ids.map((id) => `${type}-${id}`));
          for (const id of ids) {
            let value = found.get(`${type}-${id}`) ?? null;
            if (type === 'app-state-sync-key' && value) {
              // Pflicht-Gotcha: sonst bricht der App-State-Sync
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          // Gebündelt in einem Batch-Roundtrip — MIT Retry, damit kein
          // Signal-Key-Write still verloren geht (sonst: "Bad MAC").
          const stmts = [];
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const value = data[type][id];
              stmts.push(
                value
                  ? {
                      sql: 'INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)',
                      args: [`${session}:${type}-${id}`, JSON.stringify(value, BufferJSON.replacer)],
                    }
                  : { sql: 'DELETE FROM auth_keys WHERE id = ?', args: [`${session}:${type}-${id}`] }
              );
            }
          }
          if (stmts.length) await batch(stmts);
        },
      },
    },

    // Creds nach JEDER Änderung sichern — mit Retry (verlorene Creds = toter Login).
    saveCreds: async () => {
      await exec({
        sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)',
        args: [session, JSON.stringify(creds, BufferJSON.replacer)],
      });
    },

    /** Session komplett löschen (401 loggedOut / 500 badSession / 411) → frischer QR. */
    clearSession: async () => {
      await exec({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [session] });
      await exec({ sql: 'DELETE FROM auth_keys WHERE id LIKE ?', args: [`${session}:%`] });
    },
  };
}
