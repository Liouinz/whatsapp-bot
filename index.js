/**
 * WhatsApp Community Bot — Hauptlogik (Offene Version)
 * ------------------------------------
 * - Verbindet sich über Baileys mit WhatsApp
 * - Schickt alle 5 Minuten ein Lebenszeichen in eine private Heartbeat-Gruppe
 * - Reagiert auf einfache Befehle in ALLEN Chats/Gruppen ohne Einschränkung
 * - Bindet die Dashboard-Website aus dashboard.js ein
 */

const express = require('express');
const helmet = require('helmet');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { createDashboardRouter } = require('./dashboard');

// ---------- Konfiguration ----------

const HEARTBEAT_GROUP_ID = process.env.HEARTBEAT_GROUP_ID || '';
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 5 * 60 * 1000);
const PORT = process.env.PORT || 3000;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';
const SELF_URL = process.env.SELF_URL || '';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ---------- Geteilter Bot-Status ----------
const botState = {
  status: 'starting', 
  qr: null,
  connectedNumber: null,
  connectedName: null,
  lastConnectedAt: null,
  messagesProcessed: 0,
  lastCommand: null,
  communityConfigured: false,
  communityGroupIds: new Set(),
};

let currentSock = null;

// ---------- Neustart-Logik ----------
const RESTART_COOLDOWN_MS = 2 * 60 * 1000;
let lastRestartTriggeredAt = 0;

function triggerRestart(reason) {
  const now = Date.now();
  if (now - lastRestartTriggeredAt < RESTART_COOLDOWN_MS) {
    logger.warn(`Neustart-Anfrage (${reason}) ignoriert – Cooldown aktiv.`);
    return false;
  }
  lastRestartTriggeredAt = now;
  logger.warn(`Neustart wird eingeleitet (${reason}).`);
  setTimeout(() => process.exit(0), 500);
  return true;
}

// ---------- HTTP-Server ----------
const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(
  createDashboardRouter({
    botState,
    dashboardPassword: '', 
    triggerRestart,
    logger,
  })
);

app.listen(PORT, () => {
  logger.info(`HTTP-Server läuft auf Port ${PORT}`);
});

// ---------- Optionaler Self-Ping ----------
if (SELF_URL) {
  const SELF_PING_INTERVAL_MS = 4 * 60 * 1000;
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.info('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, SELF_PING_INTERVAL_MS);
}

// ---------- Prozess-Sicherheitsnetze ----------
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Unbehandelte Exception – Prozess wird beendet.');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unbehandelte Promise-Rejection.');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM empfangen – fahre sauber herunter...');
  try { currentSock?.end?.(new Error('SIGTERM empfangen')); } catch {}
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT empfangen – fahre sauber herunter...');
  process.exit(0);
});

// ---------- Anti-Spam für WhatsApp-Befehle ----------
const COMMAND_RATE_LIMIT = 5;
const COMMAND_RATE_WINDOW_MS = 10 * 1000;
const commandTimestamps = new Map();

function isCommandRateLimited(senderJid) {
  const now = Date.now();
  const recent = (commandTimestamps.get(senderJid) || []).filter(
    (t) => now - t < COMMAND_RATE_WINDOW_MS
  );
  recent.push(now);
  commandTimestamps.set(senderJid, recent);
  return recent.length > COMMAND_RATE_LIMIT;
}

const commandCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [jid, timestamps] of commandTimestamps) {
    const stillRelevant = timestamps.filter((t) => now - t < COMMAND_RATE_WINDOW_MS);
    if (stillRelevant.length === 0) commandTimestamps.delete(jid);
    else commandTimestamps.set(jid, stillRelevant);
  }
}, 10 * 60 * 1000);
commandCleanupInterval.unref?.();

// ---------- WhatsApp-Bot Start ----------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });
  currentSock = sock;

  let heartbeatIntervalId = null;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botState.qr = qr;
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      botState.status = 'connected';
      botState.qr = null;
      botState.connectedNumber = sock.user?.id?.split(':')[0] || null;
      botState.connectedName = sock.user?.name || sock.user?.notify || null;
      botState.lastConnectedAt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
      logger.info(`✅ Erfolgreich mit WhatsApp verbunden! (${botState.connectedName})`);
    }

    if (connection === 'close') {
      botState.status = 'disconnected';
      if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);

      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startBot();
      } else {
        logger.error('Ausgeloggt. Bitte auth_info-Ordner löschen und neu per QR-Code einloggen.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ---------- Eingehende Nachrichten verarbeiten ----------
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;
    const isGroup = remoteJid.endsWith('@g.us');
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    // Falls kein Befehl oder zu lang -> ignorieren
    if (!text || text.length > 300 || !text.startsWith(COMMAND_PREFIX)) return;

    const [command, ...args] = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    if (!command) return;
    const commandLower = command.toLowerCase().slice(0, 30);

    const senderJid = msg.key.participant || remoteJid;
    if (isCommandRateLimited(senderJid)) {
      logger.warn(`Befehl von ${senderJid} ignoriert – Rate-Limit erreicht.`);
      return;
    }

    // Admin-Status ermitteln
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
    } else {
      // In privaten Direktnachrichten bist du standardmäßig Admin des Bots
      isAdmin = true;
    }

    botState.messagesProcessed += 1;
    botState.lastCommand = `${COMMAND_PREFIX}${commandLower}`;

    try {
      // Der Bot führt den Befehl nun für JEDEN Chat direkt aus!
      await handleCommand(sock, remoteJid, commandLower, args, msg, isAdmin);
    } catch (err) {
      logger.error({ err }, 'Fehler bei der Befehlsverarbeitung');
    }
  });

  // ---------- Heartbeat ----------
  if (HEARTBEAT_GROUP_ID) {
    heartbeatIntervalId = setInterval(async () => {
      try {
        const usedMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const uptimeMin = Math.floor(process.uptime() / 60);
        const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

        await sock.sendMessage(HEARTBEAT_GROUP_ID, {
          text: `💓 Online | ${timestamp} | Uptime: ${uptimeMin}min | RAM: ${usedMb}MB`,
        });
      } catch (err) {
        logger.error({ err }, 'Heartbeat failed');
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}

// ---------- Befehls-Handler ----------
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
        `${COMMAND_PREFIX}id – Zeigt die Chat-ID\n` +
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
      const usedMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      await sock.sendMessage(
        jid,
        {
          text:
            `🟢 Bot läuft seit ${uptimeMin} Minuten.\n` +
            `RAM: ${usedMb} MB\n` +
            `Befehle verarbeitet: ${botState.messagesProcessed}`,
        },
        { quoted: msg }
      );
      break;
    }

    case 'id':
      await sock.sendMessage(jid, { text: `🆔 Chat-ID:\n${jid}` }, { quoted: msg });
      break;

    case 'neustart': {
      if (!isAdmin) {
        await sock.sendMessage(jid, { text: '⛔ Dieser Befehl ist nur für Admins.' }, { quoted: msg });
        break;
      }
      const triggered = triggerRestart(`!neustart von ${msg.key.participant || jid}`);
      if (triggered) {
        await sock.sendMessage(jid, { text: '🔄 Bot wird neu gestartet...' }, { quoted: msg });
      } else {
        await sock.sendMessage(
          jid,
          { text: '⏳ Neustart wurde erst kürzlich ausgelöst. Bitte kurz warten.' },
          { quoted: msg }
        );
      }
      break;
    }

    default:
      await sock.sendMessage(
        jid,
        { text: `❓ Unbekannter Befehl. Nutze ${COMMAND_PREFIX}hilfe für eine Übersicht.` },
        { quoted: msg }
      );
  }
}

startBot().catch((err) => {
  logger.fatal({ err }, 'Fataler Fehler beim Starten des Bots.');
  process.exit(1);
});
