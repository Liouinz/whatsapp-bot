// UI des Control Centers — Vanilla HTML/CSS/JS, kein Build-Step, keine Frameworks.
// Design: Dark Glassmorphism + Neon-Cyan, Mobile-First, dezente Micro-Animations.
// Hinweis: Im Client-JS bewusst KEINE Template-Literals (Datei ist selbst ein Template).

import { BOT_NAME } from './config.js';

export const LOGIN_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${BOT_NAME} — Login</title>
<link rel="stylesheet" href="/app.css">
</head>
<body class="login-body">
<canvas id="fx" aria-hidden="true"></canvas>
<main class="login-wrap">
  <form class="glass login-card" id="loginForm" autocomplete="off">
    <div class="logo-dot" aria-hidden="true"></div>
    <h1>${BOT_NAME}</h1>
    <p class="sub">Control Center</p>
    <label for="pw" class="visually-hidden">Passwort</label>
    <input id="pw" type="password" placeholder="Passwort" autocomplete="current-password" required>
    <button type="submit" id="loginBtn">Anmelden</button>
    <p class="err" id="loginErr" role="alert"></p>
  </form>
</main>
<script src="/app.js"></script>
</body>
</html>`;

export const APP_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${BOT_NAME} — Control Center</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<canvas id="fx" aria-hidden="true"></canvas>

<div class="layout">
  <aside class="sidebar glass">
    <div class="brand">
      <span class="logo-dot" aria-hidden="true"></span>
      <span class="brand-name">${BOT_NAME}</span>
    </div>
    <nav id="nav" class="nav"></nav>
    <button class="ghost small" id="logoutBtn">Abmelden</button>
  </aside>

  <main class="content" id="content" tabindex="-1"></main>
</div>

<nav class="tabbar glass" id="tabbar" aria-label="Navigation"></nav>
<div class="toast" id="toast" role="status"></div>
<script src="/app.js"></script>
</body>
</html>`;

export const APP_CSS = `
:root{
  --bg:#05070d; --bg2:#0a0f1c;
  --glass:rgba(16,22,38,.55); --glass2:rgba(22,30,52,.5);
  --line:rgba(120,160,255,.14); --line-glow:rgba(0,229,208,.35);
  --text:#e8eefc; --muted:#8b96b3;
  --neon:#00e5d0; --neon-dim:rgba(0,229,208,.14);
  --warn:#ffb454; --bad:#ff5d7a; --ok:#37e08d;
  --radius:16px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:radial-gradient(1200px 700px at 80% -10%,#0d1730 0%,var(--bg) 55%) fixed,var(--bg);
  color:var(--text); min-height:100dvh; line-height:1.5;
}
#fx{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}

.glass{
  background:var(--glass);
  border:1px solid var(--line);
  border-radius:var(--radius);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  box-shadow:0 8px 32px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);
}

/* ── Login ─────────────────────────────── */
.login-wrap{min-height:100dvh;display:grid;place-items:center;padding:24px;position:relative;z-index:1}
.login-card{width:min(380px,100%);padding:38px 30px;text-align:center;animation:rise .5s ease both}
.login-card h1{font-size:1.7rem;letter-spacing:.01em;margin-top:14px}
.login-card .sub{color:var(--muted);margin-bottom:26px;font-size:.95rem}
.login-card input{
  width:100%;padding:13px 16px;border-radius:12px;border:1px solid var(--line);
  background:rgba(5,8,15,.6);color:var(--text);font-size:1rem;outline:none;
  transition:border-color .2s, box-shadow .2s;
}
.login-card input:focus{border-color:var(--neon);box-shadow:0 0 0 3px var(--neon-dim)}
.login-card button{margin-top:14px;width:100%}
.err{color:var(--bad);min-height:1.4em;margin-top:12px;font-size:.9rem}

.logo-dot{
  display:inline-block;width:14px;height:14px;border-radius:50%;
  background:var(--neon);box-shadow:0 0 14px var(--neon),0 0 40px rgba(0,229,208,.45);
  animation:pulse 2.6s ease-in-out infinite;
}

/* ── Layout ────────────────────────────── */
.layout{position:relative;z-index:1;display:flex;min-height:100dvh}
.sidebar{
  display:none;flex-direction:column;gap:8px;width:220px;margin:16px;padding:18px 14px;
  position:sticky;top:16px;height:calc(100dvh - 32px);
}
.brand{display:flex;align-items:center;gap:10px;padding:6px 8px 18px}
.brand-name{font-weight:700;letter-spacing:.02em}
.nav{display:flex;flex-direction:column;gap:4px;flex:1}
.nav a{
  display:flex;gap:10px;align-items:center;padding:11px 12px;border-radius:11px;
  color:var(--muted);text-decoration:none;font-size:.95rem;
  transition:background .18s,color .18s;
}
.nav a:hover{background:var(--glass2);color:var(--text)}
.nav a.active{background:var(--neon-dim);color:var(--neon);font-weight:600}

.content{flex:1;padding:18px 16px 96px;max-width:1060px;margin:0 auto;width:100%}
@media(min-width:900px){
  .sidebar{display:flex}
  .tabbar{display:none}
  .content{padding:26px 30px 40px}
}

/* Tab-Leiste (mobil) */
.tabbar{
  position:fixed;left:10px;right:10px;bottom:10px;z-index:5;
  display:flex;justify-content:space-around;padding:6px;
}
.tabbar a{
  flex:1;text-align:center;padding:8px 2px;border-radius:12px;color:var(--muted);
  text-decoration:none;font-size:.66rem;transition:background .18s,color .18s;
}
.tabbar a .ico{display:block;font-size:1.15rem;line-height:1.3}
.tabbar a.active{color:var(--neon);background:var(--neon-dim)}

/* ── Bausteine ─────────────────────────── */
h2.page-title{font-size:1.5rem;margin:8px 0 18px;letter-spacing:.01em}
.grid{display:grid;gap:12px}
.grid.cols2{grid-template-columns:repeat(2,1fr)}
@media(min-width:700px){.grid.cols4{grid-template-columns:repeat(4,1fr)}}
@media(max-width:699px){.grid.cols4{grid-template-columns:repeat(2,1fr)}}

.card{padding:18px;animation:rise .4s ease both}
.card h3{font-size:.8rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.stat{font-size:1.65rem;font-weight:700;transition:opacity .3s}
.stat small{font-size:.85rem;color:var(--muted);font-weight:500}

.hero{display:flex;align-items:center;gap:14px;padding:20px;margin-bottom:14px}
.status-dot{width:13px;height:13px;border-radius:50%;flex:none;background:var(--bad);transition:background .4s}
.status-dot.open{background:var(--ok);box-shadow:0 0 12px rgba(55,224,141,.7);animation:pulse 2.4s ease-in-out infinite}
.status-dot.connecting{background:var(--warn);animation:pulse 1.2s ease-in-out infinite}
.hero .h-title{font-weight:700;font-size:1.1rem}
.hero .h-sub{color:var(--muted);font-size:.87rem}

button,.btn{
  border:1px solid var(--line);background:linear-gradient(180deg,rgba(0,229,208,.16),rgba(0,229,208,.07));
  color:var(--neon);padding:11px 18px;border-radius:12px;font-size:.95rem;font-weight:600;
  cursor:pointer;transition:transform .12s,box-shadow .2s,background .2s;
}
button:hover{box-shadow:0 0 16px rgba(0,229,208,.25)}
button:active{transform:scale(.97)}
button.ghost{background:transparent;color:var(--muted)}
button.ghost:hover{color:var(--text);box-shadow:none}
button.danger{color:var(--bad);background:rgba(255,93,122,.08)}
button.small{padding:7px 12px;font-size:.82rem;border-radius:10px}
button:disabled{opacity:.45;cursor:not-allowed}

input[type=text],input[type=password],input[type=time],textarea,select{
  background:rgba(5,8,15,.6);border:1px solid var(--line);color:var(--text);
  border-radius:11px;padding:10px 13px;font-size:.95rem;outline:none;font-family:inherit;
  transition:border-color .2s;
}
input:focus,textarea:focus{border-color:var(--neon)}

.switch{position:relative;display:inline-block;width:46px;height:26px;flex:none}
.switch input{opacity:0;width:0;height:0}
.switch .sl{
  position:absolute;inset:0;border-radius:26px;background:rgba(120,160,255,.15);
  transition:background .2s;cursor:pointer;
}
.switch .sl:before{
  content:"";position:absolute;width:20px;height:20px;border-radius:50%;left:3px;top:3px;
  background:#c6d2ee;transition:transform .2s,background .2s;
}
.switch input:checked + .sl{background:rgba(0,229,208,.35)}
.switch input:checked + .sl:before{transform:translateX(20px);background:var(--neon);box-shadow:0 0 8px var(--neon)}

.row{display:flex;align-items:center;gap:12px}
.row.between{justify-content:space-between}
.list-item{padding:13px 16px;margin-bottom:9px}
.badge{font-size:.7rem;padding:3px 9px;border-radius:99px;font-weight:700;letter-spacing:.03em}
.badge.ok{color:var(--ok);background:rgba(55,224,141,.12)}
.badge.bad{color:var(--bad);background:rgba(255,93,122,.12)}
.badge.warn{color:var(--warn);background:rgba(255,180,84,.12)}
.muted{color:var(--muted)} .sm{font-size:.85rem}
.search{width:100%;margin-bottom:12px}

.qr-box{display:grid;place-items:center;padding:30px;text-align:center}
.qr-box img{width:min(320px,80vw);border-radius:14px;background:#fff;padding:12px}

.log-line{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem;padding:7px 10px;border-radius:8px;margin-bottom:5px;word-break:break-word}
.log-line.error{background:rgba(255,93,122,.08);color:#ffb3c2}
.log-line.warn{background:rgba(255,180,84,.08);color:#ffd9a3}
.log-line.info{background:rgba(120,160,255,.06);color:var(--muted)}

.spark{width:100%;height:56px;display:block}
.spark polyline{fill:none;stroke:var(--neon);stroke-width:2;stroke-linecap:round}
.spark .fill{fill:url(#sparkfill);stroke:none}

.toast{
  position:fixed;bottom:86px;left:50%;transform:translate(-50%,20px);z-index:20;
  background:var(--glass2);border:1px solid var(--line-glow);border-radius:12px;
  padding:11px 20px;font-size:.9rem;opacity:0;pointer-events:none;
  transition:opacity .25s,transform .25s;backdrop-filter:blur(12px);
}
.toast.show{opacity:1;transform:translate(-50%,0)}
@media(min-width:900px){.toast{bottom:26px}}

.detail-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.member-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;margin-bottom:7px}

@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@media(prefers-reduced-motion:reduce){
  *,*:before,*:after{animation:none!important;transition:none!important}
}
`;

export const APP_JS = `
(function(){
'use strict';

/* ── Hintergrund-Effekt: subtiles Neon-Grid (pausiert bei hidden tab) ── */
var fx = document.getElementById('fx');
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (fx && !reduced) {
  var g = fx.getContext('2d'); var raf = 0; var t = 0;
  function size(){ fx.width = innerWidth; fx.height = Math.min(innerHeight, 900); }
  function draw(){
    t += 0.004;
    g.clearRect(0,0,fx.width,fx.height);
    var step = 54;
    for (var x = 0; x < fx.width; x += step) {
      for (var y = 0; y < fx.height; y += step) {
        var w = Math.sin(t + x*0.012 + y*0.017);
        var a = 0.028 + 0.028 * w;
        g.fillStyle = 'rgba(0,229,208,' + a.toFixed(3) + ')';
        g.fillRect(x, y, 1.6, 1.6);
      }
    }
    raf = requestAnimationFrame(draw);
  }
  size(); addEventListener('resize', size); draw();
  document.addEventListener('visibilitychange', function(){
    if (document.hidden) cancelAnimationFrame(raf); else draw();
  });
}

/* ── Login-Seite? ── */
var loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    var btn = document.getElementById('loginBtn');
    var err = document.getElementById('loginErr');
    btn.disabled = true; err.textContent = '';
    fetch('/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password: document.getElementById('pw').value })
    }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
      .then(function(res){
        if (res.ok) { location.href = '/'; }
        else { err.textContent = res.j.error || 'Login fehlgeschlagen.'; btn.disabled = false; }
      })
      .catch(function(){ err.textContent = 'Keine Verbindung zum Bot.'; btn.disabled = false; });
  });
  return; // Rest ist nur fürs Panel
}

/* ── Panel-App ── */
var content = document.getElementById('content');
if (!content) return;

var TABS = [
  { id:'home', label:'Übersicht', ico:'📊' },
  { id:'qr', label:'QR', ico:'🔗' },
  { id:'groups', label:'Gruppen', ico:'👥' },
  { id:'commands', label:'Befehle', ico:'⌘' },
  { id:'mod', label:'Moderation', ico:'🛡️' },
  { id:'logs', label:'Logs', ico:'📜' },
  { id:'settings', label:'Extras', ico:'⚙️' }
];
var current = location.pathname === '/qr' ? 'qr' : (location.hash.replace('#','') || 'home');
var status = null;

function h(tag, attrs, children){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style') el.style.cssText = attrs[k]; // CSSOM statt Attribut (CSP-konform)
    else if (k.slice(0,2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
    else el.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function(c){
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
function toast(msg){
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}
function api(path, opts){
  opts = opts || {};
  if (opts.body) { opts.headers = { 'Content-Type':'application/json' }; opts.body = JSON.stringify(opts.body); }
  return fetch('/api' + path, opts).then(function(r){
    if (r.status === 401) { location.href = '/login'; throw new Error('auth'); }
    return r.json().then(function(j){ if (!r.ok) throw new Error(j.error || 'Fehler'); return j; });
  });
}
function fmtUptime(ms){
  var s = Math.floor(ms/1000), d = Math.floor(s/86400), hh = Math.floor(s%86400/3600), m = Math.floor(s%3600/60);
  return d > 0 ? d + ' T ' + hh + ' Std' : hh > 0 ? hh + ' Std ' + m + ' Min' : m + ' Min';
}
function connLabel(st){
  if (!st) return ['connecting','Verbinde …'];
  if (st.stopped) return ['bad','Gestoppt: ' + (st.stopReason || 'manuell')];
  if (st.connection === 'open') return ['open','Verbunden & wach'];
  if (st.qrAvailable) return ['connecting','QR-Code scannen (Tab „QR")'];
  return ['connecting','Verbinde …'];
}

/* ── Navigation ── */
function renderNav(){
  ['nav','tabbar'].forEach(function(id){
    var box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = '';
    TABS.forEach(function(t){
      var a = h('a', { href:'#' + t.id, class: t.id === current ? 'active' : '' }, [
        h('span', { class:'ico' }, [t.ico]), (id === 'tabbar' ? t.label : ' ' + t.label)
      ]);
      box.appendChild(a);
    });
  });
}
addEventListener('hashchange', function(){
  current = location.hash.replace('#','') || 'home';
  render();
});
var logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', function(){
  fetch('/logout', { method:'POST' }).then(function(){ location.href = '/login'; });
});

/* ── Live-Status via SSE (Fallback: Polling) ── */
function applyStatus(st){
  status = st;
  if (current === 'home') updateHome();
  if (current === 'qr') loadQr();
}
try {
  var es = new EventSource('/api/events');
  es.onmessage = function(ev){ try { applyStatus(JSON.parse(ev.data)); } catch(e){} };
  es.onerror = function(){ /* Browser reconnectet selbst */ };
} catch(e) {
  setInterval(function(){ api('/status').then(applyStatus).catch(function(){}); }, 4000);
}
api('/status').then(applyStatus).catch(function(){});

/* ── Seiten ── */
function render(){
  renderNav();
  content.innerHTML = '';
  content.focus({ preventScroll:true });
  if (current === 'home') return renderHome();
  if (current === 'qr') return renderQr();
  if (current === 'groups') return renderGroups();
  if (current === 'commands') return renderCommands();
  if (current === 'mod') return renderMod();
  if (current === 'logs') return renderLogs();
  if (current === 'settings') return renderSettings();
  current = 'home'; renderHome();
}

/* Übersicht */
function renderHome(){
  content.appendChild(h('h2', { class:'page-title' }, ['Übersicht']));
  var hero = h('div', { class:'glass hero' }, [
    h('span', { class:'status-dot', id:'sDot' }),
    h('div', {}, [
      h('div', { class:'h-title', id:'sTitle' }, ['Verbinde …']),
      h('div', { class:'h-sub', id:'sSub' }, ['—'])
    ])
  ]);
  content.appendChild(hero);
  var grid = h('div', { class:'grid cols4' }, [
    statCard('Gruppen', 'stGroups'),
    statCard('Gesendet heute', 'stSent'),
    statCard('Befehle heute', 'stCmds'),
    statCard('KI heute', 'stAi')
  ]);
  content.appendChild(grid);
  var act = h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['Aktivität (letzte 4 Std)']),
    h('div', { id:'sparkBox' })
  ]);
  content.appendChild(act);
  updateHome();
}
function statCard(title, id){
  return h('div', { class:'glass card' }, [ h('h3', {}, [title]), h('div', { class:'stat', id:id }, ['—']) ]);
}
function setStat(id, text){
  var el = document.getElementById(id);
  if (!el || el.textContent === String(text)) return;
  el.style.opacity = '0.35';
  setTimeout(function(){ el.textContent = text; el.style.opacity = '1'; }, 140);
}
function updateHome(){
  if (!status) return;
  var dot = document.getElementById('sDot');
  if (!dot) return;
  var cl = connLabel(status);
  dot.className = 'status-dot ' + (cl[0] === 'open' ? 'open' : cl[0] === 'bad' ? '' : 'connecting');
  document.getElementById('sTitle').textContent = cl[1];
  document.getElementById('sSub').textContent =
    'Uptime ' + fmtUptime(status.uptimeMs) + ' · Warteschlange ' + status.queue;
  setStat('stGroups', status.groups == null ? '…' : status.groups);
  setStat('stSent', status.sentToday);
  setStat('stCmds', status.commandsToday);
  setStat('stAi', status.ai.used + ' / ' + status.ai.limit);
  drawSpark(status.activity || []);
}
function drawSpark(data){
  var box = document.getElementById('sparkBox');
  if (!box) return;
  var w = 600, hh = 56, max = Math.max.apply(null, data.concat([1]));
  var pts = data.map(function(v, i){
    return (i * (w / (data.length - 1 || 1))).toFixed(1) + ',' + (hh - 4 - (v / max) * (hh - 10)).toFixed(1);
  }).join(' ');
  box.innerHTML =
    '<svg class="spark" viewBox="0 0 ' + w + ' ' + hh + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="rgba(0,229,208,.28)"/><stop offset="1" stop-color="rgba(0,229,208,0)"/>' +
    '</linearGradient></defs>' +
    '<polygon class="fill" points="0,' + hh + ' ' + pts + ' ' + w + ',' + hh + '"/>' +
    '<polyline points="' + pts + '"/></svg>';
}

/* QR */
function renderQr(){
  content.appendChild(h('h2', { class:'page-title' }, ['Verbindung / QR']));
  content.appendChild(h('div', { class:'glass qr-box', id:'qrBox' }, ['Lade …']));
  loadQr();
}
function loadQr(){
  var box = document.getElementById('qrBox');
  if (!box) return;
  api('/qr').then(function(res){
    box.innerHTML = '';
    if (res.connection === 'open') {
      box.appendChild(h('div', {}, [
        h('div', { style:'font-size:3rem' }, ['✅']),
        h('div', { class:'h-title' }, ['Bot ist online']),
        h('p', { class:'muted sm' }, ['Session aktiv — kein QR-Code nötig.'])
      ]));
    } else if (res.qr) {
      var img = h('img', { alt:'WhatsApp QR-Code', src:res.qr });
      box.appendChild(img);
      box.appendChild(h('p', { class:'muted sm', style:'margin-top:12px' },
        ['Mit WhatsApp scannen: Einstellungen → Verknüpfte Geräte. Aktualisiert sich automatisch.']));
    } else {
      box.appendChild(h('p', { class:'muted' }, ['Noch kein QR-Code — der Bot verbindet sich gerade …']));
    }
  }).catch(function(){ box.textContent = 'QR-Status konnte nicht geladen werden.'; });
}

/* Gruppen */
function renderGroups(){
  content.appendChild(h('h2', { class:'page-title' }, ['Gruppen']));
  var search = h('input', { type:'text', class:'search', placeholder:'Gruppe suchen …',
    oninput: function(e){ drawGroupList(e.target.value); } });
  content.appendChild(search);
  content.appendChild(h('div', { id:'groupList' }, ['Lade …']));
  api('/groups').then(function(res){ window._groups = res.groups; drawGroupList(''); })
    .catch(function(e){ document.getElementById('groupList').textContent = e.message; });
}
function drawGroupList(filter){
  var box = document.getElementById('groupList');
  if (!box) return;
  var groups = (window._groups || []).filter(function(gr){
    return gr.name.toLowerCase().indexOf((filter || '').toLowerCase()) !== -1;
  });
  box.innerHTML = '';
  if (!groups.length) return box.appendChild(h('p', { class:'muted' }, ['Keine Gruppen gefunden.']));
  groups.forEach(function(gr){
    box.appendChild(h('div', { class:'glass list-item' }, [
      h('div', { class:'row between', style:'cursor:pointer', onclick:function(){ renderGroupDetail(gr); } }, [
        h('div', {}, [
          h('div', {}, [gr.name]),
          h('div', { class:'muted sm' }, [gr.members + ' Mitglieder'])
        ]),
        h('span', { class:'badge ' + (gr.botAdmin ? 'ok' : 'bad') }, [gr.botAdmin ? 'BOT ADMIN' : 'KEIN ADMIN'])
      ])
    ]));
  });
}
function renderGroupDetail(gr){
  content.innerHTML = '';
  content.appendChild(h('div', { class:'detail-head' }, [
    h('button', { class:'ghost small', onclick:function(){ render(); } }, ['← Zurück']),
    h('h2', { class:'page-title', style:'margin:0' }, [gr.name])
  ]));

  function toggleRow(label, field, value){
    var input = h('input', { type:'checkbox' });
    input.checked = !!value;
    input.addEventListener('change', function(){
      api('/groups/' + encodeURIComponent(gr.jid) + '/settings', { method:'POST', body:{ field:field, value:input.checked } })
        .then(function(){ toast('✅ Gespeichert'); gr[field] = input.checked; })
        .catch(function(e){ toast('⚠️ ' + e.message); input.checked = !input.checked; });
    });
    return h('div', { class:'glass list-item row between' }, [
      h('span', {}, [label]),
      h('label', { class:'switch' }, [input, h('span', { class:'sl' })])
    ]);
  }
  content.appendChild(toggleRow('Bot in dieser Gruppe aktiv', 'enabled', gr.enabled));
  content.appendChild(toggleRow('Anti-Link', 'antilink', gr.antilink));
  content.appendChild(toggleRow('Anti-Spam', 'antispam', gr.antispam));
  content.appendChild(toggleRow('Anti-Raid', 'antiraid', gr.antiraid));

  var nmEnabled = h('input', { type:'checkbox' }); nmEnabled.checked = gr.nightmode.enabled;
  var nmStart = h('input', { type:'time', value:gr.nightmode.start });
  var nmEnd = h('input', { type:'time', value:gr.nightmode.end });
  var nmSave = h('button', { class:'small', onclick:function(){
    api('/groups/' + encodeURIComponent(gr.jid) + '/settings', { method:'POST',
      body:{ field:'nightmode', value:{ enabled:nmEnabled.checked, start:nmStart.value, end:nmEnd.value } } })
      .then(function(){ toast('✅ Nachtmodus gespeichert'); })
      .catch(function(e){ toast('⚠️ ' + e.message); });
  } }, ['Speichern']);
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['🌙 Nachtmodus']),
    h('div', { class:'row', style:'flex-wrap:wrap;margin-top:8px' }, [
      h('label', { class:'switch' }, [nmEnabled, h('span', { class:'sl' })]),
      nmStart, h('span', { class:'muted' }, ['bis']), nmEnd, nmSave
    ])
  ]));

  var mBox = h('div', { style:'margin-top:14px' }, [h('p', { class:'muted' }, ['Mitglieder laden …'])]);
  content.appendChild(mBox);
  api('/groups/' + encodeURIComponent(gr.jid) + '/members').then(function(res){
    mBox.innerHTML = '';
    mBox.appendChild(h('h3', { class:'muted', style:'margin-bottom:10px' }, ['👥 Mitglieder (' + res.members.length + ')']));
    res.members.forEach(function(m){
      var label = (m.pn || m.id).split('@')[0];
      mBox.appendChild(h('div', { class:'glass member-row' }, [
        h('div', {}, [
          h('span', {}, ['+' + label + ' ']),
          m.admin ? h('span', { class:'badge ok' }, [m.admin === 'superadmin' ? 'INHABER' : 'ADMIN']) : null
        ]),
        m.admin ? h('span') : h('div', { class:'row' }, [
          h('button', { class:'small ghost', onclick:function(){ memberAction(gr.jid, m, 'kick'); } }, ['👢 Kick']),
          h('button', { class:'small danger', onclick:function(){ memberAction(gr.jid, m, 'ban'); } }, ['⛔ Ban'])
        ])
      ]));
    });
  }).catch(function(e){ mBox.innerHTML = ''; mBox.appendChild(h('p', { class:'muted' }, [e.message])); });
}
function memberAction(jid, member, action){
  var label = (member.pn || member.id).split('@')[0];
  if (!confirm((action === 'kick' ? 'Wirklich entfernen: +' : 'Wirklich BANNEN: +') + label + '?')) return;
  api('/groups/' + encodeURIComponent(jid) + '/' + action, { method:'POST', body:{ user: member.pn || member.id } })
    .then(function(res){ toast(res.ok ? '✅ Erledigt' : '⚠️ Hat nicht geklappt (bin ich Admin?)'); })
    .catch(function(e){ toast('⚠️ ' + e.message); });
}

/* Befehle */
function renderCommands(){
  content.appendChild(h('h2', { class:'page-title' }, ['Befehle']));
  var box = h('div', { id:'cmdBox' }, ['Lade …']);
  content.appendChild(box);
  api('/commands').then(function(res){
    box.innerHTML = '';

    var groups = { community:'👥 Community', tools:'🧰 Tools', games:'🎮 Spiele', admin:'🛡️ Admin' };
    Object.keys(groups).forEach(function(gk){
      var cmds = res.commands.filter(function(c){ return c.group === gk; });
      if (!cmds.length) return;
      box.appendChild(h('h3', { class:'muted', style:'margin:14px 0 8px' }, [groups[gk]]));
      cmds.forEach(function(c){
        var input = h('input', { type:'checkbox' });
        input.checked = c.enabled;
        input.addEventListener('change', function(){
          api('/commands/' + c.name, { method:'POST', body:{ enabled: input.checked } })
            .then(function(){ toast('✅ !' + c.name + (input.checked ? ' aktiviert' : ' deaktiviert')); })
            .catch(function(e){ toast('⚠️ ' + e.message); input.checked = !input.checked; });
        });
        box.appendChild(h('div', { class:'glass list-item row between' }, [
          h('div', {}, [ h('div', {}, ['!' + c.name]), h('div', { class:'muted sm' }, [c.desc]) ]),
          h('label', { class:'switch' }, [input, h('span', { class:'sl' })])
        ]));
      });
    });

    box.appendChild(h('h3', { class:'muted', style:'margin:18px 0 8px' }, ['✨ Eigene Befehle & FAQ']));
    var nName = h('input', { type:'text', placeholder:'name' });
    var nReply = h('input', { type:'text', placeholder:'Antwort', style:'flex:1' });
    var nType = h('select', {}, [ h('option', { value:'cmd' }, ['Befehl']), h('option', { value:'faq' }, ['FAQ']) ]);
    var addBtn = h('button', { class:'small', onclick:function(){
      api('/custom', { method:'POST', body:{ type:nType.value === 'faq' ? 'faq' : 'cmd', name:nName.value, reply:nReply.value } })
        .then(function(){ toast('✅ Gespeichert'); render(); })
        .catch(function(e){ toast('⚠️ ' + e.message); });
    } }, ['Anlegen']);
    box.appendChild(h('div', { class:'glass card' }, [
      h('div', { class:'row', style:'flex-wrap:wrap' }, [nType, nName, nReply, addBtn])
    ]));
    [['cmd', res.custom], ['faq', res.faqs]].forEach(function(pair){
      (pair[1] || []).forEach(function(name){
        box.appendChild(h('div', { class:'glass list-item row between' }, [
          h('span', {}, ['!' + name + (pair[0] === 'faq' ? '  (FAQ)' : '')]),
          h('button', { class:'small danger', onclick:function(){
            api('/custom/' + pair[0] + '/' + encodeURIComponent(name), { method:'DELETE' })
              .then(function(){ toast('✅ Gelöscht'); render(); })
              .catch(function(e){ toast('⚠️ ' + e.message); });
          } }, ['Löschen'])
        ]));
      });
    });
  }).catch(function(e){ box.textContent = e.message; });
}

/* Moderation */
function renderMod(){
  content.appendChild(h('h2', { class:'page-title' }, ['Moderation']));
  var box = h('div', {}, ['Lade …']);
  content.appendChild(box);
  api('/moderation').then(function(res){
    box.innerHTML = '';
    function section(title, rows, type, render){
      box.appendChild(h('h3', { class:'muted', style:'margin:14px 0 8px' }, [title + ' (' + rows.length + ')']));
      if (!rows.length) box.appendChild(h('p', { class:'muted sm' }, ['Nichts offen. ✅']));
      rows.forEach(function(r){
        box.appendChild(h('div', { class:'glass list-item row between' }, [
          h('div', { class:'sm' }, render(r)),
          h('button', { class:'small ghost', onclick:function(){
            api('/moderation/clear', { method:'POST', body:{ type:type, group:r.group_jid, user:r.user_jid } })
              .then(function(){ toast('✅ Aufgehoben'); content.innerHTML = ''; renderMod(); })
              .catch(function(e){ toast('⚠️ ' + e.message); });
          } }, ['Aufheben'])
        ]));
      });
    }
    function who(r){ return '+' + String(r.user_jid).split('@')[0]; }
    section('⚠️ Aktive Verwarnungen', res.warns, 'warn', function(r){
      return [ h('div', {}, [who(r)]), h('div', { class:'muted' }, [r.reason || '']) ];
    });
    section('🔇 Aktive Mutes', res.mutes, 'mute', function(r){
      return [ h('div', {}, [who(r)]), h('div', { class:'muted' }, ['bis ' + new Date(Number(r.until)).toLocaleString('de-DE')]) ];
    });
    section('⛔ Bans', res.bans, 'ban', function(r){
      return [ h('div', {}, [who(r)]), h('div', { class:'muted' }, [r.reason || '']) ];
    });
    box.appendChild(h('h3', { class:'muted', style:'margin:14px 0 8px' }, ['📋 Audit-Log']));
    res.audit.forEach(function(a){
      box.appendChild(h('div', { class:'log-line info' }, [
        new Date(Number(a.created_at)).toLocaleString('de-DE') + ' · ' + a.action +
        (a.target ? ' → +' + String(a.target).split('@')[0] : '') + (a.detail ? ' · ' + a.detail : '')
      ]));
    });
  }).catch(function(e){ box.textContent = e.message; });
}

/* Logs */
function renderLogs(){
  content.appendChild(h('h2', { class:'page-title' }, ['Logs']));
  var search = h('input', { type:'text', class:'search', placeholder:'Filtern …', oninput:function(e){ draw(e.target.value); } });
  content.appendChild(search);
  var box = h('div', { id:'logBox' }, ['Lade …']);
  content.appendChild(box);
  var logs = [];
  function draw(filter){
    box.innerHTML = '';
    var shown = logs.filter(function(l){ return l.msg.toLowerCase().indexOf((filter || '').toLowerCase()) !== -1; });
    if (!shown.length) return box.appendChild(h('p', { class:'muted' }, ['Keine Einträge. ✅']));
    shown.slice().reverse().forEach(function(l){
      box.appendChild(h('div', { class:'log-line ' + l.level }, [
        new Date(l.ts).toLocaleTimeString('de-DE') + '  ' + l.msg
      ]));
    });
  }
  api('/logs').then(function(res){ logs = res.logs; draw(search.value); }).catch(function(e){ box.textContent = e.message; });
}

/* Einstellungen */
function renderSettings(){
  content.appendChild(h('h2', { class:'page-title' }, ['Einstellungen']));

  content.appendChild(h('div', { class:'glass card' }, [
    h('h3', {}, ['🔄 Neustart']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Startet den Bot-Prozess neu (2 Min Cooldown). Die Session bleibt erhalten.']),
    h('button', { onclick:function(){
      if (!confirm('Bot wirklich neu starten?')) return;
      api('/restart', { method:'POST' }).then(function(r){ toast('🔄 ' + r.message); })
        .catch(function(e){ toast('⚠️ ' + e.message); });
    } }, ['Jetzt neu starten'])
  ]));

  var fileInput = h('input', { type:'file', accept:'application/json', style:'display:none' });
  fileInput.addEventListener('change', function(){
    var f = fileInput.files[0];
    if (!f) return;
    f.text().then(function(txt){
      var parsed = JSON.parse(txt);
      return api('/config/import', { method:'POST', body:{ data: parsed.data || parsed } });
    }).then(function(r){ toast('✅ Import ok (' + r.imported + ' Zeilen)'); })
      .catch(function(e){ toast('⚠️ Import fehlgeschlagen: ' + e.message); });
  });
  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['💾 Konfiguration']),
    h('p', { class:'muted sm', style:'margin-bottom:10px' }, ['Gruppen-Einstellungen, Custom-Befehle, Blacklists & Toggles als JSON sichern oder einspielen.']),
    h('div', { class:'row' }, [
      h('button', { class:'small', onclick:function(){ location.href = '/api/config/export'; } }, ['⬇️ Export']),
      h('button', { class:'small ghost', onclick:function(){ fileInput.click(); } }, ['⬆️ Import']),
      fileInput
    ])
  ]));

  content.appendChild(h('div', { class:'glass card', style:'margin-top:12px' }, [
    h('h3', {}, ['ℹ️ Hinweise']),
    h('p', { class:'muted sm' }, [
      'Keep-Alive: UptimeRobot muss SELF_URL/health alle 5 Minuten anpingen, sonst schläft der Free-Tier ein. ' +
      'Gruppen aktivieren/deaktivieren geht im Tab „Gruppen".'
    ])
  ]));
}

renderNav();
render();
})();
`;
