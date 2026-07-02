// Schlauer Fehlerlog: Rausch-Whitelist (Decrypt-Geräusche werden NIE geloggt),
// Dedupe (identische Fehler nur 1× pro Zeitfenster) und Ring-Puffer fürs Panel.

import { config } from './config.js';
import { dbRun } from './db.js';

// Muster, die bekanntes Baileys-Rauschen sind — nie loggen.
const NOISE_PATTERNS = [
  /no matching sessions/i,
  /failed to decrypt/i,
  /bad mac/i,
  /session error/i,
  /no session record/i,
  /no sender key/i,
  /closing open session in favor/i,
  /closing session: session/i,
  /decrypt(ion)? failed/i,
  /waiting for message/i,
  /unhandled event/i,
];

const dedupe = new Map(); // signature → { count, firstAt, lastLoggedAt }
const ring = []; // letzte Einträge fürs Panel: { ts, level, msg }

let errorSummarizer = null; // wird von ai.js gesetzt (vermeidet Import-Zyklus)
export function setErrorSummarizer(fn) {
  errorSummarizer = fn;
}
let ownerNotifier = null; // wird von index.js gesetzt (sendet an Owner)
export function setOwnerNotifier(fn) {
  ownerNotifier = fn;
}

function pushRing(level, msg) {
  ring.push({ ts: Date.now(), level, msg: String(msg).slice(0, 500) });
  if (ring.length > config.log.ringSize) ring.shift();
}

export function getRing() {
  return ring;
}

export function logInfo(msg) {
  console.log(msg);
  pushRing('info', msg);
}

export function logWarn(msg) {
  console.warn(msg);
  pushRing('warn', msg);
}

/**
 * Zentrale Fehler-Funktion. Filtert Rauschen, dedupliziert, schreibt Ring + DB.
 * `context` = kurzer Hinweis, wo es passiert ist (z. B. "router", "sendQueue").
 */
export function logError(err, context = '') {
  try {
    const text = String(err?.stack || err?.message || err);

    // 1) Rausch-Whitelist: bekanntes Baileys-Grundrauschen komplett ignorieren
    if (NOISE_PATTERNS.some((re) => re.test(text))) return;

    // 2) Dedupe: gleiche Signatur nur 1× pro Fenster loggen
    const signature = `${context}|${text.split('\n')[0].slice(0, 160)}`;
    const now = Date.now();
    const entry = dedupe.get(signature);
    if (entry && now - entry.lastLoggedAt < config.log.dedupeWindowMs) {
      entry.count++;
      return;
    }
    const count = entry ? entry.count + 1 : 1;
    dedupe.set(signature, { count: 0, firstAt: entry?.firstAt || now, lastLoggedAt: now });
    if (dedupe.size > 500) dedupe.delete(dedupe.keys().next().value);

    const suffix = count > 1 ? ` (${count}× seit letztem Log)` : '';
    const line = `[${context || 'allgemein'}] ${text.split('\n').slice(0, 3).join(' | ')}${suffix}`;
    console.error('🔴 ' + line);
    pushRing('error', line);

    // 3) In DB festhalten (leise — Logging darf nie crashen)
    dbRun(
      'INSERT INTO error_log (level, message, context, created_at) VALUES (?, ?, ?, ?)',
      ['error', text.slice(0, 1500), context, now]
    ).catch(() => {});
    dbRun(
      `INSERT INTO error_counts (signature, count, last_at) VALUES (?, ?, ?)
       ON CONFLICT(signature) DO UPDATE SET count = error_counts.count + ?, last_at = ?`,
      [signature.slice(0, 300), count, now, count, now]
    ).catch(() => {});

    // 4) Seltene echte Fehler optional per Gemini zusammenfassen → Owner
    if (errorSummarizer && ownerNotifier && !entry) {
      errorSummarizer(text)
        .then((summary) => summary && ownerNotifier(`🛡️ *Fehler-Report*\n${summary}`))
        .catch(() => {});
    }
  } catch {
    // Logging selbst darf niemals werfen
  }
}

/** Wichtige Meldung an die Owner (Ban-Verdacht, Logout, …) — läuft über die Sende-Queue. */
export async function ownerAlert(message) {
  logWarn('📣 Owner-Alarm: ' + message);
  dbRun('INSERT INTO owner_alerts (message, created_at, delivered) VALUES (?, ?, 0)', [
    message,
    Date.now(),
  ]).catch(() => {});
  if (ownerNotifier) {
    try {
      await ownerNotifier(message);
    } catch {
      /* Zustellung scheitert leise, steht ja in owner_alerts */
    }
  }
}
