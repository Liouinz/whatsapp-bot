/**
 * Dashboard- & QR-Code-Website
 * ----------------------------
 * Dieses Modul enthält ausschließlich die HTTP-Webseite des Bots:
 * - /ping        – für UptimeRobot (öffentlich, ohne Passwort)
 * - /            – minimaler Status als JSON (öffentlich, ohne Passwort)
 * - /qr          – zeigt den WhatsApp-Login-QR-Code (passwortgeschützt)
 * - /dashboard   – Live-Status (RAM, Uptime, ...) (passwortgeschützt)
 * - /restart     – startet den Bot-Prozess neu (passwortgeschützt)
 *
 * Sicherheitsmaßnahmen in diesem Modul:
 * - Zeitkonstanter Passwortvergleich (verhindert Timing-Angriffe)
 * - Sperrung einer IP nach mehreren Fehlversuchen (Brute-Force-Schutz)
 * - Rate-Limiting auf allen passwortgeschützten Routen
 * - "Cache-Control: no-store" auf sensiblen Seiten
 * - Konsequentes HTML-Escaping aller dynamischen Werte (gegen XSS)
 *
 * Hinweis: Die In-Memory-Speicher (Fehlversuche, Rate-Limits) gelten pro
 * Prozess. Läuft der Bot später auf mehreren Render-Instanzen gleichzeitig,
 * bräuchte man dafür einen gemeinsamen Speicher (z. B. Redis).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 Minuten Sperre
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Zeitfenster, in dem Versuche gezählt werden

// Verhindert XSS, wenn Werte (z. B. der Gerätename oder ?key=...) in HTML eingebettet werden.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function getDiskInfo() {
  return new Promise((resolve) => {
    if (!fs.statfs) return resolve(null);
    fs.statfs('.', (err, stats) => {
      if (err) return resolve(null);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      resolve({
        totalGb: (totalBytes / 1024 / 1024 / 1024).toFixed(2),
        freeGb: (freeBytes / 1024 / 1024 / 1024).toFixed(2),
        usedGb: ((totalBytes - freeBytes) / 1024 / 1024 / 1024).toFixed(2),
      });
    });
  });
}

// Zeitkonstanter Vergleich, unabhängig von der Länge der Eingabe.
// Ein normaler "===" Vergleich kann theoretisch über minimale Zeitunterschiede
// Rückschlüsse aufs richtige Passwort zulassen – das hier verhindert das.
function safeCompare(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function renderMessagePage(title, message) {
  return `
    <html><body style="font-family:sans-serif; text-align:center; padding-top:60px;">
      <h3>${escapeHtml(title)}</h3>
      <p>${message}</p>
    </body></html>
  `;
}

/**
 * Erstellt den Express-Router für die Webseite.
 *
 * @param {object} deps
 * @param {object} deps.botState - geteiltes Status-Objekt (von index.js befüllt)
 * @param {string} deps.dashboardPassword - DASHBOARD_PASSWORD aus den Env-Vars
 * @param {(reason: string) => boolean} deps.triggerRestart - löst einen Neustart aus
 * @param {object} deps.logger - pino-Logger-Instanz
 */
function createDashboardRouter({ botState, dashboardPassword, triggerRestart, logger }) {
  const router = express.Router();

  // ---------- Brute-Force-Schutz (pro IP) ----------
  const failedAttempts = new Map(); // ip -> { count, firstAttempt, lockedUntil }

  function isLockedOut(ip) {
    const entry = failedAttempts.get(ip);
    return Boolean(entry?.lockedUntil && Date.now() < entry.lockedUntil);
  }

  function recordFailedAttempt(ip) {
    const now = Date.now();
    let entry = failedAttempts.get(ip);
    if (!entry || now - entry.firstAttempt > ATTEMPT_WINDOW_MS) {
      entry = { count: 0, firstAttempt: now, lockedUntil: null };
    }
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_MS;
      logger.warn(`IP ${ip} wegen zu vieler Fehlversuche für 15 Minuten gesperrt.`);
    }
    failedAttempts.set(ip, entry);
  }

  function clearAttempts(ip) {
    failedAttempts.delete(ip);
  }

  // Räumt alte/abgelaufene Einträge auf, damit der Speicher nicht unbegrenzt wächst.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of failedAttempts) {
      const expired = now - entry.firstAttempt > ATTEMPT_WINDOW_MS;
      const unlocked = !entry.lockedUntil || now > entry.lockedUntil;
      if (expired && unlocked) failedAttempts.delete(ip);
    }
  }, 30 * 60 * 1000);
  cleanupInterval.unref?.();

  function requireDashboardAuth(req, res, next) {
    if (!dashboardPassword) return next(); // Kein Passwort konfiguriert (Warnung kommt beim Start)

    const ip = req.ip;
    if (isLockedOut(ip)) {
      return res.status(429).send(
        renderMessagePage('🔒 Vorübergehend gesperrt', 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.')
      );
    }

    const providedKey = req.query.key ?? req.body?.key ?? '';
    const isValid =
      typeof providedKey === 'string' &&
      providedKey.length > 0 &&
      providedKey.length <= 256 &&
      safeCompare(providedKey, dashboardPassword);

    if (isValid) {
      clearAttempts(ip);
      return next();
    }

    recordFailedAttempt(ip);
    logger.warn(`Fehlgeschlagener Dashboard-Login-Versuch von ${ip}`);
    return res.status(401).send(
      renderMessagePage('🔒 Zugriff verweigert', 'Bitte URL mit <code>?key=DEIN_PASSWORT</code> aufrufen.')
    );
  }

  // ---------- Rate-Limiter ----------
  // Bremst Brute-Force-Versuche & allgemeinen Missbrauch zusätzlich zur Sperre oben.
  const sensitiveLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const restartLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ---------- Öffentliche Routen ----------

  // Für UptimeRobot – bewusst ohne Passwort & ohne Rate-Limit, damit der
  // Monitoring-Dienst nie versehentlich ausgesperrt wird.
  router.get('/ping', (req, res) => {
    res.status(200).send('OK');
  });

  router.get('/', (req, res) => {
    res.status(200).json({
      status: botState.status,
      uptimeMinutes: Math.floor(process.uptime() / 60),
    });
  });

  // ---------- Geschützte Routen ----------

  router.get('/qr', sensitiveLimiter, requireDashboardAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const keyParam = dashboardPassword ? `?key=${encodeURIComponent(req.query.key)}` : '';
    const safeKeyParam = escapeHtml(keyParam);

    if (botState.status === 'connected') {
      return res.redirect(`/dashboard${keyParam}`);
    }
    if (!botState.qr) {
      return res.send(`
        <html>
          <head><meta http-equiv="refresh" content="10;url=/qr${safeKeyParam}"></head>
          <body style="text-align:center; font-family: sans-serif; padding-top: 40px;">
            <h2>⏳ Noch kein QR-Code verfügbar</h2>
            <p>Seite lädt automatisch neu...</p>
          </body>
        </html>
      `);
    }
    try {
      const qrImage = await QRCode.toDataURL(botState.qr, { width: 400, margin: 2 });
      res.send(`
        <html>
          <head><meta http-equiv="refresh" content="20;url=/qr${safeKeyParam}"></head>
          <body style="text-align:center; font-family: sans-serif; padding-top: 40px;">
            <h2>WhatsApp QR-Code scannen</h2>
            <img src="${qrImage}" alt="QR Code" />
            <p>Einstellungen → Verknüpfte Geräte → Gerät verknüpfen</p>
            <p style="color:gray; font-size: 12px;">Seite aktualisiert sich automatisch alle 20 Sekunden.</p>
          </body>
        </html>
      `);
    } catch (err) {
      logger.error({ err }, 'Fehler beim Erzeugen des QR-Codes');
      res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
    }
  });

  router.get('/dashboard', sensitiveLimiter, requireDashboardAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const keyParam = dashboardPassword ? `?key=${encodeURIComponent(req.query.key)}` : '';
    const safeKeyParam = escapeHtml(keyParam);
    const safeKeyValue = escapeHtml(dashboardPassword ? req.query.key : '');

    if (botState.status !== 'connected') {
      return res.redirect(`/qr${keyParam}`);
    }

    const mem = process.memoryUsage();
    const usedMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMb = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
    const uptimeMin = Math.floor(process.uptime() / 60);
    const uptimeStr = uptimeMin >= 60
      ? `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}min`
      : `${uptimeMin} min`;

    const sysTotalMb = (os.totalmem() / 1024 / 1024).toFixed(0);
    const sysFreeMb = (os.freemem() / 1024 / 1024).toFixed(0);
    const sysUsedMb = (sysTotalMb - sysFreeMb).toFixed(0);
    const cpuLoad = os.loadavg()[0].toFixed(2);

    const disk = await getDiskInfo();

    res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="15;url=/dashboard${safeKeyParam}">
          <style>
            body { font-family: sans-serif; background:#111; color:#eee; padding: 24px; max-width: 480px; margin: auto; }
            h2 { color:#4ade80; }
            .card { background:#1c1c1c; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
            .row { display:flex; justify-content:space-between; padding: 4px 0; border-bottom: 1px solid #2a2a2a; }
            .row:last-child { border-bottom:none; }
            .label { color:#888; }
            .value { font-weight:bold; }
            button { background:#dc2626; color:white; border:none; padding:10px 16px; border-radius:8px; font-size:14px; }
            button.restart { background:#2563eb; }
            a { color:#4ade80; }
          </style>
        </head>
        <body>
          <h2>✅ Bot-Dashboard</h2>
          <div class="card">
            <div class="row"><span class="label">Status</span><span class="value">🟢 Verbunden</span></div>
            <div class="row"><span class="label">Verbunden als</span><span class="value">${escapeHtml(botState.connectedName) || 'Unbekannt'}</span></div>
            <div class="row"><span class="label">Nummer</span><span class="value">${escapeHtml(botState.connectedNumber) || 'Unbekannt'}</span></div>
            <div class="row"><span class="label">Verbunden seit</span><span class="value">${escapeHtml(botState.lastConnectedAt) || '–'}</span></div>
          </div>
          <div class="card">
            <div class="row"><span class="label">Uptime</span><span class="value">${uptimeStr}</span></div>
            <div class="row"><span class="label">Befehle verarbeitet</span><span class="value">${botState.messagesProcessed}</span></div>
            <div class="row"><span class="label">Letzter Befehl</span><span class="value">${escapeHtml(botState.lastCommand) || '–'}</span></div>
          </div>
          <div class="card">
            <div class="row"><span class="label">RAM Bot (Heap genutzt)</span><span class="value">${usedMb} MB</span></div>
            <div class="row"><span class="label">RAM Bot (Heap gesamt)</span><span class="value">${heapTotalMb} MB</span></div>
            <div class="row"><span class="label">RAM Bot (Prozess gesamt)</span><span class="value">${rssMb} MB</span></div>
            <div class="row"><span class="label">RAM Server gesamt</span><span class="value">${sysUsedMb} / ${sysTotalMb} MB</span></div>
            <div class="row"><span class="label">CPU-Last (1 Min)</span><span class="value">${cpuLoad}</span></div>
          </div>
          <div class="card">
            ${disk
              ? `<div class="row"><span class="label">Speicherplatz</span><span class="value">${disk.usedGb} / ${disk.totalGb} GB</span></div>
                 <div class="row"><span class="label">Frei</span><span class="value">${disk.freeGb} GB</span></div>`
              : `<div class="row"><span class="label">Speicherplatz</span><span class="value">nicht verfügbar</span></div>`}
          </div>
          <div class="card">
            <div class="row"><span class="label">Erlaubte Community</span><span class="value">${botState.communityConfigured ? '✅ aktiv' : '❌ nicht gesetzt'}</span></div>
            <div class="row"><span class="label">Bekannte Gruppen</span><span class="value">${botState.communityGroupIds.size}</span></div>
          </div>
          <form method="POST" action="/restart" style="margin-top:16px;">
            <input type="hidden" name="key" value="${safeKeyValue}" />
            <button class="restart" onclick="return confirm('Bot wirklich neu starten?')">🔄 Bot neu starten</button>
          </form>
          <p style="color:#555; font-size:12px; margin-top:16px;">Seite aktualisiert sich automatisch alle 15 Sekunden.</p>
        </body>
      </html>
    `);
  });

  router.post('/restart', restartLimiter, requireDashboardAuth, (req, res) => {
    const triggered = triggerRestart(`Dashboard-Button (IP ${req.ip})`);
    if (triggered) {
      res.send('<p>Neustart wird eingeleitet... Render startet den Service neu.</p>');
    } else {
      res.send('<p>Neustart wurde erst kürzlich ausgelöst. Bitte kurz warten, bevor du es erneut versuchst.</p>');
    }
  });

  return router;
}

module.exports = { createDashboardRouter, escapeHtml, safeCompare };
