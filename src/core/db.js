'use strict';

/**
 * db.js — Turso/libSQL-Client + versioniertes Schema (schema_version).
 *
 * - Produktion: DATABASE_URL (+ DATABASE_KEY als authToken) → Turso.
 * - Lokal/Test: ist DATABASE_URL nicht gesetzt, Fallback auf eine lokale
 *   Datei (file:./data/local.db), damit das Gerüst ohne Cloud testbar ist.
 * - Alle Queries laufen ausschließlich PARAMETRISIERT (Sicherheit, Plan).
 * - init() legt alle Tabellen an (idempotent) und schreibt schema_version.
 *
 * Niemals crashen: Aufrufer kapseln in try/catch; init() wirft nur beim
 * harten Start-Fehler (DB unerreichbar), damit der Start klar scheitert.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { logger } = require('./logger');

const SCHEMA_VERSION = 1;

// --- Schema (Plan v7.2, 1:1) -------------------------------------------------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS auth (id TEXT PRIMARY KEY, data TEXT)`,
  `CREATE TABLE IF NOT EXISTS msg_store (id TEXT PRIMARY KEY, msg TEXT, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS groups (jid TEXT PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1, config TEXT)`,
  `CREATE TABLE IF NOT EXISTS warnings (group_jid TEXT, user_jid TEXT, count INTEGER DEFAULT 0, reasons TEXT, last_at INTEGER, PRIMARY KEY(group_jid,user_jid))`,
  `CREATE TABLE IF NOT EXISTS mutes (group_jid TEXT, user_jid TEXT, until INTEGER, reason TEXT, PRIMARY KEY(group_jid,user_jid))`,
  `CREATE TABLE IF NOT EXISTS ban_log (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT, banned_by TEXT, reason TEXT, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS community_bans (parent_jid TEXT, user_jid TEXT, by TEXT, reason TEXT, at INTEGER, PRIMARY KEY(parent_jid,user_jid))`,
  `CREATE TABLE IF NOT EXISTS member_stats (group_jid TEXT, user_jid TEXT, messages INTEGER DEFAULT 0, commands INTEGER DEFAULT 0, warnings INTEGER DEFAULT 0, last_seen INTEGER, PRIMARY KEY(group_jid,user_jid))`,
  `CREATE TABLE IF NOT EXISTS levels (group_jid TEXT, user_jid TEXT, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, last_xp_at INTEGER, PRIMARY KEY(group_jid,user_jid))`,
  `CREATE TABLE IF NOT EXISTS afk (user_jid TEXT PRIMARY KEY, reason TEXT, since INTEGER)`,
  `CREATE TABLE IF NOT EXISTS mod_history (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT, action TEXT, by TEXT, reason TEXT, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS custom_commands (group_jid TEXT, name TEXT, response TEXT, created_by TEXT, PRIMARY KEY(group_jid,name))`,
  `CREATE TABLE IF NOT EXISTS faq (group_jid TEXT, keyword TEXT, response TEXT, PRIMARY KEY(group_jid,keyword))`,
  `CREATE TABLE IF NOT EXISTS scheduled (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, text TEXT, run_at INTEGER, repeat TEXT, created_by TEXT, status TEXT DEFAULT 'pending')`,
  `CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, reporter_jid TEXT, target_jid TEXT, reason TEXT, status TEXT DEFAULT 'offen', at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS anliegen (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, group_jid TEXT, text TEXT, status TEXT DEFAULT 'offen', at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT, text TEXT, remind_at INTEGER, status TEXT DEFAULT 'pending')`,
  `CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, question TEXT, options TEXT, created_by TEXT, closed INTEGER DEFAULT 0, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER, user_jid TEXT, option_index INTEGER, PRIMARY KEY(poll_id,user_jid))`,
  `CREATE TABLE IF NOT EXISTS birthdays (user_jid TEXT PRIMARY KEY, day INTEGER, month INTEGER, year INTEGER, notified_this_year INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS quotes (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT, text TEXT, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT, title TEXT, text TEXT, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS error_log (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, signature TEXT, message TEXT, context TEXT, ai_summary TEXT, count INTEGER DEFAULT 1, first_at INTEGER, last_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, by TEXT, target TEXT, group_jid TEXT, at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
];

let client = null;

/** Erstellt (einmalig) den libSQL-Client. */
function getClient() {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (url) {
    client = createClient({ url, authToken: process.env.DATABASE_KEY });
    logger.warn('DB: verbunden mit Turso (DATABASE_URL).');
  } else {
    // Lokaler Fallback für Entwicklung/Test ohne Cloud.
    const dir = path.join(process.cwd(), 'data');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    client = createClient({ url: 'file:' + path.join(dir, 'local.db') });
    logger.warn('DB: DATABASE_URL nicht gesetzt → lokaler Fallback (data/local.db).');
  }
  return client;
}

/** Führt eine parametrisierte Schreib-/Lese-Query aus, gibt das Result zurück. */
async function run(sql, args = []) {
  return getClient().execute({ sql, args });
}

/** Liefert die erste Zeile (oder undefined). */
async function one(sql, args = []) {
  const res = await getClient().execute({ sql, args });
  return res.rows[0];
}

/** Liefert alle Zeilen (Array). */
async function many(sql, args = []) {
  const res = await getClient().execute({ sql, args });
  return res.rows;
}

/** Batch mehrerer Statements (Transaktion). */
async function batch(statements, mode = 'write') {
  return getClient().batch(statements, mode);
}

/** Legt das Schema an und schreibt die schema_version. Idempotent. */
async function init() {
  const c = getClient();
  // Schema als Batch (atomar, eine Transaktion).
  await c.batch(SCHEMA, 'write');

  // Aktuelle Version festhalten, falls noch nicht vorhanden.
  await c.execute({
    sql: 'INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)',
    args: [SCHEMA_VERSION, Date.now()],
  });

  logger.warn(`DB: Schema bereit (Version ${SCHEMA_VERSION}, ${SCHEMA.length} Tabellen).`);
  return true;
}

module.exports = { getClient, init, run, one, many, batch, SCHEMA_VERSION };
