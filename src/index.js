// Einstiegspunkt: preflight() → initDb() → Web-Panel → Baileys-Socket-Lifecycle.
// Reconnect-Logik folgt exakt der DisconnectReason-Tabelle (515/428/440/411/401/403).

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

import { BOT_NAME, OWNER_NUMBERS, config } from './config.js';
import { preflight } from './preflight.js';
import { initDb, startFlushLoop, stopFlushLoop, flushBuffers } from './db.js';
import { useTursoAuthState } from './auth.js';
import { state, setPairingCodeRequester, setForceRelinkHandler } from './state.js';
import { logInfo, logWarn, logError, ownerAlert, setOwnerNotifier } from './logger.js';
import { sendText } from './queue.js';
import { handleUpsert, loadToggles } from './router.js';
import { loadCustomCommands } from './commands/custom.js';
import { loadAfk } from './commands/afk.js';
import { loadMutes, handleJoin, getGroupSettings } from './moderation.js';
import { invalidateGroupMeta } from './permissions.js';
import { initAiUsage } from './ai.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { createDashboard, refreshGroupCache } from './dashboard.js';

const baileysLogger = pino({ level: 'silent' }); // Baileys-Rauschen komplett stumm

let clearSessionFn = null;
let reconnectTimer = null;
let selfPingTimer = null;
let httpServer = null;
let shuttingDown = false;

// Steht eine Pairing-Code-Anfrage aus, wird sie GENAU EINMAL direkt nach dem
// Aufbau des nächsten frischen Sockets eingelöst (siehe startSocket) — QR- und
// Code-Verknüpfung sind zwei getrennte Modi derselben Verbindung, die von
// Anfang an feststehen müssen. Anfordern auf einem bereits laufenden
// QR-Socket führt auf dem Handy zu "Gerät konnte nicht hinzugefügt werden".
let pendingPairing = null; // { phoneNumber, resolve, reject }

/** clearSessionFn ist erst nach dem ersten startSocket()-Durchlauf gesetzt —
 * niemals ungeprüft aufrufen (clearSessionFn?.().catch(...) würde bei null
 * mit "Cannot read properties of undefined (reading 'catch')" crashen). */
async function safeClearSession() {
  try {
    if (clearSessionFn) await clearSessionFn();
  } catch { /* Löschen darf nie werfen — Aufrufer macht trotzdem weiter */ }
}

// In-Memory-Ministore für getMessage (gegen Retry-/Decrypt-Probleme)
const messageStore = new Map(); // "jid|id" → message
function storeMessage(msg) {
  if (!msg?.key?.id || !msg.message) return;
  messageStore.set(`${msg.key.remoteJid}|${msg.key.id}`, msg.message);
  if (messageStore.size > 1500) messageStore.delete(messageStore.keys().next().value);
}

// ── Socket-Lifecycle ───────────────────────────────────────────────

async function startSocket() {
  if (shuttingDown || state.stopped) return;

  const { state: authState, saveCreds, clearSession } = await useTursoAuthState('main');
  clearSessionFn = clearSession;

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // Baileys nimmt dann seinen eingebauten Standard
  }

  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, baileysLogger),
    },
    logger: baileysLogger,
    printQRInTerminal: false, // QR läuft über /qr (geschützt) + ASCII im Log
    markOnlineOnConnect: false, // WICHTIG: Handy bekommt weiter Push-Benachrichtigungen
    syncFullHistory: false,
    browser: [BOT_NAME, 'Chrome', '1.0.0'],
    getMessage: async (key) => messageStore.get(`${key.remoteJid}|${key.id}`) || undefined,
  });

  state.sock = sock;
  state.connection = 'connecting';

  sock.ev.on('creds.update', () => saveCreds().catch((e) => logError(e, 'saveCreds')));

  sock.ev.on('connection.update', (update) => {
    // Events verwaister Sockets ignorieren — sonst stößt ein alter Socket nach
    // 515/411 einen zweiten Reconnect an (Doppel-Socket → 440-Schleife).
    if (state.sock !== sock) return;
    handleConnectionUpdate(update).catch((e) => logError(e, 'connection.update'));
  });

  sock.ev.on('messages.upsert', (upsert) => {
    try {
      for (const m of upsert.messages || []) storeMessage(m);
    } catch { /* Store ist nur Beiwerk */ }
    handleUpsert(upsert).catch((e) => logError(e, 'upsert'));
  });

  sock.ev.on('group-participants.update', (ev) => {
    handleParticipants(ev).catch((e) => logError(e, 'participants'));
  });

  // Pairing-Code SOFORT auf dem frischen Socket anfordern — bevor der normale
  // QR-Handshake überhaupt Fahrt aufnimmt (siehe Kommentar bei pendingPairing).
  // makeWASocket() liefert den Socket zurück, BEVOR die zugrunde liegende
  // WebSocket-Verbindung tatsächlich offen ist — requestPairingCode() wirft in
  // diesem kurzen Fenster hart "Connection Closed" (Baileys wartet dort nicht
  // selbst). Deshalb kurz mit Backoff wiederholen, bis die Verbindung steht.
  if (pendingPairing) {
    const { phoneNumber, resolve, reject } = pendingPairing;
    pendingPairing = null;
    try {
      let raw, lastErr;
      for (let attempt = 0; attempt < 20 && state.sock === sock; attempt++) {
        try {
          raw = await sock.requestPairingCode(phoneNumber);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      if (lastErr) throw lastErr;
      if (state.sock !== sock) throw new Error('Socket wurde zwischenzeitlich ersetzt.');
      const formatted = raw.match(/.{1,4}/g)?.join('-') || raw;
      state.pairingCode = formatted;
      state.pairingCodeUpdatedAt = Date.now();
      logInfo(`🔢 Pairing-Code angefordert für +${phoneNumber} (frischer Socket).`);
      resolve(formatted);
    } catch (err) {
      reject(err);
    }
  }
}

async function handleConnectionUpdate({ connection, lastDisconnect, qr }) {
  if (qr) {
    // QR-Schleife ist normal, solange nicht gescannt (~60 s neuer Code)
    state.currentQr = await QRCode.toDataURL(qr, { width: 512, margin: 2 }).catch(() => null);
    state.qrUpdatedAt = Date.now();
    logInfo('📱 Neuer QR-Code bereit — im Panel unter /qr scannen.');
    printQrAscii(qr);
    return;
  }

  if (connection === 'open') {
    state.connection = 'open';
    state.currentQr = null;
    state.pairingCode = null; // gekoppelt — Code hat ausgedient
    state.lastConnectedAt = Date.now();
    state.reconnectAttempts = 0;

    // LID-Basis: PN-JID UND LID des Bots erfassen (Grundlage der Admin-Erkennung)
    state.botJidPn = state.sock?.user?.id ? jidNormalizedUser(state.sock.user.id) : null;
    state.botJidLid = state.sock?.user?.lid ? jidNormalizedUser(state.sock.user.lid) : null;
    logInfo(`✅ Verbunden als ${BOT_NAME} (PN: ${state.botJidPn || '—'} · LID: ${state.botJidLid || '—'})`);

    // Gruppen-Cache im Hintergrund vorwärmen (Panel zeigt Gruppenzahl sofort,
    // LID-Mappings werden gelernt) — Fehler dabei sind unkritisch.
    setTimeout(() => refreshGroupCache().catch((e) => logError(e, 'groupCache')), 8000);
    return;
  }

  if (connection === 'close') {
    state.connection = 'close';
    const code = lastDisconnect?.error?.output?.statusCode ?? 0;

    if (shuttingDown) return;

    switch (code) {
      case DisconnectReason.restartRequired: // 515 — normal nach Pairing
        logInfo('🔁 Restart nach Pairing (515) — verbinde sofort neu (kein Fehler).');
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      case DisconnectReason.loggedOut: // 401 — alte Session NICHT reconnecten
        logWarn('⛔ 401 loggedOut: Session wird gelöscht, frische Kopplung über /qr nötig.');
        await safeClearSession();
        state.pairingCode = null; // alter Code gehörte zur gelöschten Session
        await ownerAlert(
          '⛔ *Bot wurde ausgeloggt (401).* Die Session wurde zurückgesetzt — bitte im Panel unter /qr neu koppeln.'
        );
        // Frischen (ungekoppelten) Socket starten, damit /qr sofort einen neuen Code zeigt.
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      case DisconnectReason.badSession: // 411 — Session kaputt → löschen, neuer QR
        logWarn('⚠️ Session beschädigt (411) — lösche Session, neuer QR nötig.');
        await safeClearSession();
        state.pairingCode = null; // alter Code gehörte zur gelöschten Session
        await ownerAlert('⚠️ Session war beschädigt und wurde zurückgesetzt — bitte /qr neu scannen.');
        return void startSocket().catch((e) => logError(e, 'startSocket'));

      case DisconnectReason.connectionReplaced: // 440 — nicht blind reconnecten
        state.stopped = true;
        state.stopReason = 'Andere Session aktiv (440)';
        await ownerAlert(
          '⚠️ *Verbindung ersetzt (440):* Irgendwo läuft eine zweite Bot-Session. Ich stoppe, um keine Endlosschleife zu bauen — andere Instanz beenden, dann neu starten.'
        );
        return;

      case DisconnectReason.forbidden: // 403 — möglicher Ban → STOPPEN
      case 403:
        state.stopped = true;
        state.stopReason = 'Möglicher Ban (403)';
        await ownerAlert(
          '🚨 *403 erhalten — möglicherweise wurde die Nummer gesperrt!* Ich stoppe alle Reconnects. Bitte Nummer in WhatsApp prüfen, bevor irgendetwas neu gestartet wird.'
        );
        return;

      default:
        scheduleReconnect(code);
    }
  }
}

function scheduleReconnect(code) {
  state.reconnectAttempts++;
  if (state.reconnectAttempts > config.reconnect.maxAttempts) {
    state.stopped = true;
    state.stopReason = `Zu viele Reconnect-Versuche (zuletzt Code ${code || '?'})`;
    ownerAlert(
      `🚨 *Verbindung dauerhaft gescheitert* (${config.reconnect.maxAttempts} Versuche, zuletzt Code ${code || '?'}). Ich stoppe — bitte Logs/Render prüfen.`
    ).catch(() => {});
    return;
  }
  // Exponentieller Backoff (1 s → max 60 s) + Jitter — nie in enger Schleife
  const base = Math.min(
    config.reconnect.baseDelayMs * 2 ** (state.reconnectAttempts - 1),
    config.reconnect.maxDelayMs
  );
  const delay = base + Math.floor(Math.random() * 1000);
  logInfo(`🔁 Verbindung zu (Code ${code || '?'}) — Reconnect-Versuch ${state.reconnectAttempts} in ${Math.round(delay / 1000)}s.`);
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    startSocket().catch((e) => logError(e, 'startSocket'));
  }, delay);
}

function printQrAscii(qr) {
  QRCode.toString(qr, { type: 'terminal', small: true })
    .then((s) => console.log(s))
    .catch(() => {});
}

// ── Gruppen-Events (Joins: Willkommen, Bans, Anti-Raid) ────────────

async function handleParticipants({ id, participants, action }) {
  // Bei JEDER Teilnehmer-Änderung den Metadata-Cache verwerfen —
  // promote/demote ändert Admin-Rechte, die Checks müssen frisch sein.
  invalidateGroupMeta(id);
  if (action !== 'add') return;
  await handleJoin(id, participants);
  try {
    const settings = await getGroupSettings(id);
    if (Number(settings.welcome) && Number(settings.enabled)) {
      const few = participants.slice(0, 5);
      const tags = few.map((p) => `@${String(p).split('@')[0]}`).join(' ');
      const custom = String(settings.welcome_text || '').trim();
      const text = custom
        ? custom.replaceAll('{name}', tags)
        : `👋 Willkommen ${tags}! Schau dir mit \`!regeln\` die Gruppenregeln an — Befehle: \`!hilfe\``;
      await sendText(id, text, few);
    }
  } catch (err) {
    logError(err, 'welcome');
  }
}

// ── Owner-Benachrichtigung für logger.ownerAlert ───────────────────

setOwnerNotifier(async (message) => {
  if (state.connection !== 'open') return;
  for (const num of OWNER_NUMBERS) {
    await sendText(`${num}@s.whatsapp.net`, `🤖 *${BOT_NAME}*\n${message}`);
  }
});

// ── Pairing-Code (Alternative zum QR-Scan, fürs Panel) ─────────────

let lastPairingRequestAt = 0;

setPairingCodeRequester((phoneNumber) => {
  if (!state.sock) return Promise.reject(new Error('Kein aktiver Socket — bitte kurz warten und erneut versuchen.'));
  if (state.connection === 'open') return Promise.reject(new Error('Der Bot ist bereits verbunden — kein Code nötig.'));
  if (state.sock.authState?.creds?.registered) {
    return Promise.reject(new Error('Diese Session ist schon gekoppelt — erst zurücksetzen, dann neu koppeln.'));
  }
  const wait = config.pairing.cooldownMs - (Date.now() - lastPairingRequestAt);
  if (wait > 0) {
    return Promise.reject(new Error(`Bitte noch ${Math.ceil(wait / 1000)} Sekunden warten, bevor ein neuer Code angefragt wird.`));
  }
  lastPairingRequestAt = Date.now();

  // Verbindung sauber neu aufbauen — der Code wird erst auf dem FRISCHEN
  // Socket eingelöst (in startSocket), nicht auf diesem hier, der ggf. schon
  // mitten im QR-Handshake steckt.
  return new Promise((resolve, reject) => {
    pendingPairing = { phoneNumber, resolve, reject };
    clearTimeout(reconnectTimer);
    const oldSock = state.sock;
    state.sock = null; // Events des sterbenden Sockets werden über den state.sock!==sock-Guard verworfen
    state.currentQr = null;
    state.pairingCode = null;
    state.stopped = false;
    state.reconnectAttempts = 0;
    state.connection = 'connecting';
    try { oldSock?.end?.(new Error('Neustart für Pairing-Code-Anfrage')); } catch { /* egal, wird verworfen */ }
    safeClearSession().then(() =>
      startSocket().catch((err) => {
        pendingPairing = null;
        reject(err);
      })
    );
  });
});

// ── Sitzung hart zurücksetzen (Notfall-Knopf im Panel) ─────────────
// Für den Fall, dass die gespeicherte Session kaputt ist, Baileys sich aber
// noch für "registriert" hält: scheduleReconnect() würde dann endlos mit
// denselben toten Zugangsdaten gegen dieselbe Wand rennen — nie ein neuer
// QR/Pairing-Code, weil der nur bei UNregistrierten Creds erscheint. Dieser
// Knopf ist bewusst kompromisslos: alte Session in der DB löschen, alten
// Socket sofort kappen, sofort blank neu starten. Ob das alte Handy die
// Verknüpfung noch anzeigt, spielt keine Rolle — das klärt sich von selbst,
// sobald sich woanders neu verbunden wird.

let lastRelinkAt = 0;

setForceRelinkHandler(async () => {
  const wait = config.session.relinkCooldownMs - (Date.now() - lastRelinkAt);
  if (wait > 0) throw new Error(`Bitte noch ${Math.ceil(wait / 1000)} Sekunden warten.`);
  lastRelinkAt = Date.now();

  clearTimeout(reconnectTimer);
  const oldSock = state.sock;
  state.sock = null; // sofort entkoppeln — Events des sterbenden Sockets werden dank
                      // der "if (state.sock !== sock) return;"-Guards ignoriert
  state.currentQr = null;
  state.pairingCode = null;
  state.stopped = false;
  state.stopReason = '';
  state.reconnectAttempts = 0;
  state.connection = 'connecting';

  try { oldSock?.end?.(new Error('Manueller Reset über das Panel')); } catch { /* egal, wird eh verworfen */ }
  await safeClearSession();
  logWarn('🔁 Sitzung manuell über das Panel zurückgesetzt — starte frisch (neuer QR/Pairing-Code folgt).');
  await startSocket();
});

// ── Prozess-Sicherheitsnetze & Graceful Shutdown ───────────────────

process.on('uncaughtException', (err) => logError(err, 'uncaughtException'));
process.on('unhandledRejection', (err) => logError(err, 'unhandledRejection'));

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo(`🛑 ${signal} empfangen — fahre sauber herunter (Session bleibt intakt).`);
  try {
    stopScheduler();
    stopFlushLoop();
    clearTimeout(reconnectTimer);
    clearInterval(selfPingTimer);
    await flushBuffers().catch(() => {});
    httpServer?.close();
    state.sock?.end?.(undefined);
  } catch (err) {
    logError(err, 'shutdown');
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGTERM', () => shutdown('SIGTERM')); // Render-Deploy
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ──────────────────────────────────────────────────────────

async function main() {
  console.log(`🤖 ${BOT_NAME} startet …`);
  await preflight(); // beendet sich selbst mit Klartext-Meldung bei Config-Fehlern
  await initDb();

  // Persistente Zustände in den RAM laden
  await Promise.all([loadToggles(), loadCustomCommands(), loadAfk(), loadMutes(), initAiUsage()]);

  startFlushLoop();
  startScheduler();

  // Web-Panel sofort starten, damit /qr und /health von Anfang an erreichbar sind
  const app = createDashboard();
  const port = process.env.PORT || 3000;
  httpServer = app.listen(port, () => logInfo(`🌐 Panel & /health laufen auf Port ${port}.`));

  // Interner Zusatz-Ping (der externe UptimeRobot auf SELF_URL/health bleibt Pflicht!)
  const selfUrl = (process.env.SELF_URL || '').trim().replace(/\/+$/, '');
  if (selfUrl) {
    selfPingTimer = setInterval(() => {
      fetch(`${selfUrl}/health`).catch(() => {});
    }, config.keepAlive.selfPingMs);
  }

  await startSocket();
}

main().catch((err) => {
  console.error('❌ START ABGEBROCHEN: Unerwarteter Fehler beim Hochfahren:');
  console.error(String(err?.stack || err));
  process.exit(1);
});
