# 🤖 CommunityBot v2

Modularer, sperr-sicherer WhatsApp-Community-Bot (Baileys) mit Session-Persistenz
in Turso, zentraler Sende-Drossel (Anti-Ban), intelligenter Befehlssuche,
Auto-Moderation und einer mobilen, abgesicherten Web-Oberfläche.

## Architektur

```
src/
  index.js              # Bootstrap: config → DB → Storage → Registry → Web → Socket
  core/
    config.js           # Env-Auflösung (v2-Namen + Blueprint-Fallback)
    logger.js           # pino + Fehler-Ring-Buffer (Web-Fehlerlog)
    db.js               # libSQL-Client (Turso remote / lokale Datei)
    auth-turso.js       # Session (Creds + Keys) in der DB → kein neuer QR
    connection.js       # Baileys, Reconnect-Backoff, Health-Watch, QR→PNG
    send-queue.js       # FIFO-Sende-Drossel mit Jitter + composing (Anti-Ban)
    storage.js          # Datenschicht (9 Tabellen) + debounced Stats
  bot/
    router.js           # Pipeline: Präfix→Registry→Rolle→Gates→Cooldown→run
    permissions.js      # Rollen owner>admin>mod>user + Metadaten-Cache (5min)
    help.js             # intelligente Hilfe (Frage → passender Befehl)
    moderation.js       # Badwords/Links/Spam → löschen+verwarnen+Eskalation
    events.js           # liest mit: Mute→Stats→Befehl/Moderation; Welcome; Rejoin
    reminders.js        # !remind-Scheduler
    commands/           # utility.js, moderation.js, owner.js (45 Befehle)
  web/
    server.js           # Express + Security-Header + geheimer Login + Routing
    auth.js             # Sessions, CSRF, IP-Lockout, Rate-Limit (timing-safe)
    routes.js           # Dashboard, Gruppen-Settings, Mitglieder, Daten, Backup
    views.js            # Dark-Tech-Glassmorphism (Mobile-First)
```

## Environment-Variablen

Der Code akzeptiert beide Namensschemata (v2-Spec primär, Blueprint als Fallback).

| Variable (v2) | Fallback | Pflicht | Zweck |
|---|---|---|---|
| `DATABASE_URL` | `TURSO_DATABASE_URL` | ✅ | Turso/libSQL-URL (`libsql://…turso.io`) — Session **und** Daten |
| `DATABASE_KEY` | `TURSO_AUTH_TOKEN` | ✅ | Turso Auth-Token |
| `OWNER_NUMBERS` | `OWNER_JIDS` | ✅ | Owner-Nummern, nur Ziffern, Komma-getrennt (`4915123456789`) |
| `ACCESS_SECRET` | `QR_PASSWORD` | ✅ | Langer Zufallswert für den geheimen Panel-Link |
| `SELF_URL` | `RENDER_EXTERNAL_URL` | – | Öffentliche URL (Keep-Alive) — **erst nach 1. Deploy** |
| `COMMAND_PREFIX` | – | – | Befehls-Präfix (Default `!`) |
| `MONGODB_URI` / `MONGODB_DB` | – | – | Optionaler Fallback (derzeit nicht aktiv genutzt) |
| `LOG_LEVEL` | – | – | pino-Level (Default `info`) |

> `PORT` **nicht** setzen — Render vergibt automatisch.
> Ohne `DATABASE_URL` nutzt der Bot eine lokale SQLite-Datei (`data/local.db`) —
> nur für lokale Entwicklung; auf Render-Free geht die Session beim Neustart verloren.

## Lokal starten

```bash
npm install
DATABASE_URL=... DATABASE_KEY=... OWNER_NUMBERS=49... ACCESS_SECRET=$(openssl rand -hex 24) npm start
# QR scannen unter:  http://localhost:3000/<ACCESS_SECRET>  → /qr
```

## Auf Render deployen

1. Neuer **Web Service** aus diesem Repo, Branch `claude/whatsapp-bot-v2-rebuild-sp1u6i` (bzw. `main`).
2. **Build Command**: `npm install` · **Start Command**: `node src/index.js` · Root leer.
3. Env-Variablen aus der Tabelle oben setzen (mind. die 4 Pflicht-Werte).
4. Deploy. Danach `SELF_URL` = die vergebene `https://….onrender.com` setzen.
5. Panel öffnen: `https://….onrender.com/<ACCESS_SECRET>` → **QR scannen**.

### Externer Keep-Alive (Free-Tier schläft sonst ~15 Min ein)

UptimeRobot / cron-job.org alle ~5 Min auf `https://….onrender.com/ping` zeigen lassen.

## Go-Live-Checkliste (Phase 6)

- [ ] Mit **Test-Nummer/Test-Gruppe** prüfen:
  - [ ] QR scannen → in Render „Restart" → Bot kommt **ohne** neuen QR online (Turso-Session).
  - [ ] `!ping`, `!hilfe`, `!hilfe wie banne ich jemanden` (→ `!ban`).
  - [ ] `!kick`/`!warn` als Admin; Rechte-Check als Nicht-Admin.
  - [ ] Moderation in der Web-UI für die Testgruppe an → Beleidigung → wird gelöscht + verwarnt.
  - [ ] Welcome an → neues Mitglied wird begrüßt.
  - [ ] Web-Panel am Handy: alle Seiten, Power-Toggle, Backup-Export.
- [ ] Externen Pinger einrichten.
- [ ] Auf die **dedizierte Bot-Nummer** schalten (nie privat!). Läuft ein alter Bot auf derselben Nummer → vorher abschalten.

## Sicherheit & Anti-Ban (eingebaut)

- Dedizierte Bot-Nummer verwenden; niemals Secrets ins Repo.
- Zentrale Sende-Queue mit Jitter (800–2500 ms) + `composing`; `!alle`/`!announce` 1×/10 Min pro Gruppe.
- Reconnect mit exponentiellem Backoff (≤60 s); Metadaten-Cache (5 Min); bei 403 pausiert die Queue.
- Web: geheimer Link statt Passwort, CSRF auf POST, IP-Lockout, Rate-Limit, Security-Header, destruktive Aktionen mit Bestätigung.
