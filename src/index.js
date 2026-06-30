'use strict';

/**
 * index.js — Einstiegspunkt.
 *
 * Phase 1 (Gerüst): globale Fehler-Handler (nie crashen) + DB-Init (Schema).
 * Verbindung, Watchdog, Keepalive, Router etc. folgen in späteren Phasen.
 */

const { logger } = require('./core/logger');
const db = require('./core/db');

/** Globale Handler: alles loggen, niemals den Prozess hart killen. */
function installGlobalHandlers() {
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason && reason.message ? reason.message : reason) }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message }, 'uncaughtException');
  });
  // Graceful Shutdown wird in Phase 2 mit der Verbindung verdrahtet.
  process.on('SIGTERM', () => {
    logger.warn('SIGTERM empfangen — Phase-1-Gerüst beendet sich sauber.');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.warn('SIGINT empfangen — beende.');
    process.exit(0);
  });
}

async function main() {
  installGlobalHandlers();
  await db.init();
  logger.warn('Phase 1 Gerüst bereit — DB initialisiert, alle Tabellen vorhanden.');
  // Hinweis: Ohne Verbindung (Phase 2) gibt es noch nichts wachzuhalten.
}

main().catch((e) => {
  logger.error({ err: e.message }, 'Fataler Startfehler beim Gerüst-Bootstrap.');
  process.exit(1);
});
