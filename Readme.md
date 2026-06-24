# WhatsApp-Bot

Verbindet sich per [Baileys](https://github.com/WhiskeySockets/Baileys) mit
WhatsApp, zeigt den Login-QR-Code auf einer passwortgeschützten Website, lässt
sich **pro Gruppe** konfigurieren (Befehle & Moderation) und hält den
Render-Free-Dienst gegen Inaktivität wach.

## Funktionen

- **Allgemeine Befehle** (pro Gruppe ein-/ausschaltbar): `!hilfe`, `!ping`,
  `!info`, `!id`, `!regeln`, `!gruppe`, `!top`, `!stats`, `!melden`.
- **Moderations-/Admin-Befehle** (pro Gruppe ein-/ausschaltbar): u. a. `!sag`,
  `!alle`, `!kick`, `!ban`, `!mute`/`!unmute`, `!warn`/`!unwarn`/`!clearwarn`,
  `!promote`/`!demote`, `!lock`/`!unlock`, `!setregeln`, `!setwelcome`,
  `!slowmode`, `!del`, `!remind` u. v. m. (siehe `!hilfe` bzw. die Web-Seite `/befehle`).
- **Moderation** (pro Gruppe optional): löscht Beleidigungen (mit Verwarnung &
  Soft-Mute) und/oder Links und meldet das. Der Bot muss dafür **Gruppen-Admin** sein.
- **Web-Oberfläche (Minimal):** Derzeit auf das Nötigste reduziert – Login, QR-Login
  und ein **Panel**, über das der vollständige **Blueprint** (`bot-blueprint.md`)
  heruntergeladen werden kann. Diese Datei beschreibt alles für den geplanten
  Neuaufbau (Funktionen, Technik, Speicher-Zugang, Daten-Schema, Verbesserungen,
  UI-Design). Der Bot selbst (Verbindung, Moderation, Befehle) läuft normal weiter.

## Endpoints

| Pfad         | Schutz        | Zweck                                          |
| ------------ | ------------- | ---------------------------------------------- |
| `/ping`      | offen         | Health-Check für externe Uptime-Monitore       |
| `/healthz`   | offen         | JSON-Health (powered/connected/uptime)         |
| `/`          | offen         | Anmeldeseite (Passwort)                         |
| `/status`    | Session       | JSON-Status                                    |
| `/qr`        | Session       | WhatsApp-Login-QR-Code                         |
| `/panel`     | Session       | Minimal-Panel: Status, Steuerung, Download     |
| `/blueprint` | Session       | Download der `bot-blueprint.md`                |

## Lokal testen

```bash
npm install
QR_PASSWORD=geheim npm start
```

- Der QR-Code erscheint im Terminal **und** unter `http://localhost:3000/qr?key=geheim`.
- In WhatsApp: **Einstellungen → Verknüpfte Geräte → Gerät hinzufügen** → QR scannen.
- Nach erfolgreicher Verbindung zeigt `/` den Status `verbunden`.

## Auf Render (Free) deployen

1. Neuen **Web Service** aus diesem Repo erstellen.
2. **Build Command:** `npm install`  •  **Start Command:** `npm start`
3. Environment-Variablen (optional) setzen:
   - `QR_PASSWORD` – Passwort für die Web-Oberfläche. Ist **keins** gesetzt, gilt
     das eingebaute Standard-Passwort `XWMEr3MZv-pH`. Zum Absichern hier ein
     eigenes setzen.
   - `SELF_URL` – optional, die öffentliche Render-URL (z. B. `https://dein-bot.onrender.com`)
   - `MONGODB_URI` – optional. Ohne diese Variable werden die Einstellungen in
     einer Datei gespeichert, die auf Render bei jedem Neustart verloren geht.
     Mit einer kostenlosen [MongoDB-Atlas](https://www.mongodb.com/atlas)-URL
     überleben alle Gruppen-Einstellungen Neustarts/Deploys.
4. Nach dem Deploy `https://dein-bot.onrender.com/` öffnen, Passwort eingeben und
   den QR-Code scannen. Die Oberfläche passt sich automatisch an Handy, Tablet
   und Laptop an.

## Persistente Einstellungen (MongoDB Atlas, kostenlos)

1. Kostenloses Konto auf [mongodb.com/atlas](https://www.mongodb.com/atlas) anlegen,
   einen **Free Cluster (M0)** erstellen.
2. Unter *Database Access* einen Benutzer anlegen, unter *Network Access*
   `0.0.0.0/0` erlauben.
3. *Connect → Drivers* → die Verbindungs-URL kopieren
   (`mongodb+srv://user:pass@cluster.../`).
4. In Render als Variable `MONGODB_URI` eintragen → fertig. Alle Gruppen-
   Einstellungen werden nun dauerhaft gespeichert.

## Gegen Inaktivität wach halten (wichtig)

Render Free fährt den Dienst nach ~15 Min **ohne eingehenden Traffic** herunter.
Ein interner Self-Ping allein reicht **nicht**, weil der Timer mit dem Dienst schläft.
Richte daher einen **externen Monitor** ein:

- [UptimeRobot](https://uptimerobot.com) oder [cron-job.org](https://cron-job.org)
- Ziel-URL: `https://dein-bot.onrender.com/ping`
- Intervall: alle 5 Minuten

Der optionale `SELF_URL`-Self-Ping (alle 4 Min) ist nur eine Ergänzung.

## Hinweise

- Der Ordner `auth_info/` enthält die WhatsApp-Session und ist über `.gitignore`
  ausgeschlossen. **Niemals committen.**
- Renders Free-Disk ist flüchtig: nach Redeploy/Neustart geht `auth_info/`
  verloren → der QR-Code muss neu gescannt werden. Ohne `MONGODB_URI` gehen
  auch die Gruppen-Einstellungen verloren (siehe oben).
- Zum **Löschen** von Nachrichten (Moderation) muss der Bot in der jeweiligen
  Gruppe **Admin** sein – sonst werden Verstöße nur erkannt, aber nicht gelöscht.
- Wer den QR-Code scannt, übernimmt die Session – darum ist `/qr` mit Passwort
  geschützt.
