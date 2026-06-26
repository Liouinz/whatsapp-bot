'use strict';

const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

/**
 * Baileys-Auth-State, der Creds + Signal-Keys in der (libSQL/Turso-)DB ablegt,
 * statt in Dateien (useMultiFileAuthState). So übersteht die Session
 * Render-Neustarts ohne neuen QR-Code.
 *
 * Gotchas (Pflicht):
 *  - BufferJSON.replacer/reviver beim Serialisieren — sonst gehen Buffer kaputt.
 *  - app-state-sync-key muss beim Lesen über proto.…fromObject rekonstruiert werden.
 */
async function useTursoAuthState(db, session = 'main') {
  await db.execute('CREATE TABLE IF NOT EXISTS auth (id TEXT PRIMARY KEY, data TEXT)');

  const k = (id) => `${session}:${id}`;

  const write = (id, value) =>
    db.execute({
      sql: 'INSERT OR REPLACE INTO auth (id, data) VALUES (?, ?)',
      args: [k(id), JSON.stringify(value, BufferJSON.replacer)],
    });

  const read = async (id) => {
    const r = await db.execute({ sql: 'SELECT data FROM auth WHERE id = ?', args: [k(id)] });
    return r.rows.length ? JSON.parse(r.rows[0].data, BufferJSON.reviver) : null;
  };

  const del = (id) => db.execute({ sql: 'DELETE FROM auth WHERE id = ?', args: [k(id)] });

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              tasks.push(value ? write(`${type}-${id}`, value) : del(`${type}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write('creds', creds),
    clearSession: () =>
      db.execute({ sql: 'DELETE FROM auth WHERE id LIKE ?', args: [`${session}:%`] }),
  };
}

module.exports = { useTursoAuthState };
