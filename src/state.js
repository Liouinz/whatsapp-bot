// Gemeinsamer Laufzeit-Zustand — wird von Socket-Lifecycle, Router und Panel gelesen.

export const state = {
  sock: null, // aktiver Baileys-Socket (oder null)
  connection: 'connecting', // 'connecting' | 'open' | 'close' | 'stopped'
  stopped: false, // true nach 403/440 → kein Reconnect mehr
  stopReason: '', // Klartext, warum gestoppt wurde (fürs Panel)
  currentQr: null, // aktueller QR als Data-URL (null wenn verbunden)
  qrUpdatedAt: 0,

  pairingCode: null, // formatierter Pairing-Code ("XXXX-XXXX") oder null
  pairingCodeUpdatedAt: 0,

  botJidPn: null, // eigene Telefonnummer-JID (normalisiert)
  botJidLid: null, // eigene LID (normalisiert)

  startedAt: Date.now(),
  lastConnectedAt: null,
  reconnectAttempts: 0,

  // Live-Zähler (heute; werden zusätzlich in daily_stats gebatcht)
  sentToday: 0,
  commandsToday: 0,
  aiCallsToday: 0,
  statsDay: new Date().toISOString().slice(0, 10),

  // Aktivitäts-Sparkline: Nachrichten pro 10-Minuten-Slot (letzte 24 Slots = 4 h)
  activity: new Array(24).fill(0),
  activitySlot: Math.floor(Date.now() / 600_000),
};

/** Tageszähler zurücksetzen, wenn ein neuer Tag beginnt. */
export function rolloverDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.statsDay !== today) {
    state.statsDay = today;
    state.sentToday = 0;
    state.commandsToday = 0;
    state.aiCallsToday = 0;
  }
}

/** Aktivität für die Sparkline zählen (10-Minuten-Slots, rollierend). */
export function bumpActivity() {
  const slot = Math.floor(Date.now() / 600_000);
  if (slot !== state.activitySlot) {
    const shift = Math.min(slot - state.activitySlot, state.activity.length);
    for (let i = 0; i < shift; i++) {
      state.activity.shift();
      state.activity.push(0);
    }
    state.activitySlot = slot;
  }
  state.activity[state.activity.length - 1]++;
}

// Pairing-Code-Anfrage lebt in index.js (braucht den Socket), wird hier nur
// registriert — spart dashboard.js einen zirkulären Import auf index.js
// (gleiches Prinzip wie setErrorSummarizer/setOwnerNotifier in logger.js).
let pairingCodeRequester = null;
export function setPairingCodeRequester(fn) {
  pairingCodeRequester = fn;
}
export async function requestPairingCode(phoneNumber) {
  if (!pairingCodeRequester) throw new Error('Der Bot ist noch nicht bereit — bitte kurz warten.');
  return pairingCodeRequester(phoneNumber);
}

// Sitzung hart zurücksetzen (Notfall-Knopf im Panel): für den Fall, dass der
// Socket mit einer kaputten, aber noch als "registriert" geltenden Session
// endlos gegen dieselbe Wand rennt und nie einen neuen QR/Pairing-Code zeigt.
let forceRelinkHandler = null;
export function setForceRelinkHandler(fn) {
  forceRelinkHandler = fn;
}
export async function forceRelink() {
  if (!forceRelinkHandler) throw new Error('Der Bot ist noch nicht bereit — bitte kurz warten.');
  return forceRelinkHandler();
}
