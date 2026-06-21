/**
 * WhatsApp Community Bot
 * - Verbindet sich über Baileys mit WhatsApp
 * - Schickt alle 5 Minuten ein Lebenszeichen in eine private Heartbeat-Gruppe
 * - Reagiert auf einfache Befehle in Chats/Gruppen
 * - Stellt einen /ping HTTP-Endpoint bereit, damit UptimeRobot den Server wachhalten kann
 */

const express = require('express');
const pino = require('pino');
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

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ---------- HTTP-Server für Health-Checks (UptimeRobot etc.) ----------

const app = express();
let botStatus = 'starting'; // starting | connected | disconnected
let currentQr = null; // speichert den aktuellsten QR-Code-String

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.get('/qr', async (req, res) => {
  if (botStatus === 'connected') {
    return res.send('<h2>✅ Bot ist bereits verbunden. Kein QR-Code nötig.</h2>');
  }
  if (!currentQr) {
    return res.send('<h2>⏳ Noch kein QR-Code verfügbar. Seite in ein paar Sekunden neu laden.</h2>');
  }
  try {
    const qrImage = await QRCode.toDataURL(currentQr, { width: 400, margin: 2 });
    res.send(`
      <html>
        <head><meta http-equiv="refresh" content="20"></head>
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

app.get('/', (req, res) => {
  res.status(200).json({
    status: botStatus,
    uptimeMinutes: Math.floor(process.uptime() / 60),
  });
});

app.listen(PORT, () => {
  logger.info(`HTTP-Server läuft auf Port ${PORT}`);
});

// ---------- WhatsApp-Bot ----------

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
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      logger.info('QR-Code zum Einloggen (im Logs-Tab von Render sichtbar):');
      qrcode.generate(qr, { small: true });
      logger.info('Alternativ als Bild öffnen: [DEINE-RENDER-URL]/qr');
    }

    if (connection === 'open') {
      botStatus = 'connected';
      logger.info('✅ Erfolgreich mit WhatsApp verbunden!');
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
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    if (!text.startsWith(COMMAND_PREFIX)) return;

    const [command, ...args] = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);

    try {
      await handleCommand(sock, remoteJid, command.toLowerCase(), args, msg);
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

async function handleCommand(sock, jid, command, args, msg) {
  switch (command) {
    case 'ping':
      await sock.sendMessage(jid, { text: 'pong 🏓' }, { quoted: msg });
      break;

    case 'hilfe':
    case 'help':
      await sock.sendMessage(
        jid,
        {
          text:
            `*Verfügbare Befehle:*\n` +
            `${COMMAND_PREFIX}ping – Testet, ob der Bot reagiert\n` +
            `${COMMAND_PREFIX}status – Zeigt Laufzeit-Infos\n` +
            `${COMMAND_PREFIX}hilfe – Zeigt diese Übersicht`,
        },
        { quoted: msg }
      );
      break;

    case 'status': {
      const uptimeMin = Math.floor(process.uptime() / 60);
      await sock.sendMessage(
        jid,
        { text: `🟢 Bot läuft seit ${uptimeMin} Minuten.` },
        { quoted: msg }
      );
      break;
    }

    default:
      // Unbekannte Befehle werden bewusst ignoriert, um Spam zu vermeiden.
      break;
  }
}

startBot().catch((err) => {
  logger.error({ err }, 'Bot konnte nicht gestartet werden');
  process.exit(1);
});
