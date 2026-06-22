/**
 * WhatsApp-Test-Bot — schlanke Version
 * ------------------------------------
 * - Verbindet sich über Baileys mit WhatsApp
 * - Zeigt den Login-QR-Code auf einer passwortgeschützten Website (/qr?key=...)
 * - Stellt einen offenen /ping-Endpoint für externe Uptime-Monitore bereit
 * - Optionaler Self-Ping als Ergänzung gegen Inaktivität
 *
 * Konfiguration über Umgebungsvariablen:
 *   PORT          – HTTP-Port (Render setzt das automatisch, Standard 3000)
 *   QR_PASSWORD   – Passwort für die /qr-Seite (Pflicht, sonst ist /qr gesperrt)
 *   SELF_URL      – eigene öffentliche URL (z. B. https://app.onrender.com) für Self-Ping
 *   LOG_LEVEL     – Pino-Log-Level (Standard "info")
 */

const crypto = require('crypto');
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 3000;
const QR_PASSWORD = process.env.QR_PASSWORD || '';
const SELF_URL = (process.env.SELF_URL || '').replace(/\/+$/, '');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Gemeinsamer Zustand des Bots, den der Webserver auslesen kann
const botState = {
  qr: null,
  connected: false,
  startedAt: Date.now(),
};

// ---------- Hilfsfunktionen ----------

// Zeitkonstanter Passwort-Vergleich (verhindert Timing-Angriffe)
function passwordOk(provided) {
  if (!QR_PASSWORD) return false; // ohne gesetztes Passwort bleibt /qr gesperrt
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(QR_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function htmlPage(title, body, refreshSeconds, refreshUrl) {
  const refresh = refreshSeconds
    ? `<meta http-equiv="refresh" content="${refreshSeconds};url=${refreshUrl}">`
    : '';
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${refresh}
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; background:#111; color:#eee;
             display:flex; flex-direction:column; align-items:center;
             justify-content:center; min-height:100vh; margin:0; text-align:center; }
      img { background:#fff; padding:12px; border-radius:12px; }
      .muted { color:#888; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

// ---------- Webserver ----------

const app = express();

// Offener Health-Check für externe Uptime-Monitore (UptimeRobot etc.)
app.get('/ping', (_req, res) => res.status(200).send('ok'));

// Kurzer Statusüberblick (kein Geheimnis)
app.get('/', (_req, res) => {
  res.json({
    status: botState.connected ? 'verbunden' : 'getrennt',
    qrVerfuegbar: Boolean(botState.qr),
    uptimeSekunden: Math.round((Date.now() - botState.startedAt) / 1000),
  });
});

// Passwortgeschützte QR-Code-Seite
app.get('/qr', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (!QR_PASSWORD) {
    return res
      .status(503)
      .send(htmlPage('QR gesperrt', '<h2>QR-Seite gesperrt</h2><p class="muted">Es ist kein QR_PASSWORD gesetzt.</p>'));
  }
  if (!passwordOk(req.query.key)) {
    return res.status(401).send(htmlPage('Zugriff verweigert', '<h2>🔒 Zugriff verweigert</h2><p class="muted">Falsches oder fehlendes Passwort.</p>'));
  }

  const keyParam = `?key=${encodeURIComponent(req.query.key)}`;

  if (botState.connected) {
    return res.send(htmlPage('Bereits verbunden', '<h2>✅ Bot ist bereits verbunden</h2>', 15, `/qr${keyParam}`));
  }
  if (!botState.qr) {
    return res.send(
      htmlPage('Warte auf QR', '<h2>⏳ Noch kein QR-Code verfügbar…</h2><p class="muted">Die Seite lädt automatisch neu.</p>', 10, `/qr${keyParam}`)
    );
  }

  try {
    const qrImage = await QRCode.toDataURL(botState.qr, { width: 400, margin: 2 });
    res.send(
      htmlPage(
        'WhatsApp QR-Code',
        `<h2>WhatsApp QR-Code scannen</h2>
         <img src="${qrImage}" alt="QR Code" />
         <p class="muted">WhatsApp → Verknüpfte Geräte → Gerät hinzufügen</p>`,
        20,
        `/qr${keyParam}`
      )
    );
  } catch (err) {
    logger.error({ err }, 'Fehler beim Erzeugen des QR-Codes');
    res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
  }
});

const server = app.listen(PORT, () => logger.info(`HTTP-Server läuft auf Port ${PORT}`));

// ---------- Optionaler Self-Ping (Ergänzung, kein Ersatz für externen Monitor) ----------
if (SELF_URL) {
  const SELF_PING_INTERVAL_MS = 4 * 60 * 1000;
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.debug('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, SELF_PING_INTERVAL_MS);
}

// ---------- WhatsApp-Verbindung ----------

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // wir übernehmen die QR-Anzeige selbst
    logger,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botState.qr = qr;
      logger.info('Neuer QR-Code – im Browser unter /qr?key=... scannen');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      botState.connected = true;
      botState.qr = null;
      logger.info('✅ Mit WhatsApp verbunden');
    }

    if (connection === 'close') {
      botState.connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        logger.error('Ausgeloggt. Bitte den Ordner "auth_info" löschen und neu per QR-Code einloggen.');
      } else {
        logger.warn({ statusCode }, 'Verbindung getrennt – Neuverbindung in 3s');
        setTimeout(() => startBot().catch((err) => logger.error({ err }, 'Reconnect fehlgeschlagen')), 3000);
      }
    }
  });

  return sock;
}

// ---------- Graceful Shutdown ----------
function shutdown(signal) {
  logger.info(`${signal} empfangen – fahre herunter…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startBot().catch((err) => {
  logger.error({ err }, 'Bot konnte nicht gestartet werden');
  process.exit(1);
});
