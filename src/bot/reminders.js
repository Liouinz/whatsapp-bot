'use strict';

const logger = require('../core/logger');
const { state } = require('../core/connection');

/**
 * Einfache Erinnerungen / geplante Posts (Phase 4).
 * In-Memory-Timer; Versand läuft über die Sende-Queue. Hinweis: Erinnerungen
 * gehen bei einem Neustart verloren (max. 60 Min Vorlauf, daher vertretbar).
 */

const MAX_MS = 60 * 60 * 1000; // 60 Minuten

function schedule(jid, delayMs, text, mentions) {
  const ms = Math.min(Math.max(0, delayMs), MAX_MS);
  const t = setTimeout(() => {
    state.sendQueue
      .enqueue(jid, mentions ? { text, mentions } : { text })
      .catch((e) => logger.error({ err: e }, 'Reminder-Versand fehlgeschlagen'));
  }, ms);
  if (t.unref) t.unref();
  return ms;
}

module.exports = { schedule, MAX_MS };
