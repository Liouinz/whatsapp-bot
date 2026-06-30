# 🤖 WhatsApp-Community-Bot v7.2

Stabiler, sicherer WhatsApp-Community-Bot (Baileys) mit Session-Persistenz in
Turso (Neustart **ohne QR**), Anti-Ban-Sende-Queue, Auto-Moderation, KI nur als
Fallback und einem mobilen, abgesicherten Web-Panel. Befehls-Präfix: `!`.

> Aufbau strikt nach **Masterplan v7.2**, Phase für Phase. Dieses README wächst
> mit den Phasen mit. Aktueller Stand: **Phasen 0–3** (Gerüst, Verbindung,
> Wachhalten).

## Struktur

```
src/
  index.js                # Bootstrap: DB → Keepalive → Verbindung → Watchdog
  core/
    logger.js             # pino (Level "warn") + Nummern-Maskierung
    db.js                 # libSQL/Turso, versioniertes Schema (schema_version)
    auth-turso.js         # Session (Creds+Keys) in der DB → kein neuer QR
    identity.js           # LID/PN-sichere Identität (Admin-Fix), Meta-Cache
    msg-store.js          # letzte ~500 Nachrichten in DB (getMessage/Decrypt)
    dedupe.js             # LRU der letzten ~1000 IDs (keine Doppel-Verarbeitung)
    connection.js         # Baileys-Socket, Reconnect (515/403/Backoff), upsert
    watchdog.js           # erzwingt Reconnect bei "stillen" Hängern
    keepalive.js          # HTTP /health + interner Self-Ping (Wachhalten)
```

## Environment-Variablen

| Variable | Pflicht | Zweck |
|---|---|---|
| `DATABASE_URL` | ✅ | Turso/libSQL-URL — Session **und** Daten |
| `DATABASE_KEY` | ✅ | Turso Auth-Token |
| `OWNER_NUMBERS` | ✅ | Owner-Nummern, nur Ziffern, Komma-getrennt |
| `ACCESS_SECRET` | ✅ | Langer Zufallswert für den geheimen Panel-Link |
| `SELF_URL` | – | Öffentliche URL für Keep-Alive (erst nach 1. Deploy) |
| `GEMINI_API_KEY` | – | KI-Fallback (Gemini) |
| `LOG_LEVEL` | – | pino-Level (Default `warn`) |

> `PORT` **nicht** setzen — der Hoster (z. B. Render) vergibt ihn automatisch.
> Ohne `DATABASE_URL` nutzt der Bot lokal `data/local.db` (nur Entwicklung;
> auf Free-Hosting ginge die Session beim Neustart verloren).

## Lokal starten

```bash
npm install
DATABASE_URL=... DATABASE_KEY=... OWNER_NUMBERS=49... ACCESS_SECRET=$(openssl rand -hex 24) npm start
# Beim ersten Start erscheint ein QR-Code im Log → mit WhatsApp koppeln.
```

## Wachhalten (Keep-Alive) — wichtig auf Free-Hosting

Free-Instanzen schlafen ohne Traffic ein. Der Bot exponiert dafür einen
Health-Endpunkt:

- **`GET /health`** → `200 { ok, connected, uptime_s, rss_mb, ts }`

Richte einen **externen Pinger alle ~5 Minuten** auf `SELF_URL/health` ein
(z. B. UptimeRobot oder cron-job.org), damit die Instanz nicht einschläft.
Zusätzlich pingt der Bot sich intern selbst, sobald `SELF_URL` gesetzt ist —
der externe Pinger bleibt aber die zuverlässige Variante.

## Sicherheit & Anti-Ban (Grundsätze)

- Dedizierte Bot-Nummer; niemals Secrets ins Repo.
- Session in Turso → Neustart ohne neuen QR; Graceful Shutdown bei SIGTERM.
- Reconnect: 515 sofort, 403 → STOPP + Alarm, sonst Backoff (≤ 60 s).
- Nachrichten-Dedupe gegen Doppel-Verwarnung/-XP; Decrypt-Fehler werden als
  Rauschen ignoriert (nicht geloggt).
- Telefonnummern in Log & Panel maskiert.
