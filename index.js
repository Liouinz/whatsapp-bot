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

const PORT = process.env.PORT || 3000;
// Eingebautes Standard-Passwort, in Render per QR_PASSWORD überschreibbar.
const QR_PASSWORD = process.env.QR_PASSWORD || 'XWMEr3MZv-pH';
const SELF_URL = (process.env.SELF_URL || '').replace(/\/+$/, '');
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Verfügbare Befehle (für Hilfe-Text und Pro-Gruppen-Schalter)
// adminDefault: true → Standard "nur Admins" für neue Gruppen
const COMMANDS = [
  { key: 'hilfe',  desc: 'zeigt die Hilfe' },
  { key: 'ping',   desc: 'testet, ob der Bot reagiert' },
  { key: 'info',   desc: 'Bot-Status & Laufzeit' },
  { key: 'id',     desc: 'zeigt die Gruppen-ID' },
  { key: 'regeln', desc: 'zeigt die Gruppenregeln' },
  { key: 'sag',    desc: 'Bot wiederholt deinen Text', adminDefault: true },
  { key: 'alle',   desc: 'markiert alle Mitglieder', adminDefault: true },
  { key: 'zeit',   desc: 'aktuelle Uhrzeit' },
  { key: 'würfel', desc: 'würfelt eine Zahl' },
  { key: 'gruppe', desc: 'Infos zur Gruppe' },
  { key: 'marry',  desc: 'heiraten oder Ehestatus anzeigen' },
  { key: '8ball',  desc: 'Magic 8-Ball – Antwort auf deine Frage' },
  { key: 'münze',  desc: 'wirft eine Münze – Kopf oder Zahl' },
  { key: 'rps',    desc: 'Schere-Stein-Papier gegen den Bot' },
  { key: 'melden', desc: 'Meldung an die Admins schicken' },
];
// Alias -> kanonischer Befehl
const ALIAS = {
  help: 'hilfe', menu: 'hilfe', status: 'info', echo: 'sag', tagall: 'alle',
  dice: 'würfel', wuerfel: 'würfel',
  heiraten: 'marry',
  coin: 'münze', muenze: 'münze',
  report: 'melden',
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
};

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
  return { active: true, commands, moderation: { badwords: false, links: false, warnLimit: 3, extraBadwords: [] } };
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
    marriages: g.marriages || {},
  };
}
function activeGroupCount() {
  return Object.values(config.groups).filter((g) => g.active !== false).length;
}
async function persist() {
  await store.saveConfig(config, logger);
}

// ---------- Ehe-Helfer ----------
const proposals = new Map(); // `${groupJid}:${targetJid}` → { proposerJid, expiresAt }

function marriageKey(jid1, jid2) {
  return [jid1, jid2].map((j) => j.split('@')[0]).sort().join('-');
}
function findMarriage(groupJid, personJid) {
  const marriages = config.groups[groupJid]?.marriages || {};
  for (const [key, m] of Object.entries(marriages)) {
    if (m.p1 === personJid || m.p2 === personJid) return { key, ...m };
  }
  return null;
}
function happinessStatus(since) {
  const days = (Date.now() - since) / (1000 * 60 * 60 * 24);
  const seed = since % 100;
  const base = Math.min(100, 60 + days * 0.5 + (seed % 20));
  const wobble = ((seed * 7 + Math.floor(days) * 3) % 20) - 10;
  const pct = Math.round(Math.max(20, Math.min(100, base + wobble)));
  if (pct >= 90) return `${pct}% 💍 unzertrennlich`;
  if (pct >= 70) return `${pct}% 😍 sehr glücklich`;
  if (pct >= 50) return `${pct}% 🙂 ganz gut`;
  if (pct >= 35) return `${pct}% 😐 läuft so`;
  return `${pct}% 😤 angespannt`;
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
function keyOf(req) {
  return `?key=${encodeURIComponent(req.query.key)}`;
}

const STYLE = `
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;color:#eef2f7;margin:0;min-height:100vh;
    display:flex;flex-direction:column;align-items:center;padding:24px;position:relative;overflow-x:hidden;
    background:linear-gradient(-45deg,#1a2a6c,#2a5298,#0f8b8d,#26a96c);background-size:400% 400%;
    animation:bg 20s ease infinite}
  @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
  .leaf{position:fixed;font-size:2.4rem;opacity:.16;pointer-events:none;z-index:0;animation:float 9s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-16px) rotate(8deg)}}
  .card{background:rgba(17,21,30,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:24px;max-width:600px;width:100%;
    margin:12px 0;box-shadow:0 8px 32px rgba(0,0,0,.35);position:relative;z-index:1;animation:rise .5s ease both}
  @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  h1{font-size:clamp(1.25rem,4vw,1.55rem);margin:0 0 4px} h2{font-size:1.1rem;margin:0 0 12px}
  .muted{color:#aeb8c6;font-size:.9rem} a{color:#7fd1ff;text-decoration:none} a:hover{text-decoration:underline}
  img{max-width:100%;height:auto;display:block}
  .qr{background:#fff;padding:16px;border-radius:14px;display:inline-block;max-width:100%}
  .qr img{width:320px;max-width:100%;margin:0 auto}
  .status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.85rem;font-weight:600}
  .on{background:rgba(34,197,94,.2);color:#86efac} .off{background:rgba(248,113,113,.18);color:#fca5a5}
  .grp{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.1);
    border-radius:12px;margin:8px 0;background:rgba(255,255,255,.04);cursor:pointer;transition:border-color .2s,transform .1s;color:inherit}
  .grp:hover{border-color:#38ef7d;transform:translateY(-1px)}
  .grp .avatar{width:48px;height:48px;border-radius:50%;flex-shrink:0;object-fit:cover;background:rgba(255,255,255,.1)}
  .grp .meta{flex:1;min-width:0}
  .grp .name{font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .badge{font-size:.7rem;background:rgba(127,209,255,.18);color:#bfe3ff;padding:2px 8px;border-radius:999px;margin-left:6px}
  .opt{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;
    border:1px solid rgba(255,255,255,.1);border-radius:10px;margin:8px 0;background:rgba(255,255,255,.04)}
  .opt input[type=checkbox]{width:24px;height:24px;accent-color:#38ef7d;flex-shrink:0}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px}
  .stat .k{color:#aeb8c6;font-size:.8rem} .stat .v{font-size:1.3rem;font-weight:700;margin-top:2px}
  button{background:linear-gradient(135deg,#0f8b8d,#38ef7d);color:#06231a;border:0;border-radius:12px;
    padding:13px 20px;font-size:1rem;font-weight:700;cursor:pointer;width:100%;margin-top:12px;
    transition:transform .12s ease,filter .2s}
  button:hover{filter:brightness(1.08)} button:active{transform:scale(.97)}
  .input{width:100%;padding:13px;border-radius:10px;border:1px solid rgba(255,255,255,.14);
    background:rgba(255,255,255,.06);color:#eef2f7;font-size:1rem;margin-top:4px;
    transition:box-shadow .2s,border-color .2s}
  .input:focus{outline:none;border-color:#7fd1ff;box-shadow:0 0 0 4px rgba(127,209,255,.25)}
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
`;

const LEAVES =
  '<div class="leaf" style="top:8%;left:5%">🌿</div>' +
  '<div class="leaf" style="top:68%;left:9%;animation-delay:2s">🪴</div>' +
  '<div class="leaf" style="top:22%;right:7%;animation-delay:1s">🌱</div>' +
  '<div class="leaf" style="top:82%;right:6%;animation-delay:3s">🍃</div>';

function page(title, body, opts = {}) {
  const refresh = opts.refresh
    ? `<meta http-equiv="refresh" content="${opts.refresh};url=${opts.refreshUrl || ''}">`
    : '';
  return `<!doctype html><html lang="de"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    ${refresh}<title>${title}</title><style>${STYLE}</style></head>
    <body>${LEAVES}${body}${opts.script || ''}</body></html>`;
}

function requireAuth(req, res) {
  if (!passwordOk(req.query.key)) {
    res.status(401).send(page('Zugriff verweigert',
      '<div class="card"><h1>🔒 Zugriff verweigert</h1><p class="muted">Falsches oder fehlendes Passwort.</p><a href="/"><button>Zurück zur Anmeldung</button></a></div>'));
    return false;
  }
  return true;
}

// ---------- Webserver ----------
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/ping', (_req, res) => res.status(200).send('ok'));

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
    <div class="card">
      <div class="row"><h1>🤖 WhatsApp-Bot</h1>${statusBadge}</div>
      <p class="muted">${botState.connected
        ? 'Verbunden. Melde dich an, um Gruppen & Moderation zu verwalten.'
        : 'Noch nicht verbunden. Melde dich an, um den QR-Code zu scannen.'}</p>
    </div>
    <form class="card" method="get" action="/go">
      <h2>🔑 Anmelden</h2>
      <div class="pwwrap">
        <input id="pw" class="input" type="password" name="key" placeholder="Passwort" autofocus required>
        <button type="button" class="eye" id="eye" aria-label="Passwort anzeigen">👁️</button>
      </div>
      <button type="submit">Weiter →</button>
    </form>`, { script }));
});

app.get('/status', (_req, res) => {
  res.json({
    status: botState.connected ? 'verbunden' : 'getrennt',
    nummer: botState.me ? botState.me.id.split(':')[0] : null,
    qrVerfuegbar: Boolean(botState.qr),
    aktiveGruppen: activeGroupCount(),
    moderationsAktionen: botState.moderation.actionsTotal,
    uptimeSekunden: Math.round((Date.now() - botState.startedAt) / 1000),
  });
});

app.get('/go', (req, res) => {
  if (!passwordOk(req.query.key)) {
    return res.status(401).send(page('Falsches Passwort',
      '<div class="card"><h1>🔒 Falsches Passwort</h1><a href="/"><button>Erneut versuchen</button></a></div>'));
  }
  const keyParam = keyOf(req);
  res.redirect(botState.connected ? `/settings${keyParam}` : `/qr${keyParam}`);
});

// QR-Code-Seite
app.get('/qr', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  if (botState.connected) {
    return res.send(page('Verbunden', `
      <div class="card">
        <h1>✅ Verbunden</h1>
        <p class="muted">Erfolgreich verbunden – weiter zu den Einstellungen…</p>
        <a href="/settings${keyParam}"><button>Weiter zu den Einstellungen →</button></a>
      </div>`, { refresh: 2, refreshUrl: `/settings${keyParam}` }));
  }
  if (!botState.qr) {
    return res.send(page('Warte auf QR', `
      <div class="card" style="text-align:center">
        <h1>⏳ QR-Code wird vorbereitet…</h1>
        <p class="muted">Die Seite lädt automatisch neu.</p>
      </div>`, { refresh: 8, refreshUrl: `/qr${keyParam}` }));
  }
  try {
    const qrImage = await QRCode.toDataURL(botState.qr, { width: 360, margin: 1 });
    res.send(page('WhatsApp QR-Code', `
      <div class="card" style="text-align:center">
        <h1>📲 WhatsApp verbinden</h1>
        <p class="muted">WhatsApp → Einstellungen → <b>Verknüpfte Geräte</b> → <b>Gerät hinzufügen</b></p>
        <div class="qr"><img src="${qrImage}" alt="QR Code"></div>
        <p class="muted">Der Code aktualisiert sich automatisch.</p>
      </div>`, { refresh: 25, refreshUrl: `/qr${keyParam}` }));
  } catch (err) {
    logger.error({ err }, 'Fehler beim Erzeugen des QR-Codes');
    res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
  }
});

// Übersicht: Gruppen (jede führt zur Detail-Konfiguration)
app.get('/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  if (!botState.connected) {
    return res.send(page('Nicht verbunden', `
      <div class="card">
        <h1>⚠️ Noch nicht verbunden</h1>
        <p class="muted">Bitte zuerst die Nummer per QR-Code verbinden.</p>
        <a href="/qr${keyParam}"><button>Zum QR-Code →</button></a>
      </div>`, { refresh: 6, refreshUrl: `/settings${keyParam}` }));
  }

  await refreshGroups();
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';

  let groupsHtml = '';
  if (botState.groups.length === 0) {
    groupsHtml = '<p class="muted">Keine Gruppen gefunden. Füge den Bot zu einer Gruppe hinzu und lade neu.</p>';
  } else {
    for (const g of botState.groups) {
      const gc = effectiveGroupConfig(g.id);
      const badge = g.isCommunity
        ? '<span class="badge">🏘️ Community</span>'
        : g.community ? '<span class="badge">in Community</span>' : '';
      const activeBadge = gc.active ? '<span class="badge" style="background:rgba(34,197,94,.2);color:#86efac">aktiv</span>' : '';
      const pic = botState.groupPics[g.id];
      const avatar = pic
        ? `<img class="avatar" src="${escapeHtml(pic)}" alt="" loading="lazy">`
        : `<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:1.3rem">👥</div>`;
      groupsHtml += `
        <a class="grp" href="/group?id=${encodeURIComponent(g.id)}&key=${encodeURIComponent(req.query.key)}">
          ${avatar}
          <span class="meta"><span class="name">${escapeHtml(g.subject || 'Unbenannt')}${badge}${activeBadge}</span>
            <span class="muted">${g.size || 0} Mitglieder</span></span>
          <span style="font-size:1.3rem">⚙️</span>
        </a>`;
    }
  }

  res.send(page('Einstellungen', `
    <div class="card">
      <div class="row"><h1>⚙️ Einstellungen</h1><span class="status on">verbunden</span></div>
      <p class="muted">Nummer: <b>${escapeHtml(nummer)}</b> · Aktive Gruppen: <b>${activeGroupCount()}</b></p>
      <p class="muted">Tippe auf eine Gruppe, um Befehle & Moderation festzulegen.</p>
    </div>
    <div class="card">
      <h2>Deine Gruppen & Communities</h2>
      ${groupsHtml}
    </div>
    <div class="card row">
      <a href="/settings${keyParam}">🔄 Neu laden</a>
      <a href="/dashboard${keyParam}">📊 Dashboard</a>
      <a href="/reports${keyParam}">📋 Meldungen</a>
      <a href="/qr${keyParam}">QR-Code</a>
    </div>`));
});

// Detail-Konfiguration einer Gruppe
app.get('/group', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const keyVal = encodeURIComponent(req.query.key);
  const keyParam = keyOf(req);
  const group = botState.groups.find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
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

  res.send(page('Gruppe konfigurieren', `
    <div class="card">
      <div class="row"><h1>⚙️ ${escapeHtml(group.subject || 'Gruppe')}</h1>
        <a href="/settings${keyParam}">← zurück</a></div>
      <p class="muted">${group.size || 0} Mitglieder · <a href="/group/members?id=${encodeURIComponent(id)}&key=${encodeURIComponent(req.query.key)}">👥 Mitglieder anzeigen</a></p>
      ${saved}
    </div>
    <form method="POST" action="/group/save?id=${encodeURIComponent(id)}&key=${keyVal}">
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
        <p class="muted" style="margin-top:12px">Zusätzliche verbotene Wörter (kommagetrennt):</p>
        <textarea class="input" name="extraBadwords" placeholder="z. B. idiot, depp">${escapeHtml((gc.moderation.extraBadwords || []).join(', '))}</textarea>
      </div>
      <div class="card"><button type="submit">💾 Speichern</button></div>
    </form>`));
});

// Gruppen-Konfiguration speichern
app.post('/group/save', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const keyVal = encodeURIComponent(req.query.key);
  if (!id) return res.status(400).send('Fehlende Gruppen-ID.');

  const commands = {};
  for (const c of COMMANDS) {
    const raw = req.body[`cmd_${c.key}`];
    commands[c.key] = raw === 'admin' ? 'admin' : raw === 'off' ? false : 'all';
  }
  const extra = String(req.body.extraBadwords || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  // Bestehende Felder bewahren (marriages, moderation._state)
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
      extraBadwords: extra,
    },
  };
  await persist();
  logger.info({ group: id, active: config.groups[id].active }, 'Gruppen-Konfiguration gespeichert');
  res.redirect(`/group?id=${encodeURIComponent(id)}&key=${keyVal}&saved=1`);
});

// Mitglieder einer Gruppe
app.get('/group/members', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const keyParam = keyOf(req);
  const group = botState.groups.find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }
  if (!botState.connected) {
    return res.status(503).send(page('Nicht verbunden',
      `<div class="card"><h1>⚠️ Nicht verbunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }

  const meta = await getGroupMeta(id);
  const participants = meta?.participants || [];
  const botJid = jidNormalizedUser(botState.me?.id || '');

  let rows = '';
  for (const p of participants) {
    const num = p.id.split('@')[0];
    const adminBadge = p.admin ? `<span class="badge">${p.admin === 'superadmin' ? '👑 Ersteller' : '🛡️ Admin'}</span>` : '';
    const isSelf = jidNormalizedUser(p.id) === botJid ? '<span class="badge">🤖 Bot</span>' : '';
    rows += `<tr><td>${escapeHtml(num)}</td><td>${adminBadge}${isSelf}</td></tr>`;
  }

  res.send(page(`Mitglieder – ${group.subject}`, `
    <div class="card">
      <div class="row">
        <h1>👥 ${escapeHtml(group.subject || 'Gruppe')}</h1>
        <a href="/group?id=${encodeURIComponent(id)}&key=${encodeURIComponent(req.query.key)}">← zurück</a>
      </div>
      <p class="muted">${participants.length} Mitglieder</p>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Nummer</th><th>Rolle</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2" class="muted">Keine Mitglieder geladen.</td></tr>'}</tbody>
      </table>
    </div>`));
});

// Meldungen
app.get('/reports', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);
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
    <div class="card">
      <div class="row">
        <h1>📋 Meldungen</h1>
        <a href="/settings${keyParam}">← zurück</a>
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
      <a href="/settings${keyParam}">⚙️ Einstellungen</a>
      <a href="/dashboard${keyParam}">📊 Dashboard</a>
    </div>`));
});

// Live-Dashboard
app.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  const mem = process.memoryUsage();
  const mb = (n) => (n / 1024 / 1024).toFixed(0) + ' MB';
  const upS = Math.round((Date.now() - botState.startedAt) / 1000);
  const uptime = `${Math.floor(upS / 3600)}h ${Math.floor((upS % 3600) / 60)}m ${upS % 60}s`;
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';
  const last = botState.lastCommand
    ? `${escapeHtml(botState.lastCommand.cmd)} (${new Date(botState.lastCommand.at).toLocaleTimeString('de-DE')})`
    : '–';
  const lastMod = botState.moderation.lastAction
    ? `${escapeHtml(botState.moderation.lastAction)}`
    : '–';
  const statusBadge = botState.connected
    ? '<span class="status on">✅ verbunden</span>'
    : '<span class="status off">⭕ getrennt</span>';
  const speicher = store.usingMongo() ? 'MongoDB' : 'Datei (flüchtig)';

  res.send(page('Dashboard', `
    <div class="card">
      <div class="row"><h1>📊 Dashboard</h1>${statusBadge}</div>
      <p class="muted">Live-Daten vom Server · aktualisiert alle 10 s</p>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="k">Nummer</div><div class="v">${escapeHtml(nummer)}</div></div>
        <div class="stat"><div class="k">Laufzeit</div><div class="v">${uptime}</div></div>
        <div class="stat"><div class="k">Aktive Gruppen</div><div class="v">${activeGroupCount()}</div></div>
        <div class="stat"><div class="k">Gruppen gesamt</div><div class="v">${botState.groups.length}</div></div>
        <div class="stat"><div class="k">Befehle verarbeitet</div><div class="v">${botState.commandCount}</div></div>
        <div class="stat"><div class="k">Letzter Befehl</div><div class="v" style="font-size:1rem">${last}</div></div>
        <div class="stat"><div class="k">Moderations-Aktionen</div><div class="v">${botState.moderation.actionsTotal}</div></div>
        <div class="stat"><div class="k">Letzte Moderation</div><div class="v" style="font-size:1rem">${lastMod}</div></div>
        <div class="stat"><div class="k">RAM (Heap)</div><div class="v">${mb(mem.heapUsed)}</div></div>
        <div class="stat"><div class="k">Speicher</div><div class="v" style="font-size:1rem">${speicher}</div></div>
      </div>
    </div>
    <div class="card row">
      <a href="/settings${keyParam}">⚙️ Einstellungen</a>
      <a href="/reports${keyParam}">📋 Meldungen</a>
      <a href="/qr${keyParam}">QR-Code</a>
    </div>`, { refresh: 10, refreshUrl: `/dashboard${keyParam}` }));
});

const server = app.listen(PORT, () => logger.info(`HTTP-Server läuft auf Port ${PORT}`));

// ---------- Optionaler Self-Ping ----------
if (SELF_URL) {
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.debug('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, 4 * 60 * 1000);
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
function isAdmin(meta, jid) {
  if (!meta || !jid) return false;
  const p = meta.participants.find((x) => x.id === jid);
  return Boolean(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

// ---------- WhatsApp-Verbindung ----------
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
      logger.info('Neuer QR-Code – im Browser unter /qr?key=... scannen');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      botState.connected = true;
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
        logger.warn({ statusCode }, 'Verbindung getrennt – Neuverbindung in 3s');
        setTimeout(() => startBot().catch((err) => logger.error({ err }, 'Reconnect fehlgeschlagen')), 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) continue; // nur Gruppen
        if (msg.key.fromMe) continue;

        const group = effectiveGroupConfig(jid);
        if (!group.active) continue;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const senderJid = msg.key.participant || jid;

        // 1) Moderation (falls für die Gruppe aktiv)
        if (group.moderation.badwords || group.moderation.links) {
          const meta = await getGroupMeta(jid);
          const senderIsAdmin = isAdmin(meta, senderJid);
          const moderated = await moderation.checkMessage({
            sock, group, remoteJid: jid, senderJid, text, msg, isAdmin: senderIsAdmin,
          });
          if (moderated) continue;
        }

        // 2a) Heiratsbestätigung prüfen (vor Befehl-Check)
        if (text.trim().toLowerCase() === 'ja') {
          const proposalKey = `${jid}:${senderJid}`;
          const proposal = proposals.get(proposalKey);
          if (proposal && Date.now() < proposal.expiresAt) {
            proposals.delete(proposalKey);
            if (findMarriage(jid, senderJid) || findMarriage(jid, proposal.proposerJid)) {
              await sock.sendMessage(jid, { text: 'Eine der Personen ist bereits verheiratet! 💔' });
            } else {
              const key = marriageKey(senderJid, proposal.proposerJid);
              if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
              if (!config.groups[jid].marriages) config.groups[jid].marriages = {};
              config.groups[jid].marriages[key] = { p1: senderJid, p2: proposal.proposerJid, since: Date.now() };
              await persist();
              const n1 = senderJid.split('@')[0], n2 = proposal.proposerJid.split('@')[0];
              await sock.sendMessage(jid, {
                text: `💍 @${n2} und @${n1} sind jetzt verheiratet! Herzlichen Glückwunsch! 🎊`,
                mentions: [senderJid, proposal.proposerJid],
              });
            }
            continue;
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
        if (cmdSetting === 'admin') {
          const metaForAdmin = await getGroupMeta(jid);
          if (!isAdmin(metaForAdmin, senderJid)) continue; // nur Admins
        }

        const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
        let handled = true;

        switch (cmd) {
          case 'hilfe': {
            const lines = COMMANDS
              .filter((c) => group.commands[c.key] !== false)
              .map((c) => {
                const adminTag = group.commands[c.key] === 'admin' ? ' 🛡️' : '';
                return `${COMMAND_PREFIX}${c.key}${adminTag} – ${c.desc}`;
              }).join('\n');
            await reply(`🤖 *Bot-Befehle*\n\n${lines}\n\n🛡️ = nur Admins`);
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
            await reply(`📋 *Gruppenregeln*\n\n1. Sei respektvoll 🤝\n2. Kein Spam 🚫\n3. Bleib beim Thema 💬`);
            break;
          case 'sag':
            await reply(args.length ? args.join(' ') : `Nutzung: ${COMMAND_PREFIX}sag <Text>`);
            break;
          case 'zeit':
            await reply(`🕒 ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`);
            break;
          case 'würfel':
            await reply(`🎲 Du würfelst eine *${Math.floor(Math.random() * 6) + 1}*`);
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
          case 'marry': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) {
              const m = findMarriage(jid, senderJid);
              if (!m) {
                await reply(`Du bist nicht verheiratet. 💌 Schreib ${COMMAND_PREFIX}marry @person um einen Antrag zu machen.`);
              } else {
                const partner = m.p1 === senderJid ? m.p2 : m.p1;
                const days = Math.floor((Date.now() - m.since) / 86400000);
                const pNum = partner.split('@')[0];
                await sock.sendMessage(jid, {
                  text: `💍 Du bist seit ${days} Tag(en) mit @${pNum} verheiratet.\nGlück: ${happinessStatus(m.since)}`,
                  mentions: [partner],
                }, { quoted: msg });
              }
              break;
            }
            if (target === senderJid) { await reply('Du kannst dich nicht selbst heiraten! 😅'); break; }
            const botJidM = jidNormalizedUser(botState.me?.id || '');
            if (jidNormalizedUser(target) === botJidM) { await reply('Danke für den Antrag, aber ich bin nur ein Bot! 🤖'); break; }
            if (findMarriage(jid, senderJid)) { await reply('Du bist bereits verheiratet! 💍'); break; }
            if (findMarriage(jid, target)) {
              await sock.sendMessage(jid, {
                text: `@${target.split('@')[0]} ist bereits verheiratet! 💔`,
                mentions: [target],
              }, { quoted: msg });
              break;
            }
            proposals.set(`${jid}:${target}`, { proposerJid: senderJid, targetJid: target, expiresAt: Date.now() + 5 * 60 * 1000 });
            const sNum2 = senderJid.split('@')[0], tNum2 = target.split('@')[0];
            await sock.sendMessage(jid, {
              text: `💌 @${sNum2} macht @${tNum2} einen Heiratsantrag! 💍\n@${tNum2}, antworte mit *ja* um anzunehmen (5 Minuten Zeit).`,
              mentions: [senderJid, target],
            });
            break;
          }
          case '8ball': {
            const BALL_ANSWERS = [
              'Ja, definitiv! ✅', 'Absolut! 🎯', 'Sehr wahrscheinlich 👍',
              'Die Zeichen sagen ja ✨', 'Ohne Zweifel! 💯', 'Du kannst darauf zählen 🎱',
              'Ungewiss – frag später nochmal 🤔', 'Besser nicht zu sagen 🌫️',
              'Schwer zu sagen 😶', 'Eher nicht ❌', 'Sehr zweifelhaft 🙅',
              'Auf keinen Fall! 🚫',
            ];
            const q = args.join(' ').trim();
            if (!q) { await reply(`Stell eine Frage! z.B. ${COMMAND_PREFIX}8ball Wird es heute regnen?`); break; }
            await reply(`🎱 *${BALL_ANSWERS[Math.floor(Math.random() * BALL_ANSWERS.length)]}*`);
            break;
          }
          case 'münze':
            await reply(Math.random() < 0.5 ? '🪙 *Kopf!*' : '🪙 *Zahl!*');
            break;
          case 'rps': {
            const RPS_CHOICES = ['stein', 'schere', 'papier'];
            const RPS_EMOJI = { stein: '🪨', schere: '✂️', papier: '📄' };
            const RPS_BEATS = { stein: 'schere', schere: 'papier', papier: 'stein' };
            const userPick = args[0]?.toLowerCase();
            if (!RPS_CHOICES.includes(userPick)) {
              await reply(`Wähle: stein, schere oder papier.\nBeispiel: ${COMMAND_PREFIX}rps stein`);
              break;
            }
            const botPick = RPS_CHOICES[Math.floor(Math.random() * 3)];
            let rpsResult;
            if (userPick === botPick) rpsResult = 'Unentschieden! 🤝';
            else if (RPS_BEATS[userPick] === botPick) rpsResult = 'Du gewinnst! 🎉';
            else rpsResult = 'Ich gewinne! 🤖';
            await reply(`${RPS_EMOJI[userPick]} vs ${RPS_EMOJI[botPick]} – *${rpsResult}*`);
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
    logger.info('Konfiguration geladen');
    return startBot();
  })
  .catch((err) => {
    logger.error({ err }, 'Start fehlgeschlagen');
    process.exit(1);
  });
