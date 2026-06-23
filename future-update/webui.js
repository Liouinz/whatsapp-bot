// 🎨 WEB-UI 6.0 – NICHT AKTIV
// Wird von index.js NICHT geladen. Liefert ein komplett neues, cleanes Design
// (Apple/Samsung-Stil) mit Animationen, Glas-Effekt und Hell/Dunkel-Umschaltung.
// Einbau später gemäß INTEGRATION.md: die HTML-erzeugenden Funktionen in index.js
// nach und nach durch webui.pageShell(...) ersetzen.

'use strict';

// ====================================================================
// Globales Stylesheet – modern, animiert, responsiv
// ====================================================================
const STYLES = `
:root{
  --bg:#0a0c12; --bg2:#11141d; --card:rgba(255,255,255,.05); --card-brd:rgba(255,255,255,.10);
  --txt:#eef1f7; --muted:#9aa3b2; --accent:#4f8cff; --accent2:#7c5cff;
  --good:#34d399; --warn:#fbbf24; --bad:#f87171; --radius:20px;
}
:root.light{
  --bg:#f3f5fa; --bg2:#ffffff; --card:rgba(255,255,255,.75); --card-brd:rgba(0,0,0,.07);
  --txt:#10131a; --muted:#5b6472; --accent:#2f6bff;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{scroll-behavior:smooth}
body{
  margin:0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif;
  color:var(--txt);background:
    radial-gradient(1200px 600px at 10% -10%,rgba(124,92,255,.18),transparent 60%),
    radial-gradient(1000px 700px at 110% 10%,rgba(79,140,255,.16),transparent 55%),
    var(--bg);
  min-height:100vh;line-height:1.5;
  animation:fadeIn .5s ease;
}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 64px}
.topbar{
  position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;
  padding:12px 16px;margin:-20px -16px 20px;backdrop-filter:blur(16px);
  background:linear-gradient(180deg,rgba(10,12,18,.85),rgba(10,12,18,.4));
  border-bottom:1px solid var(--card-brd);
}
.brand{font-weight:700;font-size:1.15rem;letter-spacing:.2px}
.brand .dot{color:var(--good);animation:pulse 2s infinite}
.nav{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.nav a{
  color:var(--muted);text-decoration:none;padding:8px 14px;border-radius:999px;
  font-size:.9rem;transition:.2s;border:1px solid transparent;
}
.nav a:hover{color:var(--txt);background:var(--card)}
.nav a.active{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.card{
  background:var(--card);border:1px solid var(--card-brd);border-radius:var(--radius);
  padding:18px;backdrop-filter:blur(12px);animation:rise .5s ease both;
  transition:transform .2s,box-shadow .2s;
}
.card:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.35)}
.stat .k{font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.stat .v{font-size:1.7rem;font-weight:700;margin-top:6px}
.section-title{font-size:1.3rem;font-weight:700;margin:28px 4px 12px}
.btn{
  display:inline-flex;align-items:center;gap:8px;cursor:pointer;border:none;
  padding:11px 18px;border-radius:14px;font-weight:600;font-size:.95rem;color:#fff;
  background:linear-gradient(135deg,var(--accent),var(--accent2));transition:.2s;
}
.btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
.btn.ghost{background:var(--card);color:var(--txt);border:1px solid var(--card-brd)}
.btn.danger{background:linear-gradient(135deg,#f43f5e,#b91c1c)}
.switch{position:relative;display:inline-block;width:50px;height:28px}
.switch input{opacity:0;width:0;height:0}
.slider{position:absolute;inset:0;background:#3a3f4b;border-radius:999px;transition:.3s;cursor:pointer}
.slider:before{content:"";position:absolute;height:22px;width:22px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.3s}
input:checked+.slider{background:linear-gradient(135deg,var(--accent),var(--accent2))}
input:checked+.slider:before{transform:translateX(22px)}
.toggle-theme{cursor:pointer;background:var(--card);border:1px solid var(--card-brd);color:var(--txt);border-radius:999px;padding:8px 12px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.78rem;font-weight:600}
.badge.good{background:rgba(52,211,153,.16);color:var(--good)}
.badge.warn{background:rgba(251,191,36,.16);color:var(--warn)}
.badge.bad{background:rgba(248,113,113,.16);color:var(--bad)}
@media(max-width:520px){.stat .v{font-size:1.4rem}.nav a{padding:7px 11px}}
`;

const SCRIPT = `
(function(){
  var key='wa-theme';
  var saved=localStorage.getItem(key);
  if(saved==='light')document.documentElement.classList.add('light');
  window.toggleTheme=function(){
    document.documentElement.classList.toggle('light');
    localStorage.setItem(key,document.documentElement.classList.contains('light')?'light':'dark');
  };
})();
`;

// ====================================================================
// Bausteine
// ====================================================================
function navBar(active, keyParam) {
  const items = [
    ['dashboard', '📊 Dashboard'], ['groups', '⚙️ Gruppen'], ['communities', '🏘️ Communities'],
    ['commands', '📖 Befehle'], ['economy', '🏠 Wirtschaft'], ['anliegen', '📨 Anliegen'],
  ];
  const links = items.map(([id, label]) =>
    `<a href="/${id}${keyParam}" class="${active === id ? 'active' : ''}">${label}</a>`).join('');
  return `<div class="topbar">
    <div class="brand">WhatsApp-Bot <span class="dot">●</span></div>
    <div class="nav">${links}<button class="toggle-theme" onclick="toggleTheme()">🌗</button></div>
  </div>`;
}

function statCard(key, value, opts = {}) {
  const badge = opts.badge ? `<span class="badge ${opts.badgeType || 'good'}">${opts.badge}</span>` : '';
  return `<div class="card stat"><div class="k">${key}</div><div class="v">${value} ${badge}</div></div>`;
}

function statGrid(cards) {
  return `<div class="grid">${cards.join('')}</div>`;
}

function button(label, opts = {}) {
  const cls = opts.danger ? 'btn danger' : opts.ghost ? 'btn ghost' : 'btn';
  if (opts.href) return `<a class="${cls}" href="${opts.href}">${label}</a>`;
  return `<button class="${cls}" ${opts.onclick ? `onclick="${opts.onclick}"` : ''}>${label}</button>`;
}

// Komplette Seite zusammensetzen.
function pageShell(title, bodyHtml, opts = {}) {
  const { active = 'dashboard', keyParam = '' } = opts;
  return `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${STYLES}</style></head>
<body><div class="wrap">${navBar(active, keyParam)}${bodyHtml}</div>
<script>${SCRIPT}</script></body></html>`;
}

module.exports = { STYLES, SCRIPT, navBar, statCard, statGrid, button, pageShell };
