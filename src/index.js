'use strict';

const logger = require('./core/logger');

// Crash-Schutz: ein Fehler darf den Bot nie killen (Anti-Ban + Stabilität)
process.on('uncaughtException', (err) => logger.error({ err }, 'uncaughtException'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));

const config = require('./core/config');
const { getDb } = require('./core/db');
const storage = require('./core/storage');
const { initStorage, flushStats } = storage;
const { startSocket, state } = require('./core/connection');
const { startWeb } = require('./web/server');
const registry = require('./bot/registry');

async function main() {
  logger.info('🚀 CommunityBot v2 startet …');

  // DB-Client initialisieren (legt bei Bedarf lokale Datei an / verbindet Turso)
  getDb();

  // Daten-Schema anlegen + Debounced-Flush-Loop starten (Phase 2)
  await initStorage();

  // Befehle laden (Phase 3)
  registry.loadCommands();

  // Power-Zustand aus den Settings wiederherstellen (Web-UI An/Aus)
  try {
    state.powered = await storage.getSetting('powered', true);
  } catch (_) {
    /* default true */
  }

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

// Graceful Shutdown: ausstehende Stat-Deltas vor dem Beenden persistieren
// (Render schickt SIGTERM beim Neustart/Deploy)
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} empfangen — flushe ausstehende Daten …`);
  try {
    await flushStats();
  } catch (err) {
    logger.error({ err }, 'Flush beim Shutdown fehlgeschlagen');
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => logger.error({ err }, 'Fataler Start-Fehler'));
