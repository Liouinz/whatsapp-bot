'use strict';

const express = require('express');
const config = require('../core/config');
const logger = require('../core/logger');
const { state } = require('../core/connection');
const auth = require('./auth');
const panel = require('./routes');
const { layout, esc } = require('./views');

/**
 * Web-UI (Phase 5), Mobile-First + sicher.
 * - geheimer Login-Link /<ACCESS_SECRET> (statt Passwort), Session-Cookie
 * - manuelle Security-Header (kein zusätzliches Paket), CSRF auf POST
 * - IP-Lockout + Rate-Limit, timing-safe Secret-Vergleich
 */

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

function startWeb() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(securityHeaders);

  // Rate-Limit (öffentliche Health-Routen ausgenommen)
  app.use((req, res, next) => {
    if (req.path === '/ping' || req.path === '/healthz') return next();
    if (auth.rateLimited(auth.ipOf(req))) return res.status(429).type('text').send('Zu viele Anfragen.');
    next();
  });

  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // --- Öffentliche Health-Routen (Keep-Alive) ---
  app.get('/ping', (_req, res) => res.type('text').send('ok'));
  app.get('/healthz', (_req, res) =>
    res.json({ ok: true, connection: state.connection, connected: state.connection === 'open', powered: state.powered, uptimeSec: Math.round(process.uptime()) })
  );
  app.get('/robots.txt', (_req, res) => res.type('text').send('User-agent: *\nDisallow: /'));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // --- Geschütztes Panel ---
  app.use('/panel', auth.requireAuth, panel);

  // --- QR-Seite (geschützt) ---
  app.get('/qr', auth.requireAuth, (req, res) => {
    const connected = state.connection === 'open';
    const inner = connected
      ? `<p style="color:#34d399;text-align:center;font-size:18px">✅ Bot ist verbunden${state.me ? ' als +' + esc(require('../bot/util').numFromJid(state.me.id)) : ''}.</p>`
      : state.currentQr
        ? `<img class="qr" src="${state.currentQr}" alt="QR-Code">`
        : '<p class="muted" style="text-align:center">Warte auf QR-Code … Seite lädt automatisch neu.</p>';
    const body = `<div class="card"><h2>📱 WhatsApp koppeln</h2>${inner}
      <p class="muted" style="text-align:center">WhatsApp → Verknüpfte Geräte → Gerät verknüpfen, dann scannen.</p></div>`;
    if (!connected) res.setHeader('Refresh', '8');
    res.type('html').send(layout('QR', '/qr', body, req.session.csrf));
  });

  // --- Logout ---
  app.get('/logout', (req, res) => {
    const sid = auth.parseCookies(req).sid;
    auth.destroySession(sid);
    res.setHeader('Set-Cookie', auth.cookieHeader('sid', '', req, 0));
    res.redirect('/');
  });

  // --- Root: eingeloggt → Panel, sonst Hinweis ---
  app.get('/', (req, res) => {
    const sid = auth.parseCookies(req).sid;
    if (sid && auth.getSession(sid)) return res.redirect('/panel');
    res.status(200).type('html').send(
      '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content="noindex"><title>CommunityBot</title><body style="font-family:system-ui;background:#0a0e1f;color:#e8ebf7;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;opacity:.85"><div style="font-size:40px">🤖</div><h2>CommunityBot</h2><p style="opacity:.55">Zugang nur über den geheimen Link.</p></div>'
    );
  });

  // --- Login über geheimen Link: /<ACCESS_SECRET> (ZULETZT registriert) ---
  app.get('/:token', (req, res) => {
    const ip = auth.ipOf(req);
    if (auth.isLocked(ip)) return res.status(429).type('text').send('Zu viele Fehlversuche. Bitte später erneut.');
    if (!auth.secretConfigured()) return res.status(500).type('text').send('ACCESS_SECRET ist nicht gesetzt.');

    if (auth.checkSecret(req.params.token)) {
      auth.clearFail(ip);
      const { sid } = auth.createSession();
      res.setHeader('Set-Cookie', auth.cookieHeader('sid', sid, req, 8 * 60 * 60 * 1000));
      return res.redirect('/panel');
    }
    // statische Asset-Probes (mit Punkt) nicht als Fehlversuch werten → kein Lockout
    if (!req.params.token.includes('.')) auth.recordFail(ip);
    res.status(404).type('text').send('Not found');
  });

  app.listen(config.port, () => {
    logger.info(`Web-UI läuft auf Port ${config.port}`);
    if (!auth.secretConfigured()) {
      logger.warn('ACCESS_SECRET (oder QR_PASSWORD) ist nicht gesetzt — das Web-Panel ist NICHT erreichbar, bis ein langes Secret konfiguriert ist!');
    }
  });
  return app;
}

module.exports = { startWeb };
