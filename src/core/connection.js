'use strict';

/**
 * connection.js — WhatsApp-Verbindung (Recherche-Block 1 + 2 + 6).
 *
 *  - Socket-Konfiguration exakt nach Block 1.
 *  - Reconnect-Logik exakt nach Block 2:
 *      * 515 restartRequired → SOFORT neu (normal direkt nach Pairing).
 *      * 403 forbidden → STOPP + Alarm (mögliche Sperre, keine Schleifen).
 *      * loggedOut/badSession/multideviceMismatch → Session löschen, kein Reconnect.
 *      * connectionReplaced (440) → nicht dagegenhalten.
 *      * sonst Backoff min(1000*2**retries, 60000); bei "open" → retries=0.
 *  - messages.upsert exakt nach Block 6 (type=notify, Dedupe, fromMe→nur speichern).
 *  - Watchdog-Integration + Graceful Shutdown.
 *
 * Keine Reconnect-Schleifen, nie crashen.
 */

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  isJidNewsletter,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const QRCode = require('qrcode');

const { logger } = require('./logger');
const { useTursoAuthState } = require('./auth-turso');
const msgStore = require('./msg-store');
const dedupe = require('./dedupe');
const watchdog = require('./watchdog');

const msgRetryCounterCache = new NodeCache();

let sock = null;
let connState = 'close'; // 'close' | 'connecting' | 'open'
let retries = 0;
let stopped = false; // true → kein Reconnect mehr (Logout/403/Shutdown)
let connecting = false;
let reconnectTimer = null;
let lastQR = null;

// Pluggbarer Nachrichten-Handler (Router kommt in Phase 7).
let messageHandler = async () => {};
function setMessageHandler(fn) {
  if (typeof fn === 'function') messageHandler = fn;
}

// Optionaler Alarm-Hook (z. B. Owner benachrichtigen) bei 403.
let onAlarm = () => {};
function setAlarmHandler(fn) {
  if (typeof fn === 'function') onAlarm = fn;
}

// Optionaler Hook bei erfolgreichem "open" (z. B. Sende-Queue fortsetzen).
let onOpen = () => {};
function setOpenHandler(fn) {
  if (typeof fn === 'function') onOpen = fn;
}

function getSock() {
  return sock;
}
function getQR() {
  return lastQR;
}
function isConnected() {
  return connState === 'open';
}

/** Block 2: Entscheidung je DisconnectReason-Code. */
function decideReconnect(code) {
  switch (code) {
    case DisconnectReason.loggedOut:
      return { reconnect: false, clear: true };
    case DisconnectReason.badSession:
      return { reconnect: false, clear: true };
    case DisconnectReason.multideviceMismatch:
      return { reconnect: false, clear: true };
    case DisconnectReason.connectionReplaced:
      return { reconnect: false, clear: false }; // 440: nicht dagegenhalten
    case DisconnectReason.forbidden:
      return { reconnect: false, clear: false }; // 403: evtl. gesperrt → STOPP + Alarm
    case DisconnectReason.restartRequired:
      return { reconnect: true, immediate: true }; // 515: SOFORT (nach Pairing!)
    default:
      return { reconnect: true }; // Backoff
  }
}

function scheduleReconnect(delay) {
  if (stopped) return; // im Shutdown/terminalen Zustand nicht neu verbinden
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((e) => logger.error(`Reconnect fehlgeschlagen: ${e.message}`));
  }, delay);
  if (reconnectTimer.unref) reconnectTimer.unref();
}

/** Block 6: Empfang dedupliziert + sauber. */
async function _onMessagesUpsert(s, { messages, type }) {
  watchdog.feed();
  if (type !== 'notify') return; // nur neue Nachrichten, keine History
  for (const m of messages) {
    try {
      if (!m.message) continue;
      if (dedupe.recentlyProcessed(m.key.id)) continue; // keine Doppel-Verarbeitung
      dedupe.markProcessed(m.key.id);
      if (m.key.fromMe) {
        await msgStore.save(m); // eigene NICHT moderieren, nur speichern
        continue;
      }
      await messageHandler(s, m);
    } catch (e) {
      logger.warn(`upsert-Verarbeitung fehlgeschlagen: ${e.message}`);
    }
  }
}

async function onConnectionUpdate(update, clearSession) {
  watchdog.feed();
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    lastQR = qr;
    try {
      const ascii = await QRCode.toString(qr, { type: 'terminal', small: true });
      logger.warn('QR-Code zum Koppeln verfügbar:\n' + ascii);
    } catch {
      logger.warn('QR-Code verfügbar (Anzeige im Panel).');
    }
  }

  if (connection === 'connecting') {
    connState = 'connecting';
  }

  if (connection === 'open') {
    connState = 'open';
    retries = 0;
    stopped = false;
    lastQR = null;
    logger.warn('Verbindung offen — angemeldet.');
    watchdog.feed();
    try {
      onOpen();
    } catch {
      /* ignore */
    }
  }

  if (connection === 'close') {
    connState = 'close';
    // Bereits im Shutdown oder terminalen Zustand → kein Reconnect, kein Rauschen.
    if (stopped) return;
    const code = lastDisconnect?.error?.output?.statusCode;
    const decision = decideReconnect(code);

    if (decision.clear) {
      await clearSession();
    }

    if (code === DisconnectReason.forbidden) {
      stopped = true;
      logger.error('403 FORBIDDEN — Verbindung möglicherweise gesperrt. STOPP + Alarm. Kein Reconnect.');
      try {
        onAlarm('forbidden_403');
      } catch {
        /* ignore */
      }
      return;
    }

    if (!decision.reconnect) {
      stopped = true;
      logger.warn(`Verbindung geschlossen (code ${code}) — kein Reconnect (Plan-Regel).`);
      return;
    }

    if (decision.immediate) {
      logger.warn('515 restartRequired — sofortiger Reconnect.');
      scheduleReconnect(0);
      return;
    }

    const delay = Math.min(1000 * 2 ** retries++, 60000);
    logger.warn(`Verbindung verloren (code ${code}) — Reconnect in ${delay} ms.`);
    scheduleReconnect(delay);
  }
}

/** Baut den Socket und verdrahtet alle Events. */
async function connect() {
  if (stopped || connecting) return sock;
  connecting = true;
  try {
    const { state, saveCreds, clearSession } = await useTursoAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      browser: ['CommunityBot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false, // Handy bekommt weiter Benachrichtigungen
      syncFullHistory: false, // keine riesige History (RAM/0.1-CPU schonen)
      msgRetryCounterCache,
      getMessage: async (key) => (await msgStore.get(key.id)) || undefined,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidNewsletter(jid),
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => {
      onConnectionUpdate(u, clearSession).catch((e) =>
        logger.error(`connection.update-Handler: ${e.message}`)
      );
    });
    sock.ev.on('messages.upsert', (payload) => {
      _onMessagesUpsert(sock, payload).catch((e) =>
        logger.warn(`messages.upsert-Handler: ${e.message}`)
      );
    });

    return sock;
  } catch (e) {
    logger.error(`connect() fehlgeschlagen: ${e.message}`);
    // Backoff-Reconnect, damit ein transienter Startfehler nicht endet.
    if (!stopped) scheduleReconnect(Math.min(1000 * 2 ** retries++, 60000));
    return null;
  } finally {
    connecting = false;
  }
}

/** Erzwingt einen Reconnect (vom Watchdog genutzt). */
function forceReconnect() {
  try {
    sock?.end(new Error('forceReconnect'));
  } catch {
    /* ignore */
  }
  if (!stopped) scheduleReconnect(0);
}

/** Startet Verbindung + Watchdog. */
async function start() {
  stopped = false;
  watchdog.start({ isConnected, forceReconnect });
  return connect();
}

/** Graceful Shutdown: Verbindung sauber schließen, NICHT ausloggen. */
async function shutdown() {
  stopped = true;
  watchdog.stop();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    // ws schließen ohne Logout (Session bleibt → Neustart ohne QR).
    sock?.end(undefined);
  } catch {
    /* ignore */
  }
  logger.warn('Verbindung sauber geschlossen (Graceful Shutdown).');
}

module.exports = {
  start,
  shutdown,
  connect,
  getSock,
  getQR,
  isConnected,
  forceReconnect,
  setMessageHandler,
  setAlarmHandler,
  setOpenHandler,
  decideReconnect,
  _onMessagesUpsert, // exportiert für Tests (Dedupe)
};
