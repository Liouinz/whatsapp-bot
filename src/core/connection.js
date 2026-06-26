'use strict';

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

const { getDb } = require('./db');
const { useTursoAuthState } = require('./auth-turso');
const { SendQueue } = require('./send-queue');
const logger = require('./logger');

/**
 * Gemeinsamer Verbindungs-Zustand. Wird von Web-UI (QR-Seite, Status) und
 * später vom Router/Events gelesen.
 */
const state = {
  sock: null,
  sendQueue: new SendQueue(null),
  currentQr: null, // data-URL PNG des aktuellen QR (oder null wenn verbunden)
  connection: 'close', // 'connecting' | 'open' | 'close'
  lastConnectedAt: null,
  me: null,
  startedAt: Date.now(),
  commandsProcessed: 0,
  powered: true, // Web-UI kann den Bot "ausschalten" (ignoriert dann Nachrichten)
};

let retries = 0;
let disconnectWindow = []; // Zeitstempel der letzten Disconnects (Health-Watch)

async function startSocket() {
  const db = getDb();
  const { state: authState, saveCreds, clearSession } = await useTursoAuthState(db, 'main');

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    logger.warn('fetchLatestBaileysVersion fehlgeschlagen — nutze Baileys-Default-Version');
  }

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, logger),
    },
    browser: ['CommunityBot', 'Chrome', '2.0.0'],
    markOnlineOnConnect: false, // weniger "Server-Spam" (Anti-Ban)
  });

  state.sock = sock;
  state.connection = 'connecting';
  state.sendQueue.setSock(sock);

  sock.ev.on('creds.update', saveCreds);

  // Event-Verarbeitung (messages.upsert, group-participants.update): Befehle,
  // Auto-Moderation, Welcome/Verify, Rejoin-Sperre, Stats. Lazy require vermeidet
  // einen Modul-Zyklus (events.js → connection.js state).
  require('../bot/events').attach(sock);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      try {
        state.currentQr = await QRCode.toDataURL(qr);
        logger.info('Neuer QR-Code generiert — Web-Seite /qr öffnen und scannen');
      } catch (e) {
        logger.error({ err: e }, 'QR konnte nicht gerendert werden');
      }
    }

    if (connection) state.connection = connection;

    if (connection === 'open') {
      retries = 0;
      disconnectWindow = [];
      state.currentQr = null;
      state.lastConnectedAt = Date.now();
      state.me = sock.user;
      logger.info({ me: sock.user?.id }, 'WhatsApp verbunden ✅');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      logger.warn({ code }, 'Verbindung geschlossen');

      if (code === DisconnectReason.loggedOut) {
        logger.warn('Ausgeloggt — Session wird gelöscht; beim Neustart ist ein neuer QR nötig');
        await clearSession();
        retries = 0;
        setTimeout(() => safeStart(), 1500);
        return;
      }

      // Health-Watch: Disconnect-Häufung → langsamer reconnecten (Anti-Ban)
      const now = Date.now();
      disconnectWindow = disconnectWindow.filter((t) => now - t < 5 * 60 * 1000);
      disconnectWindow.push(now);
      const crowded = disconnectWindow.length > 5;

      // Exponentieller Backoff bis 60 s
      const base = Math.min(1000 * 2 ** retries++, 60_000);
      const extra = crowded ? 30_000 : 0;
      const delay = Math.min(base + extra, 60_000);

      if (crowded) {
        logger.warn(`Auffällig viele Disconnects (${disconnectWindow.length}/5min) — reconnect verlangsamt`);
      }
      logger.info(`Reconnect in ${delay} ms (Versuch ${retries})`);
      setTimeout(() => safeStart(), delay);
    }
  });

  return sock;
}

/** Reconnect-Wrapper, der Fehler beim Aufbau abfängt (Crash-Schutz). */
async function safeStart() {
  try {
    await startSocket();
  } catch (e) {
    logger.error({ err: e }, 'startSocket fehlgeschlagen — neuer Versuch in 15 s');
    setTimeout(() => safeStart(), 15_000);
  }
}

module.exports = { startSocket: safeStart, state };
