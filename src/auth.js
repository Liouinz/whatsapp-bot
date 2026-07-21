// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.
// Gotcha: app-state-sync-key muss beim Laden über proto.…fromObject rekonstruiert werden.

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { getDb } from './db.js';

export async function useTursoAuthState(session = 'main') {
  const db = getDb();

  // Alle angefragten Keys in EINER Query holen — Turso ist eine Netzwerk-DB,
  // pro Key eine eigene Query würde jede Ver-/Entschlüsselung um einen vollen
  // Roundtrip pro Gerät ausbremsen (Gruppen-Sends fragen dutzende Keys ab).
  const readKeys = async (fullIds) => {
    const out = new Map();
    for (let i = 0; i < fullIds.length; i += 100) {
      const chunk = fullIds.slice(i, i + 100);
      const res = await db.execute({
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
    const res = await db.execute({
      sql: 'SELECT data FROM auth_creds WHERE id = ?',
      args: [session],
    });
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
          // Gebündelt in einem einzigen Batch-Roundtrip statt einer Query pro Key
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
          if (stmts.length) await db.batch(stmts, 'write');
        },
      },
    },

    saveCreds: async () => {
      await db.execute({
        sql: 'INSERT OR REPLACE INTO auth_creds (id, data) VALUES (?, ?)',
        args: [session, JSON.stringify(creds, BufferJSON.replacer)],
      });
    },

    /** Session komplett löschen (411 badSession / 401 loggedOut) → frischer QR. */
    clearSession: async () => {
      await db.execute({ sql: 'DELETE FROM auth_creds WHERE id = ?', args: [session] });
      await db.execute({
        sql: 'DELETE FROM auth_keys WHERE id LIKE ?',
        args: [`${session}:%`],
      });
    },
  };
}
