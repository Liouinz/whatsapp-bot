'use strict';

const pino = require('pino');
const config = require('./config');

/**
 * Ein pino-Logger, der zugleich von Baileys genutzt wird (Baileys erwartet einen
 * pino-kompatiblen Logger mit .child()).
 */
const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
