'use strict';

/**
 * msg-store.js — Speicher der letzten ~500 eigenen/ausgehenden Nachrichten
 * (Recherche-Block 4), DB-gestützt (übersteht Neustart).
 *
 * Zweck: getMessage-Callback des Sockets für Retry-Auslieferung und
 * Poll-Decrypt → reduziert "failed to decrypt".
 *
 * Speicherung als JSON via BufferJSON (Buffers überstehen Serialisierung).
 */

const { BufferJSON } = require('@whiskeysockets/baileys');
const db = require('./db');
const { logger } = require('./logger');

const MAX = 500;

/** Speichert eine (eigene/ausgehende) Nachricht. id → message. */
async function save(m) {
  try {
    if (!m?.key?.id || !m.message) return;
    const json = JSON.stringify(m.message, BufferJSON.replacer);
    await db.run('INSERT OR REPLACE INTO msg_store (id, msg, at) VALUES (?, ?, ?)', [
      m.key.id,
      json,
      Date.now(),
    ]);
    // Nicht bei jedem Write prunen (Schreiblast) → gelegentlich.
    if (Math.random() < 0.05) await prune();
  } catch (e) {
    logger.warn(`msgStore.save fehlgeschlagen: ${e.message}`);
  }
}

/** Liefert das gespeicherte message-Objekt zu einer id (oder undefined). */
async function get(id) {
  try {
    if (!id) return undefined;
    const row = await db.one('SELECT msg FROM msg_store WHERE id = ?', [id]);
    if (!row?.msg) return undefined;
    return JSON.parse(row.msg, BufferJSON.reviver);
  } catch (e) {
    logger.warn(`msgStore.get fehlgeschlagen: ${e.message}`);
    return undefined;
  }
}

/** Hält die Tabelle auf ~MAX neueste Einträge. */
async function prune(max = MAX) {
  try {
    await db.run(
      'DELETE FROM msg_store WHERE id NOT IN (SELECT id FROM msg_store ORDER BY at DESC LIMIT ?)',
      [max]
    );
  } catch (e) {
    logger.warn(`msgStore.prune fehlgeschlagen: ${e.message}`);
  }
}

module.exports = { save, get, prune, MAX };
