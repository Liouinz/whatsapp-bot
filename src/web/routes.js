'use strict';

const express = require('express');
const logger = require('../core/logger');
const storage = require('../core/storage');
const registry = require('../bot/registry');
const permissions = require('../bot/permissions');
const { state } = require('../core/connection');
const { fmtDate, fmtDuration, jidFromNum, numFromJid } = require('../bot/util');
const { esc, layout, csrfField } = require('./views');
const { checkCsrf } = require('./auth');

const router = express.Router();

// kleiner async-Wrapper, der Fehler abfängt
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  logger.error({ err }, 'Web-Route Fehler');
  res.status(500).type('html').send('❌ Interner Fehler. Siehe Fehlerlog.');
});

function csrf(req) {
  return req.session.csrf;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/', wrap(async (req, res) => {
  let groups = [];
  try {
    groups = await storage.getAllGroups();
  } catch (_) {}
  const connected = state.connection === 'open';
  const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const body = `
  <div class="card"><h2>Status</h2><div class="grid">
    ${stat('Verbindung', connected ? '🟢 online' : '🔴 ' + esc(state.connection))}
    ${stat('Bot-Power', state.powered ? '⚡ an' : '⏸ aus')}
    ${stat('Laufzeit', fmtDuration(Date.now() - state.startedAt))}
    ${stat('Gruppen', groups.length)}
    ${stat('Befehle', state.commandsProcessed)}
    ${stat('Nummer', state.me ? '+' + numFromJid(state.me.id) : '–')}
  </div></div>

  <div class="card"><h2>Steuerung</h2>
    <form method="post" action="/panel/power" style="margin-bottom:10px">${csrfField(csrf(req))}
      <input type="hidden" name="value" value="${state.powered ? 'off' : 'on'}">
      <button class="btn full ${state.powered ? 'bad' : ''}" type="submit">
        ${state.powered ? '⏸ Bot pausieren' : '⚡ Bot aktivieren'}</button>
    </form>
    <form method="post" action="/panel/restart" onsubmit="return confirmDestructive(this)">${csrfField(csrf(req))}
      <button class="btn full sec" type="submit">♻️ Prozess neu starten</button>
    </form>
    <div class="actions"><a class="btn sec full" href="/panel/backup">💾 Backup exportieren (JSON)</a></div>
  </div>`;
  res.type('html').send(layout('Dashboard', '/panel', body, csrf(req)));
}));

// ---------------------------------------------------------------------------
// Gruppen-Liste
// ---------------------------------------------------------------------------

router.get('/groups', wrap(async (req, res) => {
  const groups = await storage.getAllGroups();
  const items = await Promise.all(groups.map(async (g) => {
    let name = g.jid;
    try {
      const m = await permissions.getGroupMetadata(state.sock, g.jid);
      name = m.subject || g.jid;
    } catch (_) {}
    const t = g.active ? '<span class="tag ok">aktiv</span>' : '<span class="tag bad">aus</span>';
    return `<div class="it"><div class="row"><div><b>${esc(name)}</b> ${t}<br><span class="muted mono">${esc(g.jid)}</span></div>
      <a class="btn sm" href="/panel/group?jid=${encodeURIComponent(g.jid)}">Einstellungen</a></div></div>`;
  }));
  const body = `<div class="card"><h2>Gruppen (${groups.length})</h2>
    <div class="list">${items.join('') || '<p class="muted">Noch keine Gruppen erfasst. Schreibe in einer Gruppe eine Nachricht, dann erscheint sie hier.</p>'}</div></div>`;
  res.type('html').send(layout('Gruppen', '/panel/groups', body, csrf(req)));
}));

// ---------------------------------------------------------------------------
// Gruppen-Einstellungen
// ---------------------------------------------------------------------------

router.get('/group', wrap(async (req, res) => {
  const jid = String(req.query.jid || '');
  if (!jid) return res.redirect('/panel/groups');
  const g = (await storage.getGroup(jid)) || { jid, active: true, config: storage.DEFAULT_GROUP_CONFIG };
  const c = g.config;
  let name = jid;
  let members = [];
  try {
    const m = await permissions.getGroupMetadata(state.sock, jid);
    name = m.subject || jid;
    members = m.participants || [];
  } catch (_) {}

  const sw = (n, on) => `<label class="switch"><input type="checkbox" name="${n}"${on ? ' checked' : ''}><span class="slider"></span></label>`;
  const rowSw = (label, n, on) => `<div class="row"><span>${label}</span>${sw(n, on)}</div>`;

  const cmdOpts = (cur) => {
    const v = cur === false ? 'aus' : cur || '';
    const o = (val, lbl) => `<option value="${val}"${v === val ? ' selected' : ''}>${lbl}</option>`;
    return o('', 'Standard') + o('all', 'Alle') + o('admin', 'Admins') + o('aus', 'Deaktiviert');
  };
  const cmdRows = registry.all()
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map((cmd) => `<div class="row"><span class="mono">!${esc(cmd.name)} <span class="muted">(${esc(cmd.category)})</span></span>
      <select name="cmd_${esc(cmd.name)}">${cmdOpts(c.commands?.[cmd.name])}</select></div>`)
    .join('');

  const banlog = await storage.getBanLog(jid, 10);
  const banHtml = banlog.length
    ? '<div class="list">' + banlog.map((b) => `<div class="it">+${esc(b.num)} — ${esc(b.reason || 'kein Grund')} <span class="muted">${fmtDate(b.at)}</span></div>`).join('') + '</div>'
    : '<p class="muted">Keine Einträge.</p>';

  const body = `
  <div class="card"><h2>${esc(name)}</h2><p class="muted mono">${esc(jid)}</p></div>
  <form method="post" action="/panel/group/save">${csrfField(csrf(req))}
    <input type="hidden" name="jid" value="${esc(jid)}">
    <div class="card"><h2>Allgemein</h2>${rowSw('Bot in dieser Gruppe aktiv', 'active', g.active)}</div>

    <div class="card"><h2>🛡️ Moderation</h2>
      ${rowSw('Badwords filtern', 'mod_badwords', c.moderation.badwords)}
      ${rowSw('Links/Werbung filtern', 'mod_links', c.moderation.links)}
      ${rowSw('Spam/Flood filtern', 'mod_spam', c.moderation.spam)}
      ${rowSw('Bei Limit kicken', 'mod_kickOnLimit', c.moderation.kickOnLimit)}
      <label>Verwarnungs-Limit</label><input type="number" name="mod_warnLimit" min="1" max="20" value="${esc(c.moderation.warnLimit)}">
      <label>Slowmode (Sekunden, 0 = aus)</label><input type="number" name="mod_slowmode" min="0" value="${esc(c.moderation.slowmode || 0)}">
      <label>Zusätzliche Badwords (Komma-getrennt)</label><input type="text" name="mod_extra" value="${esc((c.moderation.extraBadwords || []).join(', '))}">
    </div>

    <div class="card"><h2>👋 Welcome</h2>
      ${rowSw('Willkommensnachricht', 'welcome_enabled', c.welcome.enabled)}
      ${rowSw('Captcha-Verifizierung (Auto-Kick)', 'welcome_verify', c.welcome.verify)}
      <label>Text (@{user} = neuer Nutzer)</label><textarea name="welcome_message">${esc(c.welcome.message || '')}</textarea>
      <label>Verify-Timeout (Minuten)</label><input type="number" name="welcome_timeout" min="1" max="60" value="${esc(c.welcome.verifyTimeoutMin || 5)}">
    </div>

    <div class="card"><h2>📜 Regeln</h2><textarea name="rules">${esc(c.rules || '')}</textarea></div>

    <div class="card"><h2>📊 Report</h2>${rowSw('Wöchentlicher Report privat an Admins', 'report_weekly', c.weeklyReport)}</div>

    <div class="card"><h2>⚙️ Rechte je Befehl</h2>
      <p class="muted">„Standard" = die im Befehl hinterlegte Stufe.</p>${cmdRows}</div>

    <button class="btn full" type="submit">💾 Speichern</button>
  </form>

  <div class="card" style="margin-top:16px"><h2>Mitglied-Aktionen</h2>
    <a class="btn sec full" href="/panel/members?jid=${encodeURIComponent(jid)}">👤 Mitglieder verwalten (${members.length})</a></div>
  <div class="card"><h2>🚫 Letzte Bans</h2>${banHtml}</div>`;
  res.type('html').send(layout('Gruppe', '/panel/groups', body, csrf(req)));
}));

router.post('/group/save', checkCsrf, wrap(async (req, res) => {
  const b = req.body;
  const jid = String(b.jid || '');
  if (!jid) return res.redirect('/panel/groups');
  const has = (k) => k in b;

  const current = await storage.getGroupConfig(jid);
  const commands = {};
  for (const cmd of registry.all()) {
    const v = b[`cmd_${cmd.name}`];
    if (v === 'all' || v === 'admin') commands[cmd.name] = v;
    else if (v === 'aus') commands[cmd.name] = false;
    // '' / Standard => kein Override
  }
  const cfg = {
    ...current,
    commands,
    moderation: {
      ...current.moderation,
      badwords: has('mod_badwords'),
      links: has('mod_links'),
      spam: has('mod_spam'),
      kickOnLimit: has('mod_kickOnLimit'),
      warnLimit: Math.max(1, parseInt(b.mod_warnLimit, 10) || 3),
      slowmode: Math.max(0, parseInt(b.mod_slowmode, 10) || 0),
      extraBadwords: String(b.mod_extra || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    welcome: {
      ...current.welcome,
      enabled: has('welcome_enabled'),
      verify: has('welcome_verify'),
      message: String(b.welcome_message || '').trim() || null,
      verifyTimeoutMin: Math.min(60, Math.max(1, parseInt(b.welcome_timeout, 10) || 5)),
    },
    rules: String(b.rules || '').trim() || null,
    weeklyReport: has('report_weekly'),
  };
  await storage.setGroupConfig(jid, cfg);
  await storage.setGroupActive(jid, has('active'));
  permissions.invalidateGroupMetadata(jid);
  res.redirect('/panel/group?jid=' + encodeURIComponent(jid));
}));

// ---------------------------------------------------------------------------
// Mitglieder verwalten
// ---------------------------------------------------------------------------

router.get('/members', wrap(async (req, res) => {
  const jid = String(req.query.jid || '');
  if (!jid) return res.redirect('/panel/groups');
  let members = [];
  let name = jid;
  try {
    const m = await permissions.getGroupMetadata(state.sock, jid);
    name = m.subject || jid;
    members = m.participants || [];
  } catch (_) {}

  const rows = await Promise.all(members.map(async (p) => {
    const num = numFromJid(p.id);
    const w = await storage.getWarnings(jid, p.id).catch(() => ({ count: 0 }));
    const muted = await storage.isMuted(jid, p.id).catch(() => false);
    const badge = (p.admin === 'admin' || p.admin === 'superadmin') ? '<span class="tag">admin</span>' : '';
    const act = (action, label, cls) =>
      `<form method="post" action="/panel/member/action" style="display:inline">${csrfField(csrf(req))}
        <input type="hidden" name="jid" value="${esc(jid)}"><input type="hidden" name="num" value="${esc(num)}">
        <input type="hidden" name="action" value="${action}">
        <button class="btn sm ${cls || 'sec'}" type="submit">${label}</button></form>`;
    return `<div class="it"><div>+${esc(num)} ${badge} ${w.count ? `<span class="tag warn">${w.count}⚠️</span>` : ''} ${muted ? '<span class="tag bad">🔇</span>' : ''}</div>
      <div class="actions">${act('warn', '⚠️ Warn')}${act('mute', '🔇 Mute')}${act('unmute', '🔊 Unmute')}${act('kick', '👋 Kick', 'bad')}</div></div>`;
  }));

  const body = `<div class="card"><h2>👤 ${esc(name)} — ${members.length} Mitglieder</h2>
    <p class="muted">Kick benötigt Bot-Admin in der Gruppe.</p>
    <div class="list">${rows.join('')}</div>
    <div class="actions" style="margin-top:14px"><a class="btn sec" href="/panel/group?jid=${encodeURIComponent(jid)}">← zurück</a></div></div>`;
  res.type('html').send(layout('Mitglieder', '/panel/groups', body, csrf(req)));
}));

router.post('/member/action', checkCsrf, wrap(async (req, res) => {
  const { jid, num, action } = req.body;
  const userJid = jidFromNum(num);
  try {
    if (action === 'kick') await state.sock.groupParticipantsUpdate(jid, [userJid], 'remove');
    else if (action === 'warn') await storage.addWarning(jid, userJid, 'via Web-Panel');
    else if (action === 'mute') await storage.setMute(jid, userJid, Date.now() + 365 * 864e5);
    else if (action === 'unmute') await storage.removeMute(jid, userJid);
  } catch (e) {
    logger.warn({ err: e, action }, 'Mitglied-Aktion fehlgeschlagen');
  }
  res.redirect('/panel/members?jid=' + encodeURIComponent(jid));
}));

// ---------------------------------------------------------------------------
// Daten-Seiten
// ---------------------------------------------------------------------------

router.get('/reports', wrap(async (req, res) => {
  const reports = await storage.getReports(100);
  const items = reports.map((r) => `<div class="it"><b>${esc(r.groupName || r.groupJid)}</b> <span class="muted">${fmtDate(r.at)}</span><br>
    <span class="muted">von +${esc(r.senderNum)}</span><br>${esc(r.text)}</div>`).join('');
  const body = `<div class="card"><h2>🚩 Meldungen (${reports.length})</h2><div class="list">${items || '<p class="muted">Keine Meldungen.</p>'}</div></div>`;
  res.type('html').send(layout('Meldungen', '/panel/reports', body, csrf(req)));
}));

router.get('/banlog', wrap(async (req, res) => {
  const bans = await storage.getRecentBans(150);
  const items = bans.map((b) => `<div class="it">+${esc(b.num)} <span class="muted">${fmtDate(b.at)}</span><br>
    ${esc(b.reason || 'kein Grund')} <span class="muted mono">${esc(b.groupJid)}</span></div>`).join('');
  const body = `<div class="card"><h2>🚫 Ban-Log (${bans.length})</h2><div class="list">${items || '<p class="muted">Keine Bans.</p>'}</div></div>`;
  res.type('html').send(layout('Ban-Log', '/panel/banlog', body, csrf(req)));
}));

router.get('/anliegen', wrap(async (req, res) => {
  const list = await storage.getAnliegen();
  const items = list.map((a) => `<div class="it"><div class="row"><div>
    <b>+${esc(a.num)}</b> <span class="tag ${a.status === 'offen' ? 'warn' : 'ok'}">${esc(a.status)}</span> <span class="muted">${fmtDate(a.at)}</span><br>${esc(a.text)}</div>
    ${a.status === 'offen' ? `<form method="post" action="/panel/anliegen/done">${csrfField(csrf(req))}<input type="hidden" name="id" value="${a.id}"><button class="btn sm" type="submit">✓ erledigt</button></form>` : ''}
    </div></div>`).join('');
  const body = `<div class="card"><h2>📨 Anliegen (${list.length})</h2><div class="list">${items || '<p class="muted">Keine Anliegen.</p>'}</div></div>`;
  res.type('html').send(layout('Anliegen', '/panel/anliegen', body, csrf(req)));
}));

router.post('/anliegen/done', checkCsrf, wrap(async (req, res) => {
  await storage.setAnliegenStatus(parseInt(req.body.id, 10), 'erledigt');
  res.redirect('/panel/anliegen');
}));

router.get('/errors', wrap(async (req, res) => {
  const errs = logger.recentErrors();
  const items = errs.map((e) => `<div class="it"><span class="tag ${e.level === 'error' ? 'bad' : 'warn'}">${esc(e.level)}</span>
    <span class="muted">${fmtDate(e.at)}</span><br>${esc(e.msg)}${e.stack ? `<div class="mono muted">${esc(e.stack)}</div>` : ''}</div>`).join('');
  const body = `<div class="card"><h2>🐞 Fehlerlog (${errs.length})</h2><div class="list">${items || '<p class="muted">Keine Fehler. 🎉</p>'}</div></div>`;
  res.type('html').send(layout('Fehlerlog', '/panel/errors', body, csrf(req)));
}));

// ---------------------------------------------------------------------------
// Backup-Export
// ---------------------------------------------------------------------------

router.get('/backup', wrap(async (req, res) => {
  const data = await storage.exportAll();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

// ---------------------------------------------------------------------------
// Steuerung (destruktiv → CSRF + Bestätigung)
// ---------------------------------------------------------------------------

router.post('/power', checkCsrf, wrap(async (req, res) => {
  const on = req.body.value === 'on';
  state.powered = on;
  await storage.setSetting('powered', on);
  logger.info(`Web-UI: Bot ${on ? 'aktiviert' : 'pausiert'}`);
  res.redirect('/panel');
}));

router.post('/restart', checkCsrf, wrap(async (req, res) => {
  logger.warn('Web-UI: Prozess-Neustart angefordert');
  res.type('html').send('<!doctype html><meta charset=utf-8><meta http-equiv="refresh" content="6;url=/panel"><body style="font-family:system-ui;background:#0b1020;color:#e6e9f5;display:grid;place-items:center;height:100vh"><div>♻️ Neustart … (Seite lädt gleich neu)</div>');
  setTimeout(async () => {
    try { await storage.flushStats(); } catch (_) {}
    process.exit(0);
  }, 500);
}));

module.exports = router;
