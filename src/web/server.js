'use strict';

const express = require('express');
const config = require('../core/config');
const logger = require('../core/logger');
const { state } = require('../core/connection');

/**
 * Minimaler Web-Server für Phase 1: QR-Seite + Health-Routen (Keep-Alive).
 * Die vollständige, abgesicherte Web-UI (geheimer Link, CSRF, Dashboard,
 * Gruppen-Settings …) folgt in Phase 5.
 */
function startWeb() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/ping', (_req, res) => res.type('text').send('ok'));

  app.get('/healthz', (_req, res) =>
    res.json({
      ok: true,
      connection: state.connection,
      connected: state.connection === 'open',
      uptimeSec: Math.round(process.uptime()),
    })
  );

  app.get('/qr', (_req, res) => {
    const connected = state.connection === 'open';
    const inner = connected
      ? '<p class="ok">✅ Bot ist verbunden.</p>'
      : state.currentQr
        ? `<img src="${state.currentQr}" alt="QR-Code" />`
        : '<p class="wait">Warte auf QR-Code … Seite lädt automatisch neu.</p>';

    res.type('html').send(`<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CommunityBot — Verbindung</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6e9f5;
    background:radial-gradient(1000px 500px at 70% -10%,#3b2a6b33,transparent),
               radial-gradient(800px 450px at 0% 110%,#0e7c8c33,transparent),#0b1020;padding:20px}
  .card{width:100%;max-width:360px;background:rgba(255,255,255,.05);
    border:1px solid rgba(140,120,255,.25);border-radius:24px;padding:28px 24px;text-align:center;
    box-shadow:0 0 40px rgba(120,90,255,.18)}
  h1{font-size:1.15rem;font-weight:600;margin:0 0 16px}
  img{width:100%;border-radius:16px;background:#fff;padding:10px}
  .ok{color:#5ef0a0;font-size:1.05rem}
  .wait{color:#9aa3b8}
  small{display:block;margin-top:16px;color:#6b7280;font-size:.78rem;line-height:1.5}
</style></head><body>
  <div class="card">
    <h1>📱 WhatsApp koppeln</h1>
    ${inner}
    <small>WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen, dann diesen Code scannen.</small>
  </div>
  <script>setTimeout(function(){location.reload()}, 8000)</script>
</body></html>`);
  });

  app.get('/', (_req, res) => res.redirect('/qr'));

  // PORT NICHT hardcoden — Render vergibt automatisch
  app.listen(config.port, () => logger.info(`Web-UI läuft auf Port ${config.port}`));

  return app;
}

module.exports = { startWeb };
