// Serielle Sende-Queue mit Jitter (800–2500 ms) — ALLE ausgehenden Nachrichten
// laufen hier durch. Schützt vor Spam-Erkennung und Rate-Limits.

import { config } from './config.js';
import { state, rolloverDay } from './state.js';
import { logError } from './logger.js';

const queue = [];
let running = false;

const jitter = () =>
  config.send.jitterMinMs +
  Math.floor(Math.random() * (config.send.jitterMaxMs - config.send.jitterMinMs));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function work() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      let sent = false;
      for (let attempt = 0; attempt <= config.send.maxRetries && !sent; attempt++) {
        try {
          if (!state.sock || state.connection !== 'open') {
            throw new Error('Socket nicht verbunden');
          }
          const result = await state.sock.sendMessage(job.jid, job.content, job.options);
          rolloverDay();
          state.sentToday++;
          job.resolve?.(result);
          sent = true;
        } catch (err) {
          if (attempt < config.send.maxRetries) {
            await sleep(config.send.retryBackoffMs * (attempt + 1));
          } else {
            // Nach 2 Retries verwerfen + leise loggen — nie crashen
            logError(err, 'sendQueue');
            job.resolve?.(null);
          }
        }
      }
      await sleep(jitter());
    }
  } finally {
    running = false;
  }
}

/**
 * Nachricht einreihen. Gibt ein Promise auf das Send-Ergebnis zurück
 * (löst mit null auf, wenn endgültig verworfen wurde).
 */
export function enqueue(jid, content, options = {}) {
  return new Promise((resolve) => {
    queue.push({ jid, content, options, resolve });
    work().catch((err) => logError(err, 'sendQueue.work'));
  });
}

/** Bequemer Text-Send. `mentions` optional für @-Erwähnungen. */
export function sendText(jid, text, mentions = undefined) {
  const content = mentions?.length ? { text, mentions } : { text };
  return enqueue(jid, content);
}

/** Antwort auf eine konkrete Nachricht (mit Zitat). */
export function replyTo(msg, text, mentions = undefined) {
  const content = mentions?.length ? { text, mentions } : { text };
  return enqueue(msg.key.remoteJid, content, { quoted: msg });
}

export function queueLength() {
  return queue.length;
}
