# WhatsApp Community Bot

Ein WhatsApp-Bot auf Baileys-Basis mit:
- **Heartbeat**: schickt alle 5 Minuten ein Lebenszeichen in eine private Gruppe (nur der Bot ist dort Mitglied)
- **Befehle**: `!ping`, `!status`, `!hilfe`
- **HTTP-Endpoint** `/ping` für UptimeRobot, damit Render den Service nicht einschlafen lässt

## 1. Lokal testen (optional)

```bash
npm install
npm start
```

Beim ersten Start erscheint ein QR-Code im Terminal. Mit WhatsApp scannen:
**Einstellungen → Verknüpfte Geräte → Gerät verknüpfen**

## 2. Auf Render deployen

1. Dieses Repo mit Render verbinden (Web Service)
2. **Build Command:** `npm install`
3. **Start Command:** `npm start`
4. Environment-Variablen setzen (siehe unten)
5. Deployen

Nach dem Deploy im **Logs-Tab** von Render nachschauen — dort erscheint der QR-Code als Text-Grafik.
Mit dem Handy scannen, fertig.

⚠️ **Wichtig:** Render Free-Tier hat **kein dauerhaftes Dateisystem**. Nach jedem
Neudeploy (z. B. nach einem Code-Update) geht die Login-Session verloren und du musst
erneut per QR-Code einloggen. Für eine dauerhafte Session bräuchtest du ein Render-Volume
(kostenpflichtig) oder einen externen Speicher.

## 3. Environment-Variablen (bei Render unter "Environment" eintragen)

| Variable | Beschreibung | Beispiel |
|---|---|---|
| `HEARTBEAT_GROUP_ID` | ID deiner privaten Heartbeat-Gruppe | `123456789-1234567890@g.us` |
| `HEARTBEAT_INTERVAL_MS` | Intervall in Millisekunden (optional) | `300000` (= 5 Min) |
| `COMMAND_PREFIX` | Präfix für Befehle (optional) | `!` |

## 4. Heartbeat-Gruppen-ID finden

1. Bot einmal verbinden (QR-Code scannen)
2. Eine **neue, private Gruppe** erstellen, in der NUR der Bot-Account drin ist
   (z. B. Gruppe erstellen, dich selbst kurz hinzufügen, eine Nachricht senden lassen, dich selbst wieder entfernen)
3. Im Code/Log temporär folgende Zeile in `messages.upsert` einfügen, um die ID zu sehen:
   ```js
   console.log('Gruppe-ID:', remoteJid);
   ```
4. Eine Nachricht in die Gruppe schreiben → die ID erscheint im Log
5. Die ID in die Environment-Variable `HEARTBEAT_GROUP_ID` eintragen

## 5. UptimeRobot einrichten (damit der Service nicht einschläft)

1. Kostenlosen Account auf [uptimerobot.com](https://uptimerobot.com) erstellen (keine Kreditkarte nötig)
2. Neuen Monitor anlegen:
   - **Monitor Type:** HTTP(s)
   - **URL:** `https://DEIN-RENDER-NAME.onrender.com/ping`
   - **Monitoring Interval:** 5 Minuten
3. Speichern — fertig

Damit bleibt der Render-Service dauerhaft wach, ohne dass eine Kreditkarte nötig ist.
