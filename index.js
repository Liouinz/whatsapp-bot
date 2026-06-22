/**
 * WhatsApp-Test-Bot — schlanke Version mit Web-Oberfläche
 * -------------------------------------------------------
 * - Verbindet sich über Baileys mit WhatsApp
 * - Zeigt den Login-QR-Code auf einer passwortgeschützten Website (/qr?key=...)
 * - Einstellungsseite (/settings?key=...): Gruppen & Communities auswählen,
 *   in denen der Bot aktiv sein soll (wird in bot_config.json gespeichert)
 * - Offener /ping-Endpoint für externe Uptime-Monitore
 * - Optionaler Self-Ping als Ergänzung gegen Inaktivität
 *
 * Umgebungsvariablen:
 *   PORT          – HTTP-Port (Render setzt das automatisch, Standard 3000)
 *   QR_PASSWORD   – Passwort für /qr und /settings (Pflicht)
 *   SELF_URL      – eigene öffentliche URL für Self-Ping (optional)
 *   COMMAND_PREFIX– Präfix für Befehle (Standard "!")
 *   LOG_LEVEL     – Pino-Log-Level (Standard "info")
 */

const fs = require('fs');
const path = require('path');
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
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';
const CONFIG_PATH = path.join(__dirname, 'bot_config.json');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Gemeinsamer Zustand
const botState = {
  qr: null,
  connected: false,
  startedAt: Date.now(),
  me: null, // { id, name }
  sock: null,
  groups: [], // [{ id, subject, size, isCommunity, community }]
  groupsFetchedAt: 0,
};

// Persistente Konfiguration: in welchen Gruppen der Bot aktiv sein soll
let config = { activeGroups: [] };
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!Array.isArray(config.activeGroups)) config.activeGroups = [];
  } catch {
    config = { activeGroups: [] };
  }
}
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    logger.error({ err }, 'Konfiguration konnte nicht gespeichert werden');
  }
}
loadConfig();

// ---------- Hilfsfunktionen ----------

function passwordOk(provided) {
  if (!QR_PASSWORD) return false;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(QR_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLE = `
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:#0f1115;color:#e7e9ee;
       margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px}
  .card{background:#1a1d24;border:1px solid #2a2f3a;border-radius:16px;padding:24px;
        max-width:560px;width:100%;margin:12px 0;box-shadow:0 6px 24px rgba(0,0,0,.3)}
  h1{font-size:1.4rem;margin:0 0 4px} h2{font-size:1.1rem;margin:0 0 12px}
  .muted{color:#8b93a3;font-size:.9rem} a{color:#4f9cf9}
  .qr{background:#fff;padding:16px;border-radius:12px;display:inline-block}
  .status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.85rem;font-weight:600}
  .on{background:#10391f;color:#4ade80} .off{background:#3a1010;color:#f87171}
  .grp{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #2a2f3a;
       border-radius:10px;margin:8px 0;background:#141821}
  .grp input{width:20px;height:20px;accent-color:#4f9cf9;flex-shrink:0}
  .grp .name{font-weight:600} .badge{font-size:.7rem;background:#2a3550;color:#9db8ff;
       padding:2px 8px;border-radius:999px;margin-left:6px}
  button{background:#4f9cf9;color:#06122a;border:0;border-radius:10px;padding:12px 20px;
         font-size:1rem;font-weight:700;cursor:pointer;width:100%;margin-top:12px}
  button:hover{background:#6fb0ff}
  .row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
`;

function page(title, body, opts = {}) {
  const refresh = opts.refresh
    ? `<meta http-equiv="refresh" content="${opts.refresh};url=${opts.refreshUrl || ''}">`
    : '';
  return `<!doctype html><html lang="de"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    ${refresh}<title>${title}</title><style>${STYLE}</style></head>
    <body>${body}</body></html>`;
}

// Middleware: prüft das Passwort, sonst Abbruch
function requireAuth(req, res) {
  if (!QR_PASSWORD) {
    res.status(503).send(page('Gesperrt', '<div class="card"><h1>🔒 Gesperrt</h1><p class="muted">Es ist kein QR_PASSWORD gesetzt. Bitte in den Render-Einstellungen setzen.</p></div>'));
    return false;
  }
  if (!passwordOk(req.query.key)) {
    res.status(401).send(page('Zugriff verweigert', '<div class="card"><h1>🔒 Zugriff verweigert</h1><p class="muted">Falsches oder fehlendes Passwort.</p></div>'));
    return false;
  }
  return true;
}

// ---------- Webserver ----------

const app = express();
app.use(express.urlencoded({ extended: true }));

// Offener Health-Check für externe Uptime-Monitore
app.get('/ping', (_req, res) => res.status(200).send('ok'));

// Öffentlicher Statusüberblick (ohne Geheimnisse)
app.get('/', (_req, res) => {
  res.json({
    status: botState.connected ? 'verbunden' : 'getrennt',
    nummer: botState.me ? botState.me.id.split(':')[0] : null,
    qrVerfuegbar: Boolean(botState.qr),
    aktiveGruppen: config.activeGroups.length,
    uptimeSekunden: Math.round((Date.now() - botState.startedAt) / 1000),
  });
});

// QR-Code-Seite (passwortgeschützt)
app.get('/qr', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  const keyParam = `?key=${encodeURIComponent(req.query.key)}`;

  if (botState.connected) {
    return res.send(page('Verbunden', `
      <div class="card">
        <h1>✅ Verbunden</h1>
        <p class="muted">Der Bot ist mit WhatsApp verbunden.</p>
        <a href="/settings${keyParam}"><button>Weiter zu den Einstellungen →</button></a>
      </div>`));
  }
  if (!botState.qr) {
    return res.send(page('Warte auf QR', `
      <div class="card" style="text-align:center">
        <h1>⏳ QR-Code wird vorbereitet…</h1>
        <p class="muted">Die Seite lädt automatisch neu.</p>
      </div>`, { refresh: 8, refreshUrl: `/qr${keyParam}` }));
  }

  try {
    const qrImage = await QRCode.toDataURL(botState.qr, { width: 360, margin: 1 });
    res.send(page('WhatsApp QR-Code', `
      <div class="card" style="text-align:center">
        <h1>📲 WhatsApp verbinden</h1>
        <p class="muted">WhatsApp → Einstellungen → <b>Verknüpfte Geräte</b> → <b>Gerät hinzufügen</b></p>
        <div class="qr"><img src="${qrImage}" alt="QR Code" width="360" height="360"></div>
        <p class="muted">Der Code aktualisiert sich automatisch.</p>
      </div>`, { refresh: 25, refreshUrl: `/qr${keyParam}` }));
  } catch (err) {
    logger.error({ err }, 'Fehler beim Erzeugen des QR-Codes');
    res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
  }
});

// Einstellungsseite: Gruppen/Communities auswählen (passwortgeschützt)
app.get('/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = `?key=${encodeURIComponent(req.query.key)}`;

  if (!botState.connected) {
    return res.send(page('Nicht verbunden', `
      <div class="card">
        <h1>⚠️ Noch nicht verbunden</h1>
        <p class="muted">Bitte zuerst die Nummer per QR-Code verbinden.</p>
        <a href="/qr${keyParam}"><button>Zum QR-Code →</button></a>
      </div>`, { refresh: 6, refreshUrl: `/settings${keyParam}` }));
  }

  // Gruppen laden (frisch, falls älter als 30s)
  await refreshGroups();

  const active = new Set(config.activeGroups);
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';

  let groupsHtml = '';
  if (botState.groups.length === 0) {
    groupsHtml = '<p class="muted">Keine Gruppen gefunden. Füge den Bot zu einer Gruppe hinzu und lade neu.</p>';
  } else {
    for (const g of botState.groups) {
      const checked = active.has(g.id) ? 'checked' : '';
      const badge = g.isCommunity
        ? '<span class="badge">🏘️ Community</span>'
        : g.community ? '<span class="badge">in Community</span>' : '';
      groupsHtml += `
        <label class="grp">
          <input type="checkbox" name="active" value="${escapeHtml(g.id)}" ${checked}>
          <span><span class="name">${escapeHtml(g.subject || 'Unbenannt')}</span>${badge}
            <br><span class="muted">${g.size || 0} Mitglieder</span></span>
        </label>`;
    }
  }

  res.send(page('Einstellungen', `
    <div class="card">
      <div class="row">
        <h1>⚙️ Einstellungen</h1>
        <span class="status on">verbunden</span>
      </div>
      <p class="muted">Nummer: <b>${escapeHtml(nummer)}</b> · Aktive Gruppen: <b>${config.activeGroups.length}</b></p>
    </div>
    <form class="card" method="POST" action="/settings/save${keyParam}">
      <h2>In welchen Gruppen soll der Bot aktiv sein?</h2>
      <p class="muted">Wähle die Gruppen & Communities aus. Nur dort reagiert der Bot.</p>
      ${groupsHtml}
      <button type="submit">💾 Auswahl speichern</button>
    </form>
    <div class="card row">
      <a href="/settings${keyParam}">🔄 Gruppen neu laden</a>
      <a href="/qr${keyParam}">QR-Code</a>
    </div>`));
});

// Auswahl speichern
app.post('/settings/save', (req, res) => {
  if (!requireAuth(req, res)) return;
  const keyParam = `?key=${encodeURIComponent(req.query.key)}`;

  let selected = req.body.active || [];
  if (!Array.isArray(selected)) selected = [selected];
  config.activeGroups = selected.filter(Boolean);
  saveConfig();
  logger.info({ aktiveGruppen: config.activeGroups.length }, 'Aktive Gruppen aktualisiert');

  res.send(page('Gespeichert', `
    <div class="card">
      <h1>✅ Gespeichert</h1>
      <p class="muted">Der Bot ist jetzt in <b>${config.activeGroups.length}</b> Gruppe(n) aktiv.</p>
      <a href="/settings${keyParam}"><button>Zurück zu den Einstellungen</button></a>
    </div>`));
});

const server = app.listen(PORT, () => logger.info(`HTTP-Server läuft auf Port ${PORT}`));

// ---------- Optionaler Self-Ping ----------
if (SELF_URL) {
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.debug('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, 4 * 60 * 1000);
}

// ---------- Gruppen laden ----------
async function refreshGroups(force = false) {
  if (!botState.sock || !botState.connected) return;
  if (!force && Date.now() - botState.groupsFetchedAt < 30 * 1000) return;
  try {
    const all = await botState.sock.groupFetchAllParticipating();
    botState.groups = Object.values(all)
      .map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size || (g.participants ? g.participants.length : 0),
        isCommunity: Boolean(g.isCommunity),
        community: g.linkedParent || null,
      }))
      .sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
    botState.groupsFetchedAt = Date.now();
    logger.info({ anzahl: botState.groups.length }, 'Gruppen geladen');
  } catch (err) {
    logger.warn({ err }, 'Gruppen konnten nicht geladen werden');
  }
}

// ---------- WhatsApp-Verbindung ----------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger });
  botState.sock = sock;

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
      botState.me = sock.user;
      logger.info({ nummer: sock.user?.id }, '✅ Mit WhatsApp verbunden');
      refreshGroups(true);
    }

    if (connection === 'close') {
      botState.connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Ausgeloggt. Ordner "auth_info" löschen und neu per QR-Code einloggen.');
      } else {
        logger.warn({ statusCode }, 'Verbindung getrennt – Neuverbindung in 3s');
        setTimeout(() => startBot().catch((err) => logger.error({ err }, 'Reconnect fehlgeschlagen')), 3000);
      }
    }
  });

  // Nachrichten verarbeiten – nur in ausgewählten Gruppen
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) continue; // nur Gruppen
        if (msg.key.fromMe) continue;
        if (!config.activeGroups.includes(jid)) continue; // nur aktive Gruppen

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';
        if (!text.startsWith(COMMAND_PREFIX)) continue;

        const cmd = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/)[0].toLowerCase();
        if (cmd === 'ping') {
          await sock.sendMessage(jid, { text: 'pong 🏓' });
        } else if (cmd === 'id') {
          await sock.sendMessage(jid, { text: `Gruppen-ID: ${jid}` });
        }
      } catch (err) {
        logger.warn({ err }, 'Fehler beim Verarbeiten einer Nachricht');
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
