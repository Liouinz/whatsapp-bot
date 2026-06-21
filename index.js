/**
 * WhatsApp Community Bot
 * - Verbindet sich über Baileys mit WhatsApp
 * - Schickt alle 5 Minuten ein Lebenszeichen in eine private Heartbeat-Gruppe
 * - Reagiert auf einfache Befehle in Chats/Gruppen
 * - Stellt einen /ping HTTP-Endpoint bereit, damit UptimeRobot den Server wachhalten kann
 */

const express = require('express');
const pino = require('pino');
const os = require('os');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

// ---------- Konfiguration ----------

// Trage hier die ID deiner privaten Heartbeat-Gruppe ein.
// Format: "1234567890-1234567890@g.us"
// Wie du die ID findest: siehe README.md
const HEARTBEAT_GROUP_ID = process.env.HEARTBEAT_GROUP_ID || '';

// Intervall für das Lebenszeichen in Millisekunden (Standard: 5 Minuten)
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 5 * 60 * 1000);

// Port für den HTTP-Server (Render setzt diesen automatisch über process.env.PORT)
const PORT = process.env.PORT || 3000;

// Präfix für Bot-Befehle, z. B. "!hilfe"
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';

// Optional: Die eigene Render-URL, damit sich der Server selbst wach halten kann.
// Beispiel: https://whatsapp-bot-vbnp.onrender.com
// Falls leer, macht der Bot keinen Self-Ping (empfohlen: stattdessen UptimeRobot nutzen).
const SELF_URL = process.env.SELF_URL || '';

// Optional: Kommagetrennte Liste erlaubter Chat-/Gruppen-IDs.
// Falls gesetzt, reagiert der Bot NUR in diesen Chats auf Befehle.
// Beispiel: "123456789-1234567890@g.us,987654321-9876543210@g.us"
// Falls leer, reagiert der Bot überall (nicht empfohlen für den Produktivbetrieb).
const ALLOWED_CHATS = (process.env.ALLOWED_CHATS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

// Optional: Die ID der WhatsApp-Community selbst (nicht einer einzelnen Untergruppe).
// Falls gesetzt, erlaubt der Bot automatisch ALLE Untergruppen dieser Community,
// ohne dass du jede einzelne ID in ALLOWED_CHATS eintragen musst.
// Format: "123456789@g.us" (Community-IDs haben kein Bindestrich-Präfix wie Gruppen)
const COMMUNITY_ID = process.env.COMMUNITY_ID || '';

// Set, das zur Laufzeit befüllt wird: alle Gruppen-IDs, die zur Community gehören.
// Wird beim Start und danach periodisch aktualisiert.
let communityGroupIds = new Set();

// Optional: Passwort zum Schutz von /qr, /dashboard und /restart.
// Ohne dieses Passwort kann JEDER im Internet, der die URL kennt, deinen Bot-Status
// sehen und neu starten lassen. Stark empfohlen, ein sicheres Passwort zu setzen!
// Aufruf dann z. B. so: https://deine-url.onrender.com/dashboard?key=DEIN_PASSWORT
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Verhindert XSS, wenn Werte aus der URL (z. B. ?key=...) in HTML eingebettet werden.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Middleware: schützt /qr, /dashboard und /restart mit einem Passwort,
// falls DASHBOARD_PASSWORD gesetzt ist. Ohne gesetztes Passwort bleibt es offen
// (mit einer deutlichen Warnung im Log, damit das nicht versehentlich passiert).
function requireDashboardAuth(req, res, next) {
  if (!DASHBOARD_PASSWORD) return next();
  const providedKey = req.query.key || req.body?.key;
  if (providedKey === DASHBOARD_PASSWORD) return next();
  res.status(401).send(`
    <html><body style="font-family:sans-serif; text-align:center; padding-top:60px;">
      <h3>🔒 Zugriff verweigert</h3>
      <p>Bitte URL mit <code>?key=DEIN_PASSWORT</code> aufrufen.</p>
    </body></html>
  `);
}

if (!DASHBOARD_PASSWORD) {
  logger.warn(
    'DASHBOARD_PASSWORD ist nicht gesetzt. /qr, /dashboard und /restart sind ' +
    'für JEDEN im Internet ohne Passwort erreichbar. Setze DASHBOARD_PASSWORD in den Render-Umgebungsvariablen!'
  );
}

const app = express();
app.use(express.urlencoded({ extended: true }));
let botStatus = 'starting'; // starting | connected | disconnected
let currentQr = null; // speichert den aktuellsten QR-Code-String
let connectedNumber = null; // Telefonnummer, mit der der Bot aktuell verbunden ist
let connectedName = null; // WhatsApp-Anzeigename des verbundenen Geräts
let lastConnectedAt = null; // Zeitpunkt der letzten erfolgreichen Verbindung
let messagesProcessed = 0; // Zähler: wie viele Befehle wurden insgesamt verarbeitet
let lastCommand = null; // letzter ausgeführter Befehl (für Live-Einblick)
let socketRef = null; // Referenz auf den aktuellen Baileys-Socket, für Restart-Button etc.

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// Liefert Festplattenspeicher-Infos, falls verfügbar (Node 19+, manche Hosts unterstützen es nicht)
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

app.get('/qr', requireDashboardAuth, async (req, res) => {
  const keyParam = DASHBOARD_PASSWORD ? `?key=${encodeURIComponent(req.query.key)}` : '';
  const safeKeyParam = escapeHtml(keyParam);

  if (botStatus === 'connected') {
    return res.redirect(`/dashboard${keyParam}`);
  }
  if (!currentQr) {
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
    const qrImage = await QRCode.toDataURL(currentQr, { width: 400, margin: 2 });
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
    res.status(500).send('Fehler beim Erzeugen des QR-Codes: ' + err.message);
  }
});

app.get('/dashboard', requireDashboardAuth, async (req, res) => {
  const keyParam = DASHBOARD_PASSWORD ? `?key=${encodeURIComponent(req.query.key)}` : '';
  const safeKeyParam = escapeHtml(keyParam);
  const safeKeyValue = escapeHtml(DASHBOARD_PASSWORD ? req.query.key : '');

  if (botStatus !== 'connected') {
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
          <div class="row"><span class="label">Verbunden als</span><span class="value">${connectedName || 'Unbekannt'}</span></div>
          <div class="row"><span class="label">Nummer</span><span class="value">${connectedNumber || 'Unbekannt'}</span></div>
          <div class="row"><span class="label">Verbunden seit</span><span class="value">${lastConnectedAt || '–'}</span></div>
        </div>
        <div class="card">
          <div class="row"><span class="label">Uptime</span><span class="value">${uptimeStr}</span></div>
          <div class="row"><span class="label">Befehle verarbeitet</span><span class="value">${messagesProcessed}</span></div>
          <div class="row"><span class="label">Letzter Befehl</span><span class="value">${lastCommand || '–'}</span></div>
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
          <div class="row"><span class="label">Erlaubte Community</span><span class="value">${COMMUNITY_ID ? '✅ aktiv' : '❌ nicht gesetzt'}</span></div>
          <div class="row"><span class="label">Bekannte Gruppen</span><span class="value">${communityGroupIds.size}</span></div>
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

app.post('/restart', requireDashboardAuth, (req, res) => {
  res.send('<p>Neustart wird eingeleitet... Render startet den Service neu.</p>');
  logger.warn('Neustart über Dashboard angefordert.');
  setTimeout(() => process.exit(0), 500); // Render startet den Prozess automatisch neu
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: botStatus,
    uptimeMinutes: Math.floor(process.uptime() / 60),
  });
});

app.listen(PORT, () => {
  logger.info(`HTTP-Server läuft auf Port ${PORT}`);
});

// ---------- Optionaler Self-Ping ----------
// Hält den Render-Free-Service wach, indem der Bot regelmäßig seine eigene URL aufruft.
// HINWEIS: UptimeRobot (externer Dienst) ist die zuverlässigere Lösung, weil er auch
// funktioniert, falls der Prozess selbst mal abstürzt. Self-Ping ist nur ein Fallback.
if (SELF_URL) {
  const SELF_PING_INTERVAL_MS = 4 * 60 * 1000; // alle 4 Minuten (unter dem 15-Min-Sleep-Limit)
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.info('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, SELF_PING_INTERVAL_MS);
  logger.info(`Self-Ping aktiviert: alle ${SELF_PING_INTERVAL_MS / 60000} Minuten an ${SELF_URL}/ping`);
}

// ---------- WhatsApp-Bot ----------

// Lädt alle Gruppen, in denen der Bot Mitglied ist, und merkt sich,
// welche davon zur konfigurierten Community gehören (per linkedParent-Feld).
async function refreshCommunityGroups(sock) {
  if (!COMMUNITY_ID) return;
  try {
    const groups = await sock.groupFetchAllParticipating();
    const matching = Object.values(groups).filter((g) => g.linkedParent === COMMUNITY_ID);
    communityGroupIds = new Set(matching.map((g) => g.id));
    logger.info(`Community-Gruppen aktualisiert: ${communityGroupIds.size} Gruppen gefunden.`);
  } catch (err) {
    logger.error({ err }, 'Konnte Community-Gruppen nicht laden.');
  }
}

async function startBot() {
  // Speichert die Login-Session lokal, damit nicht bei jedem Neustart neu gescannt werden muss.
  // WICHTIG: Auf Render ist das Dateisystem NICHT dauerhaft (kein Volume im Free-Tier).
  // Nach jedem Neudeploy musst du also ggf. erneut per QR-Code einloggen.
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }), // weniger Spam im Log; bei Bedarf auf 'info' setzen
  });

  // QR-Code anzeigen, wenn ein Login nötig ist
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      logger.info('QR-Code zum Einloggen (im Logs-Tab von Render sichtbar):');
      qrcode.generate(qr, { small: true });
      logger.info('Alternativ als Bild öffnen: [DEINE-RENDER-URL]/qr');
    }

    if (connection === 'open') {
      botStatus = 'connected';
      socketRef = sock;
      connectedNumber = sock.user?.id?.split(':')[0] || null;
      connectedName = sock.user?.name || sock.user?.notify || null;
      lastConnectedAt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
      logger.info(`✅ Erfolgreich mit WhatsApp verbunden! (${connectedName}, ${connectedNumber})`);
      await refreshCommunityGroups(sock);
    }

    if (connection === 'close') {
      botStatus = 'disconnected';
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      logger.warn(`Verbindung getrennt. Neu verbinden: ${shouldReconnect}`);

      if (shouldReconnect) {
        startBot();
      } else {
        logger.error('Ausgeloggt. Bitte auth_info-Ordner löschen und neu per QR-Code einloggen.');
      }
    }
  });

  // Zugangsdaten speichern, wenn sie sich ändern
  sock.ev.on('creds.update', saveCreds);

  // ---------- Eingehende Nachrichten verarbeiten ----------
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    if (!text.startsWith(COMMAND_PREFIX)) return;

    const [command, ...args] = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const commandLower = command.toLowerCase();

    // '!id' funktioniert überall, damit man neue Gruppen-IDs herausfinden kann
    // (z. B. beim Hinzufügen einer neuen Gruppe zur Community).
    // '!gruppen' NICHT überall erlauben: es würde sonst alle Community-Gruppennamen
    // und IDs an jeden ausgeben, der den Bot in einen fremden Chat einlädt.
    const isSetupCommand = commandLower === 'id';

    // Sicherheitsprüfung: Bot antwortet NUR in Gruppen, NIE in privaten Chats
    // (außer bei Setup-Befehlen, die du selbst zum Einrichten brauchst).
    if (!isGroup && !isSetupCommand) {
      logger.info(`Ignoriert: private Nachricht von ${remoteJid}`);
      return;
    }

    // Community-Check: reagiert nur in Gruppen, die zur konfigurierten Community gehören,
    // ODER in Chats, die explizit in ALLOWED_CHATS stehen.
    const isInCommunity = COMMUNITY_ID && communityGroupIds.has(remoteJid);
    const isExplicitlyAllowed = ALLOWED_CHATS.includes(remoteJid);
    const noRestrictionConfigured = !COMMUNITY_ID && ALLOWED_CHATS.length === 0;

    const isAllowed =
      isSetupCommand || isInCommunity || isExplicitlyAllowed || noRestrictionConfigured;

    if (!isAllowed) {
      logger.info(`Ignoriert: Befehl "${commandLower}" von nicht erlaubtem Chat ${remoteJid}`);
      return;
    }

    // Admin-Status ermitteln (nur relevant in Gruppen)
    let isAdmin = false;
    if (isGroup) {
      try {
        const metadata = await sock.groupMetadata(remoteJid);
        const sender = msg.key.participant || msg.key.remoteJid;
        const participant = metadata.participants.find((p) => p.id === sender);
        isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
      } catch (err) {
        logger.warn({ err }, 'Konnte Admin-Status nicht prüfen.');
      }
    }

    messagesProcessed += 1;
    lastCommand = `${COMMAND_PREFIX}${commandLower}`;

    try {
      await handleCommand(sock, remoteJid, commandLower, args, msg, isAdmin);
    } catch (err) {
      logger.error({ err }, 'Fehler bei der Befehlsverarbeitung');
    }
  });

  // ---------- Heartbeat ----------
  if (HEARTBEAT_GROUP_ID) {
    setInterval(async () => {
      try {
        const usedMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const uptimeMin = Math.floor(process.uptime() / 60);
        const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

        await sock.sendMessage(HEARTBEAT_GROUP_ID, {
          text: `💓 Online | ${timestamp} | Uptime: ${uptimeMin}min | RAM: ${usedMb}MB`,
        });
      } catch (err) {
        logger.error({ err }, 'Heartbeat fehlgeschlagen');
      }
    }, HEARTBEAT_INTERVAL_MS);

    logger.info(`Heartbeat aktiviert: alle ${HEARTBEAT_INTERVAL_MS / 60000} Minuten`);
  } else {
    logger.warn('HEARTBEAT_GROUP_ID nicht gesetzt – Heartbeat ist deaktiviert.');
  }
}

// ---------- Befehle ----------

async function handleCommand(sock, jid, command, args, msg, isAdmin) {
  switch (command) {
    case 'ping':
      await sock.sendMessage(jid, { text: 'pong 🏓' }, { quoted: msg });
      break;

    case 'hilfe':
    case 'help': {
      let helpText =
        `*Verfügbare Befehle:*\n` +
        `${COMMAND_PREFIX}ping – Testet, ob der Bot reagiert\n` +
        `${COMMAND_PREFIX}status – Zeigt Laufzeit-Infos\n` +
        `${COMMAND_PREFIX}id – Zeigt die Chat-ID (für Heartbeat-Setup)\n` +
        `${COMMAND_PREFIX}gruppen – Listet alle Gruppen-IDs des Bots\n` +
        `${COMMAND_PREFIX}hilfe – Zeigt diese Übersicht`;

      if (isAdmin) {
        helpText +=
          `\n\n*Admin-Befehle:*\n` +
          `${COMMAND_PREFIX}neustart – Startet den Bot-Prozess neu`;
      }

      await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
      break;
    }

    case 'status': {
      const uptimeMin = Math.floor(process.uptime() / 60);
      await sock.sendMessage(
        jid,
        { text: `🟢 Bot läuft seit ${uptimeMin} Minuten.` },
        { quoted: msg }
      );
      break;
    }

    case 'id':
      await sock.sendMessage(
        jid,
        { text: `📋 Diese Chat-ID lautet:\n${jid}` },
        { quoted: msg }
      );
      break;

    case 'gruppen': {
      try {
        const groups = await sock.groupFetchAllParticipating();
        const list = Object.values(groups)
          .map((g) => `• ${g.subject}\n  ${g.id}`)
          .join('\n\n');
        await sock.sendMessage(
          jid,
          { text: `📋 *Gruppen, in denen der Bot Mitglied ist:*\n\n${list || 'Keine Gruppen gefunden.'}` },
          { quoted: msg }
        );
      } catch (err) {
        await sock.sendMessage(jid, { text: `Fehler beim Abrufen der Gruppen: ${err.message}` });
      }
      break;
    }

    case 'neustart':
      if (!isAdmin) {
        await sock.sendMessage(jid, { text: '⛔ Nur Admins dürfen den Bot neu starten.' }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { text: '🔄 Bot wird neu gestartet...' }, { quoted: msg });
      setTimeout(() => process.exit(0), 1000);
      break;

    default:
      // Unbekannte Befehle werden bewusst ignoriert, um Spam zu vermeiden.
      break;
  }
}

startBot().catch((err) => {
  logger.error({ err }, 'Bot konnte nicht gestartet werden');
  process.exit(1);
});