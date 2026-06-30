'use strict';

/**
 * index.js — Einstiegspunkt.
 *
 * Phase 1 (Gerüst): globale Fehler-Handler + DB-Init (Schema).
 * Phase 2 (Verbindung): Socket starten, Watchdog, Graceful Shutdown.
 * Router/Keepalive/Web folgen in späteren Phasen.
 */

const { logger } = require('./core/logger');
const db = require('./core/db');
const connection = require('./core/connection');
const keepalive = require('./core/keepalive');

let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn(`${signal} empfangen — fahre sauber herunter.`);
  try {
    keepalive.stop();
    await connection.shutdown();
  } catch (e) {
    logger.warn(`Shutdown-Fehler: ${e.message}`);
  }
  process.exit(0);
}

/** Globale Handler: alles loggen, niemals den Prozess hart killen. */
function installGlobalHandlers() {
  process.on('unhandledRejection', (reason) => {
    logger.error(
      { reason: String(reason && reason.message ? reason.message : reason) },
      'unhandledRejection'
    );
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message }, 'uncaughtException');
  });
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

async function main() {
  installGlobalHandlers();
  await db.init();
  keepalive.start({ getStatus: () => ({ connected: connection.isConnected() }) });
  await connection.start();
  logger.warn('Phase 3 bereit — Health/Keepalive aktiv, Verbindung gestartet, Watchdog aktiv.');
}

main().catch((e) => {
  logger.error({ err: e.message }, 'Fataler Startfehler.');
  process.exit(1);
});
