'use strict';

/**
 * logger.js — pino auf Level "warn" (gegen Decrypt-Spam) + Nummern-Maskierung.
 *
 * Stolperstein-Bezug (Plan): Logger niemals auf "info" → sonst Decrypt-Spam.
 * Sicherheit (Plan): Telefonnummern in Log & Panel maskiert.
 *
 * Wir maskieren defensiv: ein pino-logMethod-Hook ersetzt in allen String-
 * Argumenten lange Ziffernfolgen (Nummern / JID-Localparts) durch eine
 * maskierte Form. So landet keine Klar-Nummer im Log, auch wenn ein Aufruf
 * das Maskieren vergisst.
 */

const pino = require('pino');

/** Maskiert eine reine Ziffernfolge: erste 2 + letzte 2 sichtbar, Rest "*". */
function maskNumber(input) {
  if (input === undefined || input === null) return input;
  const s = String(input);
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}

/** Maskiert eine JID (PN oder LID), Server-Teil bleibt erhalten. */
function maskJid(jid) {
  if (!jid) return jid;
  try {
    const [user, server] = String(jid).split('@');
    const local = (user || '').split(':')[0]; // device-suffix abschneiden
    return maskNumber(local) + (server ? '@' + server : '');
  } catch {
    return '***';
  }
}

/** Maskiert alle langen Ziffernfolgen (>=7) in einem freien Text. */
function maskText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\d{7,16}/g, (m) => maskNumber(m));
}

const level = process.env.LOG_LEVEL || 'warn';

const logger = pino({
  level,
  // Jede String-Botschaft durch die Maskierung schicken.
  hooks: {
    logMethod(args, method) {
      try {
        const masked = args.map((a) => (typeof a === 'string' ? maskText(a) : a));
        return method.apply(this, masked);
      } catch {
        return method.apply(this, args);
      }
    },
  },
});

module.exports = { logger, maskNumber, maskJid, maskText };
