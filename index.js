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
// Hinweis: command-catalog.js bleibt als Referenz für den Neuaufbau im Repo
// (vollständige Befehlstexte), wird vom laufenden Code aber nicht mehr benötigt.

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
  return `<!doctype html><html lang="de"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    ${refresh}<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
    <body><div class="content bare">${body}${opts.script || ''}</div></body></html>`;
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

// Startseite: nicht angemeldet → Login; angemeldet → Download-Seite.
app.get('/', (req, res) => {
  if (sessionOk(req)) {
    return res.send(page('Blueprint herunterladen', `
      <div class="card hero">
        <div class="logo">🤖</div>
        <h1 class="gradient-text" style="font-size:clamp(1.6rem,6vw,2.1rem)">Bot-Blueprint</h1>
        <p class="muted" style="max-width:420px;margin:8px auto 18px">Die vollständige Spezifikationsdatei für den Neuaufbau.</p>
        <a href="/blueprint"><button class="glow-btn">⬇️ Blueprint herunterladen</button></a>
      </div>
      <div class="card" style="text-align:center"><a href="/logout">⎋ Abmelden</a></div>`));
  }
  const script = `<script>(function(){var p=document.getElementById('pw'),e=document.getElementById('eye');
    e.addEventListener('click',function(){if(p.type==='password'){p.type='text';e.textContent='🙈';}
    else{p.type='password';e.textContent='👁️';}p.focus();});})();</script>`;
  res.send(page('Anmelden', `
    <div class="card hero">
      <div class="logo">🤖</div>
      <h1 class="gradient-text" style="font-size:clamp(1.6rem,6vw,2.1rem)">Bot-Blueprint</h1>
      <p class="muted" style="max-width:380px;margin:8px auto 14px">Melde dich an, um die Datei herunterzuladen.</p>
    </div>
    <form class="card" method="post" action="/login">
      <h2>🔑 Anmelden</h2>
      <div class="pwwrap">
        <input id="pw" class="input" type="password" name="password" placeholder="Passwort" autofocus required>
        <button type="button" class="eye" id="eye" aria-label="Passwort anzeigen">👁️</button>
      </div>
      <button type="submit" class="glow-btn">Weiter →</button>
    </form>`, { script }));
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
  if (activeSessions.size >= 50) activeSessions.clear();
  activeSessions.add(token);
  const secure = process.env.NODE_ENV !== 'development';
  res.setHeader('Set-Cookie', `sess=${token}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Max-Age=86400; Path=/`);
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  const t = parseCookies(req).sess;
  if (t) activeSessions.delete(t);
  res.setHeader('Set-Cookie', 'sess=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
  res.redirect('/');
});

// Blueprint-Datei als Download ausliefern (passwortgeschützt)
app.get('/blueprint', (req, res) => {
  if (!requireAuth(req, res)) return;
  const fs = require('fs');
  const path = require('path');
  try {
    const file = path.join(__dirname, 'bot-blueprint.md');
    const data = fs.readFileSync(file);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bot-blueprint.md"');
    res.send(data);
  } catch (err) {
    logger.error({ err }, 'Blueprint-Datei konnte nicht gelesen werden');
    res.status(500).send(page('Fehler',
      '<div class="card"><h1>⚠️ Blueprint nicht gefunden</h1><p class="muted">Die Datei bot-blueprint.md fehlt auf dem Server.</p><a href="/"><button>Zurück</button></a></div>'));
  }
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
      logger.info('Neuer QR-Code – im Server-Terminal/Log scannen');
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
