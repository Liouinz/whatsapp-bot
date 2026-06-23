/**
 * Persistenz-Schicht für die Bot-Konfiguration.
 * ---------------------------------------------
 * Priorität: Turso (libSQL) → MongoDB → lokale Datei
 * - TURSO_DATABASE_URL + TURSO_AUTH_TOKEN: Cloud-SQLite via Turso (empfohlen)
 * - MONGODB_URI / MONGODB_DB: MongoDB Atlas (Fallback)
 * - Ohne beides: lokale bot_config.json (geht bei Render-Free-Restart verloren)
 *
 * Schnittstelle: loadConfig() und saveConfig(config) – beide asynchron.
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'bot_config.json');
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'whatsappbot';
const COLLECTION = 'config';
const DOC_ID = 'main';
const TURSO_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

const EMPTY = { groups: {} };

let mongoCollection = null;
let mongoFailed = false;
let tursoClient = null;
let tursoFailed = false;

function createLogger(logger) {
  return logger || { info() {}, warn() {}, error() {} };
}

async function getTurso(logger) {
  if (!TURSO_URL || !TURSO_TOKEN || tursoFailed) return null;
  if (tursoClient) return tursoClient;
  try {
    const { createClient } = require('@libsql/client');
    tursoClient = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    await tursoClient.execute('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');
    logger.info('Konfiguration: Turso verbunden');
    return tursoClient;
  } catch (err) {
    tursoFailed = true;
    logger.error({ err }, 'Turso-Verbindung fehlgeschlagen – nutze Fallback');
    return null;
  }
}

async function getCollection(logger) {
  if (!MONGODB_URI || mongoFailed) return null;
  if (mongoCollection) return mongoCollection;
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    mongoCollection = client.db(DB_NAME).collection(COLLECTION);
    logger.info('Konfiguration: MongoDB verbunden');
    return mongoCollection;
  } catch (err) {
    mongoFailed = true;
    logger.error({ err }, 'MongoDB-Verbindung fehlgeschlagen – nutze lokale Datei');
    return null;
  }
}

// ---------- Datei-Fallback ----------
function loadFromFile() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    return normalize(data);
  } catch {
    return { ...EMPTY };
  }
}
function saveToFile(config) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(config, null, 2));
  } catch {
    /* ignoriert – Datei evtl. nicht schreibbar */
  }
}

// Alte Struktur ({ activeGroups: [...] }) auf neue Struktur migrieren
function normalize(data) {
  if (!data || typeof data !== 'object') return { ...EMPTY };
  if (!data.groups) data.groups = {};
  if (Array.isArray(data.activeGroups)) {
    for (const jid of data.activeGroups) {
      if (!data.groups[jid]) data.groups[jid] = { active: true };
    }
    delete data.activeGroups;
  }
  return data;
}

async function loadConfig(logger) {
  const log = createLogger(logger);
  const tc = await getTurso(log);
  if (tc) {
    try {
      const rs = await tc.execute({ sql: 'SELECT value FROM kv WHERE key=?', args: ['config'] });
      if (rs.rows[0]) return normalize(JSON.parse(rs.rows[0].value));
      return { ...EMPTY };
    } catch (err) {
      log.error({ err }, 'Laden aus Turso fehlgeschlagen – nutze Fallback');
    }
  }
  const col = await getCollection(log);
  if (col) {
    try {
      const doc = await col.findOne({ _id: DOC_ID });
      return normalize(doc?.config || { ...EMPTY });
    } catch (err) {
      log.error({ err }, 'Laden aus MongoDB fehlgeschlagen – nutze Datei');
    }
  }
  return loadFromFile();
}

async function saveConfig(config, logger) {
  const log = createLogger(logger);
  const tc = await getTurso(log);
  if (tc) {
    try {
      await tc.execute({ sql: 'INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)', args: ['config', JSON.stringify(config)] });
      return;
    } catch (err) {
      log.error({ err }, 'Speichern in Turso fehlgeschlagen – nutze Fallback');
    }
  }
  const col = await getCollection(log);
  if (col) {
    try {
      await col.updateOne({ _id: DOC_ID }, { $set: { config } }, { upsert: true });
      return;
    } catch (err) {
      log.error({ err }, 'Speichern in MongoDB fehlgeschlagen – nutze Datei');
    }
  }
  saveToFile(config);
}

module.exports = {
  loadConfig,
  saveConfig,
  usingMongo: () => Boolean(MONGODB_URI) && !mongoFailed,
  usingTurso: () => Boolean(TURSO_URL) && Boolean(TURSO_TOKEN) && !tursoFailed,
};
