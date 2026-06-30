'use strict';

/**
 * watchdog.js — gegen "stille" Hänger (Recherche-Block 7).
 *
 * Merkt die letzte Event-Zeit. Timer alle 60 s: ist die Verbindung "offen",
 * kam aber > 10 Min kein Event → Reconnect erzwingen. Fängt tote
 * Verbindungen, die kein "close" werfen.
 */

const { logger } = require('./logger');

const CHECK_INTERVAL = 60 * 1000; // 60 s
const MAX_IDLE = 10 * 60 * 1000; // 10 Min

let lastEventAt = Date.now();
let timer = null;

/** Bei jedem eingehenden Event aufrufen. */
function feed() {
  lastEventAt = Date.now();
}

/**
 * Startet den Watchdog.
 * @param {object} deps { isConnected(): boolean, forceReconnect(): void }
 */
function start({ isConnected, forceReconnect }) {
  stop();
  lastEventAt = Date.now();
  timer = setInterval(() => {
    try {
      if (!isConnected()) return; // nur bei (vermeintlich) offener Verbindung
      const idle = Date.now() - lastEventAt;
      if (idle > MAX_IDLE) {
        logger.warn(
          `Watchdog: ${Math.round(idle / 1000)}s ohne Event bei offener Verbindung → erzwinge Reconnect.`
        );
        feed(); // verhindert sofortiges Dauerfeuer
        forceReconnect();
      }
    } catch (e) {
      logger.warn(`Watchdog-Fehler: ${e.message}`);
    }
  }, CHECK_INTERVAL);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { feed, start, stop, CHECK_INTERVAL, MAX_IDLE };
