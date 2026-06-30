'use strict';

/**
 * auth-turso.js — Baileys-Session in Turso (Ersatz für useMultiFileAuthState).
 *
 * Stolperstein-Bezug (Plan):
 *  - useMultiFileAuthState ist tabu → Session in die DB.
 *  - BufferJSON für (De-)Serialisierung (Buffers überstehen JSON).
 *  - app-state-sync-key-Gotcha: beim Lesen mit
 *    proto.Message.AppStateSyncKeyData.fromObject(value) rekonstruieren.
 *  - Generische Key-Typen über keys.get(type, ids) / keys.set(data).
 *
 * Alle Zugriffe parametrisiert. Lese-Fehler → null (nie crashen);
 * Schreib-Fehler werden geloggt (Phase 5 ergänzt Retry + RAM-Halten).
 */

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const db = require('./db');
const { logger } = require('./logger');

async function readData(id) {
  try {
    const row = await db.one('SELECT data FROM auth WHERE id = ?', [id]);
    if (!row?.data) return null;
    return JSON.parse(row.data, BufferJSON.reviver);
  } catch (e) {
    logger.warn(`auth.readData(${id}) fehlgeschlagen: ${e.message}`);
    return null;
  }
}

async function writeData(id, value) {
  try {
    const data = JSON.stringify(value, BufferJSON.replacer);
    await db.run('INSERT OR REPLACE INTO auth (id, data) VALUES (?, ?)', [id, data]);
  } catch (e) {
    // Sichtbar loggen — verlorene creds wären fatal. Phase 5 härtet mit Retry.
    logger.error(`auth.writeData(${id}) fehlgeschlagen: ${e.message}`);
  }
}

async function removeData(id) {
  try {
    await db.run('DELETE FROM auth WHERE id = ?', [id]);
  } catch (e) {
    logger.warn(`auth.removeData(${id}) fehlgeschlagen: ${e.message}`);
  }
}

/**
 * Liefert { state: { creds, keys }, saveCreds, clearSession }.
 */
async function useTursoAuthState() {
  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              // app-state-sync-key korrekt rekonstruieren.
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              result[id] = value;
            })
          );
          return result;
        },
        set: async (data) => {
          const tasks = [];
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              const name = `${type}-${id}`;
              tasks.push(value ? writeData(name, value) : removeData(name));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearSession: async () => {
      try {
        await db.run('DELETE FROM auth');
        logger.warn('Session in DB gelöscht (clearSession).');
      } catch (e) {
        logger.error(`clearSession fehlgeschlagen: ${e.message}`);
      }
    },
  };
}

module.exports = { useTursoAuthState };
