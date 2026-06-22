# WhatsApp-Test-Bot

Schlanke Testversion: verbindet sich per [Baileys](https://github.com/WhiskeySockets/Baileys)
mit WhatsApp, zeigt den Login-QR-Code auf einer passwortgeschützten Website und
hält den Render-Free-Dienst gegen Inaktivität wach.

## Endpoints

| Pfad            | Schutz       | Zweck                                           |
| --------------- | ------------ | ----------------------------------------------- |
| `/ping`         | offen        | Health-Check für externe Uptime-Monitore        |
| `/`             | offen        | JSON-Status (verbunden? Uptime?)                |
| `/qr?key=…`     | `QR_PASSWORD`| Zeigt den WhatsApp-Login-QR-Code                |

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
4. Nach dem Deploy `https://dein-bot.onrender.com/` öffnen, Passwort eingeben und
   den QR-Code scannen. Die Oberfläche passt sich automatisch an Handy, Tablet
   und Laptop an.

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
  verloren → der QR-Code muss neu gescannt werden.
- Wer den QR-Code scannt, übernimmt die Session – darum ist `/qr` mit Passwort
  geschützt.
