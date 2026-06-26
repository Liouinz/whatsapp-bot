'use strict';

/**
 * HTML-Renderer für die Web-UI. Dark-Tech + Glassmorphism (Blueprint Kap. 10).
 * Performance: nur transform/opacity animiert, backdrop-filter NIE animiert,
 * max. 2 Blur-Ebenen, prefers-reduced-motion respektiert.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root{color-scheme:dark;--bg:#0a0e1f;--card:rgba(255,255,255,.055);--line:rgba(150,130,255,.22);
  --txt:#e8ebf7;--mut:#9aa3c0;--pur:#8b5cf6;--cyan:#22d3ee;--ok:#34d399;--bad:#f87171;--warn:#fbbf24;--r:22px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;color:var(--txt);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  background:var(--bg);overflow-x:hidden}
/* zwei sanft schwebende Gradient-Blobs (animiert nur via transform) */
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden}
.bg::before,.bg::after{content:"";position:absolute;width:60vmax;height:60vmax;border-radius:50%;filter:blur(70px);opacity:.45;will-change:transform}
.bg::before{background:radial-gradient(circle,#7c3aed,transparent 60%);top:-20vmax;left:-15vmax;animation:f1 22s ease-in-out infinite}
.bg::after{background:radial-gradient(circle,#06b6d4,transparent 60%);bottom:-20vmax;right:-15vmax;animation:f2 26s ease-in-out infinite}
@keyframes f1{0%,100%{transform:translate(0,0)}50%{transform:translate(8vmax,6vmax)}}
@keyframes f2{0%,100%{transform:translate(0,0)}50%{transform:translate(-7vmax,-5vmax)}}
.wrap{max-width:680px;margin:0 auto;padding:18px 16px 60px}
header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 2px 18px}
.brand{font-weight:700;font-size:18px;background:linear-gradient(90deg,var(--pur),var(--cyan));
  -webkit-background-clip:text;background-clip:text;color:transparent}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
nav a{font-size:13px;color:var(--mut);text-decoration:none;padding:7px 12px;border-radius:14px;
  background:var(--card);border:1px solid var(--line);transition:transform .12s,opacity .12s}
nav a:active{transform:scale(.96)}
nav a.on{color:var(--txt);border-color:var(--pur)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px;margin:0 0 16px;
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 0 26px rgba(124,58,237,.10)}
.card h2{margin:0 0 12px;font-size:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.stat{background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:16px;padding:12px}
.stat .k{font-size:12px;color:var(--mut)}.stat .v{font-size:20px;font-weight:700;margin-top:3px}
label{display:block;font-size:13px;color:var(--mut);margin:12px 0 5px}
input[type=text],input[type=number],textarea,select{width:100%;padding:11px 12px;border-radius:14px;
  background:rgba(0,0,0,.25);border:1px solid var(--line);color:var(--txt);font:inherit}
textarea{min-height:74px;resize:vertical}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.row:last-child{border-bottom:0}
.switch{position:relative;width:48px;height:28px;flex:0 0 auto}
.switch input{opacity:0;width:0;height:0}
.slider{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:999px;transition:background .15s}
.slider::before{content:"";position:absolute;height:22px;width:22px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .15s}
.switch input:checked+.slider{background:linear-gradient(90deg,var(--pur),var(--cyan))}
.switch input:checked+.slider::before{transform:translateX(20px)}
.btn{display:inline-block;border:0;cursor:pointer;font:inherit;font-weight:600;color:#fff;padding:11px 16px;border-radius:14px;
  background:linear-gradient(90deg,var(--pur),var(--cyan));transition:transform .12s,opacity .12s;text-decoration:none;text-align:center}
.btn:active{transform:scale(.97)}
.btn.sec{background:rgba(255,255,255,.08);border:1px solid var(--line)}
.btn.bad{background:linear-gradient(90deg,#ef4444,#b91c1c)}
.btn.sm{padding:7px 11px;font-size:13px;font-weight:500}
.btn.full{display:block;width:100%}
.muted{color:var(--mut);font-size:13px}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.08);color:var(--mut)}
.tag.ok{color:var(--ok)}.tag.bad{color:var(--bad)}.tag.warn{color:var(--warn)}
.list .it{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.list .it:last-child{border-bottom:0}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
img.qr{width:100%;max-width:280px;border-radius:16px;background:#fff;padding:10px;display:block;margin:8px auto}
@media (prefers-reduced-motion:reduce){.bg::before,.bg::after{animation:none}.btn,nav a{transition:none}}
`;

function layout(title, active, body, csrf) {
  const tabs = [
    ['/panel', '📊 Dashboard'],
    ['/panel/groups', '👥 Gruppen'],
    ['/panel/reports', '🚩 Meldungen'],
    ['/panel/banlog', '🚫 Ban-Log'],
    ['/panel/anliegen', '📨 Anliegen'],
    ['/panel/errors', '🐞 Fehlerlog'],
    ['/qr', '📱 QR'],
  ];
  const nav = tabs
    .map(([href, label]) => `<a href="${href}"${active === href ? ' class="on"' : ''}>${label}</a>`)
    .join('');
  return `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><div class="bg"></div><div class="wrap">
<header><span class="brand">🤖 CommunityBot</span><a class="btn sec sm" href="/logout">Logout</a></header>
<nav>${nav}</nav>
${body}
<p class="muted" style="text-align:center;margin-top:24px;opacity:.5">CommunityBot v2 · Web-Panel</p>
</div>
<script>
function confirmDestructive(f){return confirm('Sicher? Diese Aktion kann nicht rückgängig gemacht werden.');}
</script></body></html>`;
}

function csrfField(csrf) {
  return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
}

module.exports = { esc, layout, csrfField, CSS };
