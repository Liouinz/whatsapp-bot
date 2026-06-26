'use strict';

const logger = require('./logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Zentrale Sende-Drossel (Anti-Ban, Kapitel A).
 * ALLE ausgehenden Nachrichten laufen FIFO nacheinander durch diese Queue mit
 * zufälliger Pause (Jitter). Vor längeren Antworten wird "composing" simuliert.
 * Bei 403 (account_reachout_restricted o. ä.) pausiert die Queue automatisch.
 */
class SendQueue {
  constructor(sock = null, opts = {}) {
    this.sock = sock;
    this.minDelay = opts.minDelay ?? 800;
    this.maxDelay = opts.maxDelay ?? 2500;
    this.queue = [];
    this.running = false;
    this.pauseUntil = 0;
  }

  setSock(sock) {
    this.sock = sock;
  }

  /** Pausiert die Queue für ms Millisekunden (Health-Watch / 403). */
  pause(ms) {
    this.pauseUntil = Math.max(this.pauseUntil, Date.now() + ms);
    logger.warn(`SendQueue pausiert für ${ms} ms`);
  }

  /**
   * Nachricht einreihen. Gibt ein Promise zurück, das mit dem Baileys-Ergebnis
   * auflöst (oder rejectet). content = Baileys-Message-Content (z. B. { text }).
   */
  enqueue(jid, content, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ jid, content, options, resolve, reject });
      this._run().catch((e) => logger.error({ err: e }, 'SendQueue _run Fehler'));
    });
  }

  /** Bequemer Text-Helfer. */
  sendText(jid, text, options = {}) {
    return this.enqueue(jid, { text }, options);
  }

  async _run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const wait = this.pauseUntil - Date.now();
        if (wait > 0) await sleep(wait);

        const job = this.queue.shift();
        try {
          if (!this.sock) throw new Error('Socket nicht verbunden');

          const text = typeof job.content?.text === 'string' ? job.content.text : '';
          if (job.options.composing !== false && text.length > 20) {
            try {
              await this.sock.sendPresenceUpdate('composing', job.jid);
              await sleep(rand(400, 1200));
            } catch (_) {
              /* Presence ist best-effort */
            }
          }

          const res = await this.sock.sendMessage(
            job.jid,
            job.content,
            job.options.messageOptions || {}
          );
          job.resolve(res);
        } catch (err) {
          const code = err?.output?.statusCode || err?.data?.statusCode;
          if (code === 403) this.pause(60_000);
          logger.error({ err }, 'SendQueue: Senden fehlgeschlagen');
          job.reject(err);
        }

        await sleep(rand(this.minDelay, this.maxDelay));
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = { SendQueue };
