'use strict';

/**
 * send-queue.js — zentrale Sende-Drossel (Plan Phase 4, Anti-Ban).
 *
 *  - ALLE Sends laufen durch eine FIFO-Queue (ein Send zur Zeit).
 *  - Jitter 800–2500 ms zwischen den Sends.
 *  - "composing" (Tippen) vor langen Antworten.
 *  - Gruppen-Adds gedrosselt auf ~3 / 10 Min.
 *  - Bei 403 → Queue pausieren (mögliche Sperre, keine Schleifen).
 *  - getGroupMetaCached (aus identity) hier mit re-exportiert.
 *
 * Nie crashen: Fehler werden geloggt, Jobs rejecten sauber.
 */

const { logger } = require('./logger');
const { getGroupMetaCached, invalidateGroupMeta } = require('./identity');

const MIN_JITTER = 800;
const MAX_JITTER = 2500;
const COMPOSING_THRESHOLD = 120; // ab so vielen Zeichen vorher "tippen"

let ADD_MAX = 3;
let ADD_WINDOW = 10 * 60 * 1000; // 10 Min

const queue = [];
let working = false;
let paused = false;
const addTimestamps = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_JITTER + Math.floor(Math.random() * (MAX_JITTER - MIN_JITTER));

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.text || content.caption || '';
}

function isForbidden(e) {
  const code = e?.output?.statusCode || e?.statusCode;
  return code === 403 || /forbidden/i.test(e?.message || '');
}

async function worker() {
  if (working) return;
  working = true;
  try {
    while (queue.length && !paused) {
      const job = queue.shift();
      try {
        const text = extractText(job.content);
        // "composing" vor langen Antworten.
        if (job.sock && job.jid && text && text.length > COMPOSING_THRESHOLD) {
          try {
            await job.sock.sendPresenceUpdate('composing', job.jid);
          } catch {
            /* presence ist best-effort */
          }
          await sleep(Math.min(1500, 400 + text.length * 8));
        }
        const res = await job.sock.sendMessage(job.jid, job.content, job.options);
        job.resolve(res);
      } catch (e) {
        if (isForbidden(e)) {
          paused = true;
          logger.error('Sende-Queue: 403 erhalten → Queue pausiert (mögliche Sperre).');
          job.reject(e);
          break;
        }
        logger.warn(`Senden fehlgeschlagen: ${e.message}`);
        job.reject(e);
      }
      // Jitter nur, wenn noch etwas wartet.
      if (queue.length && !paused) await sleep(jitter());
    }
  } finally {
    working = false;
  }
}

/** Reiht einen Send ein; Promise resolved mit dem Baileys-Ergebnis. */
function enqueueSend(sock, jid, content, options) {
  return new Promise((resolve, reject) => {
    queue.push({ sock, jid, content, options, resolve, reject });
    worker().catch((e) => logger.warn(`Queue-Worker-Fehler: ${e.message}`));
  });
}

/** Bequemer Text-Send über die Queue. */
function sendText(sock, jid, text, options) {
  return enqueueSend(sock, jid, { text }, options);
}

/** Gruppen-Mitglieder hinzufügen — gedrosselt auf ~ADD_MAX / ADD_WINDOW. */
async function addParticipants(sock, jid, participants) {
  const now = Date.now();
  while (addTimestamps.length && now - addTimestamps[0] > ADD_WINDOW) addTimestamps.shift();
  if (addTimestamps.length >= ADD_MAX) {
    const waitMs = ADD_WINDOW - (now - addTimestamps[0]) + 100;
    logger.warn(`Add-Drossel: warte ${Math.round(waitMs / 1000)}s vor weiterem Hinzufügen.`);
    await sleep(waitMs);
    return addParticipants(sock, jid, participants);
  }
  addTimestamps.push(Date.now());
  try {
    const res = await sock.groupParticipantsUpdate(jid, participants, 'add');
    invalidateGroupMeta(jid);
    return res;
  } catch (e) {
    logger.warn(`addParticipants fehlgeschlagen: ${e.message}`);
    throw e;
  }
}

function pause(reason) {
  paused = true;
  logger.warn(`Sende-Queue pausiert${reason ? ': ' + reason : '.'}`);
}

function resume() {
  if (!paused) return;
  paused = false;
  logger.warn('Sende-Queue fortgesetzt.');
  worker().catch((e) => logger.warn(`Queue-Worker-Fehler: ${e.message}`));
}

function isPaused() {
  return paused;
}

function pendingCount() {
  return queue.length;
}

// Test-Helfer (für deterministische Add-Drossel-Tests).
function _setAddLimits(max, windowMs) {
  ADD_MAX = max;
  ADD_WINDOW = windowMs;
}

module.exports = {
  enqueueSend,
  sendText,
  addParticipants,
  pause,
  resume,
  isPaused,
  pendingCount,
  getGroupMetaCached,
  invalidateGroupMeta,
  _setAddLimits,
  MIN_JITTER,
  MAX_JITTER,
};
