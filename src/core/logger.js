'use strict';

const pino = require('pino');
const config = require('./config');

/**
 * pino-Logger (auch von Baileys genutzt) + In-Memory-Ring-Buffer der letzten
 * Fehler/Warnungen für die Fehlerlog-Seite der Web-UI.
 */
const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
});

const RING_MAX = 200;
const ring = [];

function record(level, args) {
  let msg = '';
  let err;
  for (const a of args) {
    if (typeof a === 'string') msg = msg ? `${msg} ${a}` : a;
    else if (a && typeof a === 'object') {
      if (a.err instanceof Error) err = a.err;
      else if (a instanceof Error) err = a;
    }
  }
  ring.push({
    at: Date.now(),
    level,
    msg: msg || (err ? err.message : ''),
    stack: err ? String(err.stack || err.message).split('\n').slice(0, 3).join('\n') : undefined,
  });
  if (ring.length > RING_MAX) ring.shift();
}

// error/warn zusätzlich in den Ring-Buffer schreiben (Instanz-Methoden überschreiben)
for (const lvl of ['error', 'warn']) {
  const orig = logger[lvl].bind(logger);
  logger[lvl] = (...args) => {
    try {
      record(lvl, args);
    } catch (_) {
      /* never throw from logging */
    }
    return orig(...args);
  };
}

logger.recentErrors = () => ring.slice().reverse();

module.exports = logger;
