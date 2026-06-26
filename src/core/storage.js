'use strict';

const { getDb } = require('./db');
const logger = require('./logger');

/**
 * Daten-Schicht (Phase 2).
 * Normalisierte SQL-Tabellen statt einem großen JSON-Blob → eine neue Warnung
 * schreibt genau 1 Zeile, nicht den ganzen Zustand.
 *
 * Heiße Daten (member_stats) werden in-memory akkumuliert und gebündelt
 * (debounced) geschrieben. Warnungen werden als einzelner Zeilen-Upsert
 * sofort geschrieben.
 *
 * Persistenz-Backend ist der libSQL-Client (Turso remote oder lokale Datei),
 * siehe core/db.js. (Optionaler Mongo-Fallback ist bewusst noch nicht dabei.)
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS groups (
     jid TEXT PRIMARY KEY,
     active INTEGER DEFAULT 1,
     config TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS warnings (
     group_jid TEXT, user_jid TEXT,
     count INTEGER DEFAULT 0, reasons TEXT, last_at INTEGER,
     PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS mutes (
     group_jid TEXT, user_jid TEXT, until INTEGER,
     PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS member_stats (
     group_jid TEXT, num TEXT,
     messages INTEGER DEFAULT 0, commands INTEGER DEFAULT 0,
     warnings INTEGER DEFAULT 0, last_seen INTEGER,
     PRIMARY KEY (group_jid, num)
   )`,
  `CREATE TABLE IF NOT EXISTS ban_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     group_jid TEXT, num TEXT, banned_by TEXT, reason TEXT, at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS community_bans (
     parent_jid TEXT, num TEXT, by TEXT, reason TEXT, at INTEGER,
     PRIMARY KEY (parent_jid, num)
   )`,
  `CREATE TABLE IF NOT EXISTS reports (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     group_jid TEXT, group_name TEXT, sender_num TEXT, text TEXT, at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS anliegen (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     num TEXT, text TEXT, at INTEGER, groups TEXT, communities TEXT,
     status TEXT DEFAULT 'offen'
   )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
];

/** Standard-Konfiguration einer Gruppe (liegt als kleines JSON in groups.config). */
const DEFAULT_GROUP_CONFIG = {
  commands: {}, // pro Befehl: 'all' | 'admin' | false (Override; sonst Default des Befehls)
  moderation: {
    badwords: false,
    links: false,
    spam: false,
    warnLimit: 3,
    kickOnLimit: false,
    slowmode: 0,
    extraBadwords: [],
  },
  rules: null,
  welcome: {
    enabled: false,
    message: null,
    verify: false,
    verifyTimeoutMin: 5,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = () => Date.now();

function safeParse(text, fallback) {
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

/** Tiefe Zusammenführung von Plain-Objects (Arrays werden ersetzt, nicht gemerged). */
function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!patch || typeof patch !== 'object') return out;
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], pv);
    } else {
      out[key] = pv;
    }
  }
  return out;
}

const db = () => getDb();

// ---------------------------------------------------------------------------
// Schema + Debounced-Flush-Lifecycle
// ---------------------------------------------------------------------------

let flushTimer = null;

async function initStorage() {
  const client = db();
  for (const stmt of SCHEMA) {
    await client.execute(stmt);
  }
  // Periodischer Flush der heißen In-Memory-Daten
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      flushStats().catch((e) => logger.error({ err: e }, 'flushStats Fehler'));
    }, 8000);
    if (flushTimer.unref) flushTimer.unref();
  }
  logger.info('Storage: Schema initialisiert (9 Tabellen)');
}

// ---------------------------------------------------------------------------
// GROUPS
// ---------------------------------------------------------------------------

async function ensureGroup(jid) {
  await db().execute({
    sql: 'INSERT OR IGNORE INTO groups (jid, active, config) VALUES (?, 1, ?)',
    args: [jid, JSON.stringify(DEFAULT_GROUP_CONFIG)],
  });
}

async function getGroup(jid) {
  const r = await db().execute({ sql: 'SELECT jid, active, config FROM groups WHERE jid = ?', args: [jid] });
  if (!r.rows.length) return null;
  const row = r.rows[0];
  return {
    jid: row.jid,
    active: Number(row.active) === 1,
    config: deepMerge(DEFAULT_GROUP_CONFIG, safeParse(row.config, {})),
  };
}

/** Liefert immer eine Config (Defaults gemerged), auch wenn die Gruppe neu ist. */
async function getGroupConfig(jid) {
  const g = await getGroup(jid);
  return g ? g.config : deepMerge(DEFAULT_GROUP_CONFIG, {});
}

/** Merged ein Teil-Patch in die Gruppen-Config und speichert (1 Zeile). */
async function updateGroupConfig(jid, patch) {
  await ensureGroup(jid);
  const current = await getGroupConfig(jid);
  const merged = deepMerge(current, patch);
  await db().execute({
    sql: 'UPDATE groups SET config = ? WHERE jid = ?',
    args: [JSON.stringify(merged), jid],
  });
  return merged;
}

async function setGroupActive(jid, active) {
  await ensureGroup(jid);
  await db().execute({ sql: 'UPDATE groups SET active = ? WHERE jid = ?', args: [active ? 1 : 0, jid] });
}

async function getAllGroups() {
  const r = await db().execute('SELECT jid, active, config FROM groups');
  return r.rows.map((row) => ({
    jid: row.jid,
    active: Number(row.active) === 1,
    config: deepMerge(DEFAULT_GROUP_CONFIG, safeParse(row.config, {})),
  }));
}

// ---------------------------------------------------------------------------
// WARNINGS  (sofortiger Zeilen-Upsert — 1 Warnung = 1 Zeile)
// ---------------------------------------------------------------------------

const MAX_REASONS = 20;

async function addWarning(groupJid, userJid, reason) {
  const existing = await getWarnings(groupJid, userJid);
  const reasons = existing.reasons.slice();
  if (reason) reasons.push({ reason: String(reason), at: now() });
  while (reasons.length > MAX_REASONS) reasons.shift();
  const count = existing.count + 1;
  await db().execute({
    sql: `INSERT INTO warnings (group_jid, user_jid, count, reasons, last_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(group_jid, user_jid)
          DO UPDATE SET count = excluded.count, reasons = excluded.reasons, last_at = excluded.last_at`,
    args: [groupJid, userJid, count, JSON.stringify(reasons), now()],
  });
  return count;
}

async function removeWarning(groupJid, userJid) {
  const existing = await getWarnings(groupJid, userJid);
  if (existing.count <= 0) return 0;
  const count = existing.count - 1;
  const reasons = existing.reasons.slice();
  reasons.pop();
  if (count <= 0) {
    await clearWarnings(groupJid, userJid);
    return 0;
  }
  await db().execute({
    sql: 'UPDATE warnings SET count = ?, reasons = ?, last_at = ? WHERE group_jid = ? AND user_jid = ?',
    args: [count, JSON.stringify(reasons), now(), groupJid, userJid],
  });
  return count;
}

async function clearWarnings(groupJid, userJid) {
  await db().execute({
    sql: 'DELETE FROM warnings WHERE group_jid = ? AND user_jid = ?',
    args: [groupJid, userJid],
  });
}

async function getWarnings(groupJid, userJid) {
  const r = await db().execute({
    sql: 'SELECT count, reasons, last_at FROM warnings WHERE group_jid = ? AND user_jid = ?',
    args: [groupJid, userJid],
  });
  if (!r.rows.length) return { count: 0, reasons: [], lastAt: 0 };
  const row = r.rows[0];
  return { count: Number(row.count), reasons: safeParse(row.reasons, []), lastAt: Number(row.last_at) || 0 };
}

async function getAllWarnings(groupJid) {
  const r = await db().execute({
    sql: 'SELECT user_jid, count, reasons, last_at FROM warnings WHERE group_jid = ? AND count > 0 ORDER BY count DESC',
    args: [groupJid],
  });
  return r.rows.map((row) => ({
    userJid: row.user_jid,
    count: Number(row.count),
    reasons: safeParse(row.reasons, []),
    lastAt: Number(row.last_at) || 0,
  }));
}

// ---------------------------------------------------------------------------
// MUTES
// ---------------------------------------------------------------------------

async function setMute(groupJid, userJid, until) {
  await db().execute({
    sql: `INSERT INTO mutes (group_jid, user_jid, until) VALUES (?, ?, ?)
          ON CONFLICT(group_jid, user_jid) DO UPDATE SET until = excluded.until`,
    args: [groupJid, userJid, until],
  });
}

async function removeMute(groupJid, userJid) {
  await db().execute({ sql: 'DELETE FROM mutes WHERE group_jid = ? AND user_jid = ?', args: [groupJid, userJid] });
}

async function getMute(groupJid, userJid) {
  const r = await db().execute({
    sql: 'SELECT until FROM mutes WHERE group_jid = ? AND user_jid = ?',
    args: [groupJid, userJid],
  });
  return r.rows.length ? Number(r.rows[0].until) : 0;
}

async function isMuted(groupJid, userJid) {
  const until = await getMute(groupJid, userJid);
  return until > now();
}

async function getActiveMutes(groupJid) {
  const r = await db().execute({
    sql: 'SELECT user_jid, until FROM mutes WHERE group_jid = ? AND until > ?',
    args: [groupJid, now()],
  });
  return r.rows.map((row) => ({ userJid: row.user_jid, until: Number(row.until) }));
}

/** Entfernt abgelaufene Mutes (periodisch aufrufbar). */
async function cleanupExpiredMutes() {
  await db().execute({ sql: 'DELETE FROM mutes WHERE until <= ?', args: [now()] });
}

// ---------------------------------------------------------------------------
// MEMBER STATS  (debounced — heiße Daten)
// ---------------------------------------------------------------------------

// Schlüssel -> { messages, commands, warnings, lastSeen }
const pendingStats = new Map();
const statKey = (groupJid, num) => `${groupJid} ${num}`;

/**
 * Zählt Aktivität hoch (in-memory). Wird gebündelt geflusht, statt bei jeder
 * Nachricht in die DB zu schreiben.
 */
function bumpStat(groupJid, num, { messages = 0, commands = 0, warnings = 0 } = {}) {
  const key = statKey(groupJid, num);
  const p = pendingStats.get(key) || { groupJid, num, messages: 0, commands: 0, warnings: 0, lastSeen: 0 };
  p.messages += messages;
  p.commands += commands;
  p.warnings += warnings;
  p.lastSeen = now();
  pendingStats.set(key, p);
}

/** Schreibt alle ausstehenden Stat-Deltas gebündelt (Transaktion). */
async function flushStats() {
  if (pendingStats.size === 0) return;
  const batch = [];
  for (const p of pendingStats.values()) {
    batch.push({
      sql: `INSERT INTO member_stats (group_jid, num, messages, commands, warnings, last_seen)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_jid, num) DO UPDATE SET
              messages = messages + excluded.messages,
              commands = commands + excluded.commands,
              warnings = warnings + excluded.warnings,
              last_seen = excluded.last_seen`,
      args: [p.groupJid, p.num, p.messages, p.commands, p.warnings, p.lastSeen],
    });
  }
  pendingStats.clear();
  try {
    await db().batch(batch, 'write');
  } catch (e) {
    logger.error({ err: e }, 'flushStats: Batch-Write fehlgeschlagen');
  }
}

async function getMemberStat(groupJid, num) {
  await flushStats();
  const r = await db().execute({
    sql: 'SELECT messages, commands, warnings, last_seen FROM member_stats WHERE group_jid = ? AND num = ?',
    args: [groupJid, num],
  });
  if (!r.rows.length) return { messages: 0, commands: 0, warnings: 0, lastSeen: 0 };
  const row = r.rows[0];
  return {
    messages: Number(row.messages),
    commands: Number(row.commands),
    warnings: Number(row.warnings),
    lastSeen: Number(row.last_seen) || 0,
  };
}

async function getTopMembers(groupJid, limit = 10) {
  await flushStats();
  const r = await db().execute({
    sql: 'SELECT num, messages FROM member_stats WHERE group_jid = ? ORDER BY messages DESC LIMIT ?',
    args: [groupJid, limit],
  });
  return r.rows.map((row) => ({ num: row.num, messages: Number(row.messages) }));
}

// ---------------------------------------------------------------------------
// BAN LOG
// ---------------------------------------------------------------------------

async function addBanLog(groupJid, num, bannedBy, reason) {
  await db().execute({
    sql: 'INSERT INTO ban_log (group_jid, num, banned_by, reason, at) VALUES (?, ?, ?, ?, ?)',
    args: [groupJid, num, bannedBy, reason || null, now()],
  });
}

async function getBanLog(groupJid, limit = 50) {
  const r = await db().execute({
    sql: 'SELECT num, banned_by, reason, at FROM ban_log WHERE group_jid = ? ORDER BY at DESC LIMIT ?',
    args: [groupJid, limit],
  });
  return r.rows.map((row) => ({
    num: row.num,
    bannedBy: row.banned_by,
    reason: row.reason,
    at: Number(row.at),
  }));
}

// ---------------------------------------------------------------------------
// COMMUNITY BANS
// ---------------------------------------------------------------------------

async function addCommunityBan(parentJid, num, by, reason) {
  await db().execute({
    sql: `INSERT INTO community_bans (parent_jid, num, by, reason, at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(parent_jid, num) DO UPDATE SET by = excluded.by, reason = excluded.reason, at = excluded.at`,
    args: [parentJid, num, by, reason || null, now()],
  });
}

async function removeCommunityBan(parentJid, num) {
  await db().execute({
    sql: 'DELETE FROM community_bans WHERE parent_jid = ? AND num = ?',
    args: [parentJid, num],
  });
}

async function isCommunityBanned(parentJid, num) {
  const r = await db().execute({
    sql: 'SELECT 1 FROM community_bans WHERE parent_jid = ? AND num = ?',
    args: [parentJid, num],
  });
  return r.rows.length > 0;
}

async function getCommunityBans(parentJid) {
  const r = await db().execute({
    sql: 'SELECT num, by, reason, at FROM community_bans WHERE parent_jid = ? ORDER BY at DESC',
    args: [parentJid],
  });
  return r.rows.map((row) => ({ num: row.num, by: row.by, reason: row.reason, at: Number(row.at) }));
}

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

async function addReport(groupJid, groupName, senderNum, text) {
  await db().execute({
    sql: 'INSERT INTO reports (group_jid, group_name, sender_num, text, at) VALUES (?, ?, ?, ?, ?)',
    args: [groupJid, groupName || null, senderNum, text, now()],
  });
}

async function getReports(limit = 100) {
  const r = await db().execute({
    sql: 'SELECT id, group_jid, group_name, sender_num, text, at FROM reports ORDER BY at DESC LIMIT ?',
    args: [limit],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    groupJid: row.group_jid,
    groupName: row.group_name,
    senderNum: row.sender_num,
    text: row.text,
    at: Number(row.at),
  }));
}

// ---------------------------------------------------------------------------
// ANLIEGEN (DM-Anliegen)
// ---------------------------------------------------------------------------

async function addAnliegen(num, text, groups = [], communities = []) {
  const r = await db().execute({
    sql: `INSERT INTO anliegen (num, text, at, groups, communities, status)
          VALUES (?, ?, ?, ?, ?, 'offen')`,
    args: [num, text, now(), JSON.stringify(groups), JSON.stringify(communities)],
  });
  return Number(r.lastInsertRowid);
}

async function getAnliegen(status = null) {
  const sql = status
    ? 'SELECT * FROM anliegen WHERE status = ? ORDER BY at DESC'
    : 'SELECT * FROM anliegen ORDER BY at DESC';
  const r = await db().execute({ sql, args: status ? [status] : [] });
  return r.rows.map((row) => ({
    id: Number(row.id),
    num: row.num,
    text: row.text,
    at: Number(row.at),
    groups: safeParse(row.groups, []),
    communities: safeParse(row.communities, []),
    status: row.status,
  }));
}

async function setAnliegenStatus(id, status) {
  await db().execute({ sql: 'UPDATE anliegen SET status = ? WHERE id = ?', args: [status, id] });
}

// ---------------------------------------------------------------------------
// SETTINGS  (globaler Key/Value-Store, JSON-Werte)
// ---------------------------------------------------------------------------

async function getSetting(key, fallback = null) {
  const r = await db().execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return r.rows.length ? safeParse(r.rows[0].value, fallback) : fallback;
}

async function setSetting(key, value) {
  await db().execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, JSON.stringify(value)],
  });
}

// ---------------------------------------------------------------------------

module.exports = {
  DEFAULT_GROUP_CONFIG,
  initStorage,
  flushStats,
  // groups
  ensureGroup,
  getGroup,
  getGroupConfig,
  updateGroupConfig,
  setGroupActive,
  getAllGroups,
  // warnings
  addWarning,
  removeWarning,
  clearWarnings,
  getWarnings,
  getAllWarnings,
  // mutes
  setMute,
  removeMute,
  getMute,
  isMuted,
  getActiveMutes,
  cleanupExpiredMutes,
  // stats
  bumpStat,
  getMemberStat,
  getTopMembers,
  // ban log
  addBanLog,
  getBanLog,
  // community bans
  addCommunityBan,
  removeCommunityBan,
  isCommunityBanned,
  getCommunityBans,
  // reports
  addReport,
  getReports,
  // anliegen
  addAnliegen,
  getAnliegen,
  setAnliegenStatus,
  // settings
  getSetting,
  setSetting,
};
