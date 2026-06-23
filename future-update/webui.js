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

// ====================================================================
// Weitere Komponenten
// ====================================================================
function sectionTitle(text) { return `<div class="section-title">${text}</div>`; }

function table(headers, rows) {
  const head = headers.map((h) => `<th style="text-align:left;padding:10px 12px;color:var(--muted);font-size:.8rem">${h}</th>`).join('');
  const body = rows.map((r) =>
    `<tr style="border-top:1px solid var(--card-brd)">${r.map((c) => `<td style="padding:10px 12px">${c}</td>`).join('')}</tr>`).join('');
  return `<div class="card" style="padding:6px"><table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function formRow(label, inputHtml) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid var(--card-brd)">
    <span style="color:var(--txt)">${label}</span><span>${inputHtml}</span></div>`;
}

function toggleSwitch(name, checked) {
  return `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="slider"></span></label>`;
}

function progressBar(value, max, label = '') {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return `<div style="margin:6px 0">
    ${label ? `<div style="font-size:.8rem;color:var(--muted);margin-bottom:4px">${label} – ${value}/${max}</div>` : ''}
    <div style="height:10px;background:var(--card-brd);border-radius:999px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:linear-gradient(135deg,var(--accent),var(--accent2));transition:width .6s ease"></div>
    </div></div>`;
}

function groupCard(g, keyParam = '') {
  const status = g.active ? '<span class="badge good">aktiv</span>' : '<span class="badge bad">inaktiv</span>';
  return `<div class="card">
    <div style="font-weight:600;font-size:1.05rem;margin-bottom:6px">${escapeHtml(g.subject || g.id)}</div>
    <div style="color:var(--muted);font-size:.85rem;margin-bottom:10px">${g.size || 0} Mitglieder ${status}</div>
    ${button('Verwalten', { href: `/groups/${encodeURIComponent(g.id)}${keyParam}`, ghost: true })}
  </div>`;
}

// kleine HTML-Escape-Hilfe (Module ist eigenständig)
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ====================================================================
// Fertige Seiten-Renderer (später 1:1 in index.js-Routen einsetzbar)
// ====================================================================
function renderLogin(keyParam = '', error = '') {
  const body = `<div style="max-width:380px;margin:10vh auto 0">
    <div class="card" style="text-align:center;animation:rise .5s ease both">
      <div style="font-size:2.4rem;margin-bottom:6px">🤖</div>
      <div class="section-title" style="margin:0 0 4px">WhatsApp-Bot</div>
      <p style="color:var(--muted);margin-top:0">Bitte Passwort eingeben</p>
      ${error ? `<p class="badge bad">${escapeHtml(error)}</p>` : ''}
      <form method="GET" action="/dashboard" style="margin-top:14px">
        <input name="key" type="password" placeholder="Passwort"
          style="width:100%;padding:12px 14px;border-radius:14px;border:1px solid var(--card-brd);background:var(--card);color:var(--txt);margin-bottom:12px">
        <button class="btn" style="width:100%;justify-content:center">Anmelden</button>
      </form>
    </div></div>`;
  return pageShell('Login', body, { active: '', keyParam });
}

function renderDashboard(stats, keyParam = '') {
  // stats: [{k, v, badge?, badgeType?}]
  const cards = stats.map((s) => statCard(s.k, s.v, { badge: s.badge, badgeType: s.badgeType }));
  const body = `${sectionTitle('📊 Übersicht')}${statGrid(cards)}`;
  return pageShell('Dashboard', body, { active: 'dashboard', keyParam });
}

function renderGroups(groups, keyParam = '') {
  const cards = groups.map((g) => groupCard(g, keyParam)).join('');
  const body = `${sectionTitle('⚙️ Gruppen')}<div class="grid">${cards}</div>`;
  return pageShell('Gruppen', body, { active: 'groups', keyParam });
}

function renderEconomyBoard(rows, keyParam = '') {
  // rows: [{rank, name, houses, worth}]
  const medals = ['🥇', '🥈', '🥉'];
  const trows = rows.map((r, i) => [medals[i] || `${i + 1}.`, escapeHtml(r.name), r.houses, r.worth]);
  const body = `${sectionTitle('🏆 Reichste Spieler')}${table(['#', 'Spieler', 'Häuser', 'Vermögen'], trows)}`;
  return pageShell('Wirtschaft', body, { active: 'economy', keyParam });
}

function renderSettings(settings, keyParam = '') {
  const rows = settings.map((s) => formRow(s.label, toggleSwitch(s.name, s.checked))).join('');
  const body = `${sectionTitle('🛠️ Einstellungen')}
    <form method="POST" action="/settings${keyParam}"><div class="card">${rows}</div>
    <div style="margin-top:14px">${button('Speichern')}</div></form>`;
  return pageShell('Einstellungen', body, { active: 'settings', keyParam });
}

// ====================================================================
// Spieler-Profil-Seite
// ====================================================================
function renderPlayerProfile(player, keyParam = '') {
  // player: { name, level, xp, levelSpan, prestige, cash, bank, houses, achievements, items, stats }
  const levelPct = Math.round((player.xp / Math.max(1, player.levelSpan)) * 100);
  const topStats = [
    statCard('Level', `${player.level} <span style="font-size:.9rem;color:var(--muted)">✨${player.prestige}</span>`),
    statCard('Bargeld', escapeHtml(player.cash)),
    statCard('Bank', escapeHtml(player.bank)),
    statCard('Häuser', player.houses),
  ];
  const achHtml = (player.achievements || []).slice(0, 12).map((a) =>
    `<div class="card" style="padding:12px;display:flex;gap:10px;align-items:center">
      <div style="font-size:1.4rem">${a.name.split(' ')[0]}</div>
      <div><div style="font-weight:600;font-size:.9rem">${escapeHtml(a.name)}</div>
      <div style="color:var(--muted);font-size:.8rem">${escapeHtml(a.desc)}</div></div>
    </div>`).join('');
  const itemHtml = (player.items || []).slice(0, 12).map((i) =>
    `<div class="card" style="padding:10px 12px;text-align:center">
      <div style="font-size:1.5rem">${i.def?.name?.split(' ')[0] || '🎒'}</div>
      <div style="font-size:.8rem;margin-top:4px">${escapeHtml(i.def?.name || i.itemId)}</div>
    </div>`).join('');
  const body = `
    ${sectionTitle(`👤 ${escapeHtml(player.name || 'Spieler')}`)}
    ${statGrid(topStats)}
    <div class="card" style="margin-top:14px">
      ${progressBar(player.xp, player.levelSpan, `XP (Level ${player.level} → ${player.level + 1})`)}
    </div>
    ${player.achievements?.length ? `${sectionTitle('🏆 Achievements')}<div style="display:grid;gap:10px;grid-template-columns:1fr">${achHtml}</div>` : ''}
    ${player.items?.length ? `${sectionTitle('🎒 Items')}<div class="grid">${itemHtml}</div>` : ''}
  `;
  return pageShell('Spieler-Profil', body, { active: 'economy', keyParam });
}

// ====================================================================
// Rangliste-Seite
// ====================================================================
function renderLeaderboard(rows, keyParam = '') {
  // rows: [{rank, name, cash, bank, houses, total}]
  const medals = ['🥇', '🥈', '🥉'];
  const trows = rows.map((r, i) => [
    medals[i] || `${i + 1}.`,
    `<strong>${escapeHtml(r.name)}</strong>`,
    escapeHtml(r.cash),
    escapeHtml(r.bank),
    r.houses,
    `<strong>${escapeHtml(r.total)}</strong>`,
  ]);
  const body = `
    ${sectionTitle('🏆 Rangliste – Reichste Spieler')}
    ${table(['#', 'Spieler', '💵 Bargeld', '🏦 Bank', '🏠 Häuser', '📊 Gesamt'], trows)}
    <p style="color:var(--muted);font-size:.85rem;margin-top:8px">Vermögen = Bargeld + Bank + Hauswerte</p>
  `;
  return pageShell('Rangliste', body, { active: 'economy', keyParam });
}

// ====================================================================
// Shop-Seite
// ====================================================================
function renderShop(items, dailyDeal, keyParam = '') {
  // items: Array von Item-Defs, dailyDeal: { name, price, salePrice, id }
  const dealCard = dailyDeal ? `
    <div class="card" style="background:linear-gradient(135deg,rgba(79,140,255,.15),rgba(124,92,255,.15));margin-bottom:18px;padding:18px">
      <div style="font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">✨ Tagesdeal</div>
      <div style="font-weight:700;font-size:1.2rem;margin:6px 0">${escapeHtml(dailyDeal.name)}</div>
      <div><del style="color:var(--muted)">${escapeHtml(String(dailyDeal.price))}</del>
        <strong style="color:var(--good);margin-left:8px">${escapeHtml(String(dailyDeal.salePrice))}</strong>
        <span class="badge good" style="margin-left:6px">-25%</span></div>
      <div style="margin-top:10px;font-family:monospace;background:var(--card);padding:6px 10px;border-radius:8px;font-size:.85rem">!kaufenitem ${escapeHtml(dailyDeal.id)}</div>
    </div>
  ` : '';
  const groups = {};
  for (const item of items) {
    const cat = item.craft ? 'Crafting' : item.id.startsWith('car_') ? 'Fahrzeuge' : item.id.startsWith('pet_') ? 'Haustiere' : item.id.startsWith('col_') ? 'Sammler' : 'Boosts';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  const sections = Object.entries(groups).map(([cat, catItems]) => {
    const cards = catItems.map((i) => `
      <div class="card" style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:1.5rem">${i.name.split(' ')[0]}</div>
        <div style="font-weight:600;font-size:.95rem">${escapeHtml(i.name.split(' ').slice(1).join(' '))}</div>
        <div style="color:var(--muted);font-size:.8rem">${escapeHtml(i.id)}</div>
        <div style="margin-top:auto;font-weight:700">${i.craft ? 'Nur Crafting' : escapeHtml(String(i.price))}</div>
      </div>`).join('');
    return `${sectionTitle(cat)}<div class="grid">${cards}</div>`;
  }).join('');
  const body = `${sectionTitle('🛒 Shop')}${dealCard}${sections}`;
  return pageShell('Shop', body, { active: 'economy', keyParam });
}

// ====================================================================
// Quests-Seite
// ====================================================================
function renderQuests(daily, weekly, globalChallenge, keyParam = '') {
  const fmtQ = (q) => {
    const pct = Math.round((q.progress / Math.max(1, q.goal)) * 100);
    const statusBadge = q.claimed ? '<span class="badge good">✅ Abgeholt</span>' : q.done ? '<span class="badge warn">🎁 Abholbar</span>' : '';
    return `
      <div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
          <div>
            <div style="font-weight:600">${escapeHtml(q.text)}</div>
            <div style="color:var(--muted);font-size:.82rem;margin-top:4px">+${escapeHtml(String(q.reward))} Coins & ${q.xp} XP</div>
          </div>
          ${statusBadge}
        </div>
        ${progressBar(q.progress, q.goal)}
        ${q.done && !q.claimed ? `<div style="margin-top:8px;font-family:monospace;background:var(--card);padding:5px 10px;border-radius:8px;font-size:.83rem">!claim ${q.id}</div>` : ''}
      </div>`;
  };
  const barLen = Math.floor(globalChallenge.pct / 10);
  const gcHtml = `
    <div class="card" style="padding:16px">
      <div style="font-weight:700;margin-bottom:8px">🌍 Community-Challenge</div>
      <div style="color:var(--muted);font-size:.85rem;margin-bottom:10px">Ziel: ${escapeHtml(String(globalChallenge.goal))}× ${escapeHtml(globalChallenge.event)}</div>
      ${progressBar(globalChallenge.progress, globalChallenge.goal)}
    </div>`;
  const body = `
    ${sectionTitle('📅 Tagesquests')}
    <div style="display:grid;gap:10px">${daily.map(fmtQ).join('')}</div>
    ${sectionTitle('📆 Wochenquests')}
    <div style="display:grid;gap:10px">${weekly.map(fmtQ).join('')}</div>
    ${sectionTitle('🌍 Community')}
    ${gcHtml}
  `;
  return pageShell('Quests', body, { active: 'economy', keyParam });
}

// ====================================================================
// Achievements-Seite
// ====================================================================
function renderAchievements(allAchs, unlockedIds, keyParam = '') {
  // allAchs: alle Achievement-Defs, unlockedIds: Set von freigeschalteten IDs
  const cards = allAchs.map((a) => {
    const done = unlockedIds.has(a.id);
    return `
      <div class="card" style="opacity:${done ? 1 : 0.45};padding:14px;display:flex;gap:12px;align-items:center">
        <div style="font-size:1.7rem">${a.name.split(' ')[0]}</div>
        <div style="flex:1">
          <div style="font-weight:700">${escapeHtml(a.name.split(' ').slice(1).join(' '))}</div>
          <div style="color:var(--muted);font-size:.82rem">${escapeHtml(a.desc)}</div>
          ${a.reward ? `<div style="color:var(--good);font-size:.82rem;margin-top:3px">+${escapeHtml(String(a.reward))} Coins Belohnung</div>` : ''}
        </div>
        ${done ? '<span class="badge good">✅</span>' : '<span class="badge bad">🔒</span>'}
      </div>`;
  }).join('');
  const body = `${sectionTitle(`🏆 Achievements (${unlockedIds.size}/${allAchs.length})`)}
    <div style="display:grid;gap:10px">${cards}</div>`;
  return pageShell('Achievements', body, { active: 'economy', keyParam });
}

// ====================================================================
// Event/Turnier-Seite
// ====================================================================
function renderTournament(tournament, keyParam = '') {
  if (!tournament) {
    return pageShell('Turnier', `<div class="card" style="margin-top:40px;text-align:center;padding:30px">
      <div style="font-size:2rem">🏆</div>
      <div class="section-title" style="margin:10px 0">Kein aktives Turnier</div>
      <div style="color:var(--muted)">Starte mit <code>!turnier start &lt;spiel&gt;</code></div>
    </div>`, { active: 'economy', keyParam });
  }
  const mins = Math.ceil(tournament.timeLeft / 60000);
  const board = tournament.sorted.slice(0, 10).map(([uid, sc], i) =>
    [`${i + 1}.`, `@${uid.split('@')[0]}`, sc]);
  const body = `
    ${sectionTitle(`🏆 Turnier: ${escapeHtml(tournament.game)}`)}
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${statCard('⏱️ Verbleibend', `${mins} Min`)}
        ${statCard('🏆 Preis', escapeHtml(String(tournament.prize)))}
        ${statCard('👥 Spieler', tournament.players.size)}
      </div>
    </div>
    ${table(['#', 'Spieler', 'Punkte'], board)}
  `;
  return pageShell('Turnier', body, { active: 'economy', keyParam });
}

// ====================================================================
// Craft-Seite – zeigt alle Rezepte mit Zutaten und Fortschritt
// ====================================================================
function renderCraft(recipes, playerItems, keyParam = '') {
  const ownedIds = new Set(playerItems.map((i) => i.itemId || i.id));
  const recipeCards = recipes.map((r) => {
    const allOwned = r.ingredients.every((id) => ownedIds.has(id));
    const ingLines = r.ingredients.map((id) => {
      const have = ownedIds.has(id);
      return `<span style="color:${have ? 'var(--success)' : 'var(--danger)'}">${have ? '✅' : '❌'} <code>${id}</code></span>`;
    }).join('&nbsp; ');
    return `<div class="card" style="padding:16px;margin-bottom:10px;border-left:4px solid ${allOwned ? 'var(--success)' : 'var(--muted)'}">
      <div style="font-weight:700;margin-bottom:8px">🧪 ${escapeHtml(r.desc.split('→')[1]?.trim() || r.id)}</div>
      <div style="margin-bottom:8px;font-size:.9rem">Zutaten: ${ingLines}</div>
      <div style="font-size:.85rem;color:var(--muted)">${escapeHtml(r.desc)}</div>
      ${allOwned ? `<div style="margin-top:8px">${button('!craften ' + r.ingredients.join(' '), 'Jetzt craften!', 'secondary')}</div>` : ''}
    </div>`;
  }).join('');
  const body = `${sectionTitle('🧪 Crafting-Rezepte')}${recipeCards}`;
  return pageShell('Crafting', body, { active: 'economy', keyParam });
}

// ====================================================================
// Item-Marktplatz-Seite
// ====================================================================
function renderMarket(listings, keyParam = '') {
  if (!listings.length) {
    return pageShell('Marktplatz', `<div class="card" style="text-align:center;padding:40px;margin-top:20px">
      <div style="font-size:2rem">📭</div>
      <div class="section-title" style="margin:10px 0">Marktplatz ist leer</div>
      <div style="color:var(--muted)">Stelle Items mit <code>!itemposter &lt;item-id&gt; &lt;preis&gt;</code> ein.</div>
    </div>`, { active: 'shop', keyParam });
  }
  const rows = listings.map((l) => [
    escapeHtml(l.item?.name || l.itemId),
    `<code>${l.itemId || l.item?.id}</code>`,
    `${(l.askPrice || 0).toLocaleString()}`,
    `@${(l.sellerId || '').split('@')[0]}`,
    button(`!kaufenmarkt ${l.item?.id || l.itemId}`, 'Kaufen', 'secondary'),
  ]);
  const body = `${sectionTitle('🏪 Item-Marktplatz')}${table(['Item', 'ID', 'Preis', 'Verkäufer', ''], rows)}`;
  return pageShell('Marktplatz', body, { active: 'shop', keyParam });
}

// ====================================================================
// Clan-Profil-Seite
// ====================================================================
function renderClanProfile(clan, members, levelInfo, keyParam = '') {
  if (!clan) {
    return pageShell('Clan', `<div class="card" style="text-align:center;padding:40px;margin-top:20px">
      <div style="font-size:2rem">⚔️</div>
      <div class="section-title">Kein Clan</div>
      <div style="color:var(--muted)">Gründe mit <code>!clan erstellen &lt;name&gt;</code></div>
    </div>`, { active: 'clans', keyParam });
  }
  const lvl = levelInfo?.current || { label: 'Neuling', maxMembers: 5 };
  const xpBar = levelInfo?.next
    ? progressBar(clan.xp - (levelInfo.current?.xpRequired || 0), levelInfo.next.xpRequired - (levelInfo.current?.xpRequired || 0), `Level: ${lvl.label}`)
    : `<div style="color:var(--accent);font-weight:700">MAX LEVEL erreicht! 🌟</div>`;
  const memberRows = (members || []).map((m) => [
    m.role === 'leader' ? '👑' : '⚔️',
    `@${(m.userId || '').split('@')[0]}`,
    m.role === 'leader' ? 'Anführer' : 'Mitglied',
    (m.xpContributed || 0).toLocaleString(),
  ]);
  const body = `
    ${sectionTitle(`⚔️ ${escapeHtml(clan.name)}`)}
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${statCard('🏅 Level', lvl.label)}
        ${statCard('⭐ XP', (clan.xp || 0).toLocaleString())}
        ${statCard('👥 Mitglieder', `${members.length}/${lvl.maxMembers}`)}
        ${statCard('💰 Schatzkammer', (clan.treasury || 0).toLocaleString())}
      </div>
    </div>
    ${clan.description ? `<div class="card" style="padding:12px 16px;margin-bottom:16px;color:var(--muted);font-style:italic">${escapeHtml(clan.description)}</div>` : ''}
    <div style="margin-bottom:16px">${xpBar}</div>
    ${sectionTitle('👥 Mitglieder')}
    ${table(['', 'Nutzer', 'Rolle', 'XP-Beitrag'], memberRows)}
  `;
  return pageShell(`Clan: ${clan.name}`, body, { active: 'clans', keyParam });
}

// ====================================================================
// Clan-Rangliste
// ====================================================================
function renderClanLeaderboard(clans, keyParam = '') {
  const medals = ['🥇', '🥈', '🥉'];
  const rows = clans.map((c, i) => [
    medals[i] || `${i + 1}.`,
    escapeHtml(c.name),
    (c.xp || 0).toLocaleString(),
    c.memberCount || '?',
  ]);
  const body = `${sectionTitle('🏆 Clan-Rangliste')}${table(['#', 'Clan', 'XP', 'Mitglieder'], rows)}`;
  return pageShell('Clan-Rangliste', body, { active: 'clans', keyParam });
}

// ====================================================================
// Admin-Statistik-Seite
// ====================================================================
function renderAdminStats(stats, groups, keyParam = '') {
  const {
    totalUsers = 0,
    totalCoins = 0,
    totalHouses = 0,
    totalMessages = 0,
    botUptime = 0,
    gamesEnabled = 0,
  } = stats;
  const uptimeStr = (() => {
    const s = Math.floor(botUptime / 1000);
    const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return `${d}d ${h % 24}h ${m % 60}m`;
  })();
  const body = `
    ${sectionTitle('📊 Admin-Statistiken')}
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${statCard('👤 Nutzer', totalUsers.toLocaleString())}
        ${statCard('💰 Coins gesamt', totalCoins.toLocaleString())}
        ${statCard('🏠 Häuser', totalHouses.toLocaleString())}
        ${statCard('💬 Nachrichten', totalMessages.toLocaleString())}
        ${statCard('⏱️ Laufzeit', uptimeStr)}
        ${statCard('🎮 Spielgruppen', gamesEnabled)}
      </div>
    </div>
    ${sectionTitle('📋 Aktive Gruppen')}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${(groups || []).map((g) => groupCard({
        name: g.name || g.id,
        id: g.id,
        memberCount: g.participants?.length || g.memberCount || 0,
        gamesEnabled: g.gamesEnabled,
        keyParam,
      })).join('')}
    </div>
  `;
  return pageShell('Admin-Statistiken', body, { active: 'dashboard', keyParam });
}

// ====================================================================
// Aktien-Dashboard
// ====================================================================
function renderStockDashboard(stocks, playerDepot, keyParam = '') {
  const trendIcon = (vol) => vol > 0.4 ? '🔴' : vol > 0.2 ? '🟡' : '🟢';
  const stockCards = stocks.map((s) => {
    const held = playerDepot[s.id] || 0;
    const price = s.currentPrice || 0;
    return `<div class="card" style="padding:14px;border-left:4px solid var(--accent)">
      <div style="font-weight:700;font-size:1.05rem">${s.name}</div>
      <div style="margin:6px 0;color:var(--muted)">Kurs: <strong>${price.toLocaleString()} Coins</strong></div>
      <div style="font-size:.85rem">${trendIcon(s.volatility)} Volatilität: ${(s.volatility * 100).toFixed(0)}%</div>
      ${held > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);color:var(--success)">
        Im Depot: ${held} Stk. = ${(held * price).toLocaleString()} Coins
      </div>` : ''}
      <div style="margin-top:8px;display:flex;gap:6px">
        ${button(`!aktien kaufen ${s.id} 1`, 'Kaufen', 'secondary')}
        ${held > 0 ? button(`!aktien verkaufen ${s.id} ${held}`, 'Alles verkaufen') : ''}
      </div>
    </div>`;
  }).join('');
  const body = `${sectionTitle('📈 Aktienmarkt')}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">
      ${stockCards}
    </div>`;
  return pageShell('Aktienmarkt', body, { active: 'economy', keyParam });
}

// ====================================================================
// Enchantment-Seite
// ====================================================================
function renderEnchantments(enchantments, playerItems, keyParam = '') {
  const enchCards = enchantments.map((e) => `
    <div class="card" style="padding:14px;margin-bottom:10px">
      <div style="font-weight:700">${e.name} <code style="font-size:.8rem">[${e.id}]</code></div>
      <div style="color:var(--muted);font-size:.9rem;margin:6px 0">${e.desc}</div>
      <div style="font-size:.85rem">Kosten: ${(e.costMultiplier * 100).toFixed(0)}% des Item-Preises</div>
    </div>
  `).join('');
  const body = `
    ${sectionTitle('🔮 Verzauberungen')}
    <div style="color:var(--muted);margin-bottom:16px;font-size:.9rem">
      Verzauberungen stärken deine Items. Nutze <code>!verzaubern &lt;item-id&gt; &lt;enchant-id&gt;</code>.
    </div>
    ${enchCards}
  `;
  return pageShell('Verzauberungen', body, { active: 'shop', keyParam });
}

// ====================================================================
// Hilfe-Seite – komplette Befehls-Referenz als Web-Seite
// ====================================================================
function renderHelp(categories, keyParam = '') {
  const categoryCards = Object.entries(categories).map(([key, cat]) => {
    const cmds = cat.commands.map(([cmd, desc]) => `
      <tr>
        <td style="font-family:monospace;color:var(--accent);white-space:nowrap;padding:6px 10px">!${escapeHtml(cmd)}</td>
        <td style="padding:6px 10px;color:var(--muted)">${escapeHtml(desc)}</td>
      </tr>`).join('');
    return `<div class="card" style="padding:0;margin-bottom:14px;overflow:hidden">
      <div style="padding:12px 16px;background:var(--accent);color:#fff;font-weight:700">${escapeHtml(cat.label)} <span style="font-weight:400;font-size:.9em;opacity:.8">– ${escapeHtml(cat.desc)}</span></div>
      <table style="width:100%;border-collapse:collapse">
        ${cmds}
      </table>
    </div>`;
  }).join('');
  const body = `
    ${sectionTitle('📖 Befehlsreferenz')}
    <div style="margin-bottom:16px;padding:12px 16px;background:var(--card);border-radius:10px;color:var(--muted);font-size:.9rem">
      Alle Befehle mit <strong>!</strong> starten. Spiel-Befehle nur in freigegebenen Gruppen (<code>!spielgruppe an</code>).
    </div>
    ${categoryCards}
  `;
  return pageShell('Hilfe', body, { active: 'help', keyParam });
}

// ====================================================================
// Fehler-Seite (404 / 403)
// ====================================================================
function renderError(code, message, keyParam = '') {
  const icons = { 404: '🔍', 403: '🔒', 500: '💥' };
  const icon = icons[code] || '⚠️';
  const body = `<div class="card" style="text-align:center;padding:50px 20px;margin-top:40px">
    <div style="font-size:4rem;margin-bottom:12px">${icon}</div>
    <div style="font-size:2rem;font-weight:700;color:var(--accent);margin-bottom:8px">${code}</div>
    <div style="color:var(--muted);font-size:1.1rem">${escapeHtml(message)}</div>
    <div style="margin-top:20px">${button('/?key=' + keyParam, '← Zurück zum Dashboard')}</div>
  </div>`;
  return pageShell(`${code} – Fehler`, body, { active: '', keyParam });
}

// ====================================================================
// Benachrichtigungs-Toast (als HTML-Snippet, kein komplette Seite)
// ====================================================================
function toastScript(message, type = 'success') {
  const color = type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--accent)';
  return `<script>
    (function() {
      const t = document.createElement('div');
      t.textContent = ${JSON.stringify(message)};
      t.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:10px;background:${color};color:#fff;font-weight:700;z-index:9999;animation:fadeIn .3s ease';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    })();
  </script>`;
}

module.exports = {
  STYLES, SCRIPT, navBar, statCard, statGrid, button, pageShell,
  sectionTitle, table, formRow, toggleSwitch, progressBar, groupCard, escapeHtml,
  renderLogin, renderDashboard, renderGroups, renderEconomyBoard, renderSettings,
  renderPlayerProfile, renderLeaderboard, renderShop, renderQuests, renderAchievements,
  renderTournament, renderCraft, renderMarket, renderClanProfile, renderClanLeaderboard,
  renderAdminStats, renderStockDashboard, renderEnchantments, renderHelp, renderError,
  toastScript,
};
