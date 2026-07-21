// Serielle Sende-Queue mit Jitter (800–2500 ms) — ALLE ausgehenden Nachrichten
// laufen hier durch. Schützt vor Spam-Erkennung und Rate-Limits.

import { config } from './config.js';
import { state, rolloverDay } from './state.js';
import { logError } from './logger.js';

const queue = [];
let running = false;

const WAIT_FOR_CONNECTION_MS = 45_000; // bei kurzem Reconnect nicht sofort verwerfen

const jitter = () =>
  config.send.jitterMinMs +
  Math.floor(Math.random() * (config.send.jitterMaxMs - config.send.jitterMinMs));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kurz auf eine offene Verbindung warten (überbrückt normale Reconnects). */
async function waitForConnection() {
  const deadline = Date.now() + WAIT_FOR_CONNECTION_MS;
  while (Date.now() < deadline) {
    if (state.sock && state.connection === 'open') return true;
    if (state.stopped) return false; // 403/440: nichts mehr senden
    await sleep(1500);
  }
  return false;
}

let lastSentAt = 0;

async function work() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      // Jitter VOR dem Senden, gemessen am letzten Send: hält den Abstand
      // zwischen Nachrichten (Spam-Schutz), lässt aber eine einzelne Antwort
      // nach Leerlauf sofort raus — vorher hing hinter JEDEM Send ein Sleep.
      const wait = lastSentAt + jitter() - Date.now();
      if (wait > 0) await sleep(wait);
      let sent = false;
      for (let attempt = 0; attempt <= config.send.maxRetries && !sent; attempt++) {
        try {
          if (!(await waitForConnection())) {
            throw new Error('Socket nicht verbunden (Timeout beim Warten auf Reconnect)');
          }
          const result = await state.sock.sendMessage(job.jid, job.content, job.options);
          rolloverDay();
          state.sentToday++;
          lastSentAt = Date.now();
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
