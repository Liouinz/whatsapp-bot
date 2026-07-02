// Turso-Auth-State für Baileys — ersetzt useMultiFileAuthState (TABU auf Render).
// Creds liegen in auth_creds, Signal-Keys in auth_keys. Serialisiert via BufferJSON.
// Gotcha: app-state-sync-key muss beim Laden über proto.…fromObject rekonstruiert werden.

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { getDb } from './db.js';

export async function useTursoAuthState(session = 'main') {
  const db = getDb();

  const writeKey = (id, value) =>
    db.execute({
      sql: 'INSERT OR REPLACE INTO auth_keys (id, data) VALUES (?, ?)',
      args: [`${session}:${id}`, JSON.stringify(value, BufferJSON.replacer)],
    });

  const readKey = async (id) => {
    const res = await db.execute({
      sql: 'SELECT data FROM auth_keys WHERE id = ?',
      args: [`${session}:${id}`],
    });
    return res.rows.length ? JSON.parse(res.rows[0].data, BufferJSON.reviver) : null;
  };

  const deleteKey = (id) =>
    db.execute({ sql: 'DELETE FROM auth_keys WHERE id = ?', args: [`${session}:${id}`] });

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
          await Promise.all(
            ids.map(async (id) => {
              let value = await readKey(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                // Pflicht-Gotcha: sonst bricht der App-State-Sync
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const value = data[type][id];
              tasks.push(value ? writeKey(`${type}-${id}`, value) : deleteKey(`${type}-${id}`));
            }
          }
          await Promise.all(tasks);
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
