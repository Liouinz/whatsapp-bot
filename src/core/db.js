'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const config = require('./config');
const logger = require('./logger');

let client = null;

/**
 * libSQL-Client (Singleton).
 * - Mit DATABASE_URL/KEY → Turso (remote, überlebt Neustarts).
 * - Ohne → lokale SQLite-Datei (data/local.db) als Fallback. Auf Render-Free
 *   wird die Platte bei Neustart gelöscht; deshalb ist Turso für die
 *   Session-Persistenz Pflicht. Lokal ist es nur für die Entwicklung gedacht.
 */
function getDb() {
  if (client) return client;

  if (config.databaseUrl) {
    client = createClient({ url: config.databaseUrl, authToken: config.databaseKey });
    logger.info('DB: Turso/libSQL (remote) verbunden');
  } else {
    const dir = path.join(process.cwd(), 'data');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
      /* ignore */
    }
    const file = path.join(dir, 'local.db');
    client = createClient({ url: `file:${file}` });
    logger.warn('DB: kein DATABASE_URL gesetzt — lokale SQLite-Datei als Fallback (Session geht bei Render-Neustart verloren!)');
  }
  return client;
}

module.exports = { getDb };
