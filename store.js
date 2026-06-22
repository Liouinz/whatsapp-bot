/**
 * Persistenz-Schicht für die Bot-Konfiguration.
 * ---------------------------------------------
 * - Ist die Umgebungsvariable MONGODB_URI gesetzt, werden die Einstellungen in
 *   einer MongoDB-Atlas-Datenbank gespeichert (überlebt Neustarts/Deploys).
 * - Ohne MONGODB_URI wird auf eine lokale Datei (bot_config.json) zurückgefallen.
 *   Auf Render-Free geht diese Datei bei jedem Neustart verloren.
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

const EMPTY = { groups: {} };

let mongoCollection = null; // gecachte Collection, falls MongoDB aktiv
let mongoFailed = false; // bei Fehler dauerhaft auf Datei zurückfallen

function createLogger(logger) {
  return logger || { info() {}, warn() {}, error() {} };
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

module.exports = { loadConfig, saveConfig, usingMongo: () => Boolean(MONGODB_URI) && !mongoFailed };
