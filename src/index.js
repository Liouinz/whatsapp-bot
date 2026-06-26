'use strict';

const logger = require('./core/logger');

// Crash-Schutz: ein Fehler darf den Bot nie killen (Anti-Ban + Stabilität)
process.on('uncaughtException', (err) => logger.error({ err }, 'uncaughtException'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));

const config = require('./core/config');
const { getDb } = require('./core/db');
const { startSocket } = require('./core/connection');
const { startWeb } = require('./web/server');

async function main() {
  logger.info('🚀 CommunityBot v2 startet …');

  // DB-Client initialisieren (legt bei Bedarf lokale Datei an / verbindet Turso)
  getDb();

  // Web zuerst, damit /qr und /ping sofort erreichbar sind
  startWeb();

  // Keep-Alive: interner Selbst-Ping (zusätzlich zum empfohlenen EXTERNEN Pinger)
  if (config.selfUrl) startKeepAlive();

  // WhatsApp-Verbindung aufbauen (lädt Session aus der DB → kein neuer QR nötig)
  await startSocket();
}

function startKeepAlive() {
  const url = config.selfUrl.replace(/\/$/, '') + '/ping';
  setInterval(() => {
    // Node ≥ 20 hat globales fetch
    fetch(url).catch(() => {});
  }, 5 * 60 * 1000);
  logger.info(`Keep-Alive aktiv → ${url} (alle 5 Min). Hinweis: externen Pinger (UptimeRobot/cron-job.org) zusätzlich einrichten.`);
}

main().catch((err) => logger.error({ err }, 'Fataler Start-Fehler'));
