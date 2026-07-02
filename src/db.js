// Turso-Client + Schema + Schreib-Batching mit Ausfallschutz.
// Häufige Writes (XP, Counter) werden im RAM gesammelt und alle ~10 s gebündelt
// geschrieben. Ist Turso kurz weg, bleiben die Daten im RAM und werden nachgeschrieben.

import { createClient } from '@libsql/client';
import { config } from './config.js';

let client = null;

export function getDb() {
  if (!client) {
    client = createClient({
      url: process.env.DATABASE_URL.trim(),
      authToken: process.env.DATABASE_KEY.trim(),
    });
  }
  return client;
}

/** Direkter Write/Read mit einem stillen Retry (transiente Turso-Aussetzer). */
export async function dbRun(sql, args = []) {
  const db = getDb();
  try {
    return await db.execute({ sql, args });
  } catch (err) {
    await new Promise((r) => setTimeout(r, 500));
    return db.execute({ sql, args }); // zweiter Versuch — wirft er auch, fängt der Aufrufer
  }
}

/** Read-Helper: gibt rows zurück, bei DB-Fehler [] (Bot läuft weiter). */
export async function dbRows(sql, args = []) {
  try {
    const res = await dbRun(sql, args);
    return res.rows;
  } catch {
    return [];
  }
}

// ── Schema ─────────────────────────────────────────────────────────

const TABLES = [
  // Session (Phase 2)
  `CREATE TABLE IF NOT EXISTS auth_creds (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_keys (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,

  // Gruppen & Mitglieder
  `CREATE TABLE IF NOT EXISTS groups (
     jid TEXT PRIMARY KEY, name TEXT, member_count INTEGER DEFAULT 0,
     bot_is_admin INTEGER DEFAULT 0, updated_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS group_settings (
     jid TEXT PRIMARY KEY,
     enabled INTEGER DEFAULT 1,
     antilink INTEGER DEFAULT 0,
     antispam INTEGER DEFAULT 0,
     blacklist_on INTEGER DEFAULT 1,
     welcome INTEGER DEFAULT 0,
     rules TEXT DEFAULT '',
     levelup_announce INTEGER DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS members (
     group_jid TEXT, user_jid TEXT, user_lid TEXT, name TEXT, last_seen INTEGER,
     PRIMARY KEY (group_jid, user_jid)
   )`,

  // Moderation
  `CREATE TABLE IF NOT EXISTS warnings (
     id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, user_jid TEXT,
     reason TEXT, by_jid TEXT, created_at INTEGER, expires_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS mutes (
     group_jid TEXT, user_jid TEXT, until INTEGER, by_jid TEXT, reason TEXT,
     PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS bans (
     group_jid TEXT, user_jid TEXT, reason TEXT, by_jid TEXT, created_at INTEGER,
     PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS blocked_words (
     group_jid TEXT, word TEXT, PRIMARY KEY (group_jid, word)
   )`,
  `CREATE TABLE IF NOT EXISTS allowed_chats (jid TEXT PRIMARY KEY, note TEXT)`,

  // XP / Level
  `CREATE TABLE IF NOT EXISTS xp (
     group_jid TEXT, user_jid TEXT, xp INTEGER DEFAULT 0, messages INTEGER DEFAULT 0,
     name TEXT, PRIMARY KEY (group_jid, user_jid)
   )`,
  `CREATE TABLE IF NOT EXISTS levels (
     group_jid TEXT, user_jid TEXT, level INTEGER DEFAULT 0,
     PRIMARY KEY (group_jid, user_jid)
   )`,

  // Community-Features
  `CREATE TABLE IF NOT EXISTS afk (
     user_jid TEXT PRIMARY KEY, reason TEXT, since INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS custom_commands (
     name TEXT PRIMARY KEY, reply TEXT, by_jid TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS faq (
     keyword TEXT PRIMARY KEY, answer TEXT, by_jid TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS scheduled_messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT, chat_jid TEXT, text TEXT,
     send_at INTEGER, created_by TEXT, done INTEGER DEFAULT 0, done_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS nightmode (
     group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0,
     start_hhmm TEXT DEFAULT '22:00', end_hhmm TEXT DEFAULT '07:00', is_closed INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS antiraid (
     group_jid TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0
   )`,

  // System
  `CREATE TABLE IF NOT EXISTS command_toggles (name TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
     key TEXT PRIMARY KEY, count INTEGER, window_start INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS error_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, message TEXT, context TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS error_counts (
     signature TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
     day TEXT PRIMARY KEY, calls INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS games (
     group_jid TEXT, game TEXT, state TEXT, updated_at INTEGER,
     PRIMARY KEY (group_jid, game)
   )`,
  `CREATE TABLE IF NOT EXISTS game_scores (
     group_jid TEXT, user_jid TEXT, game TEXT, wins INTEGER DEFAULT 0, name TEXT,
     PRIMARY KEY (group_jid, user_jid, game)
   )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, group_jid TEXT,
     target TEXT, by_jid TEXT, detail TEXT, created_at INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS owner_alerts (
     id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, created_at INTEGER, delivered INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS daily_stats (
     day TEXT PRIMARY KEY, messages INTEGER DEFAULT 0, commands INTEGER DEFAULT 0, ai_calls INTEGER DEFAULT 0
   )`,

  // Economy (Coins sind global pro Nutzer, nicht pro Gruppe)
  `CREATE TABLE IF NOT EXISTS coins (
     user_jid TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, name TEXT,
     last_daily TEXT DEFAULT '', streak INTEGER DEFAULT 0,
     total_earned INTEGER DEFAULT 0, total_gambled INTEGER DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS purchases (
     user_jid TEXT, item_id TEXT, created_at INTEGER,
     PRIMARY KEY (user_jid, item_id)
   )`,
  `CREATE TABLE IF NOT EXISTS user_titles (
     user_jid TEXT PRIMARY KEY, title TEXT
   )`,

  // Umfragen
  `CREATE TABLE IF NOT EXISTS polls (
     id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, question TEXT,
     options TEXT, created_by TEXT, created_at INTEGER, open INTEGER DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
     poll_id INTEGER, user_jid TEXT, option_idx INTEGER,
     PRIMARY KEY (poll_id, user_jid)
   )`,

  // Geburtstage (pro Nutzer, angekündigt in der Gruppe, in der sie gesetzt wurden)
  `CREATE TABLE IF NOT EXISTS birthdays (
     user_jid TEXT PRIMARY KEY, day INTEGER, month INTEGER, name TEXT,
     group_jid TEXT, last_congratulated TEXT DEFAULT ''
   )`,

  // Nachrichten pro Gruppe und Tag (für Wochenreport & Panel-Statistik)
  `CREATE TABLE IF NOT EXISTS group_daily (
     group_jid TEXT, day TEXT, messages INTEGER DEFAULT 0,
     PRIMARY KEY (group_jid, day)
   )`,
];

// Spalten, die nach dem ersten Deploy dazukamen — werden per ALTER TABLE nachgezogen,
// weil CREATE TABLE IF NOT EXISTS bestehende Tabellen nicht erweitert.
const MIGRATIONS = [
  ['group_settings', 'slowmode_secs', 'INTEGER DEFAULT 0'],
  ['group_settings', 'welcome_text', "TEXT DEFAULT ''"],
  ['group_settings', 'weekly_report', 'INTEGER DEFAULT 0'],
];

async function migrate(db) {
  const columnCache = new Map(); // table → Set(Spaltennamen)
  for (const [table, column, type] of MIGRATIONS) {
    if (!columnCache.has(table)) {
      const info = await db.execute(`PRAGMA table_info(${table})`);
      columnCache.set(table, new Set(info.rows.map((r) => String(r.name))));
    }
    if (!columnCache.get(table).has(column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`🔧 Migration: ${table}.${column} ergänzt.`);
    }
  }
}

export async function initDb() {
  const db = getDb();
  for (const sql of TABLES) {
    await db.execute(sql);
  }
  await migrate(db);
  console.log(`✅ DB initialisiert (${TABLES.length} Tabellen).`);
}

// ── Schreib-Batching (XP + Tages-Counter) ──────────────────────────

const xpBuffer = new Map(); // key "group|user" → { xp, messages, name }
const statBuffer = { messages: 0, commands: 0, ai_calls: 0 };
const groupDayBuffer = new Map(); // "group|day" → Nachrichten-Zähler
let flushTimer = null;
let flushFailStreak = 0;

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function bufferXp(groupJid, userJid, xpAmount, name) {
  const key = `${groupJid}|${userJid}`;
  const cur = xpBuffer.get(key) || { xp: 0, messages: 0, name: '' };
  cur.xp += xpAmount;
  cur.messages += 1;
  if (name) cur.name = name;
  xpBuffer.set(key, cur);
}

export function bufferStat(field, amount = 1) {
  if (field in statBuffer) statBuffer[field] += amount;
}

/** Nachrichten-Zähler pro Gruppe/Tag (für Wochenreport & Panel-Charts). */
export function bufferGroupMessage(groupJid) {
  const key = `${groupJid}|${todayKey()}`;
  groupDayBuffer.set(key, (groupDayBuffer.get(key) || 0) + 1);
}

/** Gepufferte Werte gebündelt schreiben. Bei DB-Ausfall: Puffer behalten, später nachschreiben. */
export async function flushBuffers() {
  const db = getDb();
  const stmts = [];

  for (const [key, val] of xpBuffer) {
    const [groupJid, userJid] = key.split('|');
    stmts.push({
      sql: `INSERT INTO xp (group_jid, user_jid, xp, messages, name) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(group_jid, user_jid) DO UPDATE SET
              xp = xp + excluded.xp, messages = messages + excluded.messages,
              name = CASE WHEN excluded.name != '' THEN excluded.name ELSE xp.name END`,
      args: [groupJid, userJid, val.xp, val.messages, val.name || ''],
    });
  }

  for (const [key, count] of groupDayBuffer) {
    const [groupJid, day] = key.split('|');
    stmts.push({
      sql: `INSERT INTO group_daily (group_jid, day, messages) VALUES (?, ?, ?)
            ON CONFLICT(group_jid, day) DO UPDATE SET messages = group_daily.messages + excluded.messages`,
      args: [groupJid, day, count],
    });
  }

  if (statBuffer.messages || statBuffer.commands || statBuffer.ai_calls) {
    stmts.push({
      sql: `INSERT INTO daily_stats (day, messages, commands, ai_calls) VALUES (?, ?, ?, ?)
            ON CONFLICT(day) DO UPDATE SET
              messages = daily_stats.messages + excluded.messages,
              commands = daily_stats.commands + excluded.commands,
              ai_calls = daily_stats.ai_calls + excluded.ai_calls`,
      args: [todayKey(), statBuffer.messages, statBuffer.commands, statBuffer.ai_calls],
    });
  }

  if (!stmts.length) return;

  // Snapshot nehmen und Puffer erst NACH Erfolg leeren (Ausfallschutz)
  try {
    await db.batch(stmts, 'write');
    xpBuffer.clear();
    groupDayBuffer.clear();
    statBuffer.messages = 0;
    statBuffer.commands = 0;
    statBuffer.ai_calls = 0;
    flushFailStreak = 0;
  } catch (err) {
    flushFailStreak++;
    if (flushFailStreak === 1 || flushFailStreak % 30 === 0) {
      console.warn(`⚠️ DB-Flush fehlgeschlagen (${flushFailStreak}×) — Werte bleiben im RAM: ${String(err?.message || err).slice(0, 120)}`);
    }
  }
}

export function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => flushBuffers().catch(() => {}), config.db.flushIntervalMs);
}

export function stopFlushLoop() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
}

// ── Level-Kurve ────────────────────────────────────────────────────
// Level n ist erreicht ab totalXpForLevel(n) XP (quadratisch: 1→100, 2→300, 3→600 …)

export function totalXpForLevel(level) {
  return 50 * level * (level + 1);
}

export function xpToLevel(xp) {
  let level = 0;
  while (totalXpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Fortschritt im aktuellen Level (für !rank): { level, have, need } */
export function levelProgress(xp) {
  const level = xpToLevel(xp);
  const base = totalXpForLevel(level);
  return { level, have: xp - base, need: totalXpForLevel(level + 1) - base };
}
