/**
 * WhatsApp Community Bot — Hauptlogik
 * ------------------------------------
 * - Verbindet sich über Baileys mit WhatsApp
 * - Schickt alle 5 Minuten ein Lebenszeichen in eine private Heartbeat-Gruppe
 * - Reagiert auf einfache Befehle in Chats/Gruppen
 * - Bindet die Dashboard-Website aus dashboard.js ein
 *
 * Sicherheitsmaßnahmen in diesem Modul:
 * - Validierung der wichtigsten Umgebungsvariablen beim Start (mit Warnungen)
 * - HTTP-Sicherheits-Header über Helmet (CSP, etc.)
 * - Begrenzte Body-Größe für POST-Requests (gegen Payload-Floods)
 * - "trust proxy" korrekt gesetzt, damit Rate-Limiting & Logging echte
 *   Client-IPs sehen (Render läuft hinter einem Reverse-Proxy)
 * - Rate-Limiting für WhatsApp-Befehle pro Absender (gegen Spam/Missbrauch)
 * - "!gruppen" und "!neustart" sind nur noch für Gruppen-Admins erlaubt
 * - Cooldown für Neustarts (verhindert Neustart-Spam über Chat & Dashboard)
 * - Saubere Prozess-Absicherung (uncaughtException, SIGTERM, ...)
 * - Aufräumen von Timern bei Reconnects (verhindert Speicher-/Timer-Leaks)
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
// Falls leer, macht der Bot keinen Self-Ping (empfohlen: stattdessen UptimeRobot nutzen).
const SELF_URL = process.env.SELF_URL || '';

// Optional: Kommagetrennte Liste erlaubter Chat-/Gruppen-IDs.
// Falls gesetzt, reagiert der Bot NUR in diesen Chats auf Befehle.
const ALLOWED_CHATS = (process.env.ALLOWED_CHATS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

// Optional: Die ID der WhatsApp-Community selbst (nicht einer einzelnen Untergruppe).
// Format: "123456789@g.us"
const COMMUNITY_ID = process.env.COMMUNITY_ID || '';

// Passwort zum Schutz von /qr, /dashboard und /restart.
// Ohne dieses Passwort kann JEDER im Internet, der die URL kennt, den Bot-Status
// sehen und neu starten lassen. Unbedingt ein langes, zufälliges Passwort setzen!
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ---------- Konfiguration validieren ----------
// Prüft beim Start die wichtigsten Einstellungen und warnt bei Problemen,
// statt erst später mit unklaren Fehlern zu scheitern.
function validateConfig() {
  if (!DASHBOARD_PASSWORD) {
    logger.warn(
      'DASHBOARD_PASSWORD ist nicht gesetzt. /qr, /dashboard und /restart sind ' +
      'für JEDEN im Internet ohne Passwort erreichbar. Setze DASHBOARD_PASSWORD in den Render-Umgebungsvariablen!'
    );
  } else if (DASHBOARD_PASSWORD.length < 12) {
    logger.warn(
      'DASHBOARD_PASSWORD ist kürzer als 12 Zeichen. Für mehr Sicherheit ein längeres, zufälliges Passwort verwenden.'
    );
  }

  if (!HEARTBEAT_GROUP_ID) {
    logger.warn('HEARTBEAT_GROUP_ID nicht gesetzt – Heartbeat ist deaktiviert.');
  } else if (!HEARTBEAT_GROUP_ID.endsWith('@g.us')) {
    logger.warn('HEARTBEAT_GROUP_ID sieht ungültig aus (sollte auf "@g.us" enden).');
  }

  if (COMMUNITY_ID && !COMMUNITY_ID.endsWith('@g.us')) {
    logger.warn('COMMUNITY_ID sieht ungültig aus (sollte auf "@g.us" enden).');
  }

  for (const chatId of ALLOWED_CHATS) {
    if (!chatId.endsWith('@g.us') && !chatId.endsWith('@s.whatsapp.net')) {
      logger.warn(`ALLOWED_CHATS enthält einen ungültig aussehenden Eintrag: ${chatId}`);
    }
  }
}
validateConfig();

// ---------- Geteilter Bot-Status ----------
// Dieses Objekt wird per Referenz an die Dashboard-Website (dashboard.js)
// weitergegeben. Änderungen hier sind dort sofort sichtbar.
const botState = {
  status: 'starting', // starting | connected | disconnected
  qr: null,
  connectedNumber: null,
  connectedName: null,
  lastConnectedAt: null,
  messagesProcessed: 0,
  lastCommand: null,
  communityConfigured: Boolean(COMMUNITY_ID),
  communityGroupIds: new Set(),
};

let currentSock = null;

// ---------- Neustart-Logik (gemeinsam für Dashboard-Button & !neustart) ----------
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
  setTimeout(() => process.exit(0), 500); // Render startet den Prozess automatisch neu
  return true;
}

// ---------- HTTP-Server ----------
const app = express();

// Render läuft hinter einem Reverse-Proxy. Ohne diese Zeile würde req.ip
// immer die interne Proxy-IP liefern statt der echten Client-IP – Rate-Limiting
// und die Login-Sperre in dashboard.js würden dadurch wirkungslos.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Dashboard nutzt einfache Inline-Styles
        imgSrc: ["'self'", 'data:'], // QR-Code wird als data:-Bild eingebettet
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    },
  })
);

// Begrenzte Body-Größe, damit niemand den /restart-Endpunkt mit riesigen
// Requests überlasten kann.
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(
  createDashboardRouter({
    botState,
    dashboardPassword: DASHBOARD_PASSWORD,
    triggerRestart,
    logger,
  })
);

app.listen(PORT, () => {
  logger.info(`HTTP-Server läuft auf Port ${PORT}`);
});

// ---------- Optionaler Self-Ping ----------
// Hält den Render-Free-Service wach, indem der Bot regelmäßig seine eigene URL aufruft.
// HINWEIS: UptimeRobot (externer Dienst) ist die zuverlässigere Lösung.
if (SELF_URL) {
  const SELF_PING_INTERVAL_MS = 4 * 60 * 1000; // alle 4 Minuten (unter dem 15-Min-Sleep-Limit)
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.info('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, SELF_PING_INTERVAL_MS);
  logger.info(`Self-Ping aktiviert: alle ${SELF_PING_INTERVAL_MS / 60000} Minuten an ${SELF_URL}/ping`);
}

// ---------- Prozess-Sicherheitsnetze ----------
// Verhindert, dass ein einzelner unerwarteter Fehler den Bot stillschweigend
// in einem kaputten Zustand weiterlaufen lässt.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Unbehandelte Exception – Prozess wird beendet.');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unbehandelte Promise-Rejection.');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM empfangen – fahre sauber herunter...');
  try {
    currentSock?.end?.(new Error('SIGTERM empfangen'));
  } catch {
    // Verbindung war evtl. schon zu, egal
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT empfangen – fahre sauber herunter...');
  process.exit(0);
});

// ---------- Anti-Spam für WhatsApp-Befehle ----------
// Begrenzt, wie viele Befehle eine einzelne Person in kurzer Zeit senden kann –
// schützt vor versehentlichem oder absichtlichem Spam/Flooding.
const COMMAND_RATE_LIMIT = 5;
const COMMAND_RATE_WINDOW_MS = 10 * 1000;
const commandTimestamps = new Map(); // senderJid -> [timestamps]

function isCommandRateLimited(senderJid) {
  const now = Date.now();
  const recent = (commandTimestamps.get(senderJid) || []).filter(
    (t) => now - t < COMMAND_RATE_WINDOW_MS
  );
  recent.push(now);
  commandTimestamps.set(senderJid, recent);
  return recent.length > COMMAND_RATE_LIMIT;
}

// Räumt alte Einträge auf, damit die Map nicht unbegrenzt wächst.
const commandCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [jid, timestamps] of commandTimestamps) {
    const stillRelevant = timestamps.filter((t) => now - t < COMMAND_RATE_WINDOW_MS);
    if (stillRelevant.length === 0) commandTimestamps.delete(jid);
    else commandTimestamps.set(jid, stillRelevant);
  }
}, 10 * 60 * 1000);
commandCleanupInterval.unref?.();

// ---------- WhatsApp-Bot ----------

// Lädt alle Gruppen, in denen der Bot Mitglied ist, und merkt sich,
// welche davon zur konfigurierten Community gehören (per linkedParent-Feld).
async function refreshCommunityGroups(sock) {
  if (!COMMUNITY_ID) return;
  try {
    const groups = await sock.groupFetchAllParticipating();
    const matching = Object.values(groups).filter((g) => g.linkedParent === COMMUNITY_ID);
    botState.communityGroupIds = new Set(matching.map((g) => g.id));
    logger.info(`Community-Gruppen aktualisiert: ${botState.communityGroupIds.size} Gruppen gefunden.`);
  } catch (err) {
    logger.error({ err }, 'Konnte Community-Gruppen nicht laden.');
  }
}

async function startBot() {
  // Speichert die Login-Session lokal, damit nicht bei jedem Neustart neu gescannt werden muss.
  // WICHTIG: Auf Render ist das Dateisystem im Free-Tier NICHT dauerhaft.
  // Nach jedem Neudeploy musst du also ggf. erneut per QR-Code einloggen.
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }), // weniger Spam im Log; bei Bedarf auf 'info' setzen
  });
  currentSock = sock;

  // Timer, die an diese Socket-Instanz gebunden sind. Werden bei einem
  // Reconnect bewusst gestoppt, damit sich keine Timer aus alten, toten
  // Verbindungen ansammeln (sonst: Speicher-Leak & sinnloser Heartbeat-Spam).
  let heartbeatIntervalId = null;
  let communityRefreshIntervalId = null;

  function clearOwnTimers() {
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
    if (communityRefreshIntervalId) clearInterval(communityRefreshIntervalId);
  }

  // QR-Code anzeigen, wenn ein Login nötig ist
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botState.qr = qr;
      logger.info('QR-Code zum Einloggen (im Logs-Tab von Render sichtbar):');
      qrcodeTerminal.generate(qr, { small: true });
      logger.info('Alternativ als Bild öffnen: [DEINE-RENDER-URL]/qr');
    }

    if (connection === 'open') {
      botState.status = 'connected';
      botState.qr = null;
      botState.connectedNumber = sock.user?.id?.split(':')[0] || null;
      botState.connectedName = sock.user?.name || sock.user?.notify || null;
      botState.lastConnectedAt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
      logger.info(`✅ Erfolgreich mit WhatsApp verbunden! (${botState.connectedName}, ${botState.connectedNumber})`);
      await refreshCommunityGroups(sock);

      if (COMMUNITY_ID) {
        communityRefreshIntervalId = setInterval(() => refreshCommunityGroups(sock), 30 * 60 * 1000);
      }
    }

    if (connection === 'close') {
      botState.status = 'disconnected';
      clearOwnTimers();

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
    if (!remoteJid) return;
    const isGroup = remoteJid.endsWith('@g.us');
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    // Sehr lange "Befehle" sind nie legitim – ignorieren, statt sie zu parsen
    // oder ausführlich zu loggen.
    if (!text || text.length > 300 || !text.startsWith(COMMAND_PREFIX)) return;

    const [command, ...args] = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    if (!command) return;
    const commandLower = command.toLowerCase().slice(0, 30);

    const senderJid = msg.key.participant || remoteJid;
    if (isCommandRateLimited(senderJid)) {
      logger.warn(`Befehl von ${senderJid} ignoriert – Rate-Limit erreicht.`);
      return;
    }

    // '!id' funktioniert überall, damit man neue Gruppen-IDs herausfinden kann.
    const isSetupCommand = commandLower === 'id';

    // Sicherheitsprüfung: Bot antwortet NUR in Gruppen, NIE in privaten Chats
    // (außer bei Setup-Befehlen, die du selbst zum Einrichten brauchst).
    if (!isGroup && !isSetupCommand) {
      logger.info(`Ignoriert: private Nachricht von ${remoteJid}`);
      return;
    }

    // Community-Check: reagiert nur in Gruppen, die zur konfigurierten Community gehören,
    // ODER in Chats, die explizit in ALLOWED_CHATS stehen.
    const isInCommunity = COMMUNITY_ID && botState.communityGroupIds.has(remoteJid);
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

    botState.messagesProcessed += 1;
    botState.lastCommand = `${COMMAND_PREFIX}${commandLower}`;

    try {
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
        `${COMMAND_PREFIX}hilfe – Zeigt diese Übersicht`;

      if (isAdmin) {
        helpText +=
          `\n\n*Admin-Befehle:*\n` +
          `${COMMAND_PREFIX}gruppen – Listet alle Community-Gruppen-IDs\n` +
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

    // Listet alle bekannten Community-Gruppen mit Name & ID auf.
    // Bewusst nur für Admins: das ist operative Information, die nicht jedes
    // Mitglied einer Gruppe sehen muss.
    case 'gruppen': {
      if (!isAdmin) {
        await sock.sendMessage(jid, { text: '⛔ Dieser Befehl ist nur für Gruppen-Admins.' }, { quoted: msg });
        break;
      }
      if (botState.communityGroupIds.size === 0) {
        await sock.sendMessage(
          jid,
          { text: 'Keine Community-Gruppen bekannt. Ist COMMUNITY_ID korrekt gesetzt?' },
          { quoted: msg }
        );
        break;
      }
      try {
        const allGroups = await sock.groupFetchAllParticipating();
        const lines = [...botState.communityGroupIds].map((id) => {
          const name = allGroups[id]?.subject || 'Unbekannt';
          return `• ${name}\n  ${id}`;
        });
        await sock.sendMessage(jid, { text: `*Community-Gruppen:*\n${lines.join('\n')}` }, { quoted: msg });
      } catch (err) {
        logger.error({ err }, 'Fehler beim Abrufen der Gruppenliste');
        await sock.sendMessage(jid, { text: '⚠️ Gruppenliste konnte nicht geladen werden.' }, { quoted: msg });
      }
      break;
    }

    // Nur für Admins, mit dem gleichen Cooldown wie der Dashboard-Button –
    // verhindert Neustart-Spam, egal über welchen Weg er ausgelöst wird.
    case 'neustart': {
      if (!isAdmin) {
        await sock.sendMessage(jid, { text: '⛔ Dieser Befehl ist nur für Gruppen-Admins.' }, { quoted: msg });
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
