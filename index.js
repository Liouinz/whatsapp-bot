/**
 * Minimale Platzhalter-Seite.
 * --------------------------------------------------------------------
 * Der alte WhatsApp-Bot wurde komplett entfernt. Diese winzige Seite
 * existiert nur, damit der Server (Render) etwas Deploybares hat und die
 * alte Bot-Seite ersetzt. Sie bietet ausschließlich die Blueprint-Datei
 * zum Download an. Keine Abhängigkeiten – nur Node-Bordmittel.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BLUEPRINT = path.join(__dirname, 'bot-blueprint.md');

const PAGE = `<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot-Blueprint</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e9ecf3;
    background:radial-gradient(1200px 600px at 70% -10%,#3b2a6b33,transparent),
               radial-gradient(900px 500px at 0% 110%,#0e7c8c33,transparent),#0b1020;padding:20px}
  .card{width:100%;max-width:440px;background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.10);border-radius:24px;padding:30px 24px;text-align:center;
    box-shadow:0 20px 60px #0008,inset 0 0 0 1px rgba(255,255,255,.02)}
  .logo{font-size:48px;line-height:1}
  h1{font-size:1.5rem;margin:14px 0 6px;
    background:linear-gradient(90deg,#a78bfa,#22d3ee);-webkit-background-clip:text;
    background-clip:text;color:transparent}
  p{color:#9aa3b8;font-size:.95rem;line-height:1.6;margin:0 auto 22px;max-width:340px}
  a.btn{display:inline-block;text-decoration:none;color:#fff;font-weight:700;font-size:1rem;
    padding:15px 26px;border-radius:16px;
    background:linear-gradient(90deg,#7c3aed,#06b6d4);
    box-shadow:0 10px 30px #7c3aed55;transition:transform .15s ease,box-shadow .15s ease}
  a.btn:active{transform:scale(.97)}
  small{display:block;margin-top:18px;color:#6b7280;font-size:.78rem}
</style></head>
<body>
  <div class="card">
    <div class="logo">🤖</div>
    <h1>WhatsApp-Bot — entfernt</h1>
    <p>Der alte Bot wurde komplett gelöscht. Übrig ist nur die Blueprint-Datei
    mit allen Funktionen &amp; Infos für den Neuaufbau.</p>
    <a class="btn" href="/blueprint">⬇️ Blueprint herunterladen</a>
    <small>bot-blueprint.md</small>
  </div>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/blueprint' || url === '/bot-blueprint.md') {
    fs.readFile(BLUEPRINT, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Blueprint-Datei nicht gefunden.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bot-blueprint.md"',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
    return;
  }

  if (url === '/ping' || url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

server.listen(PORT, () => console.log('Platzhalter-Server läuft auf Port ' + PORT));
