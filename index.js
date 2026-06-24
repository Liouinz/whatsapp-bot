/**
 * WhatsApp-Bot — Web-Oberfläche, Moderation & Pro-Gruppen-Konfiguration
 * --------------------------------------------------------------------
 * - Verbindet sich über Baileys mit WhatsApp, QR-Code auf passwortgeschützter Website
 * - Pro Gruppe einstellbar: aktiv/inaktiv, erlaubte Befehle, Moderation
 * - Moderation (optional pro Gruppe): löscht Beleidigungen & Links, meldet das
 * - Persistenz über MongoDB (falls MONGODB_URI gesetzt), sonst lokale Datei
 * - /ping für externe Uptime-Monitore, optionaler Self-Ping
 *
 * Umgebungsvariablen:
 *   PORT, QR_PASSWORD, SELF_URL, COMMAND_PREFIX, LOG_LEVEL,
 *   MONGODB_URI / MONGODB_DB (optional, für persistente Einstellungen)
 */

const crypto = require('crypto');
const os = require('os');
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const store = require('./store');
const { createModeration } = require('./moderation');
// Vollständige Befehls-Dokumentation (offline-fähig, keine DB-Abhängigkeit)
const { COMMAND_CATALOG } = require('./command-catalog');

const PORT = process.env.PORT || 3000;
// Eingebautes Standard-Passwort, in Render per QR_PASSWORD überschreibbar.
const QR_PASSWORD = process.env.QR_PASSWORD || 'XWMEr3MZv-pH';
// Self-Ping-Ziel: bevorzugt SELF_URL, fällt automatisch auf die von Render gesetzte
// RENDER_EXTERNAL_URL zurück – so funktioniert der Wach-halte-Ping auch ohne manuelle Variable.
const SELF_URL = (process.env.SELF_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';
// Optionaler Notfall-Override für den Community-Inhaber (komma-getrennte Nummern ohne +).
// Normalerweise wird der Inhaber automatisch als Ersteller der Community-Hauptgruppe erkannt;
// dieser Override greift nur, falls die Metadaten der Hauptgruppe mal nicht lesbar sind.
const OWNER_OVERRIDE = (process.env.OWNER_JIDS || '')
  .split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean);

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Fehlerlog-Capture: warn/error werden zusätzlich in botState.errorLog gepuffert
// (botState ist erst später definiert, aber der Wrapper wird nur zur Laufzeit aufgerufen)
['warn', 'error'].forEach((lvl) => {
  const orig = logger[lvl].bind(logger);
  logger[lvl] = (...args) => {
    orig(...args);
    try {
      const [data, msg] = typeof args[0] === 'object' && args[0] !== null
        ? [args[0], args[1]]
        : [{}, args[0]];
      if (botState.errorLog.length >= 200) botState.errorLog.shift();
      botState.errorLog.push({ at: Date.now(), level: lvl, msg: String(msg || ''), detail: safeErrDetail(data) });
    } catch (_) {}
  };
});

// Serialisiert ein Logger-Detail-Objekt sicher (circular-safe, Errors lesbar,
// gekürzt). Verhindert Crash/Memory-Retention im Fehlerlog.
function safeErrDetail(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) return null;
  const seen = new WeakSet();
  try {
    const s = JSON.stringify(data, (k, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'function') return '[Function]';
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }, 2);
    return s ? s.slice(0, 4000) : null;
  } catch (_) {
    try { return String(data).slice(0, 500); } catch (__) { return null; }
  }
}

// ---------- Absturzschutz ----------
// Render Free startet einen abgestürzten Prozess nicht von selbst neu. Damit der Bot
// NIEMALS wegen eines unerwarteten Fehlers stirbt, fangen wir alles global ab und laufen weiter.
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException abgefangen – Bot läuft weiter');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection abgefangen – Bot läuft weiter');
});

// Verfügbare Befehle (für Hilfe-Text und Pro-Gruppen-Schalter)
// adminDefault: true → Standard "nur Admins" für neue Gruppen
const COMMANDS = [
  // ---- Allgemein ----
  { key: 'hilfe',      desc: 'zeigt alle verfügbaren Befehle' },
  { key: 'ping',       desc: 'testet, ob der Bot reagiert' },
  { key: 'info',       desc: 'Bot-Status & Laufzeit' },
  { key: 'id',         desc: 'zeigt die Gruppen-ID' },
  { key: 'regeln',     desc: 'zeigt die Gruppenregeln' },
  { key: 'gruppe',     desc: 'Infos zur Gruppe anzeigen' },
  { key: 'top',        desc: 'Top aktivste Mitglieder' },
  { key: 'stats',      desc: 'eigene oder fremde Aktivitäts-Statistik' },
  // ---- Admin-Befehle ----
  { key: 'sag',        desc: 'Bot wiederholt deinen Text', adminDefault: true },
  { key: 'alle',       desc: 'markiert alle Mitglieder', adminDefault: true },
  { key: 'kick',       desc: 'Mitglied aus der Gruppe entfernen', adminDefault: true },
  { key: 'ban',        desc: 'Mitglied kicken & im Ban-Log vermerken', adminDefault: true },
  { key: 'communitykick', desc: '⚠️ Person dauerhaft aus ALLEN Community-Gruppen bannen', ownerOnly: true },
  { key: 'communityunban', desc: 'Community-Bann einer Person aufheben', ownerOnly: true },
  { key: 'communitybanlist', desc: 'alle dauerhaft gebannten Personen auflisten', ownerOnly: true },
  { key: 'mute',       desc: 'Mitglied stummschalten', adminDefault: true },
  { key: 'unmute',     desc: 'Stummschaltung aufheben', adminDefault: true },
  { key: 'warn',       desc: 'Mitglied manuell verwarnen', adminDefault: true },
  { key: 'unwarn',     desc: 'eine Verwarnung zurücknehmen', adminDefault: true },
  { key: 'clearwarn',  desc: 'alle Verwarnungen eines Mitglieds löschen', adminDefault: true },
  { key: 'warninfo',   desc: 'Verwarnungsstand eines Mitglieds anzeigen', adminDefault: true },
  { key: 'warnlist',   desc: 'alle verwarnten Mitglieder auflisten', adminDefault: true },
  { key: 'promote',    desc: 'Mitglied zum Admin machen', adminDefault: true },
  { key: 'demote',     desc: 'Admin-Status eines Mitglieds entziehen', adminDefault: true },
  { key: 'link',       desc: 'Einladungslink abrufen', adminDefault: true },
  { key: 'revoke',     desc: 'Einladungslink widerrufen & neu erstellen', adminDefault: true },
  { key: 'announce',   desc: 'alle markieren + Nachricht senden', adminDefault: true },
  { key: 'pin',        desc: 'zitierte Nachricht anpinnen', adminDefault: true },
  { key: 'unpin',      desc: 'zitierte Nachricht lösen', adminDefault: true },
  { key: 'setregeln',  desc: 'Gruppenregeln festlegen', adminDefault: true },
  { key: 'setwelcome', desc: 'Willkommensnachricht festlegen', adminDefault: true },
  { key: 'welcome',    desc: 'Willkommensnachrichten an/aus', adminDefault: true },
  { key: 'lock',       desc: '🔒 Chat sperren – nur Admins dürfen schreiben', adminDefault: true },
  { key: 'unlock',     desc: '🔓 Chat entsperren – alle dürfen schreiben', adminDefault: true },
  { key: 'infolock',   desc: 'nur Admins dürfen Gruppeninfo ändern', adminDefault: true },
  { key: 'infounlock', desc: 'alle dürfen Gruppeninfo ändern', adminDefault: true },
  { key: 'setname',    desc: 'Gruppennamen ändern', adminDefault: true },
  { key: 'setdesc',    desc: 'Gruppenbeschreibung ändern', adminDefault: true },
  { key: 'del',        desc: 'zitierte Nachricht löschen', adminDefault: true },
  { key: 'admins',     desc: 'alle Admins markieren', adminDefault: true },
  { key: 'ephemeral',  desc: 'verschwindende Nachrichten setzen', adminDefault: true },
  { key: 'addmode',    desc: 'wer darf Mitglieder hinzufügen (admin/all)', adminDefault: true },
  { key: 'slowmode',   desc: 'Slowmode setzen (Sekunden, off)', adminDefault: true },
  { key: 'remind',     desc: 'geplante Erinnerung mit Text', adminDefault: true },
  // ---- Sonstiges ----
  { key: 'melden',     desc: 'Meldung an die Admins schicken' },
];

// Alias -> kanonischer Befehl
const ALIAS = {
  help: 'hilfe', menu: 'hilfe', status: 'info', echo: 'sag', tagall: 'alle',
  report: 'melden',
  sperren: 'lock', entsperren: 'unlock',
  loeschen: 'del', löschen: 'del', delete: 'del',
  erinnerung: 'remind', erinnere: 'remind',
  ckick: 'communitykick', comban: 'communitykick', communityban: 'communitykick', nuke: 'communitykick',
  cunban: 'communityunban', cbanlist: 'communitybanlist',
};

// Gemeinsamer Zustand
const botState = {
  qr: null,
  connected: false,
  startedAt: Date.now(),
  me: null,
  sock: null,
  groups: [],
  groupPics: {},
  groupMeta: {}, // jid -> { meta, at }
  groupsFetchedAt: 0,
  commandCount: 0,
  lastCommand: null,
  moderation: { actionsTotal: 0, lastAction: null, lastActionAt: null },
  activityLog: [], // letzte 100 Bot-Aktionen
  errorLog: [],    // letzte 200 Laufzeit-Warnings/Errors (nur RAM, reset bei Neustart)
  reconnecting: false, // verhindert mehrere parallele Reconnects
  lastConnectedAt: 0,  // Zeitpunkt der letzten erfolgreichen Verbindung
  powered: true,       // Bot-Hauptschalter (per Website steuerbar). false = pausiert.
  paused: false,       // intern: true während /power off (kein Auto-Reconnect)
};

// In-Memory-Maps
const slowmodeLast  = new Map(); // `${groupJid}:${senderJid}` -> timestamp letzter Nachricht
let _persistTimer   = null;      // Debounced-persist Handle

// Slowmode-Cleanup: alte Einträge regelmäßig entfernen
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, t] of slowmodeLast) if (t < cutoff) slowmodeLast.delete(k);
}, 30 * 60 * 1000).unref?.();

const moderation = createModeration({
  logger,
  botState,
  loadWarn: (gid) => config.groups[gid]?.moderation?._state,
  saveWarn: (gid, data) => {
    if (!config.groups[gid]) config.groups[gid] = defaultGroupConfig();
    config.groups[gid].moderation._state = data;
    persist();
  },
});

// ---------- Konfiguration (pro Gruppe) ----------
let config = { groups: {} };

function defaultGroupConfig() {
  const commands = {};
  for (const c of COMMANDS) commands[c.key] = c.adminDefault ? 'admin' : 'all';
  return {
    active: true,
    commands,
    moderation: { badwords: false, links: false, warnLimit: 3, extraBadwords: [] },
    rules: null,
    welcome: { enabled: false, message: null },
    memberStats: {},   // { [senderNum]: { messages, commands, warnings, lastSeen } }
    banLog: [],        // [{ num, bannedBy, reason, at }] max 500
  };
}
// Migriert legacy-boolean-Werte auf neue String-Werte ('all'|'admin'|false).
function migrateCmdValue(val, adminDefault) {
  if (val === false) return false;
  if (val === true) return 'all';
  if (val === 'admin' || val === 'all') return val;
  return adminDefault ? 'admin' : 'all';
}
// Effektive Konfiguration einer Gruppe (mit Defaults). Nicht konfigurierte
// Gruppen gelten als inaktiv.
function effectiveGroupConfig(jid) {
  const d = defaultGroupConfig();
  const g = config.groups[jid];
  if (!g) return { ...d, active: false };
  const commands = {};
  for (const c of COMMANDS) {
    commands[c.key] = migrateCmdValue((g.commands || {})[c.key], c.adminDefault);
  }
  return {
    active: g.active !== false,
    commands,
    moderation: { ...d.moderation, ...(g.moderation || {}) },
    rules: g.rules || null,
    welcome: { enabled: false, message: null, ...(g.welcome || {}) },
    memberStats: g.memberStats || {},
    banLog: g.banLog || [],
  };
}
function activeGroupCount() {
  return Object.values(config.groups).filter((g) => g.active !== false).length;
}

// ---------- Community-Helfer ----------
// Normalisiert das linkedParent-Feld (kann String oder Objekt sein) auf eine JID.
function parentJidOf(g) {
  const lp = g.community;
  if (!lp) return null;
  if (typeof lp === 'string') return lp;
  return lp.id || lp.jid || null;
}
function communityName(parentJid) {
  const g = getGroupsCached().find((x) => x.id === parentJid);
  return g ? (g.subject || 'Community') : `Community ${(parentJid || '').split('@')[0].slice(-6)}`;
}
// Gruppiert alle bekannten Gruppen nach ihrer Community (linkedParent).
function getCommunities() {
  const map = new Map();
  for (const g of getGroupsCached()) {
    const parent = parentJidOf(g);
    if (!parent) continue;
    if (!map.has(parent)) map.set(parent, { parent, name: communityName(parent), groups: [] });
    map.get(parent).groups.push(g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
// Setzt active für alle Gruppen einer Community.
async function setCommunityActive(parentJid, enable) {
  let n = 0;
  for (const g of getGroupsCached()) {
    if (parentJidOf(g) !== parentJid) continue;
    if (!config.groups[g.id]) config.groups[g.id] = defaultGroupConfig();
    config.groups[g.id].active = enable;
    n += 1;
  }
  if (n) await persist();
  return n;
}

async function persist() {
  await store.saveConfig(config, logger);
}

function persistDebounced() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persist().catch((e) => logger.warn({ e }, 'Debounced persist fehlgeschlagen'));
  }, 60 * 1000);
}

// Gibt live-Gruppen zurück wenn verbunden, sonst den persistierten Cache.
function getGroupsCached() {
  if (botState.connected && botState.groups.length > 0) return botState.groups;
  return (config.groupCache || []);
}

// ---------- Aktivitäts-Tracking ----------
function activityLogPush(entry) {
  botState.activityLog.push({ ...entry, at: Date.now() });
  if (botState.activityLog.length > 100) botState.activityLog.shift();
}

function recordActivity(groupJid, senderNum, type) {
  if (!config.groups[groupJid]) return;
  const stats = config.groups[groupJid].memberStats || {};
  const s = stats[senderNum] || { messages: 0, commands: 0, warnings: 0, lastSeen: 0 };
  if (type === 'command') s.commands = (s.commands || 0) + 1;
  else s.messages = (s.messages || 0) + 1;
  s.lastSeen = Date.now();
  stats[senderNum] = s;
  config.groups[groupJid].memberStats = stats;
  activityLogPush({ type, groupJid, senderNum });
  persistDebounced();
}

function getTopMembers(groupJid, n = 5) {
  const stats = config.groups[groupJid]?.memberStats || {};
  return Object.entries(stats)
    .map(([num, s]) => ({ num, total: (s.messages || 0) + (s.commands || 0), ...s }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function getMemberStats(groupJid, num) {
  return config.groups[groupJid]?.memberStats?.[num] || { messages: 0, commands: 0, warnings: 0, lastSeen: 0 };
}

function addBanLog(groupJid, entry) {
  if (!config.groups[groupJid]) config.groups[groupJid] = defaultGroupConfig();
  const log = config.groups[groupJid].banLog || [];
  log.push({ ...entry, at: Date.now() });
  if (log.length > 500) log.shift();
  config.groups[groupJid].banLog = log;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ---------- DM-Assistent (Privatnachrichten) ----------
// Standardmäßig aus. Wenn aktiv, nimmt der Bot per Privatchat Anliegen entgegen
// (Nachricht muss mit dem Befehlspräfix beginnen).
async function handleDmAssistant(sock, jid, text, msg) {
  const num = jid.split('@')[0];
  const body = text.slice(COMMAND_PREFIX.length).trim();
  const first = (body.split(/\s+/)[0] || '').toLowerCase();
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

  if (!body || first === 'hilfe' || first === 'help' || first === 'start' || first === 'info') {
    await reply(
      `👋 Hallo! Ich bin der Assistent.\n\n` +
      `Schreib mir dein Anliegen einfach mit einem ${COMMAND_PREFIX} davor, z. B.:\n` +
      `${COMMAND_PREFIX}Ich habe ein Problem mit …\n\n` +
      `Dein Anliegen wird gespeichert und an die Admins weitergeleitet. 📨`
    );
    return;
  }

  // Gemeinsame Gruppen/Communities der Nummer ermitteln (best effort, gecacht)
  await Promise.allSettled(botState.groups.map((g) => getGroupMeta(g.id)));
  const sharedGroups = [];
  const communitySet = new Set();
  for (const g of botState.groups) {
    const meta = botState.groupMeta[g.id]?.meta;
    if (meta && meta.participants.some((p) => p.id.split('@')[0] === num)) {
      sharedGroups.push(g.subject || g.id);
      const parent = parentJidOf(g);
      if (parent) communitySet.add(communityName(parent));
    }
  }

  if (!config.anliegen) config.anliegen = [];
  config.anliegen.push({
    id: Date.now(),
    num,
    text: body,
    at: Date.now(),
    groups: sharedGroups,
    communities: [...communitySet],
    status: 'offen',
  });
  if (config.anliegen.length > 300) config.anliegen = config.anliegen.slice(-300);
  await persist();
  activityLogPush({ type: 'anliegen', senderNum: num });

  const ctxInfo = communitySet.size
    ? `\n\n(Erkannt in: ${[...communitySet].join(', ')})`
    : sharedGroups.length ? `\n\n(Gemeinsame Gruppen: ${sharedGroups.join(', ')})` : '';
  await reply(`✅ Danke! Dein Anliegen wurde aufgenommen und an die Admins weitergeleitet.${ctxInfo}`);
}

function getTargetJid(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo
    || msg.message?.imageMessage?.contextInfo
    || msg.message?.videoMessage?.contextInfo;
  return (ctx?.mentionedJid?.[0]) || (ctx?.participant) || null;
}

// ---------- Mini-Helfer für Community-Moderation ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const subjectOf = (gid) => getGroupsCached().find((g) => g.id === gid)?.subject || gid.split('@')[0];
// Erlaubt auch reine Nummern als Ziel, z. B. "!communitykick 4915123456789".
function numArgToJid(a) {
  const d = (a || '').replace(/\D/g, '');
  return d.length >= 7 && d.length <= 20 ? `${d}@s.whatsapp.net` : null;
}

// ---------- Hilfsfunktionen ----------
function passwordOk(provided) {
  if (!QR_PASSWORD) return false;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(QR_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// ---------- Session-Cookie-Verwaltung (kein npm-Paket nötig) ----------
// Tokens leben nur im RAM — bei Server-Neustart muss der Nutzer sich erneut anmelden.
const activeSessions = new Set();

function parseCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) cookies[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return cookies;
}

function sessionOk(req) {
  const t = parseCookies(req).sess;
  return Boolean(t && activeSessions.has(t));
}

// ---------- Login-Bruteforce-Schutz (In-Memory) ----------
// Max. 8 Fehlversuche pro IP in 10 Minuten, danach kurz gesperrt.
const LOGIN_WINDOW = 10 * 60 * 1000;
const LOGIN_MAX = 8;
const loginAttempts = new Map(); // ip -> { count, first }
function loginBlocked(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW) { loginAttempts.delete(ip); return false; }
  return rec.count >= LOGIN_MAX;
}
function noteLoginFail(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW) loginAttempts.set(ip, { count: 1, first: now });
  else rec.count += 1;
  if (loginAttempts.size > 1000) { // Map beschränken: abgelaufene Einträge aufräumen
    for (const [k, v] of loginAttempts) if (now - v.first > LOGIN_WINDOW) loginAttempts.delete(k);
  }
}
function noteLoginOk(ip) { loginAttempts.delete(ip); }

const STYLE = `
  :root{
    --bg:#0a0b10; --panel:rgba(255,255,255,.045); --panel-2:rgba(255,255,255,.06);
    --panel-brd:rgba(255,255,255,.09); --txt:#e9ecf3; --muted:#98a2b6;
    --accent:#6366f1; --accent2:#a855f7; --accent3:#22d3ee;
    --good:#34d399; --bad:#fb7185; --warn:#fbbf24; --radius:20px;
    --shadow:0 18px 50px rgba(0,0,0,.45);
  }
  *{box-sizing:border-box}
  ::selection{background:rgba(139,92,246,.35);color:#fff}
  body{font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,system-ui,sans-serif;
    color:var(--txt);margin:0;min-height:100vh;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
    display:flex;flex-direction:column;align-items:center;padding:24px;position:relative;overflow-x:hidden;
    background:
      radial-gradient(900px 520px at 10% -10%,rgba(99,102,241,.22),transparent 60%),
      radial-gradient(820px 600px at 112% 0%,rgba(168,85,247,.17),transparent 55%),
      radial-gradient(760px 520px at 50% 120%,rgba(34,211,238,.10),transparent 60%),
      var(--bg);
    background-attachment:fixed;animation:fadein .6s ease}
  @keyframes fadein{from{opacity:0}to{opacity:1}}
  /* dekorative, weich verlaufende Farb-Orbs im Hintergrund (ersetzt die alten Blätter) */
  .leaf{position:fixed;width:340px;height:340px;border-radius:50%;pointer-events:none;z-index:0;
    filter:blur(90px);opacity:.55;animation:drift 20s ease-in-out infinite}
  @keyframes drift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(0,-34px) scale(1.08)}}
  .card{background:var(--panel);backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5);
    border:1px solid var(--panel-brd);border-radius:var(--radius);padding:24px;max-width:640px;width:100%;
    margin:12px 0;box-shadow:var(--shadow);position:relative;z-index:1;animation:rise .55s cubic-bezier(.2,.7,.2,1) both}
  .card:hover{border-color:rgba(255,255,255,.14)}
  @keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  h1{font-size:clamp(1.3rem,4vw,1.7rem);margin:0 0 4px;letter-spacing:-.02em;font-weight:750}
  h2{font-size:1.12rem;margin:0 0 12px;letter-spacing:-.01em;font-weight:700}
  .muted{color:var(--muted);font-size:.9rem} a{color:#c4b5fd;text-decoration:none;transition:color .15s} a:hover{color:#ddd6fe}
  img{max-width:100%;height:auto;display:block}
  .qr{background:#fff;padding:16px;border-radius:14px;display:inline-block;max-width:100%}
  .qr img{width:320px;max-width:100%;margin:0 auto}
  .status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.85rem;font-weight:600}
  .on{background:rgba(34,197,94,.2);color:#86efac} .off{background:rgba(248,113,113,.18);color:#fca5a5}
  .grp{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.1);
    border-radius:12px;margin:8px 0;background:rgba(255,255,255,.04);cursor:pointer;transition:border-color .2s,transform .1s;color:inherit}
  .grp:hover{border-color:rgba(139,92,246,.55);transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.3)}
  .grp .avatar{width:48px;height:48px;border-radius:50%;flex-shrink:0;object-fit:cover;background:rgba(255,255,255,.1)}
  .grp .meta{flex:1;min-width:0}
  .grp .name{font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .badge{font-size:.7rem;background:rgba(127,209,255,.18);color:#bfe3ff;padding:2px 8px;border-radius:999px;margin-left:6px}
  .opt{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;
    border:1px solid rgba(255,255,255,.1);border-radius:10px;margin:8px 0;background:rgba(255,255,255,.04)}
  .opt input[type=checkbox]{width:24px;height:24px;accent-color:var(--accent);flex-shrink:0}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.025));
    border:1px solid var(--panel-brd);border-radius:16px;padding:16px;transition:transform .18s,border-color .18s}
  .stat:hover{transform:translateY(-3px);border-color:rgba(139,92,246,.4)}
  .stat .k{color:var(--muted);font-size:.74rem;text-transform:uppercase;letter-spacing:.6px}
  .stat .v{font-size:1.45rem;font-weight:750;margin-top:4px;letter-spacing:-.01em}
  button{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:0;border-radius:14px;
    padding:13px 20px;font-size:1rem;font-weight:700;cursor:pointer;width:100%;margin-top:12px;letter-spacing:.01em;
    box-shadow:0 8px 22px rgba(99,102,241,.32);transition:transform .12s ease,filter .2s,box-shadow .2s}
  button:hover{filter:brightness(1.08);box-shadow:0 12px 30px rgba(139,92,246,.45)} button:active{transform:scale(.97)}
  .input{width:100%;padding:13px;border-radius:12px;border:1px solid var(--panel-brd);
    background:rgba(255,255,255,.05);color:var(--txt);font-size:1rem;margin-top:4px;
    transition:box-shadow .2s,border-color .2s}
  .input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px rgba(99,102,241,.25)}
  textarea.input{min-height:64px;resize:vertical}
  .pwwrap{position:relative} .pwwrap .input{padding-right:50px}
  .eye{position:absolute;right:6px;bottom:6px;width:auto;margin:0;padding:6px 9px;background:rgba(255,255,255,.08);
    font-size:1.15rem;border-radius:8px}
  .row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  select.input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237fd1ff' stroke-width='2' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;cursor:pointer}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08)}
  th{color:#aeb8c6;font-weight:600} tr:hover td{background:rgba(255,255,255,.03)}
  @media(max-width:600px){body{padding:14px} .card{padding:18px}}
  input[type=search],.search-bar{width:100%;padding:11px 14px;border-radius:10px;
    border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#eef2f7;
    font-size:.95rem;margin-bottom:12px;transition:border-color .2s,box-shadow .2s}
  input[type=search]:focus,.search-bar:focus{outline:none;border-color:#7fd1ff;box-shadow:0 0 0 3px rgba(127,209,255,.2)}
  .action-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:8px;
    font-size:.8rem;font-weight:600;cursor:pointer;width:auto;margin:2px;transition:filter .15s,transform .1s}
  .action-btn:hover{filter:brightness(1.12)} .action-btn:active{transform:scale(.95)}
  .btn-red{background:rgba(248,113,113,.25);color:#fca5a5;border:1px solid rgba(248,113,113,.35)}
  .btn-blue{background:rgba(127,209,255,.18);color:#bfe3ff;border:1px solid rgba(127,209,255,.3)}
  .btn-yellow{background:rgba(250,204,21,.18);color:#fde68a;border:1px solid rgba(250,204,21,.3)}
  .btn-green{background:rgba(34,197,94,.18);color:#86efac;border:1px solid rgba(34,197,94,.3)}
  .member-card{display:flex;align-items:center;gap:10px;padding:10px 12px;
    border:1px solid rgba(255,255,255,.09);border-radius:11px;margin:6px 0;background:rgba(255,255,255,.03)}
  .member-card .num{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .member-card .actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
  .tag{display:inline-block;font-size:.7rem;padding:2px 8px;border-radius:999px;margin-left:4px}
  .tag-admin{background:rgba(250,204,21,.2);color:#fde68a}
  .tag-creator{background:rgba(248,113,113,.2);color:#fca5a5}
  .tag-bot{background:rgba(127,209,255,.18);color:#bfe3ff}
  .log-entry{padding:8px 12px;border-radius:8px;margin:4px 0;font-size:.85rem;
    border-left:3px solid rgba(255,255,255,.2);background:rgba(255,255,255,.03)}
  .log-add{border-color:#86efac} .log-remove{border-color:#fca5a5}
  .log-command{border-color:#7fd1ff} .log-message{border-color:rgba(255,255,255,.2)}
  .log-kick{border-color:#f97316} .log-ban{border-color:#ef4444}
  .log-warn{border-color:#fde68a} .log-mute{border-color:#c084fc}
  .log-pin{border-color:#38bdf8} .log-unpin{border-color:#94a3b8}
  .log-anliegen{border-color:#a78bfa}
  .log-lock{border-color:#fb7185} .log-del{border-color:#f43f5e} .log-slowmode{border-color:#facc15}
  .cmd-row{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;margin:6px 0;
    border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(255,255,255,.03);transition:border-color .15s}
  .cmd-row:hover{border-color:rgba(127,209,255,.4)}
  .cmd-name{font-size:.95rem;font-weight:700;color:#7fd1ff;background:rgba(127,209,255,.12);padding:2px 8px;border-radius:7px}
  .cmd-section h2{margin-bottom:6px}
  .cmd-card{border:1px solid rgba(255,255,255,.08);border-radius:12px;margin:6px 0;background:rgba(255,255,255,.03);overflow:hidden;transition:border-color .15s}
  .cmd-card:hover{border-color:rgba(127,209,255,.35)}
  .cmd-card[open]{border-color:rgba(99,102,241,.4);background:rgba(99,102,241,.04)}
  .cmd-card summary::-webkit-details-marker{display:none}
  .leaderboard{counter-reset:rank}
  .lb-row{display:flex;align-items:center;gap:10px;padding:9px 12px;
    border:1px solid rgba(255,255,255,.08);border-radius:10px;margin:5px 0;background:rgba(255,255,255,.03)}
  .lb-rank{font-size:1.2rem;width:28px;text-align:center;font-weight:700}
  .lb-num{flex:1;font-weight:600} .lb-count{color:#aeb8c6;font-size:.85rem}
  /* ---- Navigationsleiste ---- */
  .nav{position:sticky;top:14px;z-index:5;display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;
    max-width:640px;width:100%;margin:0 0 16px;padding:8px;border-radius:18px;
    background:rgba(14,16,24,.72);backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5);
    border:1px solid var(--panel-brd);box-shadow:0 10px 30px rgba(0,0,0,.35);
    scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .nav::-webkit-scrollbar{display:none}
  .nav a{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:9px 14px;border-radius:12px;
    font-size:.85rem;font-weight:600;color:#c3cad8;white-space:nowrap;transition:background .18s,color .18s,transform .1s}
  .nav a:hover{background:rgba(255,255,255,.07);text-decoration:none;transform:translateY(-1px);color:#fff}
  .nav a.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;box-shadow:0 6px 18px rgba(99,102,241,.4)}
  /* ---- Toolbar & Segmented-Control ---- */
  .toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
  .seg{display:inline-flex;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
    border-radius:11px;padding:3px;gap:2px}
  .seg-btn{padding:7px 13px;border-radius:9px;font-size:.82rem;font-weight:600;color:#cdd6e3;
    cursor:pointer;width:auto;margin:0;background:transparent;border:0;transition:background .15s,color .15s}
  .seg-btn.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
  .seg-btn:hover:not(.active){background:rgba(255,255,255,.08)}
  .chip{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:600;
    padding:3px 10px;border-radius:999px;background:rgba(127,209,255,.15);color:#bfe3ff}
  .chip.on{background:rgba(34,197,94,.2);color:#86efac} .chip.off{background:rgba(248,113,113,.18);color:#fca5a5}
  .toast{animation:pop .4s ease both}
  @keyframes pop{0%{opacity:0;transform:scale(.9)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}
  /* ---- moderne Zusatz-Utilities ---- */
  .gradient-text{background:linear-gradient(135deg,#a5b4fc,#c4b5fd 40%,#67e8f9);
    -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
  .hero{text-align:center;padding:30px 22px 26px}
  .hero .logo{font-size:3rem;line-height:1;filter:drop-shadow(0 8px 22px rgba(99,102,241,.5));animation:rise .6s ease both}
  .pill{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:600;padding:6px 13px;
    border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--panel-brd);color:var(--muted)}
  .pill .dot{width:8px;height:8px;border-radius:50%;background:var(--good);box-shadow:0 0 10px var(--good);animation:blink 2s infinite}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
  .divider{height:1px;background:linear-gradient(90deg,transparent,var(--panel-brd),transparent);margin:18px 0}
  .glow-btn{position:relative;overflow:hidden}
  .glow-btn::after{content:"";position:absolute;inset:0;background:radial-gradient(120px 60px at var(--mx,50%) var(--my,50%),rgba(255,255,255,.25),transparent 60%);opacity:0;transition:opacity .2s}
  .glow-btn:hover::after{opacity:1}

  /* ---- Strom-/Steuerungspanel ---- */
  .power-card{background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.03));
    border:1px solid var(--panel-brd);border-radius:22px;padding:22px;margin:0 auto 18px;max-width:760px;
    box-shadow:0 20px 60px rgba(0,0,0,.35)}
  .power-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .power-orb{width:54px;height:54px;border-radius:50%;flex:0 0 auto;position:relative;
    transition:all .4s cubic-bezier(.4,0,.2,1)}
  .power-orb.on{background:radial-gradient(circle at 35% 30%,#86efac,#22c55e 60%,#15803d);
    box-shadow:0 0 0 6px rgba(34,197,94,.12),0 0 34px rgba(34,197,94,.6)}
  .power-orb.on::after{content:"";position:absolute;inset:0;border-radius:50%;
    box-shadow:0 0 24px rgba(34,197,94,.8);animation:pulse 2.2s infinite}
  .power-orb.off{background:radial-gradient(circle at 35% 30%,#9aa3b2,#4b5563 60%,#374151);
    box-shadow:0 0 0 6px rgba(120,130,150,.1)}
  @keyframes pulse{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:.35;transform:scale(1.12)}}
  .power-title{font-size:1.18rem;font-weight:800;letter-spacing:.2px}
  .power-sub{color:var(--muted);font-size:.86rem;margin-top:2px}
  .power-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px}
  .power-actions form{margin:0}
  .pbtn{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:2px;
    border:0;border-radius:16px;padding:15px 16px;cursor:pointer;color:#fff;text-align:left;
    font-size:1rem;font-weight:700;transition:transform .15s ease,box-shadow .2s ease,filter .2s ease}
  .pbtn small{font-weight:500;opacity:.85;font-size:.76rem}
  .pbtn:hover{transform:translateY(-2px)} .pbtn:active{transform:scale(.98)}
  .pbtn-off{background:linear-gradient(135deg,#f87171,#dc2626);box-shadow:0 12px 30px rgba(220,38,38,.4)}
  .pbtn-on{background:linear-gradient(135deg,#34d399,#059669);box-shadow:0 12px 30px rgba(5,150,105,.4)}
  .pbtn-restart{background:linear-gradient(135deg,#60a5fa,#2563eb);box-shadow:0 12px 30px rgba(37,99,235,.4)}
  .pbtn-server{background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 12px 30px rgba(217,119,6,.4)}
  /* ---- Globaler Aus-Zustand: alles wirkt grau ---- */
  .power-banner{max-width:760px;margin:0 auto 16px;padding:13px 18px;border-radius:16px;font-weight:700;
    background:linear-gradient(135deg,rgba(248,113,113,.18),rgba(220,38,38,.1));
    border:1px solid rgba(248,113,113,.4);color:#fecaca;display:flex;align-items:center;gap:10px}
  .conn-banner{max-width:760px;margin:0 auto 16px;padding:10px 18px;border-radius:14px;font-size:.9rem;font-weight:600;
    background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.35);color:#fde68a;
    display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  body.poweroff .sidebar,body.poweroff .card:not(.power-card),body.poweroff .stat,body.poweroff .topbar{
    filter:grayscale(1) brightness(.82);transition:filter .5s ease}
  body.poweroff{background:#070809}

  /* ================= APP-SHELL (Sidebar-Layout) ================= */
  .content{position:relative;z-index:2;width:100%;align-self:stretch}
  .content.bare{max-width:520px;margin:24px auto}
  .content.has-shell{padding:6px 12px 60px 268px;max-width:1340px;margin-right:auto}
  .content.has-shell .card{max-width:none}
  @media(max-width:880px){.content.has-shell{padding:78px 4px 48px}}

  .sidebar{position:fixed;top:0;left:0;bottom:0;width:256px;z-index:40;display:flex;flex-direction:column;
    background:linear-gradient(180deg,rgba(20,22,34,.96),rgba(12,13,20,.96));
    border-right:1px solid var(--panel-brd);backdrop-filter:blur(18px);overflow-y:auto;
    padding:18px 14px;gap:6px;box-shadow:6px 0 40px rgba(0,0,0,.35)}
  .sidebar::-webkit-scrollbar{width:7px}.sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:10px}
  .sb-brand{display:flex;align-items:center;gap:12px;padding:8px 10px 14px}
  .sb-logo{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-size:1.35rem;
    background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 8px 22px rgba(99,102,241,.45)}
  .sb-brand b{font-size:1.05rem;letter-spacing:.2px;display:block;line-height:1.1}
  .sb-brand span{font-size:.72rem;color:var(--muted)}
  .sb-status{display:flex;align-items:center;gap:8px;margin:2px 6px 12px;padding:9px 12px;border-radius:12px;
    background:rgba(255,255,255,.04);border:1px solid var(--panel-brd);font-size:.8rem;font-weight:600}
  .sb-status .d{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
  .sb-status .d.on{background:#22c55e;box-shadow:0 0 12px #22c55e;animation:blink 2s infinite}
  .sb-status .d.off{background:#9aa3b2}
  .sb-group{margin-top:10px}
  .sb-cap{font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
    padding:6px 12px 4px;opacity:.7;font-weight:700}
  .sb-link{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;color:var(--muted);
    text-decoration:none;font-weight:600;font-size:.92rem;transition:all .16s ease;position:relative}
  .sb-link .ic{width:20px;text-align:center;font-size:1rem;flex:0 0 auto}
  .sb-link:hover{background:rgba(255,255,255,.06);color:#fff;transform:translateX(2px)}
  .sb-link.active{background:linear-gradient(135deg,rgba(99,102,241,.9),rgba(168,85,247,.85));color:#fff;
    box-shadow:0 8px 22px rgba(99,102,241,.4)}
  .sb-link.active::before{content:"";position:absolute;left:-14px;top:50%;transform:translateY(-50%);
    width:4px;height:22px;border-radius:0 4px 4px 0;background:#fff}
  .sb-foot{margin-top:auto;padding:12px 8px 2px}
  .sb-foot a{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:11px;
    background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:#fca5a5;
    text-decoration:none;font-weight:700;font-size:.85rem}
  .sb-foot a:hover{background:rgba(248,113,113,.2)}
  /* Mobile: Sidebar wird zur horizontalen Topbar */
  @media(max-width:880px){
    .sidebar{flex-direction:row;bottom:auto;width:100%;height:auto;overflow-x:auto;overflow-y:hidden;
      padding:10px 12px;gap:6px;align-items:center;border-right:0;border-bottom:1px solid var(--panel-brd)}
    .sb-brand{padding:4px 8px;flex:0 0 auto}.sb-brand span{display:none}
    .sb-status,.sb-cap,.sb-foot{display:none}
    .sb-group{margin:0;display:flex;gap:6px}
    .sb-link{padding:8px 12px;white-space:nowrap}.sb-link.active::before{display:none}
    .sb-link .lbl{display:none}.sb-link .ic{font-size:1.15rem}
  }
`;

// Weiche, animierte Farb-Orbs als moderner Hintergrund (ersetzt die alten Pflanzen-Emojis).
const LEAVES =
  '<div class="leaf" style="top:-90px;left:-60px;background:radial-gradient(circle,#6366f1,transparent 70%)"></div>' +
  '<div class="leaf" style="top:34%;right:-110px;background:radial-gradient(circle,#a855f7,transparent 70%);animation-delay:4s"></div>' +
  '<div class="leaf" style="bottom:-110px;left:18%;background:radial-gradient(circle,#22d3ee,transparent 70%);animation-delay:8s"></div>';

function page(title, body, opts = {}) {
  const refresh = opts.refresh
    ? `<meta http-equiv="refresh" content="${opts.refresh};url=${opts.refreshUrl || ''}">`
    : '';
  const off = !botState.powered;
  const bodyClass = off ? ' class="poweroff"' : '';
  // Globaler Hinweis-Banner, wenn der Bot ausgeschaltet ist (auf allen Innenseiten).
  const banner = (off && opts.power !== false)
    ? `<div class="power-banner">🔴 Der Bot ist ausgeschaltet. Der Server läuft weiter – schalte ihn im Dashboard wieder ein.</div>`
    : '';
  // Wegklickbarer Verbindungs-Hinweis (nur wenn Bot an, aber WhatsApp getrennt)
  const noConnBanner = (botState.powered && !botState.connected && opts.power !== false)
    ? `<div class="conn-banner" id="connBanner">🔌 Keine WhatsApp-Verbindung&ensp;
         <a href="/qr">Jetzt verbinden</a>
         <button onclick="document.getElementById('connBanner').remove();localStorage.setItem('connDismissed','1')" style="width:auto;padding:3px 10px;margin:0 0 0 8px;font-size:.85rem;background:rgba(255,255,255,.12)">×</button>
       </div>
       <script>(function(){if(localStorage.getItem('connDismissed')==='1'){var b=document.getElementById('connBanner');if(b)b.remove();}})();</script>`
    : '';
  // Innenseiten enthalten die Sidebar (via navBar) → App-Shell-Layout mit
  // linkem Innenabstand. Login/QR/Fehlerseiten haben keine Sidebar → zentriert.
  const hasShell = /class="sidebar"/.test(body);
  const contentClass = hasShell ? 'content has-shell' : 'content bare';
  return `<!doctype html><html lang="de"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    ${refresh}<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
    <body${bodyClass}>${LEAVES}<div class="${contentClass}">${banner}${noConnBanner}${body}${opts.script || ''}</div></body></html>`;
}

// Strom-/Steuerungspanel: Bot an/aus, Bot neu starten, Server neu starten.
function powerPanel() {
  const on = botState.powered;
  const conn = botState.connected;
  const statusTxt = !on
    ? 'Ausgeschaltet – der Server läuft weiter, der Bot reagiert nicht.'
    : conn ? 'Eingeschaltet & mit WhatsApp verbunden.' : 'Eingeschaltet – verbindet sich…';
  const onOffBtn = on
    ? `<form method="post" action="/power/off" onsubmit="return confirm('Bot wirklich ausschalten? Der Server bleibt online, der Bot reagiert dann nicht mehr.')">
         <button class="pbtn pbtn-off">⏻ Bot ausschalten<small>Bot pausiert · Server bleibt an</small></button></form>`
    : `<form method="post" action="/power/on">
         <button class="pbtn pbtn-on">⚡ Bot einschalten<small>Verarbeitung & Verbindung starten</small></button></form>`;
  return `
  <div class="power-card">
    <div class="power-head">
      <div class="power-orb ${on ? 'on' : 'off'}"></div>
      <div>
        <div class="power-title">${on ? '🟢 Bot ist AN' : '⚪ Bot ist AUS'}</div>
        <div class="power-sub">${statusTxt}</div>
      </div>
    </div>
    <div class="power-actions">
      ${onOffBtn}
      <form method="post" action="/bot/restart" onsubmit="return confirm('Bot neu starten? Die WhatsApp-Verbindung wird kurz getrennt und neu aufgebaut.')">
        <button class="pbtn pbtn-restart">🔄 Bot neu starten<small>Verbindung neu aufbauen · Server bleibt an</small></button></form>
      <form method="post" action="/server/restart" onsubmit="return confirm('GANZEN Server neu starten? Der Prozess wird beendet und von der Plattform neu gestartet. Daten kommen aus der Cloud.')">
        <button class="pbtn pbtn-server">♻️ Server neu starten<small>Kompletter Neustart · lädt Cloud-Daten</small></button></form>
    </div>
  </div>`;
}

// Gemeinsame Navigationsleiste für alle Innenseiten
// Seitenleiste (App-Shell). Gruppierte Navigation + Live-Status + Logout.
// Signatur bleibt navBar(active), damit alle Routen unverändert funktionieren.
function navBar(active = '') {
  const groups = [
    ['Übersicht', [
      ['dashboard', '📊', 'Dashboard'],
      ['activity', '📡', 'Aktivität'],
    ]],
    ['Verwaltung', [
      ['settings', '⚙️', 'Gruppen'],
      ['community', '🏘️', 'Communities'],
      ['community/global', '🌐', 'Global-Einstellungen'],
      ['befehle', '📖', 'Befehle'],
    ]],
    ['Sicherheit', [
      ['reports', '📋', 'Meldungen'],
      ['banlog', '🚫', 'Ban-Log'],
      ['fehlerlog', '⚠️', 'Fehlerlog'],
    ]],
    ['Werkzeuge', [
      ['lookup', '🔎', 'Nummer'],
      ['search', '🔍', 'Suche'],
      ['anliegen', '📨', 'Anliegen'],
    ]],
    ['Statistiken', [
      ['server', '🖥️', 'Server'],
    ]],
    ['Verbindung', [
      ['qr', '📲', 'QR-Code'],
    ]],
  ];
  const renderGroup = ([cap, items]) => {
    const links = items.map(([path, icon, label]) =>
      `<a href="/${path}" class="sb-link ${active === path ? 'active' : ''}">` +
      `<span class="ic">${icon}</span><span class="lbl">${label}</span></a>`
    ).join('');
    return `<div class="sb-group"><div class="sb-cap">${cap}</div>${links}</div>`;
  };
  const connected = botState.connected;
  const statusDot = !botState.powered ? '<span class="d off"></span> Bot aus'
    : connected ? '<span class="d on"></span> Verbunden'
    : '<span class="d off"></span> Getrennt';
  return `<aside class="sidebar">
    <div class="sb-brand">
      <div class="sb-logo">🤖</div>
      <div><b>WA-Bot</b><span>Steuerzentrale</span></div>
    </div>
    <div class="sb-status">${statusDot}</div>
    ${groups.map(renderGroup).join('')}
    <div class="sb-foot"><a href="/logout">⎋ Abmelden</a></div>
  </aside>`;
}

function requireAuth(req, res) {
  if (!sessionOk(req)) {
    res.status(401).send(page('Zugriff verweigert',
      '<div class="card"><h1>🔒 Zugriff verweigert</h1><p class="muted">Bitte melde dich an.</p><a href="/"><button>Zurück zur Anmeldung</button></a></div>'));
    return false;
  }
  return true;
}

// ---------- Webserver ----------
const app = express();
// Hinter Render/Proxy: echte Client-IP aus X-Forwarded-For lesen (für Ratelimit).
app.set('trust proxy', 1);
app.disable('x-powered-by'); // Express-Fingerprint nicht verraten
// Body-Größe begrenzen (Schutz vor Speicher-DoS durch riesige POST-Bodies).
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Sicherheits-Header auf allen Antworten. Wichtig u. a.:
//  - Referrer-Policy:no-referrer → das ?key=-Passwort leakt nicht via Referer.
//  - CSP → erlaubt nur eigene/inline Ressourcen (kein externes Script), blockt
//    Framing/Objekte → reduziert XSS/Clickjacking & Safe-Browsing-Flags.
//  - X-Robots-Tag:noindex → das Dashboard taucht nicht in Suchmaschinen auf.
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "form-action 'self'",
].join('; ');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

// Suchmaschinen aussperren (Dashboard ist privat).
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.get('/ping', (_req, res) => res.status(200).send('ok'));
// Health-Endpoint für Uptime-Monitore (UptimeRobot etc.) – immer 200, mit Status-JSON.
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    powered: botState.powered,
    connected: botState.connected,
    uptime: Math.round((Date.now() - botState.startedAt) / 1000),
  });
});

// ---------- Strom-/Steuerungs-Endpunkte (passwortgeschützt) ----------
// Bot AUS: pausiert die Verarbeitung & trennt die WhatsApp-Verbindung,
// der Webserver bleibt aber online. Zustand wird in der Cloud gespeichert.
app.post('/power/off', async (req, res) => {
  if (!requireAuth(req, res)) return;
  botState.powered = false;
  botState.paused = true;
  config.botPowered = false;
  try { await persist(); } catch (e) { logger.warn({ e }, 'persist (power off) fehlgeschlagen'); }
  try { botState.sock?.end?.(new Error('per Website ausgeschaltet')); } catch (_) {}
  botState.connected = false;
  logger.warn('🔴 Bot per Website AUSGESCHALTET – Webserver bleibt online.');
  res.redirect(`/dashboard`);
});

// Bot AN: nimmt die Verarbeitung wieder auf und verbindet neu.
app.post('/power/on', async (req, res) => {
  if (!requireAuth(req, res)) return;
  botState.powered = true;
  botState.paused = false;
  config.botPowered = true;
  try { await persist(); } catch (e) { logger.warn({ e }, 'persist (power on) fehlgeschlagen'); }
  if (!botState.connected && !botState.reconnecting) {
    botState.lastConnectedAt = botState.lastConnectedAt || Date.now();
    startBot().catch((e) => { logger.error({ e }, 'Einschalten: Start fehlgeschlagen'); scheduleReconnect('Power-On'); });
  }
  logger.info('🟢 Bot per Website EINGESCHALTET.');
  res.redirect(`/dashboard`);
});

// Bot NEU STARTEN: trennt die WhatsApp-Verbindung sauber und baut sie neu auf,
// ohne den Server (und damit die Web-Oberfläche) zu beenden.
app.post('/bot/restart', async (req, res) => {
  if (!requireAuth(req, res)) return;
  botState.powered = true;
  botState.paused = false;
  config.botPowered = true;
  try { await persist(); } catch (_) {}
  logger.warn('🔄 Bot-Neustart (Verbindung) angefordert.');
  try { botState.sock?.end?.(new Error('Neustart angefordert')); } catch (_) {}
  botState.connected = false;
  botState.reconnecting = false;
  setTimeout(() => {
    startBot().catch((e) => { logger.error({ e }, 'Bot-Neustart fehlgeschlagen'); scheduleReconnect('Neustart'); });
  }, 1500);
  res.redirect(`/dashboard`);
});

// SERVER NEU STARTEN: beendet den Prozess. Render (oder ein Prozess-Manager)
// startet ihn automatisch neu; dabei werden alle Daten frisch aus der Cloud geladen.
app.post('/server/restart', async (req, res) => {
  if (!requireAuth(req, res)) return;
  // powered-Status beibehalten, damit der Bot nach dem Neustart so weiterläuft wie jetzt.
  config.botPowered = botState.powered;
  try { await persist(); } catch (_) {}
  logger.warn('♻️ SERVER-Neustart angefordert – Prozess wird beendet, Plattform startet neu.');
  res.redirect(`/dashboard`);
  setTimeout(() => process.exit(0), 800);
});

// Startseite: Anmeldung mit Augen-Symbol
app.get('/', (_req, res) => {
  const statusBadge = botState.connected
    ? '<span class="status on">✅ verbunden</span>'
    : botState.qr
      ? '<span class="status off">⭕ wartet auf QR-Scan</span>'
      : '<span class="status off">⭕ getrennt</span>';
  const script = `<script>(function(){var p=document.getElementById('pw'),e=document.getElementById('eye');
    e.addEventListener('click',function(){if(p.type==='password'){p.type='text';e.textContent='🙈';}
    else{p.type='password';e.textContent='👁️';}p.focus();});})();</script>`;
  res.send(page('WhatsApp-Bot', `
    <div class="card hero">
      <div class="logo">🤖</div>
      <h1 class="gradient-text" style="font-size:clamp(1.6rem,6vw,2.1rem)">WhatsApp-Bot</h1>
      <p class="muted" style="max-width:380px;margin:8px auto 14px">Melde dich an, um Gruppen, Moderation & Communities zu verwalten.</p>
      <div>${statusBadge}</div>
    </div>
    <form class="card" method="post" action="/login">
      <h2>🔑 Anmelden</h2>
      <div class="pwwrap">
        <input id="pw" class="input" type="password" name="password" placeholder="Passwort" autofocus required>
        <button type="button" class="eye" id="eye" aria-label="Passwort anzeigen">👁️</button>
      </div>
      <button type="submit" class="glow-btn">Weiter →</button>
    </form>
    <p class="muted" style="text-align:center;font-size:.78rem;opacity:.6;margin-top:4px">🔒 Sichere, passwortgeschützte Verwaltung</p>`, { script }));
});

app.get('/status', (req, res) => {
  // Enthält die Bot-Nummer → nur mit Cookie-Session. Öffentliche Monitore nutzen /healthz.
  if (!sessionOk(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({
    status: botState.connected ? 'verbunden' : 'getrennt',
    nummer: botState.me ? botState.me.id.split(':')[0] : null,
    qrVerfuegbar: Boolean(botState.qr),
    aktiveGruppen: activeGroupCount(),
    moderationsAktionen: botState.moderation.actionsTotal,
    uptimeSekunden: Math.round((Date.now() - botState.startedAt) / 1000),
  });
});

app.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginBlocked(ip)) {
    return res.status(429).send(page('Zu viele Versuche',
      '<div class="card"><h1>⏳ Zu viele Fehlversuche</h1><p class="muted">Bitte warte ein paar Minuten und versuche es dann erneut.</p><a href="/"><button>Zurück</button></a></div>'));
  }
  if (!passwordOk(req.body.password)) {
    noteLoginFail(ip);
    return res.status(401).send(page('Falsches Passwort',
      '<div class="card"><h1>🔒 Falsches Passwort</h1><p class="muted">Das eingegebene Passwort ist falsch.</p><a href="/"><button>Erneut versuchen</button></a></div>'));
  }
  noteLoginOk(ip);
  const token = crypto.randomBytes(32).toString('hex');
  if (activeSessions.size >= 50) activeSessions.clear(); // Verhindert unbegrenzte Session-Akkumulation
  activeSessions.add(token);
  const secure = process.env.NODE_ENV !== 'development';
  res.setHeader('Set-Cookie', `sess=${token}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Max-Age=86400; Path=/`);
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  const t = parseCookies(req).sess;
  if (t) activeSessions.delete(t);
  res.setHeader('Set-Cookie', 'sess=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
  res.redirect('/');
});

// QR-Code-Seite
app.get('/qr', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  if (botState.connected) {
    return res.send(page('Verbunden', `
      <div class="card">
        <h1>✅ Verbunden</h1>
        <p class="muted">Erfolgreich verbunden – weiter zu den Einstellungen…</p>
        <a href="/settings"><button>Weiter zu den Einstellungen →</button></a>
      </div>`, { refresh: 2, refreshUrl: `/settings` }));
  }
  if (!botState.qr) {
    return res.send(page('Warte auf QR', `
      <div class="card" style="text-align:center">
        <h1>⏳ QR-Code wird vorbereitet…</h1>
        <p class="muted">Die Seite lädt automatisch neu.</p>
      </div>`, { refresh: 8, refreshUrl: `/qr` }));
  }
  try {
    const qrImage = await QRCode.toDataURL(botState.qr, { width: 360, margin: 1 });
    res.send(page('WhatsApp QR-Code', `
      <div class="card" style="text-align:center">
        <h1>📲 WhatsApp verbinden</h1>
        <p class="muted">WhatsApp → Einstellungen → <b>Verknüpfte Geräte</b> → <b>Gerät hinzufügen</b></p>
        <div class="qr"><img src="${qrImage}" alt="QR Code"></div>
        <p class="muted">Der Code aktualisiert sich automatisch.</p>
        <a href="/dashboard" style="display:inline-block;margin-top:14px"><button style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:10px 22px;cursor:pointer;color:#e9ecf3;font-weight:600">← Zurück zum Dashboard</button></a>
      </div>`, { refresh: 25, refreshUrl: `/qr` }));
  } catch (err) {
    logger.error({ err }, 'Fehler beim Erzeugen des QR-Codes');
    res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
  }
});

// Übersicht: Gruppen (jede führt zur Detail-Konfiguration)
app.get('/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  if (botState.connected) await refreshGroups();
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';
  const groups = getGroupsCached();

  let groupsHtml = '';
  if (groups.length === 0) {
    groupsHtml = '<p class="muted">Keine Gruppen im Cache. Verbinde den Bot, um Gruppen zu laden.</p>';
  } else {
    for (const g of groups) {
      const gc = effectiveGroupConfig(g.id);
      const stats = config.groups[g.id]?.memberStats || {};
      const activity = Object.values(stats).reduce((a, m) => a + (m.messages || 0) + (m.commands || 0), 0);
      const badge = g.isCommunity
        ? '<span class="badge">🏘️ Community</span>'
        : g.community ? '<span class="badge">in Community</span>' : '';
      const activeBadge = gc.active
        ? '<span class="chip on">● aktiv</span>'
        : '<span class="chip off">○ inaktiv</span>';
      const pic = botState.groupPics[g.id];
      const avatar = pic
        ? `<img class="avatar" src="${escapeHtml(pic)}" alt="" loading="lazy">`
        : `<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:1.3rem">👥</div>`;
      groupsHtml += `
        <a class="grp" data-active="${gc.active ? 1 : 0}" data-name="${escapeHtml((g.subject || 'unbenannt').toLowerCase())}" data-size="${g.size || 0}" data-activity="${activity}"
           href="/group?id=${encodeURIComponent(g.id)}">
          ${avatar}
          <span class="meta"><span class="name">${escapeHtml(g.subject || 'Unbenannt')}${badge} ${activeBadge}</span>
            <span class="muted">${g.size || 0} Mitglieder · ${activity} Aktivität</span></span>
          <span style="font-size:1.3rem">⚙️</span>
        </a>`;
    }
  }

  const totalMembers = groups.reduce((s, g) => s + (g.size || 0), 0);
  const connBadge = botState.connected ? '<span class="status on">verbunden</span>' : '<span class="status off">offline</span>';
  res.send(page('Einstellungen', `
    ${navBar('settings')}
    <div class="card">
      <div class="row"><h1>⚙️ Gruppen-Übersicht</h1>${connBadge}</div>
      <p class="muted">Nummer: <b>${escapeHtml(nummer)}</b></p>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="k">Aktive Gruppen</div><div class="v">${activeGroupCount()}</div></div>
        <div class="stat"><div class="k">Gruppen gesamt</div><div class="v">${groups.length}</div></div>
        <div class="stat"><div class="k">Mitglieder gesamt</div><div class="v">${totalMembers}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Deine Gruppen & Communities</h2>
      <input type="search" id="grpSearch" class="search-bar" placeholder="🔍 Gruppe suchen…" oninput="applyView()">
      <div class="toolbar">
        <div class="seg" id="segFilter">
          <button type="button" class="seg-btn active" data-filter="all" onclick="setFilter(this)">Alle</button>
          <button type="button" class="seg-btn" data-filter="active" onclick="setFilter(this)">Aktiv</button>
          <button type="button" class="seg-btn" data-filter="inactive" onclick="setFilter(this)">Inaktiv</button>
        </div>
        <select class="input" id="sortSel" style="width:auto;min-width:170px;margin:0" onchange="applyView()">
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="size-desc">Größe (absteigend)</option>
          <option value="size-asc">Größe (aufsteigend)</option>
          <option value="activity-desc">Aktivität (absteigend)</option>
        </select>
      </div>
      <p class="muted" id="grpCount" style="margin:0 0 8px"></p>
      <div id="grpList">${groupsHtml}</div>
    </div>
    <div class="card row" style="flex-wrap:wrap;gap:10px">
      <a href="/settings">🔄 Neu laden</a>
      <a href="/lookup">🔎 Nummer suchen</a>
      <a href="/dashboard">📊 Dashboard</a>
    </div>`,
    { script: `<script>
      var curFilter='all';
      function setFilter(btn){curFilter=btn.dataset.filter;
        document.querySelectorAll('#segFilter .seg-btn').forEach(function(b){b.classList.toggle('active',b===btn)});applyView();}
      function applyView(){
        var q=(document.getElementById('grpSearch').value||'').toLowerCase();
        var sort=document.getElementById('sortSel').value;
        var list=document.getElementById('grpList');
        var cards=Array.prototype.slice.call(list.querySelectorAll('.grp'));
        cards.sort(function(a,b){
          if(sort==='name-asc')return a.dataset.name.localeCompare(b.dataset.name);
          if(sort==='name-desc')return b.dataset.name.localeCompare(a.dataset.name);
          if(sort==='size-desc')return b.dataset.size-a.dataset.size;
          if(sort==='size-asc')return a.dataset.size-b.dataset.size;
          if(sort==='activity-desc')return b.dataset.activity-a.dataset.activity;
          return 0;
        });
        var shown=0;
        cards.forEach(function(el){
          list.appendChild(el);
          var okF=curFilter==='all'||(curFilter==='active'&&el.dataset.active==='1')||(curFilter==='inactive'&&el.dataset.active==='0');
          var okQ=el.dataset.name.includes(q);
          var vis=okF&&okQ; el.style.display=vis?'':'none'; if(vis)shown++;
        });
        var c=document.getElementById('grpCount'); if(c)c.textContent=shown+' von '+cards.length+' Gruppen';
      }
      applyView();
    </script>` }
  ));
});

// Detail-Konfiguration einer Gruppe
app.get('/group', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const group = getGroupsCached().find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings"><button>Zurück</button></a></div>`));
  }

  const gc = effectiveGroupConfig(id);
  const saved = req.query.saved ? '<p class="muted">✅ Gespeichert.</p>' : '';
  const chk = (b) => (b ? 'checked' : '');

  function cmdSelect(key) {
    const val = gc.commands[key];
    const sel = (v) => val === v ? 'selected' : '';
    return `<select class="input" name="cmd_${key}" style="width:auto;min-width:160px">
      <option value="all" ${sel('all')}>Alle</option>
      <option value="admin" ${sel('admin')}>Nur Admins</option>
      <option value="off" ${sel(false)}>Deaktiviert</option>
    </select>`;
  }

  const commandsHtml = COMMANDS.map((c) => `
    <div class="opt">
      <span>${COMMAND_PREFIX}${c.key}<br><span class="muted">${c.desc}</span></span>
      ${cmdSelect(c.key)}
    </div>`).join('');

  const parentJ = parentJidOf(group);
  const comBadge = parentJ
    ? `<a href="/community" class="chip" style="text-decoration:none">🏘️ ${escapeHtml(communityName(parentJ))}</a>`
    : '';
  res.send(page('Gruppe konfigurieren', `
    ${navBar('')}
    <div class="card">
      <div class="row"><h1>⚙️ ${escapeHtml(group.subject || 'Gruppe')}</h1>
        <a href="/settings">← zurück</a></div>
      <p class="muted">${group.size || 0} Mitglieder ${comBadge} · <a href="/group/members?id=${encodeURIComponent(id)}">👥 Mitglieder anzeigen</a></p>
      ${saved}
    </div>
    <form method="POST" action="/group/save?id=${encodeURIComponent(id)}">
      <div class="card">
        <h2>Status</h2>
        <label class="opt"><span>Bot in dieser Gruppe <b>aktiv</b></span>
          <input type="checkbox" name="active" ${chk(gc.active)}></label>
      </div>
      <div class="card">
        <h2>Erlaubte Befehle</h2>
        <p class="muted">Welche Befehle dürfen in dieser Gruppe genutzt werden?</p>
        ${commandsHtml}
      </div>
      <div class="card">
        <h2>Moderation</h2>
        <p class="muted">Damit der Bot Nachrichten löschen kann, muss er in dieser Gruppe <b>Admin</b> sein.</p>
        <label class="opt"><span>🤬 Beleidigungen löschen + verwarnen</span>
          <input type="checkbox" name="mod_badwords" ${chk(gc.moderation.badwords)}></label>
        <label class="opt"><span>🔗 Links löschen</span>
          <input type="checkbox" name="mod_links" ${chk(gc.moderation.links)}></label>
        <label class="opt"><span>Verwarnungen bis Stummschaltung</span>
          <input class="input" style="width:80px" type="number" min="1" max="10" name="warnLimit" value="${gc.moderation.warnLimit}"></label>
        <label class="opt"><span>🐌 Slowmode (Sekunden, 0 = aus)<br><span class="muted">max. 1 Nachricht/Nutzer pro X Sek. (gilt nicht für Admins)</span></span>
          <input class="input" style="width:80px" type="number" min="0" max="3600" name="slowmode" value="${Number(gc.moderation.slowmode) || 0}"></label>
        <p class="muted" style="margin-top:12px">Zusätzliche verbotene Wörter (kommagetrennt):</p>
        <textarea class="input" name="extraBadwords" placeholder="z. B. idiot, depp">${escapeHtml((gc.moderation.extraBadwords || []).join(', '))}</textarea>
      </div>
      <div class="card">
        <h2>👋 Willkommensnachrichten</h2>
        <label class="opt"><span>Neue Mitglieder begrüßen</span>
          <input type="checkbox" name="welcome_enabled" ${chk(gc.welcome.enabled)}></label>
        <p class="muted" style="margin-top:8px">Nachrichtentext ({user} = Nummer des neuen Mitglieds):</p>
        <textarea class="input" name="welcome_message" placeholder="Willkommen @{user} in der Gruppe! 🎉">${escapeHtml(gc.welcome.message || '')}</textarea>
      </div>
      <div class="card">
        <h2>📋 Gruppenregeln</h2>
        <p class="muted">Diese Regeln werden mit !regeln angezeigt. Leer lassen = Standardregeln.</p>
        <textarea class="input" name="rules" placeholder="1. Sei respektvoll…" style="min-height:100px">${escapeHtml(gc.rules || '')}</textarea>
      </div>
      <div class="card"><button type="submit">💾 Speichern</button></div>
    </form>`));
});

// Gruppen-Konfiguration speichern
app.post('/group/save', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  if (!id) return res.status(400).send('Fehlende Gruppen-ID.');

  const commands = {};
  for (const c of COMMANDS) {
    const raw = req.body[`cmd_${c.key}`];
    commands[c.key] = raw === 'admin' ? 'admin' : raw === 'off' ? false : 'all';
  }
  const extra = String(req.body.extraBadwords || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const welcomeMsg = String(req.body.welcome_message || '').trim() || null;
  const rulesText = String(req.body.rules || '').trim() || null;

  // Bestehende Felder bewahren (moderation._state)
  const existing = config.groups[id] || {};
  config.groups[id] = {
    ...existing,
    active: req.body.active !== undefined,
    commands,
    moderation: {
      ...(existing.moderation || {}),
      badwords: req.body.mod_badwords !== undefined,
      links: req.body.mod_links !== undefined,
      warnLimit: Math.min(10, Math.max(1, Number(req.body.warnLimit) || 3)),
      slowmode: Math.min(3600, Math.max(0, Number(req.body.slowmode) || 0)),
      extraBadwords: extra,
    },
    welcome: {
      enabled: req.body.welcome_enabled !== undefined,
      message: welcomeMsg,
    },
    rules: rulesText,
  };
  await persist();
  logger.info({ group: id, active: config.groups[id].active }, 'Gruppen-Konfiguration gespeichert');
  res.redirect(`/group?id=${encodeURIComponent(id)}&saved=1`);
});

// Mitglieder einer Gruppe
app.get('/group/members', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const group = getGroupsCached().find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings"><button>Zurück</button></a></div>`));
  }
  if (!botState.connected) {
    return res.status(503).send(page('Nicht verbunden',
      `<div class="card"><h1>⚠️ Nicht verbunden</h1><a href="/settings"><button>Zurück</button></a></div>`));
  }

  const meta = await getGroupMeta(id);
  const participants = meta?.participants || [];
  const botJid = jidNormalizedUser(botState.me?.id || '');

  let memberCards = '';
  for (const p of participants) {
    const num = p.id.split('@')[0];
    const isSelfBot = jidNormalizedUser(p.id) === botJid;
    const roleTags = (p.admin === 'superadmin' ? '<span class="tag tag-creator">👑 Ersteller</span>' :
      p.admin ? '<span class="tag tag-admin">🛡️ Admin</span>' : '') +
      (isSelfBot ? '<span class="tag tag-bot">🤖 Bot</span>' : '');
    const encodedJid = encodeURIComponent(p.id);
    const grpEnc = encodeURIComponent(id);
    const actionBtns = !isSelfBot ? `
      <a href="/member?jid=${encodedJid}&group=${grpEnc}" class="action-btn btn-blue">📋 Profil</a>
      <form method="POST" action="/member/action" style="display:inline" onsubmit="return confirm('Wirklich muten?')">
        <input type="hidden" name="action" value="mute">
        <input type="hidden" name="targetJid" value="${escapeHtml(p.id)}">
        <input type="hidden" name="groupJid" value="${escapeHtml(id)}">
        <button type="submit" class="action-btn btn-yellow">🔇 Mute</button>
      </form>
      <form method="POST" action="/member/action" style="display:inline" onsubmit="return confirm('Wirklich kicken?')">
        <input type="hidden" name="action" value="kick">
        <input type="hidden" name="targetJid" value="${escapeHtml(p.id)}">
        <input type="hidden" name="groupJid" value="${escapeHtml(id)}">
        <button type="submit" class="action-btn btn-red">🚫 Kick</button>
      </form>` : '';
    memberCards += `<div class="member-card" data-num="${escapeHtml(num)}">
      <div class="num">${escapeHtml(num)}${roleTags}</div>
      <div class="actions">${actionBtns}</div>
    </div>`;
  }

  res.send(page(`Mitglieder – ${group.subject}`, `
    ${navBar('')}
    <div class="card">
      <div class="row">
        <h1>👥 ${escapeHtml(group.subject || 'Gruppe')}</h1>
        <a href="/group?id=${encodeURIComponent(id)}">← zurück</a>
      </div>
      <p class="muted">${participants.length} Mitglieder · <a href="/group/stats?id=${encodeURIComponent(id)}">🏆 Leaderboard</a></p>
    </div>
    <div class="card">
      <input type="search" id="memSearch" class="search-bar" placeholder="🔍 Nummer suchen…" oninput="filterMem(this.value)">
      <div id="memList">${memberCards || '<p class="muted">Keine Mitglieder geladen.</p>'}</div>
    </div>`,
    { script: `<script>function filterMem(v){v=v.toLowerCase();document.querySelectorAll('#memList .member-card').forEach(function(el){el.style.display=el.dataset.num.includes(v)?'':'none';})}</script>` }
  ));
});

// Meldungen
app.get('/reports', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const reports = (config.reports || []).slice().reverse();

  let rows = '';
  for (const r of reports) {
    const date = new Date(r.at).toLocaleString('de-DE');
    rows += `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(r.groupName || r.groupJid)}</td>
      <td>${escapeHtml(r.senderNum)}</td>
      <td>${escapeHtml(r.text)}</td>
    </tr>`;
  }

  res.send(page('Meldungen', `
    ${navBar('reports')}
    <div class="card">
      <div class="row">
        <h1>📋 Meldungen</h1>
        <a href="/settings">← zurück</a>
      </div>
      <p class="muted">${reports.length} Meldung(en) gesamt</p>
    </div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Datum</th><th>Gruppe</th><th>Von</th><th>Text</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">Noch keine Meldungen.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card row">
      <a href="/settings">⚙️ Einstellungen</a>
      <a href="/dashboard">📊 Dashboard</a>
    </div>`));
});

// Community-Übersicht – Gruppen nach Community gebündelt
app.get('/community', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  if (botState.connected) await refreshGroups();
  const communities = getCommunities();
  const connBadge2 = botState.connected ? '<span class="status on">verbunden</span>' : '<span class="status off">offline</span>';

  let body = `${navBar('community')}
    <div class="card">
      <div class="row"><h1>🏘️ Communities</h1>${connBadge2}</div>
      <p class="muted">Der Bot erkennt automatisch, welche Gruppen zu welcher Community gehören.
        Du kannst eine ganze Community auf einmal ein- oder ausschalten und einzelne Gruppen weiter feinjustieren.</p>
    </div>`;

  if (!communities.length) {
    body += `<div class="card"><p class="muted">Keine Communities gefunden. Der Bot ist in keiner Gruppe, die zu einer Community gehört
      – oder die Community-Struktur wurde noch nicht geladen.</p></div>`;
  } else {
    for (const c of communities) {
      const activeCount = c.groups.filter((g) => effectiveGroupConfig(g.id).active).length;
      const grpHtml = c.groups.map((g) => {
        const gc = effectiveGroupConfig(g.id);
        const chip = gc.active ? '<span class="chip on">● aktiv</span>' : '<span class="chip off">○ inaktiv</span>';
        return `<a class="grp" href="/group?id=${encodeURIComponent(g.id)}">
          <span class="meta"><span class="name">${escapeHtml(g.subject || 'Unbenannt')} ${chip}</span>
            <span class="muted">${g.size || 0} Mitglieder</span></span>
          <span style="font-size:1.2rem">⚙️</span></a>`;
      }).join('');
      body += `
        <div class="card">
          <div class="row">
            <h2 style="margin:0">🏘️ ${escapeHtml(c.name)}</h2>
            <span class="chip">${activeCount}/${c.groups.length} aktiv</span>
          </div>
          <div class="row" style="gap:8px;margin:10px 0;flex-wrap:wrap">
            <a href="/community/settings?parent=${encodeURIComponent(c.parent)}" class="action-btn btn-blue">⚙️ Einstellungen für alle Gruppen</a>
            <form method="POST" action="/community/toggle" style="display:inline">
              <input type="hidden" name="parent" value="${escapeHtml(c.parent)}"><input type="hidden" name="enable" value="1">
              <button type="submit" class="action-btn btn-green">✅ Alle aktivieren</button>
            </form>
            <form method="POST" action="/community/toggle" style="display:inline">
              <input type="hidden" name="parent" value="${escapeHtml(c.parent)}"><input type="hidden" name="enable" value="0">
              <button type="submit" class="action-btn btn-red">⛔ Alle deaktivieren</button>
            </form>
          </div>
          ${grpHtml}
        </div>`;
    }
  }
  res.send(page('Communities', body));
});

// Community komplett an/aus
app.post('/community/toggle', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parent = String(req.body.parent || '');
  const enable = String(req.body.enable) === '1';
  if (parent) {
    const n = await setCommunityActive(parent, enable);
    logger.info({ parent, enable, n }, 'Community umgeschaltet');
  }
  res.redirect(`/community`);
});

// Pro-Community Einstellungen – Seite (gilt für ALLE Gruppen dieser Community)
app.get('/community/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const parent = String(req.query.parent || '');

  if (botState.connected) await refreshGroups();
  const community = getCommunities().find((c) => c.parent === parent);
  if (!parent || !community) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Community nicht gefunden</h1><a href="/community"><button>Zurück</button></a></div>`));
  }

  const grps = community.groups;
  const chk = (b) => (b ? 'checked' : '');
  const saved = req.query.saved ? '<p class="muted">✅ Auf alle Gruppen angewendet.</p>' : '';

  // Aktuellen Stand aus den Gruppen ableiten (Vorbelegung des Formulars)
  const cfgs = grps.map((g) => effectiveGroupConfig(g.id));
  const everyActive = grps.length > 0 && cfgs.every((c) => c.active);
  const ref = cfgs[0] || effectiveGroupConfig('__none__');
  const mod = ref.moderation || {};

  res.send(page(`Einstellungen – ${community.name}`, `
    ${navBar('community')}
    <div class="card">
      <div class="row"><h1>⚙️ ${escapeHtml(community.name)}</h1>
        <a href="/community">← zurück</a></div>
      <p class="muted">Diese Einstellungen gelten für <b>alle ${grps.length} Gruppen</b> dieser Community. Beim Speichern werden sie auf jede Gruppe angewendet. Einzelne Gruppen kannst du danach weiterhin separat feinjustieren.</p>
      ${saved}
    </div>
    <form method="POST" action="/community/settings/save">
      <input type="hidden" name="parent" value="${escapeHtml(parent)}">
      <div class="card">
        <h2>Status</h2>
        <label class="opt"><span>Bot in allen Gruppen <b>aktiv</b></span>
          <input type="checkbox" name="active" ${chk(everyActive)}></label>
      </div>
      <div class="card">
        <h2>Moderation</h2>
        <p class="muted">Damit der Bot Nachrichten löschen kann, muss er in der jeweiligen Gruppe <b>Admin</b> sein.</p>
        <label class="opt"><span>🤬 Beleidigungen löschen + verwarnen</span>
          <input type="checkbox" name="mod_badwords" ${chk(mod.badwords)}></label>
        <label class="opt"><span>🔗 Links löschen</span>
          <input type="checkbox" name="mod_links" ${chk(mod.links)}></label>
        <label class="opt"><span>Verwarnungen bis Stummschaltung</span>
          <input class="input" style="width:80px" type="number" min="1" max="10" name="warnLimit" value="${Number(mod.warnLimit) || 3}"></label>
        <label class="opt"><span>🐌 Slowmode (Sekunden, 0 = aus)</span>
          <input class="input" style="width:80px" type="number" min="0" max="3600" name="slowmode" value="${Number(mod.slowmode) || 0}"></label>
        <p class="muted" style="margin-top:12px">Zusätzliche verbotene Wörter (kommagetrennt):</p>
        <textarea class="input" name="extraBadwords" placeholder="z. B. idiot, depp">${escapeHtml((mod.extraBadwords || []).join(', '))}</textarea>
      </div>
      <div class="card">
        <h2>👋 Willkommensnachrichten</h2>
        <label class="opt"><span>Neue Mitglieder begrüßen</span>
          <input type="checkbox" name="welcome_enabled" ${chk(ref.welcome?.enabled)}></label>
        <p class="muted" style="margin-top:8px">Nachrichtentext ({user} = Nummer des neuen Mitglieds):</p>
        <textarea class="input" name="welcome_message" placeholder="Willkommen @{user} in der Gruppe! 🎉">${escapeHtml(ref.welcome?.message || '')}</textarea>
      </div>
      <div class="card">
        <h2>📋 Gruppenregeln</h2>
        <p class="muted">Diese Regeln werden mit !regeln angezeigt. Leer lassen = Standardregeln.</p>
        <textarea class="input" name="rules" placeholder="1. Sei respektvoll…" style="min-height:100px">${escapeHtml(ref.rules || '')}</textarea>
      </div>
      <div class="card">
        <h2>📢 Ankündigung (optional)</h2>
        <p class="muted">Wird beim Speichern <b>einmalig</b> an alle aktiven Gruppen dieser Community gesendet (nur bei aktiver Verbindung). Leer lassen = nichts senden.</p>
        <textarea class="input" name="announcement" placeholder="Nachricht an die Community …"></textarea>
      </div>
      <div class="card"><button type="submit">💾 Auf alle ${grps.length} Gruppen anwenden</button></div>
    </form>`));
});

// Pro-Community Einstellungen – Speichern (auf alle Gruppen der Community anwenden)
app.post('/community/settings/save', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parent = String(req.body.parent || '');
  if (!parent) return res.status(400).send('Fehlende Community-ID.');

  const community = getCommunities().find((c) => c.parent === parent);
  if (!community) return res.status(404).send('Community nicht gefunden.');

  const b = req.body;
  const active = b.active !== undefined;
  const extra = String(b.extraBadwords || '').split(',').map((s) => s.trim()).filter(Boolean);
  const warnLimit = Math.min(10, Math.max(1, Number(b.warnLimit) || 3));
  const slowmode = Math.min(3600, Math.max(0, Number(b.slowmode) || 0));
  const welcomeEnabled = b.welcome_enabled !== undefined;
  const welcomeMsg = String(b.welcome_message || '').trim() || null;
  const rulesText = String(b.rules || '').trim() || null;

  for (const g of community.groups) {
    const existing = config.groups[g.id] || defaultGroupConfig();
    config.groups[g.id] = {
      ...existing,
      active,
      moderation: {
        ...(existing.moderation || {}),
        badwords: b.mod_badwords !== undefined,
        links: b.mod_links !== undefined,
        warnLimit, slowmode, extraBadwords: extra,
      },
      welcome: { enabled: welcomeEnabled, message: welcomeMsg },
      rules: rulesText,
    };
  }
  await persist();
  logger.info({ parent, groups: community.groups.length, active }, 'Community-Einstellungen auf alle Gruppen angewendet');

  // Optionale Ankündigung an aktive Gruppen dieser Community
  const announcement = String(b.announcement || '').trim();
  if (announcement && botState.connected && botState.sock) {
    let sent = 0;
    for (const g of community.groups) {
      if (config.groups[g.id]?.active === false) continue;
      try {
        await botState.sock.sendMessage(g.id, { text: announcement });
        sent += 1;
        await new Promise((r) => setTimeout(r, 300));
      } catch (_) {}
    }
    logger.info({ parent, sent }, 'Community-Ankündigung gesendet');
  }

  res.redirect(`/community/settings?parent=${encodeURIComponent(parent)}&saved=1`);
});

// Community-weite Globaleinstellungen – Seite
app.get('/community/global', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const gs = config.globalSettings || {};
  const mod = gs.moderation || {};

  const toggleRow = (name, label, checked, note = '') =>
    `<label class="toggle-row"><span>${label}${note ? `<small class="muted"> – ${note}</small>` : ''}</span><input type="hidden" name="${name}" value="0"><input type="checkbox" name="${name}" value="1"${checked ? ' checked' : ''}></label>`;

  res.send(page('Global-Einstellungen', `${navBar('community/global')}
    <div class="page-header"><h1>🌐 Globaleinstellungen</h1><a href="/community">← Communities</a></div>
    <div class="card" style="border:2px solid #ff9800;background:rgba(255,152,0,.08)">
      <p>⚠️ <b>Achtung:</b> Wenn Synchronisation aktiv ist, überschreiben diese Einstellungen alle Gruppeneinstellungen beim Speichern.</p>
    </div>
    <form method="POST" action="/community/global/save">
      <div class="card">
        <h2>🔄 Synchronisation</h2>
        ${toggleRow('syncEnabled', 'Sync aktiviert', gs.syncEnabled, 'Einstellungen auf alle Gruppen anwenden')}
        ${toggleRow('botActive', 'Bot in allen Gruppen aktiv', gs.botActive !== false, 'Schaltet alle Gruppen ein/aus')}
      </div>
      <div class="card">
        <h2>👋 Willkommensnachricht</h2>
        ${toggleRow('welcomeEnabled', 'Willkommen aktiviert', gs.welcome?.enabled)}
        <label>Nachricht (Platzhalter: {user})<br>
          <textarea name="welcomeMsg" rows="3" style="width:100%;margin-top:6px">${escapeHtml(gs.welcome?.message || 'Willkommen, {user}! 👋')}</textarea>
        </label>
      </div>
      <div class="card">
        <h2>🛡️ Moderation</h2>
        ${toggleRow('badwords', 'Schlechte Wörter filtern', mod.badwords)}
        ${toggleRow('links', 'Links löschen', mod.links)}
        <label>Warn-Limit (1–10)<br><input type="number" name="warnLimit" min="1" max="10" value="${mod.warnLimit || 3}" style="width:80px;margin-top:4px"></label>
        <label style="margin-top:10px;display:block">Slowmode (Sekunden, 0=aus)<br><input type="number" name="slowmode" min="0" max="300" value="${mod.slowmode || 0}" style="width:80px;margin-top:4px"></label>
      </div>
      <div class="card">
        <h2>📢 Globale Ankündigung</h2>
        <p class="muted">Diese Nachricht wird <b>einmalig</b> beim Speichern an alle aktiven Gruppen gesendet. Leer lassen, um nichts zu senden.</p>
        <textarea name="announcement" rows="3" style="width:100%" placeholder="Nachricht an alle Gruppen …"></textarea>
      </div>
      <div class="card" style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="submit" class="glow-btn">💾 Speichern & Synchronisieren</button>
        <a href="/community" style="align-self:center">Abbrechen</a>
      </div>
    </form>`));
});

// Community-weite Globaleinstellungen – Speichern & Sync
app.post('/community/global/save', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const b = req.body;

  const gs = {
    syncEnabled: b.syncEnabled === '1',
    botActive: b.botActive === '1',
    welcome: {
      enabled: b.welcomeEnabled === '1',
      message: String(b.welcomeMsg || 'Willkommen, {user}! 👋').slice(0, 500),
    },
    moderation: {
      badwords: b.badwords === '1',
      links: b.links === '1',
      warnLimit: Math.min(10, Math.max(1, Number(b.warnLimit) || 3)),
      slowmode: Math.min(300, Math.max(0, Number(b.slowmode) || 0)),
    },
    announcement: String(b.announcement || '').slice(0, 1000),
  };
  config.globalSettings = gs;

  let synced = 0;
  if (gs.syncEnabled && config.groups) {
    for (const [gid, grp] of Object.entries(config.groups)) {
      grp.active = gs.botActive;
      grp.welcome = grp.welcome || {};
      grp.welcome.enabled = gs.welcome.enabled;
      grp.welcome.message = gs.welcome.message;
      grp.moderation = grp.moderation || {};
      grp.moderation.badwords = gs.moderation.badwords;
      grp.moderation.links = gs.moderation.links;
      grp.moderation.warnLimit = gs.moderation.warnLimit;
      grp.moderation.slowmode = gs.moderation.slowmode;
      synced++;
    }
    logger.info({ synced }, 'Global-Sync: alle Gruppen synchronisiert');
  }

  // Globale Ankündigung senden
  if (gs.announcement && botState.connected && botState.sock) {
    const activeGids = Object.entries(config.groups || {})
      .filter(([, g]) => g.active)
      .map(([gid]) => gid);
    let sent = 0;
    for (const gid of activeGids) {
      try {
        await botState.sock.sendMessage(gid, { text: gs.announcement });
        sent++;
        await new Promise((r) => setTimeout(r, 300)); // Rate-limit
      } catch (_) {}
    }
    logger.info({ sent }, 'Globale Ankündigung gesendet');
  }

  persist();
  res.redirect(`/community/global?saved=1`);
});

// Globale Nummern-Suche – alle Infos & gemeinsame Gruppen
app.get('/lookup', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const rawNum = String(req.query.num || '');
  // Normalisierung: alle Symbole entfernen, dann 00-Präfix und (0)-Ortskennzahl nach Ländervorwahl strippen
  const rawStripped = rawNum.replace(/[\s\-\/().+]/g, '').replace(/\D/g, '');
  const num = rawStripped.startsWith('00')
    ? rawStripped.slice(2)
    : rawStripped.replace(/^(\d{1,3})0(\d{7,})$/, '$1$2');

  const searchForm = `
    <form class="card" method="get" action="/lookup">
      <h2>🔎 Nummer nachschlagen</h2>
      <p class="muted">Gib eine Telefonnummer ein — Format egal: +49 151…, 0049151…, 491511234567. Der Bot normalisiert automatisch.</p>
      <input type="search" name="num" class="search-bar" placeholder="+49 151 1234567" value="${escapeHtml(rawNum)}" autofocus>
      <button type="submit">Suchen</button>
    </form>`;

  if (!num) {
    return res.send(page('Nummer-Suche', `${navBar('lookup')}${searchForm}`));
  }

  if (botState.connected) {
    await refreshGroups();
    await Promise.allSettled(botState.groups.map((g) => getGroupMeta(g.id)));
  }

  const targetJid = `${num}@s.whatsapp.net`;
  let totalMsg = 0, totalCmd = 0, totalWarn = 0;
  const groupCards = [];
  const communitySet = new Set();

  // Suche in live-Gruppen (wenn verbunden) oder Statistik-Cache offline
  const searchGroups = botState.connected && botState.groups.length > 0 ? botState.groups : getGroupsCached();
  for (const g of searchGroups) {
    const meta = botState.groupMeta[g.id]?.meta;
    // Live-Suche via Teilnehmerliste; offline via memberStats-Keys
    let member = null;
    if (meta) {
      member = meta.participants.find((p) => p.id.split('@')[0] === num) || null;
      if (!member) continue;
    } else {
      // Offline: prüfen ob Aktivitätsdaten vorhanden
      const stats = config.groups[g.id]?.memberStats || {};
      if (!Object.prototype.hasOwnProperty.call(stats, num)) continue;
      member = { admin: null }; // Rolle unbekannt offline
    }

    const parent = parentJidOf(g);
    if (parent) communitySet.add(communityName(parent));

    const stats = getMemberStats(g.id, num);
    const warn = moderation.getWarnings(g.id, targetJid);
    const muteLeft = moderation.getMuteTimeLeft(g.id, targetJid);
    const gc = effectiveGroupConfig(g.id);
    totalMsg += stats.messages || 0;
    totalCmd += stats.commands || 0;
    totalWarn += warn.count || 0;

    const roleTag = member.admin === 'superadmin' ? '<span class="tag tag-creator">👑 Ersteller</span>'
      : member.admin ? '<span class="tag tag-admin">🛡️ Admin</span>' : '';
    const statusTag = muteLeft > 0 ? `<span class="chip off">🔇 ${formatDuration(muteLeft)}</span>` : '<span class="chip on">● aktiv</span>';

    groupCards.push(`
      <div class="card">
        <div class="row">
          <h2 style="margin:0">${escapeHtml(g.subject || 'Gruppe')} ${gc.active ? '' : '<span class="chip off">inaktiv</span>'}</h2>
          ${statusTag}
        </div>
        <p class="muted">${roleTag} ${g.size || 0} Mitglieder</p>
        <div class="stats">
          <div class="stat"><div class="k">Nachrichten</div><div class="v">${stats.messages || 0}</div></div>
          <div class="stat"><div class="k">Befehle</div><div class="v">${stats.commands || 0}</div></div>
          <div class="stat"><div class="k">Verwarnungen</div><div class="v">${warn.count || 0}</div></div>
        </div>
        <div class="row" style="margin-top:10px;gap:6px;justify-content:flex-start">
          <a href="/member?jid=${encodeURIComponent(targetJid)}&group=${encodeURIComponent(g.id)}" class="action-btn btn-blue">📋 Profil</a>
          <form method="POST" action="/member/action" style="display:inline" onsubmit="return confirm('Wirklich muten?')">
            <input type="hidden" name="action" value="mute"><input type="hidden" name="targetJid" value="${escapeHtml(targetJid)}"><input type="hidden" name="groupJid" value="${escapeHtml(g.id)}">
            <button type="submit" class="action-btn btn-yellow">🔇 Mute</button>
          </form>
          <form method="POST" action="/member/action" style="display:inline" onsubmit="return confirm('Wirklich kicken?')">
            <input type="hidden" name="action" value="kick"><input type="hidden" name="targetJid" value="${escapeHtml(targetJid)}"><input type="hidden" name="groupJid" value="${escapeHtml(g.id)}">
            <button type="submit" class="action-btn btn-red">🚫 Kick</button>
          </form>
        </div>
      </div>`);
  }

  const communityChips = [...communitySet].map((n) => `<span class="chip">🏘️ ${escapeHtml(n)}</span>`).join(' ');
  const summary = groupCards.length
    ? `<div class="card">
        <h1>👤 ${escapeHtml(num)}</h1>
        <p class="muted">In <b>${groupCards.length}</b> gemeinsamen Gruppe(n) gefunden.</p>
        <div class="stats">
          <div class="stat"><div class="k">Nachrichten gesamt</div><div class="v">${totalMsg}</div></div>
          <div class="stat"><div class="k">Befehle gesamt</div><div class="v">${totalCmd}</div></div>
          <div class="stat"><div class="k">Verwarnungen gesamt</div><div class="v">${totalWarn}</div></div>
          <div class="stat"><div class="k">Communities</div><div class="v">${communitySet.size}</div></div>
        </div>
        ${communityChips ? `<p class="muted" style="margin-top:10px">Communities: ${communityChips}</p>` : ''}
      </div>`
    : `<div class="card"><h1>👤 ${escapeHtml(num)}</h1>
        <p class="muted">Diese Nummer wurde in keiner gemeinsamen Gruppe gefunden.</p></div>`;

  res.send(page(`Nummer ${num}`, `${navBar('lookup')}${searchForm}${summary}${groupCards.join('')}`));
});

// Mitglieder-Profil
app.get('/member', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const targetJid = String(req.query.jid || '');
  const groupJid  = String(req.query.group || '');
  if (!targetJid || !groupJid) {
    return res.status(400).send(page('Fehler', `<div class="card"><h1>Fehlende Parameter</h1><a href="/settings"><button>Zurück</button></a></div>`));
  }
  const num = targetJid.split('@')[0];
  const group = getGroupsCached().find((g) => g.id === groupJid);
  const gc = effectiveGroupConfig(groupJid);
  const stats = getMemberStats(groupJid, num);
  const warnings = moderation.getWarnings(groupJid, targetJid);
  const muted = moderation.isMutedUser(groupJid, targetJid);
  const muteLeft = moderation.getMuteTimeLeft(groupJid, targetJid);
  const banLog = (gc.banLog || []).filter((b) => b.num === num).slice(-5).reverse();

  const banRows = banLog.map((b) =>
    `<tr><td>${new Date(b.at).toLocaleString('de-DE')}</td><td>${escapeHtml(b.bannedBy || '–')}</td><td>${escapeHtml(b.reason || '–')}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="muted">Keine Einträge</td></tr>';

  const grpEnc = encodeURIComponent(groupJid);
  const jidEnc = encodeURIComponent(targetJid);
  const warnReasons = (warnings.reasons && warnings.reasons.length)
    ? warnings.reasons.map((r) =>
        `<div class="log-entry log-warn"><b>${new Date(r.at).toLocaleString('de-DE')}</b> · ${escapeHtml(r.by || 'admin')}<br>${escapeHtml(r.reason)}</div>`
      ).join('')
    : '<p class="muted">Keine Verwarnungsgründe gespeichert.</p>';
  const warnActions = `
    <form method="POST" action="/member/action" style="display:inline">
      <input type="hidden" name="action" value="warn"><input type="hidden" name="targetJid" value="${escapeHtml(targetJid)}"><input type="hidden" name="groupJid" value="${escapeHtml(groupJid)}">
      <input type="text" name="reason" class="input" placeholder="Grund (optional)" style="width:auto;display:inline-block;min-width:160px;margin:0 6px 0 0">
      <button type="submit" class="action-btn btn-yellow">⚠️ Verwarnen</button>
    </form>
    <form method="POST" action="/member/action" style="display:inline">
      <input type="hidden" name="action" value="unwarn"><input type="hidden" name="targetJid" value="${escapeHtml(targetJid)}"><input type="hidden" name="groupJid" value="${escapeHtml(groupJid)}">
      <button type="submit" class="action-btn btn-blue">↩️ −1 Verwarnung</button>
    </form>
    <form method="POST" action="/member/action" style="display:inline" onsubmit="return confirm('Alle Verwarnungen löschen?')">
      <input type="hidden" name="action" value="clearwarn"><input type="hidden" name="targetJid" value="${escapeHtml(targetJid)}"><input type="hidden" name="groupJid" value="${escapeHtml(groupJid)}">
      <button type="submit" class="action-btn btn-green">🧹 Alle löschen</button>
    </form>`;

  res.send(page(`Profil – ${num}`, `
    ${navBar('')}
    <div class="card">
      <div class="row"><h1>👤 ${escapeHtml(num)}</h1>
        <a href="/group/members?id=${encodeURIComponent(groupJid)}">← zurück</a>
      </div>
      <p class="muted">Gruppe: <b>${escapeHtml(group?.subject || groupJid)}</b> · <a href="/lookup?num=${encodeURIComponent(num)}">🔎 alle Gruppen dieser Nummer</a></p>
    </div>
    <div class="card">
      <h2>📊 Aktivität</h2>
      <div class="stats">
        <div class="stat"><div class="k">Nachrichten</div><div class="v">${stats.messages || 0}</div></div>
        <div class="stat"><div class="k">Befehle</div><div class="v">${stats.commands || 0}</div></div>
        <div class="stat"><div class="k">Verwarnungen</div><div class="v">${warnings.count || 0}</div></div>
        <div class="stat"><div class="k">Status</div><div class="v" style="font-size:.95rem">${muted ? `🔇 Stumm noch ${formatDuration(muteLeft)}` : '✅ Aktiv'}</div></div>
      </div>
      ${stats.lastSeen ? `<p class="muted">Zuletzt aktiv: ${new Date(stats.lastSeen).toLocaleString('de-DE')}</p>` : ''}
    </div>
    <div class="card">
      <h2>⚠️ Verwarnungen (${warnings.count || 0})</h2>
      ${warnReasons}
      <div class="row" style="margin-top:12px;gap:6px;justify-content:flex-start;flex-wrap:wrap">${warnActions}</div>
    </div>
    <div class="card">
      <h2>🚫 Ban-Verlauf</h2>
      <table><thead><tr><th>Datum</th><th>Von</th><th>Grund</th></tr></thead>
        <tbody>${banRows}</tbody></table>
    </div>`));
});

// Mitglieder-Aktionen vom Web (kick/mute/warn)
const ALLOWED_MEMBER_ACTIONS = new Set(['kick', 'mute', 'warn', 'unwarn', 'clearwarn']);
const JID_USER_RE = /^\d{5,20}@s\.whatsapp\.net$/;
const JID_GROUP_RE = /^\d{5,20}-\d+@g\.us$|^\d{5,20}@g\.us$/;

app.post('/member/action', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { action, targetJid, groupJid } = req.body;
  if (!action || !targetJid || !groupJid) return res.status(400).send('Fehlende Parameter');
  if (!ALLOWED_MEMBER_ACTIONS.has(action)) return res.status(400).send('Ungültige Aktion');
  if (!JID_USER_RE.test(targetJid)) return res.status(400).send('Ungültige Ziel-JID');
  if (!JID_GROUP_RE.test(groupJid)) return res.status(400).send('Ungültige Gruppen-JID');

  const sock = botState.sock;
  if (!sock || !botState.connected) {
    return res.status(503).send(page('Fehler', `<div class="card"><h1>Bot nicht verbunden</h1><a href="/settings"><button>Zurück</button></a></div>`));
  }

  const reason = String(req.body.reason || '').trim().slice(0, 200);
  const tnum = targetJid.split('@')[0];
  try {
    if (action === 'kick') {
      await sock.groupParticipantsUpdate(groupJid, [targetJid], 'remove');
      addBanLog(groupJid, { num: tnum, bannedBy: 'web', reason: reason || 'Kick via Web' });
      activityLogPush({ type: 'kick', groupJid, targetNum: tnum });
      await persist();
    } else if (action === 'mute') {
      moderation.muteUser(groupJid, targetJid, 60);
      activityLogPush({ type: 'mute', groupJid, targetNum: tnum });
    } else if (action === 'warn') {
      moderation.addWarning(groupJid, targetJid, reason || 'via Web');
      const ms = config.groups[groupJid]?.memberStats?.[tnum];
      if (ms) ms.warnings = (ms.warnings || 0) + 1;
      activityLogPush({ type: 'warn', groupJid, targetNum: tnum, reason: reason || 'via Web' });
      await persist();
    } else if (action === 'unwarn') {
      moderation.removeWarning(groupJid, targetJid);
      const ms = config.groups[groupJid]?.memberStats?.[tnum];
      if (ms && ms.warnings) ms.warnings = Math.max(0, ms.warnings - 1);
      activityLogPush({ type: 'warn', groupJid, targetNum: tnum, reason: 'zurückgenommen (Web)' });
      await persist();
    } else if (action === 'clearwarn') {
      moderation.clearWarnings(groupJid, targetJid);
      const ms = config.groups[groupJid]?.memberStats?.[tnum];
      if (ms) ms.warnings = 0;
      activityLogPush({ type: 'warn', groupJid, targetNum: tnum, reason: 'alle gelöscht (Web)' });
      await persist();
    }
  } catch (err) {
    logger.warn({ err }, 'Web-Aktion fehlgeschlagen');
  }

  // Warn-Aktionen führen zurück aufs Profil, Kick/Mute zurück zur Mitgliederliste
  if (['warn', 'unwarn', 'clearwarn'].includes(action)) {
    res.redirect(`/member?jid=${encodeURIComponent(targetJid)}&group=${encodeURIComponent(groupJid)}&done=${action}`);
  } else {
    res.redirect(`/group/members?id=${encodeURIComponent(groupJid)}&done=${action}`);
  }
});

// Ban-Log (global)
app.get('/banlog', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  const entries = [];
  for (const [gid, gc] of Object.entries(config.groups)) {
    const group = getGroupsCached().find((g) => g.id === gid);
    for (const b of (gc.banLog || [])) {
      entries.push({ ...b, groupName: group?.subject || gid });
    }
  }
  entries.sort((a, b) => b.at - a.at);

  const rows = entries.map((b) =>
    `<tr><td>${new Date(b.at).toLocaleString('de-DE')}</td>
     <td>${escapeHtml(b.groupName)}</td>
     <td>${escapeHtml(b.num)}</td>
     <td>${escapeHtml(b.bannedBy || '–')}</td>
     <td>${escapeHtml(b.reason || '–')}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="muted">Keine Einträge vorhanden.</td></tr>';

  res.send(page('Ban-Log', `
    ${navBar('banlog')}
    <div class="card">
      <div class="row"><h1>🚫 Ban-Log</h1><a href="/settings">← zurück</a></div>
      <p class="muted">${entries.length} Einträge gesamt</p>
    </div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Datum</th><th>Gruppe</th><th>Nummer</th><th>Von</th><th>Grund</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`));
});

// Fehler-Logbuch (RAM-Puffer der letzten 200 warn/error)
app.get('/fehlerlog', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const log = [...botState.errorLog].reverse();

  const rows = log.map((e) => {
    const lvlBadge = e.level === 'error'
      ? '<span style="background:rgba(220,53,69,.25);color:#ff6b6b;padding:2px 8px;border-radius:20px;font-size:.78rem;font-weight:700">ERROR</span>'
      : '<span style="background:rgba(255,152,0,.2);color:#ffa726;padding:2px 8px;border-radius:20px;font-size:.78rem;font-weight:700">WARN</span>';
    const time = new Date(e.at).toLocaleString('de-DE');
    const detail = e.detail
      ? `<pre style="margin:6px 0 0;font-size:.75rem;overflow-x:auto;background:rgba(0,0,0,.25);padding:8px;border-radius:8px">${escapeHtml(e.detail)}</pre>`
      : '';
    return `<div class="log-entry" style="border-left:3px solid ${e.level === 'error' ? '#ff6b6b' : '#ffa726'};padding:8px 12px;margin:4px 0;border-radius:0 8px 8px 0;background:rgba(255,255,255,.04)">
      <div class="row" style="gap:8px;flex-wrap:wrap">${lvlBadge}<b style="font-size:.85rem">${escapeHtml(e.msg)}</b><span class="muted" style="font-size:.78rem;margin-left:auto">${escapeHtml(time)}</span></div>
      ${detail}
    </div>`;
  }).join('') || '<p class="muted">Keine Fehler aufgezeichnet — alles läuft problemlos. 🎉</p>';

  res.send(page('Fehlerlog', `
    ${navBar('fehlerlog')}
    <div class="card">
      <div class="row"><h1>⚠️ Fehlerlog</h1></div>
      <p class="muted">${log.length} / 200 Einträge &ensp;·&ensp; <b>Nur RAM</b> – wird bei Server-Neustart zurückgesetzt.</p>
      <input type="search" id="errSearch" class="search-bar" placeholder="🔍 Meldung suchen…"
        oninput="(function(q){document.querySelectorAll('.log-entry').forEach(function(el){el.style.display=el.textContent.toLowerCase().includes(q.toLowerCase())?'':'none'})})(this.value)"
        style="margin-top:8px">
    </div>
    <div class="card">${rows}</div>`));
});

// Aktivitäts-Log
app.get('/activity', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  const log = [...botState.activityLog].reverse();
  const rows = log.map((e) => {
    const cls = `log-${e.type}`;
    const time = new Date(e.at).toLocaleTimeString('de-DE');
    const group = getGroupsCached().find((g) => g.id === e.groupJid);
    const grpName = group?.subject || (e.groupJid || '').split('@')[0] || '–';
    let detail = '';
    if (e.senderNum) detail += ` · von ${escapeHtml(e.senderNum)}`;
    if (e.targetNum) detail += ` · Ziel: ${escapeHtml(e.targetNum)}`;
    return `<div class="log-entry ${cls}"><b>${time}</b> [${escapeHtml(e.type)}] ${escapeHtml(grpName)}${detail}</div>`;
  }).join('') || '<p class="muted">Noch keine Aktivität aufgezeichnet.</p>';

  res.send(page('Aktivitäts-Log', `
    ${navBar('activity')}
    <div class="card">
      <div class="row"><h1>📡 Live-Aktivität</h1><a href="/settings">← zurück</a></div>
      <p class="muted">Letzte ${log.length} Einträge</p>
    </div>
    <div class="card">${rows}</div>`,
    { refresh: 15, refreshUrl: `/activity` }
  ));
});

// Globale Suche
app.get('/search', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const q = String(req.query.q || '').toLowerCase().trim();

  let resultsHtml = '';
  if (q) {
    // Communities suchen
    const comHits = getCommunities().filter((c) => c.name.toLowerCase().includes(q));
    if (comHits.length) {
      resultsHtml += `<div class="card"><h2>🏘️ Communities (${comHits.length})</h2>`;
      for (const c of comHits) {
        const activeCount = c.groups.filter((g) => effectiveGroupConfig(g.id).active).length;
        resultsHtml += `<a class="grp" href="/community">
          <span class="meta"><span class="name">🏘️ ${escapeHtml(c.name)}</span>
          <span class="muted">${c.groups.length} Gruppen · ${activeCount} aktiv</span></span><span>→</span></a>`;
      }
      resultsHtml += '</div>';
    }

    // Gruppen suchen (offline-fähig via Cache)
    const grpHits = getGroupsCached().filter((g) =>
      (g.subject || '').toLowerCase().includes(q) || g.id.includes(q));
    if (grpHits.length) {
      resultsHtml += `<div class="card"><h2>👥 Gruppen (${grpHits.length})</h2>`;
      for (const g of grpHits) {
        const gc = effectiveGroupConfig(g.id);
        const parent = parentJidOf(g);
        const comTag = parent ? `<span class="chip">🏘️ ${escapeHtml(communityName(parent))}</span>` : '';
        resultsHtml += `<a class="grp" href="/group?id=${encodeURIComponent(g.id)}">
          <span class="meta"><span class="name">${escapeHtml(g.subject || 'Unbenannt')} ${gc.active ? '<span class="chip on">● aktiv</span>' : '<span class="chip off">○ inaktiv</span>'} ${comTag}</span>
          <span class="muted">${g.size || 0} Mitglieder</span></span><span>⚙️</span></a>`;
      }
      resultsHtml += '</div>';
    }

    // Meldungen suchen
    const repHits = (config.reports || []).filter((r) =>
      r.text.toLowerCase().includes(q) || (r.senderNum || '').includes(q) || (r.groupName || '').toLowerCase().includes(q));
    if (repHits.length) {
      resultsHtml += `<div class="card"><h2>📋 Meldungen (${repHits.length})</h2><table>
        <thead><tr><th>Datum</th><th>Gruppe</th><th>Von</th><th>Text</th></tr></thead><tbody>`;
      for (const r of repHits.slice(-20).reverse()) {
        resultsHtml += `<tr><td>${new Date(r.at).toLocaleString('de-DE')}</td>
          <td>${escapeHtml(r.groupName || r.groupJid)}</td>
          <td>${escapeHtml(r.senderNum)}</td><td>${escapeHtml(r.text)}</td></tr>`;
      }
      resultsHtml += '</tbody></table></div>';
    }

    if (!resultsHtml) resultsHtml = '<div class="card"><p class="muted">Keine Ergebnisse für „' + escapeHtml(q) + '".</p></div>';
  }

  res.send(page('Suche', `
    ${navBar('search')}
    <div class="card">
      <div class="row"><h1>🔍 Suche</h1><a href="/lookup">🔎 Nummer-Suche</a></div>
      <p class="muted">Durchsuche Communities, Gruppen & Meldungen. Für eine bestimmte Nummer nutze die <a href="/lookup">Nummer-Suche</a>.</p>
    </div>
    <form class="card" method="get" action="/search">
      <input type="search" name="q" class="search-bar" placeholder="Gruppen, Mitglieder, Meldungen…" value="${escapeHtml(req.query.q || '')}" autofocus>
      <button type="submit">Suchen</button>
    </form>
    ${resultsHtml}`));
});

// Gruppen-Leaderboard
app.get('/group/stats', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const group = getGroupsCached().find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings"><button>Zurück</button></a></div>`));
  }
  const top = getTopMembers(id, 20);
  const medals = ['🥇', '🥈', '🥉'];
  const rows = top.map((m, i) => `
    <div class="lb-row">
      <div class="lb-rank">${medals[i] || (i + 1)}</div>
      <div class="lb-num">${escapeHtml(m.num)}</div>
      <div class="lb-count">${m.messages || 0} Nachr. · ${m.commands || 0} Befehle</div>
    </div>`).join('') || '<p class="muted">Noch keine Statistiken erfasst.</p>';

  res.send(page(`Leaderboard – ${group.subject}`, `
    <div class="card">
      <div class="row"><h1>🏆 Leaderboard</h1><a href="/group?id=${encodeURIComponent(id)}">← zurück</a></div>
      <p class="muted">${escapeHtml(group.subject)} · Top ${top.length} Mitglieder</p>
    </div>
    <div class="card leaderboard">${rows}</div>`));
});

// Anliegen (Privatnachrichten-Tickets)
app.get('/anliegen', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const list = (config.anliegen || []).slice().reverse();
  const dmOn = Boolean(config.settings?.dmAssistant);

  const rows = list.map((a) => {
    const ctx = (a.communities && a.communities.length) ? a.communities.join(', ')
      : (a.groups && a.groups.length) ? a.groups.join(', ') : '–';
    const statusChip = a.status === 'erledigt' ? '<span class="chip on">erledigt</span>' : '<span class="chip">offen</span>';
    const doneBtn = a.status === 'erledigt' ? '' : `
      <form method="POST" action="/anliegen/done" style="display:inline">
        <input type="hidden" name="id" value="${a.id}">
        <button type="submit" class="action-btn btn-green">✓ erledigt</button>
      </form>`;
    return `<tr>
      <td>${new Date(a.at).toLocaleString('de-DE')}</td>
      <td><a href="/lookup?num=${encodeURIComponent(a.num)}">${escapeHtml(a.num)}</a></td>
      <td>${escapeHtml(a.text)}</td>
      <td>${escapeHtml(ctx)}</td>
      <td>${statusChip} ${doneBtn}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="muted">Noch keine Anliegen eingegangen.</td></tr>';

  res.send(page('Anliegen', `
    ${navBar('anliegen')}
    <div class="card">
      <div class="row"><h1>📨 Anliegen</h1><a href="/dashboard">← Dashboard</a></div>
      <p class="muted">Private Anfragen, die Nutzer dem Bot geschickt haben.</p>
    </div>
    <form class="card" method="POST" action="/global/save">
      <h2>🤖 DM-Assistent</h2>
      <p class="muted">Wenn aktiv, kann jede Person dem Bot privat schreiben (Nachricht muss mit „${COMMAND_PREFIX}" beginnen)
        und ihr Anliegen wird hier gespeichert. <b>Standardmäßig ausgeschaltet.</b></p>
      <label class="opt"><span>DM-Assistent aktivieren</span>
        <input type="checkbox" name="dmAssistant" ${dmOn ? 'checked' : ''}></label>
      <button type="submit">💾 Speichern</button>
    </form>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Datum</th><th>Von</th><th>Anliegen</th><th>Kontext</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`));
});

// Anliegen als erledigt markieren
app.post('/anliegen/done', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.body.id);
  const a = (config.anliegen || []).find((x) => x.id === id);
  if (a) { a.status = 'erledigt'; await persist(); }
  res.redirect(`/anliegen`);
});

// Globale Optionen speichern
app.post('/global/save', async (req, res) => {
  if (!requireAuth(req, res)) return;
  config.settings = config.settings || {};
  config.settings.dmAssistant = req.body.dmAssistant !== undefined;
  await persist();
  logger.info({ dmAssistant: config.settings.dmAssistant }, 'Globale Optionen gespeichert');
  res.redirect(`/anliegen`);
});

// Befehls-Übersicht – Nachschlagewerk aller Kommandos
app.get('/befehle', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  // Normalisierung für Suche (Umlaute, ß, Groß-/Kleinschreibung)
  const norm = (s) => (s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

  // Kategorien in Anzeige-Reihenfolge mit Icons
  const CATEGORY_ICONS = {
    'Allgemein': '📋', 'Moderation': '🛡️',
  };
  const CATEGORY_ORDER = Object.keys(CATEGORY_ICONS);
  const sortedCats = [...new Set(COMMAND_CATALOG.map((c) => c.category))]
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  const accessBadge = (a) => a === 'inhaber'
    ? '<span class="tag tag-creator">👑 Inhaber</span>'
    : a === 'admin' ? '<span class="tag tag-admin">🛡️ Admin</span>'
    : '<span class="tag tag-bot">👥 alle</span>';

  const renderCmdCard = (entry) => {
    const searchStr = norm([entry.cmd, ...entry.aliases, entry.desc, entry.category, entry.usage, entry.example].join(' '));
    const aliasStr = entry.aliases.length
      ? `<div style="font-size:.78rem;color:var(--muted);margin-top:2px">auch: ${entry.aliases.map((a) => `<code style="font-size:.75rem">${COMMAND_PREFIX}${escapeHtml(a)}</code>`).join(' ')}</div>`
      : '';
    return `<details class="cmd-card" data-search="${escapeHtml(searchStr)}" data-cat="${escapeHtml(entry.category)}">
      <summary style="list-style:none;cursor:pointer;display:flex;align-items:flex-start;gap:10px;padding:12px 14px">
        <div style="flex:1;min-width:0">
          <code class="cmd-name">${COMMAND_PREFIX}${escapeHtml(entry.cmd)}</code>
          ${accessBadge(entry.access)}
          ${aliasStr}
          <div class="muted" style="margin-top:4px;font-size:.87rem">${escapeHtml(entry.desc.split('.')[0])}.</div>
        </div>
        <span style="font-size:.8rem;color:var(--muted);flex:0 0 auto;padding-top:2px">▾</span>
      </summary>
      <div style="padding:0 14px 14px;border-top:1px solid rgba(255,255,255,.06);margin-top:6px">
        <p style="margin:10px 0 6px;font-size:.9rem;line-height:1.6">${escapeHtml(entry.desc)}</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.83rem">
          <div><span class="muted">Nutzung:</span> <code style="background:rgba(255,255,255,.07);padding:2px 7px;border-radius:6px">${escapeHtml(entry.usage)}</code></div>
          <div><span class="muted">Beispiel:</span> <code style="background:rgba(99,102,241,.15);padding:2px 7px;border-radius:6px;color:#c4b5fd">${escapeHtml(entry.example)}</code></div>
        </div>
      </div>
    </details>`;
  };

  const sections = sortedCats.map((cat) => {
    const entries = COMMAND_CATALOG.filter((c) => c.category === cat);
    if (!entries.length) return '';
    const icon = CATEGORY_ICONS[cat] || '•';
    return `<div class="card cmd-section" data-cat-section="${escapeHtml(cat)}">
      <h2>${icon} ${escapeHtml(cat)} <span class="muted" style="font-size:.82rem">(${entries.length})</span></h2>
      ${entries.map(renderCmdCard).join('')}
    </div>`;
  }).join('');

  const catChips = sortedCats.map((cat) =>
    `<button type="button" class="seg-btn" data-cat="${escapeHtml(cat)}" onclick="setCat(this)">${CATEGORY_ICONS[cat] || ''} ${escapeHtml(cat)}</button>`
  ).join('');

  res.send(page('Befehle', `
    ${navBar('befehle')}
    <div class="card">
      <div class="row"><h1>📖 Befehls-Referenz</h1><span class="chip" id="cmdCountChip">${COMMAND_CATALOG.length} Befehle</span></div>
      <p class="muted">Alle ${COMMAND_CATALOG.length} Befehle mit ausführlicher Beschreibung. Präfix: <b>${escapeHtml(COMMAND_PREFIX)}</b>.
        Klicke auf einen Befehl für Details.</p>
      <input type="search" id="cmdSearch" class="search-bar" placeholder="🔍 Befehl, Beschreibung oder Stichwort…" oninput="filterCmd(this.value)" autocomplete="off">
      <div class="seg" id="catFilter" style="flex-wrap:wrap;gap:4px;margin-bottom:8px">
        <button type="button" class="seg-btn active" data-cat="all" onclick="setCat(this)">Alle</button>
        ${catChips}
      </div>
      <p class="muted" id="cmdCount" style="margin:4px 0 0"></p>
    </div>
    ${sections}`,
    { script: `<script>
      var _cat='all';
      function norm(s){return s.replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');}
      function setCat(btn){_cat=btn.dataset.cat;
        document.querySelectorAll('#catFilter .seg-btn').forEach(function(b){b.classList.toggle('active',b===btn)});
        filterCmd(document.getElementById('cmdSearch').value);}
      function filterCmd(v){
        var q=norm((v||'').toLowerCase());
        var shown=0,total=0;
        document.querySelectorAll('.cmd-card').forEach(function(el){
          total++;
          var catOk=(_cat==='all'||el.dataset.cat===_cat);
          var textOk=(!q||norm(el.dataset.search).includes(q));
          var vis=catOk&&textOk;
          el.style.display=vis?'':'none';
          if(vis)shown++;
        });
        document.querySelectorAll('.cmd-section').forEach(function(sec){
          if(_cat!=='all'&&sec.dataset.catSection!==_cat){sec.style.display='none';return;}
          var any=Array.prototype.some.call(sec.querySelectorAll('.cmd-card'),function(e){return e.style.display!=='none';});
          sec.style.display=any?'':'none';
        });
        var c=document.getElementById('cmdCount');if(c)c.textContent=shown+' von '+total+' Befehlen';
        var ch=document.getElementById('cmdCountChip');if(ch)ch.textContent=shown+' Befehle';
      }
      filterCmd('');
    </script>` }
  ));
});

// JSON-API für Dashboard-Polling
app.get('/api/stats', (req, res) => {
  if (!sessionOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const mem = process.memoryUsage();
  const totMem = os.totalmem(); const freeMem = os.freemem();
  const upS = Math.round((Date.now() - botState.startedAt) / 1000);
  let disk = null;
  try {
    const fs = require('fs');
    const st = fs.statfsSync(process.cwd());
    disk = { free: st.bfree * st.bsize, total: st.blocks * st.bsize };
  } catch (_) {}
  res.json({
    connected: botState.connected, powered: botState.powered,
    upS, nummer: botState.me ? botState.me.id.split(':')[0] : null,
    commandCount: botState.commandCount, modTotal: botState.moderation.actionsTotal,
    activeGroups: activeGroupCount(), totalGroups: getGroupsCached().length,
    lastCmd: botState.lastCommand ? botState.lastCommand.cmd : null,
    lastCmdAt: botState.lastCommand ? botState.lastCommand.at : null,
    lastMod: botState.moderation.lastAction,
    reports: (config.reports || []).length, anliegen: (config.anliegen || []).length,
    messages: Object.values(config.groups).reduce((s, g) =>
      s + Object.values(g.memberStats || {}).reduce((a, m) => a + (m.messages || 0), 0), 0),
    bans: Object.values(config.groups).reduce((s, g) => s + (g.banLog || []).length, 0),
    activityLog: botState.activityLog.length,
    ram: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss, sysFree: freeMem, sysTotal: totMem },
    cpu: { loadavg: os.loadavg(), cpus: os.cpus().length },
    disk, node: process.version,
    storage: store.usingTurso() ? 'turso' : store.usingMongo() ? 'mongo' : 'file',
  });
});

// Live-Dashboard
app.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';
  const speicher = store.usingTurso() ? 'Turso (Cloud) ✅'
    : store.usingMongo() ? 'MongoDB ✅'
    : 'Datei (flüchtig) ⚠️';

  res.send(page('Dashboard', `
    ${navBar('dashboard')}
    ${powerPanel()}
    <div class="card">
      <div class="row"><h1>📊 Dashboard</h1><span class="status" id="connStatus">…</span></div>
      <p class="muted">Live-Daten · aktualisiert alle 5 s &ensp;<span id="lastUpdate" class="muted"></span></p>
    </div>
    <div class="card">
      <div class="stats" id="statsGrid">
        <div class="stat"><div class="k">Nummer</div><div class="v" style="font-size:1.1rem">${escapeHtml(nummer)}</div></div>
        <div class="stat"><div class="k">Laufzeit</div><div class="v" id="uptime">–</div></div>
        <div class="stat"><div class="k">Aktive Gruppen</div><div class="v" id="s-ag">–</div></div>
        <div class="stat"><div class="k">Gruppen gesamt</div><div class="v" id="s-tg">–</div></div>
        <div class="stat"><div class="k">Befehle</div><div class="v" id="s-cmd">–</div></div>
        <div class="stat"><div class="k">Letzter Befehl</div><div class="v" id="s-lcmd" style="font-size:.95rem">–</div></div>
        <div class="stat"><div class="k">Moderation</div><div class="v" id="s-mod">–</div></div>
        <div class="stat"><div class="k">RAM (Heap)</div><div class="v" id="s-ram">–</div></div>
        <div class="stat"><div class="k">Speicher-Backend</div><div class="v" style="font-size:.9rem">${escapeHtml(speicher)}</div></div>
        <div class="stat"><div class="k">CPU-Kerne</div><div class="v" id="s-cpu">–</div></div>
      </div>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="k">Nachrichten</div><div class="v" id="s-msg">–</div></div>
        <div class="stat"><div class="k">Ban-Einträge</div><div class="v" id="s-bans">–</div></div>
        <div class="stat"><div class="k">Meldungen</div><div class="v" id="s-rep">–</div></div>
        <div class="stat"><div class="k">Anliegen</div><div class="v" id="s-anl">–</div></div>
        <div class="stat"><div class="k">Aktivitäts-Log</div><div class="v" id="s-alog">–</div></div>
      </div>
    </div>
    <div class="card row" style="flex-wrap:wrap;gap:10px">
      <a href="/settings">⚙️ Einstellungen</a>
      <a href="/community">🏘️ Communities</a>
      <a href="/anliegen">📨 Anliegen</a>
      <a href="/banlog">🚫 Ban-Log</a>
      <a href="/activity">📡 Aktivität</a>
      <a href="/server">🖥️ Server</a>
    </div>`,
    { script: `<script>
      var startedAt=${botState.startedAt};
      function mb(n){return(n/1048576).toFixed(0)+' MB';}
      function fmt(s){return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m '+(s%60)+'s';}
      function countUp(el,val){
        var cur=parseInt(el.textContent)||0; if(cur===val)return;
        var step=Math.max(1,Math.round((val-cur)/8)); var iv=setInterval(function(){
          cur=Math.min(cur+step,val); el.textContent=cur; if(cur>=val)clearInterval(iv);},30);
      }
      function update(){
        fetch('/api/stats',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(d){
          var cs=document.getElementById('connStatus');
          if(cs){cs.textContent=d.connected?'✅ verbunden':'⭕ getrennt';cs.className='status '+(d.connected?'on':'off');}
          var el;
          if(el=document.getElementById('uptime'))el.textContent=fmt(d.upS);
          if(el=document.getElementById('s-ag'))countUp(el,d.activeGroups);
          if(el=document.getElementById('s-tg'))countUp(el,d.totalGroups);
          if(el=document.getElementById('s-cmd'))countUp(el,d.commandCount);
          if(el=document.getElementById('s-lcmd'))el.textContent=d.lastCmd||(d.lastCmdAt?'('+new Date(d.lastCmdAt).toLocaleTimeString('de-DE')+')':'–');
          if(el=document.getElementById('s-mod'))countUp(el,d.modTotal);
          if(el=document.getElementById('s-ram'))el.textContent=mb(d.ram.heapUsed);
          if(el=document.getElementById('s-cpu'))el.textContent=d.cpu.cpus+' Kerne · '+d.cpu.loadavg[0].toFixed(2);
          if(el=document.getElementById('s-msg'))countUp(el,d.messages);
          if(el=document.getElementById('s-bans'))countUp(el,d.bans);
          if(el=document.getElementById('s-rep'))countUp(el,d.reports);
          if(el=document.getElementById('s-anl'))countUp(el,d.anliegen);
          if(el=document.getElementById('s-alog'))el.textContent=d.activityLog+'/100';
          var lu=document.getElementById('lastUpdate');
          if(lu)lu.textContent='· '+new Date().toLocaleTimeString('de-DE');
        }).catch(function(){});
      }
      update(); setInterval(update,5000);
    </script>` }
  ));
});

// ── Server-Metriken ──────────────────────────────────────────────────
app.get('/server', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;

  const mem = process.memoryUsage();
  const sysTot = os.totalmem(); const sysFree = os.freemem();
  const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  const ramPct  = Math.round(((sysTot - sysFree) / sysTot) * 100);
  const load    = os.loadavg();
  const cpuCount = os.cpus().length;
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  const upS = Math.round((Date.now() - botState.startedAt) / 1000);
  const uptime = `${Math.floor(upS/3600)}h ${Math.floor((upS%3600)/60)}m`;
  const storage = store.usingTurso() ? 'Turso Cloud ✅' : store.usingMongo() ? 'MongoDB ✅' : 'Datei (lokal) ⚠️';

  let diskHtml = '';
  try {
    const fs = require('fs');
    const st = fs.statfsSync(process.cwd());
    const dFree = st.bfree * st.bsize; const dTotal = st.blocks * st.bsize;
    const dPct = Math.round(((dTotal - dFree) / dTotal) * 100);
    diskHtml = `<div class="stat"><div class="k">Speicherplatz belegt</div>
      <div class="v">${mb(dTotal - dFree)} / ${mb(dTotal)}</div>
      <div style="margin-top:6px;height:6px;background:rgba(255,255,255,.1);border-radius:3px">
        <div style="width:${dPct}%;height:100%;border-radius:3px;background:${dPct > 85 ? 'var(--bad)' : 'var(--accent)'}"></div>
      </div></div>`;
  } catch (_) {}

  const bar = (pct, color) =>
    `<div style="margin-top:6px;height:6px;background:rgba(255,255,255,.1);border-radius:3px">
       <div style="width:${pct}%;height:100%;border-radius:3px;background:${color};transition:width .5s"></div>
     </div>`;

  res.send(page('Server', `
    ${navBar('server')}
    <div class="card">
      <h1>🖥️ Server-Metriken</h1>
      <p class="muted">System-Informationen · Node ${escapeHtml(process.version)} · Laufzeit: ${escapeHtml(uptime)}</p>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="k">Heap-RAM genutzt</div><div class="v">${mb(mem.heapUsed)} / ${mb(mem.heapTotal)}</div>
          ${bar(heapPct, heapPct > 85 ? 'var(--bad)' : 'var(--accent)')}</div>
        <div class="stat"><div class="k">System-RAM</div><div class="v">${mb(sysTot - sysFree)} / ${mb(sysTot)}</div>
          ${bar(ramPct, ramPct > 85 ? 'var(--bad)' : 'var(--accent2)')}</div>
        <div class="stat"><div class="k">RSS (Prozess)</div><div class="v">${mb(mem.rss)}</div></div>
        ${diskHtml}
        <div class="stat"><div class="k">CPU-Kerne</div><div class="v">${cpuCount}</div></div>
        <div class="stat"><div class="k">CPU-Last (1m)</div><div class="v">${load[0].toFixed(2)}</div>
          ${bar(Math.min(100, Math.round((load[0]/cpuCount)*100)), load[0] > cpuCount*0.8 ? 'var(--bad)' : 'var(--good)')}</div>
        <div class="stat"><div class="k">CPU-Last (5m)</div><div class="v">${load[1].toFixed(2)}</div></div>
        <div class="stat"><div class="k">Laufzeit</div><div class="v">${escapeHtml(uptime)}</div></div>
        <div class="stat"><div class="k">Speicher-Backend</div><div class="v" style="font-size:.9rem">${escapeHtml(storage)}</div></div>
        <div class="stat"><div class="k">Node-Version</div><div class="v" style="font-size:1rem">${escapeHtml(process.version)}</div></div>
      </div>
    </div>
    <div class="card row" style="gap:10px;flex-wrap:wrap">
      <a href="/dashboard">📊 Dashboard</a>
    </div>
  `));
});

const server = app.listen(PORT, () => logger.info(`HTTP-Server läuft auf Port ${PORT}`));

// ---------- Self-Ping (Render Free bleibt wach) ----------
// Render Free schläft nach ~15 Min ohne Traffic. Der Self-Ping hält den Web-Dienst
// wach. Wichtig: ein EXTERNER Monitor (z. B. UptimeRobot auf /healthz, alle 5 Min)
// ist die zuverlässigste Absicherung – der Self-Ping allein kann den allerersten
// Spin-Down nicht in 100 % der Fälle verhindern.
if (SELF_URL) {
  const doPing = () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    fetch(`${SELF_URL}/healthz`, { signal: ctrl.signal })
      .then(() => logger.debug('Self-Ping OK'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'))
      .finally(() => clearTimeout(t));
  };
  doPing();
  // 3 Min Basis + bis zu 60 s Jitter, damit der Takt nicht exakt mit Render-Idle kollidiert.
  const scheduleNext = () => setTimeout(() => { doPing(); scheduleNext(); }, 3 * 60 * 1000 + Math.floor(Math.random() * 60_000)).unref?.();
  scheduleNext();
} else {
  logger.warn('SELF_URL nicht gesetzt – Bot kann auf Render einschlafen! Setze SELF_URL oder nutze einen externen Monitor auf /healthz.');
}


// ---------- Gruppen & Metadaten ----------
async function refreshGroups(force = false) {
  if (!botState.sock || !botState.connected) return;
  if (!force && Date.now() - botState.groupsFetchedAt < 30 * 1000) return;
  try {
    const all = await botState.sock.groupFetchAllParticipating();
    botState.groups = Object.values(all)
      .map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size || (g.participants ? g.participants.length : 0),
        isCommunity: Boolean(g.isCommunity),
        community: g.linkedParent || null,
      }))
      .sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
    botState.groupsFetchedAt = Date.now();
    // Persistiere Gruppen-Cache für offline-Ansicht
    config.groupCache = botState.groups.map((g) => ({ id: g.id, subject: g.subject, size: g.size, isCommunity: g.isCommunity, community: g.community }));
    persistDebounced();
    logger.info({ anzahl: botState.groups.length }, 'Gruppen geladen');
    fetchGroupPictures();
  } catch (err) {
    logger.warn({ err }, 'Gruppen konnten nicht geladen werden');
  }
}

async function fetchGroupPictures() {
  if (!botState.sock) return;
  await Promise.allSettled(
    botState.groups
      .filter((g) => !(g.id in botState.groupPics))
      .map(async (g) => {
        try {
          botState.groupPics[g.id] = await botState.sock.profilePictureUrl(g.id, 'image');
        } catch {
          botState.groupPics[g.id] = null;
        }
      })
  );
}

async function getGroupMeta(jid) {
  const cached = botState.groupMeta[jid];
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.meta;
  try {
    const meta = await botState.sock.groupMetadata(jid);
    botState.groupMeta[jid] = { meta, at: Date.now() };
    return meta;
  } catch {
    return null;
  }
}
// ---------- Community-Inhaber & permanente Sperrliste ----------
// Parent-Community-JID für eine beliebige Gruppe (oder die Gruppe selbst, wenn sie Parent ist).
function communityParentOf(jid) {
  const g = botState.groups.find((x) => x.id === jid);
  if (!g) return null;
  return parentJidOf(g) || (g.isCommunity ? jid : null);
}

// Inhaber = Superadmin/Ersteller der Community-Hauptgruppe. Best-effort mit Fallbacks.
async function getCommunityOwnerNum(parentJid) {
  const meta = await getGroupMeta(parentJid);
  if (meta) {
    const creator = meta.participants?.find((p) => p.admin === 'superadmin');
    const ownerJid = creator?.id || meta.owner || meta.subjectOwner;
    if (ownerJid) return ownerJid.split('@')[0].replace(/\D/g, '');
  }
  return null;
}

// Erkennt automatisch, ob der Absender der Inhaber der Community dieser Gruppe ist.
async function isCommunityOwner(senderJid, jid) {
  const num = (senderJid || '').split('@')[0].replace(/\D/g, '');
  if (!num) return false;
  if (OWNER_OVERRIDE.includes(num)) return true; // Notfall-Override
  const parent = communityParentOf(jid);
  if (!parent) return false;
  const ownerNum = await getCommunityOwnerNum(parent);
  return Boolean(ownerNum && ownerNum === num);
}

// Persistente Sperrliste: config.communityBans[parentJid][num] = { reason, by, at }
function ensureBanStore() { if (!config.communityBans) config.communityBans = {}; }
function isCommunityBanned(parentJid, num) {
  return Boolean(config.communityBans?.[parentJid]?.[num]);
}
function addCommunityBan(parentJid, num, by, reason) {
  ensureBanStore();
  if (!config.communityBans[parentJid]) config.communityBans[parentJid] = {};
  config.communityBans[parentJid][num] = { reason: reason || 'kein Grund', by, at: Date.now() };
}
function removeCommunityBan(parentJid, num) {
  if (config.communityBans?.[parentJid]) delete config.communityBans[parentJid][num];
}

function isAdmin(meta, jid) {
  if (!meta || !jid) return false;
  const p = meta.participants.find((x) => x.id === jid);
  return Boolean(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

// ---------- WhatsApp-Verbindung ----------
// Geschützter Reconnect: stellt sicher, dass nie mehrere Verbindungsversuche gleichzeitig
// laufen (sonst doppelte Sockets). Wartet 3s und versucht es erneut.
function scheduleReconnect(grund) {
  if (botState.reconnecting) return;
  if (botState.paused || !botState.powered) return; // ausgeschaltet → kein Reconnect
  botState.reconnecting = true;
  logger.warn({ grund }, 'Neuverbindung in 3s…');
  setTimeout(() => {
    startBot().catch((err) => {
      logger.error({ err }, 'Reconnect fehlgeschlagen – neuer Versuch in 10s');
      botState.reconnecting = false;
      setTimeout(() => scheduleReconnect('Wiederholung'), 10_000);
    });
  }, 3000);
}

// Watchdog: erkennt eine still gestorbene Verbindung (kein 'close'-Event) und erzwingt
// nach 2 Minuten Offline-Zeit eine Neuverbindung. So bleibt der Bot dauerhaft erreichbar.
setInterval(() => {
  if (botState.paused || !botState.powered) return; // bewusst ausgeschaltet
  if (!botState.connected && !botState.reconnecting && botState.lastConnectedAt > 0) {
    const offlineMs = Date.now() - botState.lastConnectedAt;
    if (offlineMs > 2 * 60 * 1000) {
      logger.warn({ offlineSek: Math.round(offlineMs / 1000) }, 'Watchdog: Bot offline – erzwinge Neuverbindung');
      scheduleReconnect('Watchdog');
    }
  }
}, 60 * 1000);

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger });
  botState.sock = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      botState.qr = qr;
      logger.info('Neuer QR-Code – im Browser unter /qr scannen (nach Login)');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      botState.connected = true;
      botState.reconnecting = false;
      botState.lastConnectedAt = Date.now();
      botState.qr = null;
      botState.me = sock.user;
      logger.info({ nummer: sock.user?.id }, '✅ Mit WhatsApp verbunden');
      refreshGroups(true);
    }
    if (connection === 'close') {
      botState.connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Ausgeloggt. Ordner "auth_info" löschen und neu per QR-Code einloggen.');
      } else {
        scheduleReconnect('Verbindung getrennt');
      }
    }
  });

  // Gruppen-Events: Willkommen / Abschied
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      const gc = effectiveGroupConfig(id);
      if (!gc.active) return;
      activityLogPush({ type: action, groupJid: id, participants });
      // Permanenter Community-Bann: gebannte Personen bei Wiederbeitritt sofort entfernen.
      if (action === 'add') {
        const parent = communityParentOf(id);
        if (parent) {
          const stillHere = [];
          for (const p of participants) {
            const num = p.split('@')[0].replace(/\D/g, '');
            if (isCommunityBanned(parent, num)) {
              try {
                await sock.groupParticipantsUpdate(id, [p], 'remove');
                logger.info({ num, group: id }, 'Gebannte Person automatisch wieder entfernt');
              } catch (e) { logger.warn({ e, num, group: id }, 'Auto-Rekick fehlgeschlagen'); }
            } else {
              stillHere.push(p);
            }
          }
          // Willkommensnachricht nur für nicht-gebannte Neuzugänge.
          participants = stillHere;
        }
      }
      if (action === 'add' && gc.welcome.enabled) {
        for (const p of participants) {
          const raw = (gc.welcome.message || 'Willkommen @{user} in der Gruppe! 🎉')
            .replace('{user}', p.split('@')[0]);
          await sock.sendMessage(id, { text: raw, mentions: [p] });
        }
      }
      if (action === 'remove' && gc.welcome.enabled) {
        for (const p of participants) {
          await sock.sendMessage(id, { text: `👋 ${p.split('@')[0]} hat die Gruppe verlassen.` });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'group-participants.update Fehler');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (!jid) continue;

        // Hauptschalter: ist der Bot per Website ausgeschaltet, ignoriert er ALLES.
        if (!botState.powered) continue;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const isOwner = Boolean(msg.key.fromMe);

        // Private Nachrichten: optionaler DM-Assistent (Standard aus)
        if (jid.endsWith('@s.whatsapp.net')) {
          if (isOwner) continue;
          if (!config.settings?.dmAssistant) continue;
          if (!text.startsWith(COMMAND_PREFIX)) continue;
          await handleDmAssistant(sock, jid, text, msg);
          continue;
        }

        if (!jid.endsWith('@g.us')) continue; // sonst nur Gruppen

        // Owner-Nachrichten nur überspringen, wenn kein Befehl
        if (isOwner && !text.startsWith(COMMAND_PREFIX)) continue;

        const group = effectiveGroupConfig(jid);
        if (!group.active) continue;

        const senderJid = msg.key.participant || jid;
        const senderNum = senderJid.split('@')[0];

        // Aktivitäts-Tracking (nur echte Fremd-Nachrichten)
        if (!isOwner) {
          recordActivity(jid, senderNum, text.startsWith(COMMAND_PREFIX) ? 'command' : 'message');
        }

        // 1) Moderation – Owner überspringen
        if (!isOwner && (group.moderation.badwords || group.moderation.links)) {
          const meta = await getGroupMeta(jid);
          const senderIsAdmin = isAdmin(meta, senderJid);
          const moderated = await moderation.checkMessage({
            sock, group, remoteJid: jid, senderJid, text, msg, isAdmin: senderIsAdmin,
          });
          if (moderated) continue;
        }

        // 1b) Slowmode – zu schnelle Nachrichten von Nicht-Admins löschen
        const slow = Number(group.moderation.slowmode) || 0;
        if (!isOwner && slow > 0 && !text.startsWith(COMMAND_PREFIX)) {
          const metaS = await getGroupMeta(jid);
          if (!isAdmin(metaS, senderJid)) {
            const sk = `${jid}:${senderJid}`;
            const last = slowmodeLast.get(sk) || 0;
            const now = Date.now();
            if (now - last < slow * 1000) {
              try { await sock.sendMessage(jid, { delete: msg.key }); } catch { /* Bot evtl. kein Admin */ }
              continue;
            }
            slowmodeLast.set(sk, now);
          }
        }


        // 2b) Befehle
        if (!text.startsWith(COMMAND_PREFIX)) continue;
        const parts = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
        const raw = parts[0].toLowerCase();
        const cmd = ALIAS[raw] || raw;
        const args = parts.slice(1);

        const cmdSetting = group.commands[cmd];
        if (cmdSetting === false) continue; // in dieser Gruppe deaktiviert
        if (!isOwner && cmdSetting === 'admin') {
          const metaForAdmin = await getGroupMeta(jid);
          // Der Community-Inhaber wird überall wie ein Admin behandelt.
          if (!isAdmin(metaForAdmin, senderJid) && !(await isCommunityOwner(senderJid, jid))) continue;
        }

        const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
        let handled = true;

        switch (cmd) {
          case 'hilfe': {
            const showOwner = await isCommunityOwner(senderJid, jid);
            const lines = COMMANDS
              .filter((c) => group.commands[c.key] !== false)
              .filter((c) => !c.ownerOnly || showOwner) // Inhaber-Befehle nur dem Inhaber zeigen
              .map((c) => {
                const adminTag = c.ownerOnly ? ' 👑' : (group.commands[c.key] === 'admin' ? ' 🛡️' : '');
                return `${COMMAND_PREFIX}${c.key}${adminTag} – ${c.desc}`;
              }).join('\n');
            const legend = showOwner ? '\n\n🛡️ = nur Admins · 👑 = nur Community-Inhaber' : '\n\n🛡️ = nur Admins';
            await reply(`🤖 *Bot-Befehle*\n\n${lines}${legend}`);
            break;
          }
          case 'ping': {
            const ms = Date.now() - (Number(msg.messageTimestamp) * 1000 || Date.now());
            await reply(`pong 🏓${ms > 0 ? ` (${ms} ms)` : ''}`);
            break;
          }
          case 'info': {
            const upS = Math.round((Date.now() - botState.startedAt) / 1000);
            const uptime = `${Math.floor(upS / 3600)}h ${Math.floor((upS % 3600) / 60)}m`;
            await reply(`🤖 *Bot-Info*\nStatus: online ✅\nLaufzeit: ${uptime}\n` +
              `Aktive Gruppen: ${activeGroupCount()}\nBefehle verarbeitet: ${botState.commandCount + 1}`);
            break;
          }
          case 'id':
            await reply(`Gruppen-ID: ${jid}`);
            break;
          case 'regeln':
            await reply(`📋 *Gruppenregeln*\n\n${group.rules || '1. Sei respektvoll 🤝\n2. Kein Spam 🚫\n3. Bleib beim Thema 💬'}`);
            break;
          case 'sag':
            await reply(args.length ? args.join(' ') : `Nutzung: ${COMMAND_PREFIX}sag <Text>`);
            break;
          case 'gruppe': {
            const meta = await getGroupMeta(jid);
            const botJid = jidNormalizedUser(botState.me?.id || '');
            await reply(`👥 *${meta?.subject || group.subject || 'Gruppe'}*\n` +
              `Mitglieder: ${meta?.participants.length ?? '?'}\n` +
              `Bot ist Admin: ${isAdmin(meta, botJid) ? 'ja ✅' : 'nein ❌'}`);
            break;
          }
          case 'alle': {
            const meta = await getGroupMeta(jid);
            if (!meta) { await reply('Konnte die Gruppe nicht laden.'); break; }
            const mentions = meta.participants.map((p) => p.id);
            await sock.sendMessage(jid, {
              text: '📢 *Sammelruf*\n' + mentions.map((m) => '@' + m.split('@')[0]).join(' '),
              mentions,
            });
            break;
          }
          case 'melden': {
            const reportText = args.join(' ').trim();
            if (!reportText) { await reply(`Nutzung: ${COMMAND_PREFIX}melden <Grund>`); break; }
            const grpInfo = botState.groups.find((g) => g.id === jid);
            if (!config.reports) config.reports = [];
            config.reports.push({
              id: Date.now(),
              groupJid: jid,
              groupName: grpInfo?.subject || jid,
              senderNum: senderJid.split('@')[0],
              text: reportText,
              at: Date.now(),
            });
            if (config.reports.length > 200) config.reports = config.reports.slice(-200);
            await persist();
            await reply('✅ Deine Meldung wurde aufgenommen. Das Team wird sie prüfen.');
            break;
          }

          // ---- Admin-Moderations-Befehle ----
          case 'kick': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}kick @person`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'remove');
              addBanLog(jid, { num: target.split('@')[0], bannedBy: senderNum, reason: 'Kick' });
              activityLogPush({ type: 'kick', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
              await persist();
              await sock.sendMessage(jid, { text: `🚫 @${target.split('@')[0]} wurde aus der Gruppe entfernt.`, mentions: [target] });
            } catch { await reply('Kick fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'ban': {
            const _mentionedBan = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = _mentionedBan[0] || getTargetJid(msg);
            const reason = (_mentionedBan[0] ? args.slice(1) : args).join(' ').trim() || 'kein Grund angegeben';
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}ban @person [Grund]`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'remove');
              addBanLog(jid, { num: target.split('@')[0], bannedBy: senderNum, reason });
              activityLogPush({ type: 'ban', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
              await persist();
              await sock.sendMessage(jid, {
                text: `🚫 @${target.split('@')[0]} wurde gebannt.\nGrund: ${reason}`,
                mentions: [target],
              });
            } catch { await reply('Ban fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'communitykick': {
            if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Community-Inhaber darf das.'); break; }
            const target = getTargetJid(msg) || numArgToJid(args[0]);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}communitykick @person [Grund]`); break; }
            await refreshGroups(true);
            const parent = communityParentOf(jid);
            if (!parent) { await reply('❌ Diese Gruppe gehört zu keiner Community.'); break; }

            const targetNum = target.split('@')[0].replace(/\D/g, '');
            const reason = args.filter((a) => !a.startsWith('@')).join(' ').trim() || 'maßloses Fehlverhalten';
            addCommunityBan(parent, targetNum, senderNum, reason); // PERMANENT zuerst -> Auto-Rekick greift sofort
            await persist();

            const targets = botState.groups.filter((g) => parentJidOf(g) === parent).map((g) => g.id);
            if (!targets.includes(parent)) targets.push(parent);
            await sock.sendMessage(jid, {
              text: `⏳ Banne @${targetNum} dauerhaft aus ${targets.length} Gruppen der Community „${communityName(parent)}"…`,
              mentions: [target],
            });

            let ckOk = 0; const ckFailed = [];
            for (const gid of targets) {
              try {
                const res = await sock.groupParticipantsUpdate(gid, [target], 'remove');
                const status = Array.isArray(res) ? String(res[0]?.status ?? '200') : '200';
                if (status === '200') { ckOk += 1; addBanLog(gid, { num: targetNum, bannedBy: senderNum, reason: `Community-Bann: ${reason}` }); }
                else ckFailed.push(`${subjectOf(gid)} (${status})`);
              } catch { ckFailed.push(subjectOf(gid)); }
              await sleep(700); // Rate-Limit-Schutz
            }
            activityLogPush({ type: 'communitykick', groupJid: jid, senderNum, targetNum });
            await persist();
            let ckReport = `🔨 *Permanent gebannt*\n@${targetNum} aus *${ckOk}/${targets.length}* Gruppen entfernt.\nGrund: ${reason}\n\n🔒 Die Person wird bei jedem Wiederbeitritt automatisch entfernt – bis du \`${COMMAND_PREFIX}communityunban @person\` nutzt.`;
            if (ckFailed.length) ckReport += `\n\n⚠️ Nicht entfernt (Bot kein Admin / kein Mitglied):\n• ${ckFailed.slice(0, 15).join('\n• ')}`;
            if (ckFailed.length > 15) ckReport += `\n… und ${ckFailed.length - 15} weitere.`;
            await sock.sendMessage(jid, { text: ckReport, mentions: [target] });
            break;
          }
          case 'communityunban': {
            if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Community-Inhaber darf das.'); break; }
            const target = getTargetJid(msg) || numArgToJid(args[0]);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}communityunban @person`); break; }
            const parent = communityParentOf(jid);
            if (!parent) { await reply('❌ Diese Gruppe gehört zu keiner Community.'); break; }
            const num = target.split('@')[0].replace(/\D/g, '');
            if (!isCommunityBanned(parent, num)) { await reply('Diese Person ist nicht gebannt.'); break; }
            removeCommunityBan(parent, num);
            await persist();
            await sock.sendMessage(jid, {
              text: `✅ @${num} ist wieder freigegeben und darf der Community erneut beitreten.`,
              mentions: [target],
            });
            break;
          }
          case 'communitybanlist': {
            if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Community-Inhaber darf das.'); break; }
            const parent = communityParentOf(jid);
            if (!parent) { await reply('❌ Diese Gruppe gehört zu keiner Community.'); break; }
            const bans = config.communityBans?.[parent] || {};
            const entries = Object.entries(bans);
            if (!entries.length) { await reply('✅ Aktuell ist niemand in dieser Community gebannt.'); break; }
            const lines = entries
              .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
              .slice(0, 50)
              .map(([num, info], i) => {
                const d = info.at ? new Date(info.at).toLocaleDateString('de-DE') : '?';
                return `${i + 1}. +${num} – ${info.reason || 'kein Grund'} (${d})`;
              });
            await reply(`🚷 *Gebannte Personen – ${communityName(parent)}* (${entries.length})\n\n${lines.join('\n')}`);
            break;
          }
          case 'mute': {
            const _mentionedMute = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = _mentionedMute[0] || getTargetJid(msg);
            const minutes = Math.min(1440, Math.max(1, Number(_mentionedMute[0] ? args[1] : args[0]) || 10));
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}mute @person [Minuten]`); break; }
            moderation.muteUser(jid, target, minutes);
            activityLogPush({ type: 'mute', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
            await sock.sendMessage(jid, {
              text: `🔇 @${target.split('@')[0]} wurde für ${minutes} Minute(n) stummgeschaltet.`,
              mentions: [target],
            });
            break;
          }
          case 'unmute': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}unmute @person`); break; }
            moderation.unmuteUser(jid, target);
            await sock.sendMessage(jid, {
              text: `🔊 @${target.split('@')[0]} wurde wieder freigeschaltet.`,
              mentions: [target],
            });
            break;
          }
          case 'warn': {
            const _mentionedWarn = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = _mentionedWarn[0] || getTargetJid(msg);
            const reason = (_mentionedWarn[0] ? args.slice(1) : args).join(' ').trim() || 'kein Grund angegeben';
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}warn @person [Grund]`); break; }
            const w = moderation.addWarning(jid, target, reason);
            const warnLimit = Number(group.moderation.warnLimit) || 3;
            activityLogPush({ type: 'warn', groupJid: jid, senderNum, targetNum: target.split('@')[0], reason });
            if (config.groups[jid]?.memberStats?.[target.split('@')[0]]) {
              config.groups[jid].memberStats[target.split('@')[0]].warnings = (config.groups[jid].memberStats[target.split('@')[0]].warnings || 0) + 1;
            }
            await sock.sendMessage(jid, {
              text: `⚠️ @${target.split('@')[0]} erhält eine Verwarnung (${w.count}/${warnLimit}).\nGrund: ${reason}`,
              mentions: [target],
            });
            break;
          }
          case 'unwarn': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}unwarn @person`); break; }
            const w = moderation.removeWarning(jid, target);
            const warnLimit = Number(group.moderation.warnLimit) || 3;
            activityLogPush({ type: 'warn', groupJid: jid, senderNum, targetNum: target.split('@')[0], reason: 'Verwarnung zurückgenommen' });
            const ms = config.groups[jid]?.memberStats?.[target.split('@')[0]];
            if (ms && ms.warnings) ms.warnings = Math.max(0, ms.warnings - 1);
            await sock.sendMessage(jid, {
              text: `↩️ Eine Verwarnung von @${target.split('@')[0]} wurde zurückgenommen (jetzt ${w.count}/${warnLimit}).`,
              mentions: [target],
            });
            break;
          }
          case 'clearwarn': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}clearwarn @person`); break; }
            moderation.clearWarnings(jid, target);
            const ms2 = config.groups[jid]?.memberStats?.[target.split('@')[0]];
            if (ms2) ms2.warnings = 0;
            await sock.sendMessage(jid, {
              text: `✅ Alle Verwarnungen von @${target.split('@')[0]} wurden gelöscht.`,
              mentions: [target],
            });
            break;
          }
          case 'warninfo': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}warninfo @person`); break; }
            const w = moderation.getWarnings(jid, target);
            const warnLimit = Number(group.moderation.warnLimit) || 3;
            const muteLeft = moderation.getMuteTimeLeft(jid, target);
            const muteTxt = muteLeft > 0 ? `\n🔇 Stummgeschaltet noch: ${formatDuration(muteLeft)}` : '';
            const reasonsTxt = (w.reasons && w.reasons.length)
              ? '\n\n*Gründe:*\n' + w.reasons.map((r, i) => `${i + 1}. ${r.reason}`).join('\n')
              : '';
            await sock.sendMessage(jid, {
              text: `📋 @${target.split('@')[0]}: ${w.count}/${warnLimit} Verwarnungen${muteTxt}${reasonsTxt}`,
              mentions: [target],
            });
            break;
          }
          case 'warnlist': {
            const all = moderation.getAllWarnings(jid);
            if (!all.length) { await reply('Keine Verwarnungen in dieser Gruppe.'); break; }
            const lines = all.map((w) => `• ${w.jid.split('@')[0]}: ${w.count} Verwarnung(en)`).join('\n');
            await reply(`⚠️ *Verwarnungen in dieser Gruppe:*\n\n${lines}`);
            break;
          }
          case 'promote': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}promote @person`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'promote');
              await sock.sendMessage(jid, { text: `👑 @${target.split('@')[0]} ist jetzt Admin!`, mentions: [target] });
            } catch { await reply('Promote fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'demote': {
            const target = getTargetJid(msg);
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}demote @person`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'demote');
              await sock.sendMessage(jid, { text: `📉 @${target.split('@')[0]} ist kein Admin mehr.`, mentions: [target] });
            } catch { await reply('Demote fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'link': {
            try {
              const code = await sock.groupInviteCode(jid);
              await reply(`🔗 Einladungslink:\nhttps://chat.whatsapp.com/${code}`);
            } catch { await reply('Konnte den Einladungslink nicht abrufen. Bin ich Admin?'); }
            break;
          }
          case 'revoke': {
            try {
              await sock.groupRevokeInvite(jid);
              const code = await sock.groupInviteCode(jid);
              await reply(`🔄 Einladungslink wurde erneuert:\nhttps://chat.whatsapp.com/${code}`);
            } catch { await reply('Konnte den Einladungslink nicht widerrufen. Bin ich Admin?'); }
            break;
          }
          case 'announce': {
            const text2 = args.join(' ').trim();
            if (!text2) { await reply(`Nutzung: ${COMMAND_PREFIX}announce <Nachricht>`); break; }
            const meta2 = await getGroupMeta(jid);
            if (!meta2) { await reply('Gruppe nicht geladen.'); break; }
            const mentions2 = meta2.participants.map((p) => p.id);
            await sock.sendMessage(jid, {
              text: `📢 ${mentions2.map((m) => '@' + m.split('@')[0]).join(' ')}\n\n${text2}`,
              mentions: mentions2,
            });
            break;
          }
          case 'pin':
          case 'unpin': {
            const ctxP = msg.message?.extendedTextMessage?.contextInfo;
            if (!ctxP || !ctxP.stanzaId) {
              await reply(`Antworte auf eine Nachricht und schreibe ${COMMAND_PREFIX}${cmd}, um sie anzupinnen/zu lösen.`);
              break;
            }
            const botJidP = jidNormalizedUser(botState.me?.id || '');
            const quotedKey = {
              remoteJid: jid,
              fromMe: jidNormalizedUser(ctxP.participant || '') === botJidP,
              id: ctxP.stanzaId,
              participant: ctxP.participant || undefined,
            };
            const TIMES = { 1: 86400, 7: 604800, 30: 2592000 };
            const days = TIMES[Number(args[0])] ? Number(args[0]) : 7;
            try {
              if (cmd === 'pin') {
                await sock.sendMessage(jid, { pin: quotedKey, type: 1, time: TIMES[days] });
                const fromNum = (ctxP.participant || '').split('@')[0];
                activityLogPush({ type: 'pin', groupJid: jid, senderNum, targetNum: fromNum });
                await sock.sendMessage(jid, {
                  text: `📌 Nachricht${fromNum ? ` von @${fromNum}` : ''} wurde für ${days} Tag(e) angepinnt.`,
                  mentions: ctxP.participant ? [ctxP.participant] : [],
                });
              } else {
                await sock.sendMessage(jid, { pin: quotedKey, type: 2 });
                activityLogPush({ type: 'unpin', groupJid: jid, senderNum });
                await reply('📌 Nachricht wurde gelöst.');
              }
            } catch (err) {
              logger.warn({ err }, 'Pin/Unpin fehlgeschlagen');
              await reply('Anpinnen fehlgeschlagen. Bin ich Admin und unterstützt der Chat das?');
            }
            break;
          }
          case 'setregeln': {
            const newRules = args.join(' ').trim();
            if (!newRules) { await reply(`Nutzung: ${COMMAND_PREFIX}setregeln <Regeltext>`); break; }
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            config.groups[jid].rules = newRules;
            await persist();
            await reply(`✅ Regeln gespeichert. Anzeigen mit ${COMMAND_PREFIX}regeln`);
            break;
          }
          case 'setwelcome': {
            const wMsg = args.join(' ').trim();
            if (!wMsg) { await reply(`Nutzung: ${COMMAND_PREFIX}setwelcome <Nachricht> ({user} = Nummer)`); break; }
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            if (!config.groups[jid].welcome) config.groups[jid].welcome = { enabled: false, message: null };
            config.groups[jid].welcome.message = wMsg;
            await persist();
            await reply(`✅ Willkommensnachricht gespeichert: ${wMsg}`);
            break;
          }
          case 'welcome': {
            const toggle = args[0]?.toLowerCase();
            if (toggle !== 'on' && toggle !== 'off') { await reply(`Nutzung: ${COMMAND_PREFIX}welcome on|off`); break; }
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            if (!config.groups[jid].welcome) config.groups[jid].welcome = { enabled: false, message: null };
            config.groups[jid].welcome.enabled = toggle === 'on';
            await persist();
            await reply(`👋 Willkommensnachrichten: ${toggle === 'on' ? 'Aktiviert ✅' : 'Deaktiviert ❌'}`);
            break;
          }

          // ---- Erweiterte Admin-Befehle ----
          case 'lock':
          case 'unlock': {
            try {
              await sock.groupSettingUpdate(jid, cmd === 'lock' ? 'announcement' : 'not_announcement');
              activityLogPush({ type: 'lock', groupJid: jid, senderNum });
              await reply(cmd === 'lock'
                ? '🔒 Chat gesperrt – nur Admins können jetzt schreiben.'
                : '🔓 Chat entsperrt – alle dürfen wieder schreiben.');
            } catch { await reply('Aktion fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'infolock':
          case 'infounlock': {
            try {
              await sock.groupSettingUpdate(jid, cmd === 'infolock' ? 'locked' : 'unlocked');
              await reply(cmd === 'infolock'
                ? '🔐 Nur Admins können jetzt die Gruppeninfo ändern.'
                : '🔓 Alle dürfen jetzt die Gruppeninfo ändern.');
            } catch { await reply('Aktion fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'setname': {
            const newName = args.join(' ').trim();
            if (!newName) { await reply(`Nutzung: ${COMMAND_PREFIX}setname <neuer Name>`); break; }
            if (newName.length > 100) { await reply('Der Name darf höchstens 100 Zeichen haben.'); break; }
            try {
              await sock.groupUpdateSubject(jid, newName);
              botState.groupMeta[jid] = null; // Cache invalidieren
              await reply(`✏️ Gruppenname geändert zu: *${newName}*`);
            } catch { await reply('Aktion fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'setdesc': {
            const newDesc = args.join(' ').trim();
            try {
              await sock.groupUpdateDescription(jid, newDesc || undefined);
              await reply(newDesc ? '📝 Gruppenbeschreibung aktualisiert.' : '📝 Gruppenbeschreibung gelöscht.');
            } catch { await reply('Aktion fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'del': {
            const ctxD = msg.message?.extendedTextMessage?.contextInfo;
            if (!ctxD || !ctxD.stanzaId) { await reply(`Antworte auf eine Nachricht und schreibe ${COMMAND_PREFIX}del.`); break; }
            const botJidD = jidNormalizedUser(botState.me?.id || '');
            const delKey = {
              remoteJid: jid,
              fromMe: jidNormalizedUser(ctxD.participant || '') === botJidD,
              id: ctxD.stanzaId,
              participant: ctxD.participant || undefined,
            };
            try {
              await sock.sendMessage(jid, { delete: delKey });
              activityLogPush({ type: 'del', groupJid: jid, senderNum, targetNum: (ctxD.participant || '').split('@')[0] });
            } catch { await reply('Löschen fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'admins': {
            const metaA = await getGroupMeta(jid);
            if (!metaA) { await reply('Konnte die Gruppe nicht laden.'); break; }
            const adminJids = metaA.participants.filter((p) => p.admin === 'admin' || p.admin === 'superadmin').map((p) => p.id);
            if (!adminJids.length) { await reply('Keine Admins gefunden.'); break; }
            await sock.sendMessage(jid, {
              text: `🛡️ *Admin-Ruf*\n${adminJids.map((m) => '@' + m.split('@')[0]).join(' ')}`,
              mentions: adminJids,
            });
            break;
          }
          case 'ephemeral': {
            const opt = args[0]?.toLowerCase();
            const MAP = { off: 0, '0': 0, '1': 86400, '7': 604800, '90': 7776000 };
            if (!(opt in MAP)) { await reply(`Nutzung: ${COMMAND_PREFIX}ephemeral off|1|7|90 (Tage)`); break; }
            try {
              await sock.groupToggleEphemeral(jid, MAP[opt]);
              await reply(MAP[opt] === 0 ? '⏳ Verschwindende Nachrichten ausgeschaltet.' : `⏳ Verschwindende Nachrichten: ${opt} Tag(e).`);
            } catch { await reply('Aktion fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'addmode': {
            const mode = args[0]?.toLowerCase();
            if (mode !== 'admin' && mode !== 'all') { await reply(`Nutzung: ${COMMAND_PREFIX}addmode admin|all`); break; }
            try {
              await sock.groupMemberAddMode(jid, mode === 'admin' ? 'admin_add' : 'all_member_add');
              await reply(mode === 'admin' ? '👥 Nur Admins dürfen jetzt Mitglieder hinzufügen.' : '👥 Alle dürfen jetzt Mitglieder hinzufügen.');
            } catch { await reply('Aktion fehlgeschlagen (von WhatsApp evtl. nicht unterstützt). Bin ich Admin?'); }
            break;
          }
          case 'slowmode': {
            const opt = args[0]?.toLowerCase();
            if (!opt) {
              const cur = Number(group.moderation.slowmode) || 0;
              await reply(cur > 0 ? `🐌 Slowmode aktuell: ${cur} Sekunden.\nÄndern: ${COMMAND_PREFIX}slowmode <Sek>|off` : `Slowmode ist aus. Aktivieren: ${COMMAND_PREFIX}slowmode <Sekunden>`);
              break;
            }
            const secs = opt === 'off' ? 0 : Math.min(3600, Math.max(0, parseInt(opt, 10) || 0));
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            config.groups[jid].moderation = { ...(config.groups[jid].moderation || {}), slowmode: secs };
            await persist();
            activityLogPush({ type: 'slowmode', groupJid: jid, senderNum });
            await reply(secs > 0 ? `🐌 Slowmode aktiviert: max. 1 Nachricht alle ${secs} Sekunden (gilt nicht für Admins).` : '🐌 Slowmode ausgeschaltet.');
            break;
          }
          case 'remind': {
            const mins = Math.min(1440, Math.max(1, parseInt(args[0], 10) || 0));
            const remindText = args.slice(1).join(' ').trim();
            if (!mins || !remindText) { await reply(`Nutzung: ${COMMAND_PREFIX}remind <Minuten> <Text>`); break; }
            await reply(`⏰ Erinnerung gesetzt – in ${mins} Minute(n) melde ich mich.`);
            const rt = setTimeout(async () => {
              try {
                await sock.sendMessage(jid, { text: `⏰ *Erinnerung* (von @${senderNum}):\n${remindText}`, mentions: [senderJid] });
              } catch (e) { logger.warn({ e }, 'Remind-Nachricht fehlgeschlagen'); }
            }, mins * 60 * 1000);
            if (rt.unref) rt.unref();
            break;
          }

          // ---- Statistik-Befehle ----
          case 'top': {
            const n = Math.min(10, Math.max(1, Number(args[0]) || 5));
            const topList = getTopMembers(jid, n);
            if (!topList.length) { await reply('Noch keine Aktivitätsdaten verfügbar.'); break; }
            const medals2 = ['🥇', '🥈', '🥉'];
            const lines2 = topList.map((m, i) =>
              `${medals2[i] || (i + 1) + '.'} ${m.num} – ${m.messages || 0} Nachr. · ${m.commands || 0} Befehle`
            ).join('\n');
            await reply(`🏆 *Top ${n} – Aktivste Mitglieder*\n\n${lines2}`);
            break;
          }
          case 'stats': {
            const _statsTarget = getTargetJid(msg);
            const targetNum2 = _statsTarget ? _statsTarget.split('@')[0] : senderNum;
            const s2 = getMemberStats(jid, targetNum2);
            const w2 = moderation.getWarnings(jid, `${targetNum2}@s.whatsapp.net`);
            const lastSeen2 = s2.lastSeen ? new Date(s2.lastSeen).toLocaleString('de-DE') : 'unbekannt';
            await reply(`📊 *Statistiken für ${targetNum2}*\n\nNachrichten: ${s2.messages || 0}\nBefehle: ${s2.commands || 0}\nVerwarnungen: ${w2.count || 0}\nZuletzt aktiv: ${lastSeen2}`);
            break;
          }


          default:
            handled = false;
        }

        if (handled) {
          botState.commandCount++;
          botState.lastCommand = { cmd: COMMAND_PREFIX + cmd, at: Date.now() };
        }
      } catch (err) {
        logger.warn({ err }, 'Fehler beim Verarbeiten einer Nachricht');
      }
    }
  });

  return sock;
}

// ---------- Graceful Shutdown ----------
function shutdown(signal) {
  logger.info(`${signal} empfangen – fahre herunter…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Konfiguration laden, dann Bot starten
store.loadConfig(logger)
  .then((c) => {
    config = c && c.groups ? c : { groups: {} };
    // Globale Einstellungen & Anliegen-Liste sicherstellen
    config.settings = { dmAssistant: false, ...(config.settings || {}) };
    if (!Array.isArray(config.anliegen)) config.anliegen = [];
    if (!config.communityBans || typeof config.communityBans !== 'object') config.communityBans = {};
    if (!config.mods || typeof config.mods !== 'object') config.mods = {};
    // Bot-Hauptschalter aus der Cloud wiederherstellen (Standard: an)
    botState.powered = config.botPowered !== false;
    const speicherTyp = store.usingTurso() ? 'Turso (Cloud)' : store.usingMongo() ? 'MongoDB' : 'lokale Datei (flüchtig)';
    logger.info({ speicher: speicherTyp, selfPing: SELF_URL || 'AUS', powered: botState.powered }, 'Konfiguration geladen');
    if (!botState.powered) {
      logger.warn('Bot ist per Website ausgeschaltet (botPowered=false) – warte auf Einschalten.');
      botState.paused = true;
      return null; // Socket nicht starten, bis eingeschaltet wird
    }
    return startBot();
  })
  .catch((err) => {
    logger.error({ err }, 'Start fehlgeschlagen – versuche trotzdem zu starten');
    // Nicht hart beenden: lieber mit leerer Config starten, damit der Bot online bleibt.
    config = config && config.groups ? config : { groups: {} };
    startBot().catch((e) => logger.error({ e }, 'Bot-Start endgültig fehlgeschlagen'));
  });
