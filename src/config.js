// Zentrale Konfiguration — ALLE Stellschrauben an einem Ort, keine Magic Numbers im Code.

// Zeitzone festnageln, BEVOR irgendwo ein Date entsteht (Render läuft sonst auf UTC —
// !schedule 18:30 käme dann eine/zwei Stunden zu spät). Über Env TZ übersteuerbar.
if (!process.env.TZ) process.env.TZ = 'Europe/Berlin';

/** Anzeige-Name des Bots. Änderbar über Env-Variable BOT_NAME, ohne Code anzufassen. */
export const BOT_NAME = (process.env.BOT_NAME || 'CommunityBot').trim();

/** Befehls-Präfix. */
export const PREFIX = '!';

/** Owner-Nummern (nur Ziffern, komma-getrennt in OWNER_NUMBERS). */
export const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || '')
  .split(',')
  .map((n) => n.replace(/\D/g, ''))
  .filter(Boolean);

export const config = {
  // ── Sende-Queue ────────────────────────────────────────────────
  send: {
    jitterMinMs: 800, // zufällige Pause zwischen Sendungen (min)
    jitterMaxMs: 2500, // zufällige Pause zwischen Sendungen (max)
    maxRetries: 2, // Wiederholungen pro fehlgeschlagenem Send
    retryBackoffMs: 1500,
  },

  // ── Reconnect-Verhalten ────────────────────────────────────────
  reconnect: {
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
    maxAttempts: 25, // danach: stoppen + Owner-Alarm
  },

  // ── Nachrichten-Verarbeitung ───────────────────────────────────
  messages: {
    dedupeCacheSize: 500, // LRU für msg.key.id (gegen Doppel-Verarbeitung)
    senderRateLimit: 8, // max. Befehle pro Nutzer …
    senderRateWindowMs: 60_000, // … pro Zeitfenster
  },

  // ── Moderation ─────────────────────────────────────────────────
  moderation: {
    warnLimitMute: 3, // ab so vielen aktiven Warnungen: Mute
    warnLimitKick: 5, // ab so vielen aktiven Warnungen: Kick
    warnExpiryDays: 7, // Warnungen verfallen automatisch
    muteMinutesDefault: 10, // Standard-Mute-Dauer
    muteMinutesMax: 24 * 60, // Obergrenze für !mute
    antiRaid: {
      joinWindowMs: 60_000, // Zeitfenster für Join-Flut
      joinThreshold: 5, // ab so vielen Joins im Fenster: Raid-Modus
      lockMinutes: 10, // Gruppe so lange auf "nur Admins"
    },
  },

  // ── XP / Level ─────────────────────────────────────────────────
  xp: {
    perMessageMin: 3,
    perMessageMax: 7,
    cooldownMs: 45_000, // Anti-Spam: XP höchstens alle 45 s pro Nutzer
    minMessageLength: 3, // "ok" gibt kein XP
    levelUpAnnounce: true,
  },

  // ── KI (Gemini) ────────────────────────────────────────────────
  ai: {
    model: 'gemini-3-flash', // kostenlose Stufe (Stand 2026); KEINE alten 1.5/2.0-Modelle
    userCooldownMs: 30_000, // pro Nutzer höchstens 1 KI-Aufruf alle 30 s
    dailyLimit: 1400, // hartes Tages-Kontingent (Free-Tier ≈ 1500/Tag)
    timeoutMs: 15_000,
    maxReplyChars: 900,
  },

  // ── Fehlerlog ──────────────────────────────────────────────────
  log: {
    dedupeWindowMs: 5 * 60_000, // identische Fehler: max. 1 Logeintrag pro 5 Min
    ringSize: 300, // Einträge im Live-Log fürs Panel
    keepErrorDays: 14, // ältere error_log-Zeilen werden aufgeräumt
  },

  // ── DB-Batching ────────────────────────────────────────────────
  db: {
    flushIntervalMs: 10_000, // gesammelte Writes (XP, Counter) alle 10 s schreiben
  },

  // ── Scheduler / Cleanup ────────────────────────────────────────
  scheduler: {
    tickMs: 30_000, // geplante Nachrichten + Nachtmodus prüfen
    cleanupIntervalMs: 60 * 60_000, // Auto-Cleanup stündlich
    keepDoneSchedulesDays: 7,
  },

  // ── Panel / Web ────────────────────────────────────────────────
  web: {
    sessionTtlMs: 7 * 24 * 60 * 60_000, // Login-Cookie-Gültigkeit
    loginMaxFails: 5, // Fehlversuche pro IP …
    loginLockMinutes: 15, // … dann so lange gesperrt
    restartCooldownMs: 2 * 60_000, // Neustart-Button/-Befehl: 2 Min Cooldown
  },

  // ── Pairing-Code (Alternative zum QR-Scan) ──────────────────────
  pairing: {
    cooldownMs: 30_000, // Mindestabstand zwischen zwei Code-Anfragen
    codeValidMs: 60_000, // solange zeigt das Panel den Code an, dann ausgeblendet
  },

  // ── Sitzung zurücksetzen (Notfall-Knopf, wenn die Verbindung feststeckt) ──
  session: {
    relinkCooldownMs: 15_000, // schützt vor versehentlichem Doppel-Klick
  },

  // ── Keep-Alive ─────────────────────────────────────────────────
  keepAlive: {
    selfPingMs: 4 * 60_000, // interner Zusatz-Ping (externer UptimeRobot bleibt Pflicht)
  },

  // ── Spiele ─────────────────────────────────────────────────────
  games: {
    ratenMax: 100, // Zahlenraten: 1..100
    ratenMaxTries: 15,
    quizTimeoutMs: 60_000, // Quizfrage verfällt nach 60 s
    xpRewardQuiz: 25,
    xpRewardRaten: 20,
    xpRewardGalgen: 30,
    xpRewardTtt: 20,
    galgenMaxFails: 6, // Galgenmännchen: erlaubte Fehlversuche
    tttTimeoutMs: 5 * 60_000, // TicTacToe-Partie verfällt nach 5 Min Inaktivität
    coinsRewardQuiz: 40, // Coins zusätzlich zu XP
    coinsRewardRaten: 30,
    coinsRewardGalgen: 50,
    coinsRewardTtt: 40,
  },

  // ── Economy (Coins) ────────────────────────────────────────────
  economy: {
    dailyMin: 150, // !daily: Basis-Bereich …
    dailyMax: 250,
    streakBonus: 25, // + Bonus pro Streak-Tag …
    streakBonusMax: 250, // … gedeckelt
    giveMin: 10, // !geben: Mindestbetrag
    betMin: 20, // !wette / !slots: Mindesteinsatz
    betMax: 2000, // Maximaleinsatz (Schutz vor Alles-oder-nichts-Frust)
    startBalance: 100, // Startguthaben beim ersten Kontakt
  },

  // ── Umfragen ───────────────────────────────────────────────────
  polls: {
    maxOptions: 6,
    autoCloseHours: 24, // offene Umfragen automatisch schließen
  },

  // ── Slowmode ───────────────────────────────────────────────────
  slowmode: {
    maxSeconds: 600, // Obergrenze für !slowmode
  },

  // ── Wochenreport ───────────────────────────────────────────────
  weeklyReport: {
    weekday: 0, // Sonntag
    hour: 18, // 18:00 Uhr lokale Zeit
  },

  // ── Geburtstage ────────────────────────────────────────────────
  birthdays: {
    hour: 9, // Gratulation täglich um 9:00 lokale Zeit
    coinsGift: 200, // Geburtstags-Geschenk
  },
};

/** Pflicht-Env-Variablen — Preflight prüft, dass alle gesetzt sind. */
export const REQUIRED_ENV = [
  'DATABASE_URL',
  'DATABASE_KEY',
  'OWNER_NUMBERS',
  'ACCESS_SECRET',
  'SELF_URL',
  'GEMINI_API_KEY',
];
