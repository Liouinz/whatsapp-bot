'use strict';

/**
 * keepalive.js — Wachhalten (Plan Phase 3).
 *
 * Stolperstein-Bezug: Free-Hosting (z. B. Render) schläft ohne Traffic ein.
 *  - Exponiert einen schlanken HTTP-Server mit /health (für externen Pinger).
 *  - Zusätzlich interner Self-Ping auf SELF_URL/health alle ~5 Min als Backup.
 *
 * Der Express-App-Handle wird exportiert, damit das Web-Panel (Phase 20)
 * seine Routen auf denselben Server/Port hängen kann (Render gibt nur einen).
 */

const express = require('express');
const { logger } = require('./logger');

const PING_INTERVAL = 5 * 60 * 1000; // ~5 Min
const startedAt = Date.now();

let app = null;
let server = null;
let pingTimer = null;

function buildApp(getStatus) {
  const a = express();
  a.disable('x-powered-by');

  a.get('/health', (req, res) => {
    try {
      const s = (typeof getStatus === 'function' ? getStatus() : {}) || {};
      res.status(200).json({
        ok: true,
        connected: !!s.connected,
        uptime_s: Math.round((Date.now() - startedAt) / 1000),
        rss_mb: Math.round(process.memoryUsage().rss / 1048576),
        ts: Date.now(),
      });
    } catch (e) {
      // /health darf nie hart fehlschlagen.
      res.status(200).json({ ok: false, error: e.message });
    }
  });

  return a;
}

/** Interner Self-Ping als Backup zum externen Pinger. */
function startSelfPing() {
  const url = process.env.SELF_URL;
  if (!url) {
    logger.warn(
      'Keepalive: SELF_URL nicht gesetzt → kein interner Self-Ping. Externen Pinger auf /health einrichten.'
    );
    return;
  }
  const target = url.replace(/\/+$/, '') + '/health';
  pingTimer = setInterval(async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(target, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) logger.warn(`Self-Ping ${target} → HTTP ${r.status}`);
    } catch (e) {
      logger.warn(`Self-Ping fehlgeschlagen: ${e.message}`);
    }
  }, PING_INTERVAL);
  if (pingTimer.unref) pingTimer.unref();
}

/**
 * Startet HTTP-Server + Self-Ping.
 * @param {object} opts { getStatus(): {connected:boolean} }
 */
function start({ getStatus } = {}) {
  app = buildApp(getStatus);
  const port = process.env.PORT || 3000; // PORT kommt vom Hoster (nicht selbst setzen)
  server = app.listen(port, () => logger.warn(`Keepalive/Health läuft auf Port ${port} (GET /health).`));
  server.on('error', (e) => logger.error(`HTTP-Server-Fehler: ${e.message}`));
  startSelfPing();
  return { app, server };
}

function getApp() {
  return app;
}

function stop() {
  try {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    server?.close();
  } catch {
    /* ignore */
  }
}

module.exports = { start, getApp, stop, PING_INTERVAL };
