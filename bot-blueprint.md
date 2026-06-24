# 🤖 WhatsApp-Bot — Master-Blueprint für den kompletten Neuaufbau

> **Zweck dieses Dokuments**
> Dies ist die *eine* Datei, die alles enthält, was für den sauberen Neuaufbau
> des Bots gebraucht wird: jede Funktion und jedes Feature der alten Version
> (außer den Spielen – die kommen später), die komplette Technik, der **Speicher
> und wie man ihn erreicht**, das **Daten-Schema**, die **Pflicht-Verbesserungen**,
> ein Vorschlag für die **intelligente neue Struktur** und die **UI-Design-Spezifikation**.
>
> Du (oder eine andere KI) kannst dieses Dokument Stück für Stück abarbeiten und
> daraus eine komplett neue, saubere Version planen und bauen – Tag für Tag.
>
> **Wichtig:** Die *alte* Code-Struktur wird **nicht übernommen**. Sie ist die
> Referenz für *was* der Bot kann, nicht für *wie* er gebaut sein soll. Das *Wie*
> wird neu und besser gemacht (siehe Kapitel 8 & 9).

---

## 0. Schnell-Übersicht (TL;DR)

- **Was:** WhatsApp-Bot mit Web-Oberfläche, der pro Gruppe konfigurierbar ist.
- **Kern:** Verbindung zu WhatsApp (Baileys), **Moderation** (Beleidigungen,
  Links, Spam), **Befehle** (Utility + Admin/Moderation), **passwortgeschützte
  Web-Oberfläche** zum Konfigurieren und Auswerten.
- **Speicher:** dreistufig – **Turso (Cloud-SQLite)** → **MongoDB** → **lokale Datei**.
- **Hosting:** läuft als Web-Service (z. B. Render Free), hält sich per Self-Ping
  + externem Monitor wach.
- **Was neu muss:** intelligenteres Befehls-/Rechte-System (kein simples
  „true/false"), saubere modulare Struktur, modernes Mobile-First-UI.
- **Später:** das ganze Spiel-/Wirtschaftssystem (Casino, Shop, Quests, Berufe,
  Arena, Welt, Farm …) – **bewusst nicht Teil dieses Blueprints**.

---

## 1. Projekt-Überblick

Der Bot verbindet sich über die [Baileys](https://github.com/WhiskeySockets/Baileys)-Bibliothek
mit WhatsApp (Multi-Device, QR-Login). Er reagiert in Gruppen auf Befehle mit
einem Präfix (Standard `!`) und moderiert Nachrichten automatisch. Eine
passwortgeschützte Website zeigt den QR-Code zum Verbinden und erlaubt die
Konfiguration **pro Gruppe** sowie die Auswertung aller gesammelten Daten.

**Leitprinzipien der alten Version (sollen erhalten bleiben):**
1. **Stürzt nie ab.** Globale `uncaughtException`/`unhandledRejection`-Handler,
   jeder Befehl in try/catch. Ein Fehler in einem Befehl darf den Bot nie killen.
2. **Läuft auch ohne Cloud-DB.** Ohne Turso/Mongo wird in eine lokale Datei
   gespeichert (auf Free-Hosting flüchtig, aber funktionsfähig).
3. **Pro Gruppe einstellbar.** Jede Gruppe kann eigene Befehlsrechte, Moderation,
   Regeln und Willkommensnachricht haben.
4. **Self-Healing-Verbindung.** Automatischer Reconnect mit Backoff bei
   Verbindungsabbruch.

---

## 2. Technischer Stack

| Bereich | Technologie |
| --- | --- |
| Laufzeit | Node.js ≥ 20 (CommonJS) |
| WhatsApp | `@whiskeysockets/baileys` ^6.7 |
| Webserver | `express` ^4 |
| Logging | `pino` ^9 |
| QR-Code | `qrcode` + `qrcode-terminal` |
| Cloud-Speicher 1 | `@libsql/client` (Turso / libSQL) |
| Cloud-Speicher 2 | `mongodb` ^6 |
| Auth-Session (WA) | `useMultiFileAuthState` → Ordner `auth_info/` (per .gitignore ausgeschlossen) |

**Start:** `npm install` → `npm start` (= `node index.js`).

---

## 3. Aktuelle Dateistruktur (Ist-Zustand, nur zur Referenz)

```
index.js            # Alles-in-einem: Verbindung, Web-UI, Befehls-Router, Init
moderation.js       # Moderations-Engine (eigenständig, sauber)
store.js            # Persistenz-Schicht (Turso → Mongo → Datei)
command-catalog.js  # Reine Befehls-Dokumentation (Daten für Hilfe-Seite)
package.json
auth_info/          # WhatsApp-Session (nicht committen!)
bot_config.json     # lokaler Datei-Fallback der Konfiguration
```

> **Kritik:** `index.js` ist viel zu groß und mischt alles (HTTP, HTML,
> Bot-Logik, Routing). Im Neuaufbau muss das in klare Module getrennt werden
> (siehe Kapitel 9).

---

## 4. 💾 Speicher / Persistenz — und wie man ihn erreicht

Die gesamte Konfiguration ist **ein einziges JSON-Objekt**, das unter dem
Schlüssel `config` abgelegt wird. Die Persistenz-Schicht (`store.js`) bietet nur
zwei Funktionen: `loadConfig()` und `saveConfig(config)`. Beide sind asynchron
und wählen automatisch das beste verfügbare Backend.

**Priorität (Fallback-Kette):**

```
1. Turso (libSQL, Cloud-SQLite)   ← bevorzugt, überlebt Neustarts
2. MongoDB Atlas                  ← Fallback
3. Lokale Datei bot_config.json   ← letzter Fallback (flüchtig auf Free-Hosting)
```

### 4.1 Turso (empfohlen)
- **Env-Variablen:** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- **Tabelle:** `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`
- **Lesen:** `SELECT value FROM kv WHERE key = 'config'` → `JSON.parse(value)`
- **Schreiben:** `INSERT OR REPLACE INTO kv(key,value) VALUES('config', <json>)`
- So erreicht man den Speicher direkt (z. B. zum Export/Backup oder Migration):
  Mit den beiden Env-Werten eine libSQL-Verbindung öffnen und obige Query laufen
  lassen. Der gesamte Bot-Zustand steckt in dieser einen Zeile.

### 4.2 MongoDB (Fallback)
- **Env-Variablen:** `MONGODB_URI`, `MONGODB_DB` (Default `whatsappbot`)
- **Collection:** `config`, **Dokument:** `{ _id: 'main', config: { … } }`
- Lesen: `findOne({ _id: 'main' })` → `.config`
- Schreiben: `updateOne({ _id: 'main' }, { $set: { config } }, { upsert: true })`

### 4.3 Lokale Datei (letzter Fallback)
- Datei `bot_config.json` im Projektordner, hübsch formatiertes JSON.
- Auf Render-Free nach jedem Neustart **weg** → daher Cloud-DB nutzen.

### 4.4 Migration/Backup-Hinweis
Weil **alles** in einem JSON liegt, ist ein Backup trivial: den Wert von
`kv.config` (Turso) bzw. das `config`-Feld (Mongo) exportieren. Genau dieses
JSON kann der Neuaufbau übernehmen – siehe Schema in Kapitel 7.

---

## 5. Umgebungsvariablen (vollständig)

| Variable | Pflicht | Zweck / Default |
| --- | --- | --- |
| `PORT` | nein | HTTP-Port (Default `3000`) |
| `QR_PASSWORD` | **empfohlen** | Passwort für die gesamte Web-Oberfläche (Default eingebaut – unbedingt überschreiben!) |
| `COMMAND_PREFIX` | nein | Befehls-Präfix (Default `!`) |
| `SELF_URL` | nein | Öffentliche URL für Self-Ping (sonst `RENDER_EXTERNAL_URL`) |
| `RENDER_EXTERNAL_URL` | auto | von Render gesetzt, Fallback für Self-Ping |
| `LOG_LEVEL` | nein | pino-Level (Default `info`) |
| `OWNER_JIDS` | nein | Notfall-Override für Community-Inhaber (Nummern, kommagetrennt) |
| `TURSO_DATABASE_URL` | für Turso | Cloud-SQLite-URL |
| `TURSO_AUTH_TOKEN` | für Turso | Cloud-SQLite-Token |
| `MONGODB_URI` | für Mongo | MongoDB-Connection-String |
| `MONGODB_DB` | nein | DB-Name (Default `whatsappbot`) |

---

## 6. 📋 Feature-Inventar (alles außer Spiele)

### 6.1 Verbindung & Betrieb
- **QR-Login** (Multi-Device) über Web-Seite *und* Terminal.
- **Session-Persistenz** im Ordner `auth_info/`.
- **Auto-Reconnect** mit Backoff bei `connection.update = close` (außer bei
  `loggedOut` → dann muss neu gescannt werden).
- **Crash-Schutz:** globale Error-Handler, der Prozess läuft weiter.
- **Keep-Alive:** offener `/ping`-Endpoint für externe Monitore (UptimeRobot,
  cron-job.org) + optionaler interner Self-Ping alle ~4 Min.
- **Fehler-Log im RAM:** die letzten ~200 warn/error werden gepuffert und in der
  Web-UI angezeigt.

### 6.2 Befehlssystem (Ist-Zustand)
- Nachricht beginnt mit Präfix → erstes Wort = Befehl, Rest = Argumente.
- **Alias-Tabelle** (z. B. `help`→`hilfe`, `report`→`melden`).
- Pro Gruppe ist je Befehl ein Wert gesetzt: **`'all'` | `'admin'` | `false`**
  (alle dürfen / nur Admins / deaktiviert).
- Der Community-**Inhaber** wird überall wie ein Admin behandelt; manche Befehle
  sind **nur für den Inhaber** (`ownerOnly`).
- ⚠️ **Schwäche:** Das ist ein simpler Drei-Werte-Check pro Befehl. Es gibt keine
  Cooldowns, keine Rate-Limits pro Befehl, keine Kontext-/Argument-Validierung
  auf Systemebene, keine zentrale Rechte-Logik. → **Neu machen, Kapitel 9.**

#### Behaltene Befehle (Kern – ohne Spiele)

**Allgemein / Utility (für alle):**
`hilfe` · `ping` · `info` · `id` · `regeln` · `gruppe` · `top` · `stats` · `melden`

**Moderation / Admin (Standard nur Admins):**
`sag` · `alle` · `kick` · `ban` · `mute` · `unmute` · `warn` · `unwarn` ·
`clearwarn` · `warninfo` · `warnlist` · `promote` · `demote` · `link` · `revoke` ·
`announce` · `pin` · `unpin` · `setregeln` · `setwelcome` · `welcome` · `lock` ·
`unlock` · `infolock` · `infounlock` · `setname` · `setdesc` · `del` · `admins` ·
`ephemeral` · `addmode` · `slowmode` · `remind`

**Inhaber-Befehle (nur Community-Inhaber):**
`communitykick` (= dauerhaft aus ALLEN Community-Gruppen bannen) ·
`communityunban` · `communitybanlist`

> **Befehls-Beschreibungen** stehen ausführlich in `command-catalog.js` und
> können 1:1 übernommen werden (deutsche Texte, Nutzung, Beispiele).

### 6.3 Moderation (Engine: `moderation.js`)
Pro Gruppe aktivierbar über `group.moderation`. Funktioniert nur, wenn der Bot
in der Gruppe **Admin** ist (zum Löschen). Bestandteile:

- **Beleidigungs-Filter:** eingebaute deutsche + englische Wortliste
  (`DEFAULT_BADWORDS`) plus pro Gruppe **zusätzliche Wörter** (`extraBadwords`).
  Erkennt einzelne Wörter (Token-genau) und Phrasen. → Nachricht löschen +
  **Verwarnung**. Ab `warnLimit` (Default **3**) → **Soft-Mute** (10 Min).
- **Link-Filter:** Regex erkennt URLs, `chat.whatsapp.com`-Links und viele TLDs.
  → Nachricht löschen + freundlicher Hinweis.
- **Spam-/Flood-Schutz:** mehr als **6 Nachrichten in 10 Sek** (`flood`) oder
  **4× dieselbe Nachricht** (`repeat`) → löschen + Mute.
- **Soft-Mute:** gemutete Person → ihre Folgenachrichten werden automatisch
  gelöscht, bis der Mute abläuft.
- **Verwarnungs-Verwaltung (auch per Admin-Befehl):** `addWarning`,
  `removeWarning`, `clearWarnings`, `getWarnings`, `getAllWarnings`,
  `muteUser`, `unmuteUser`, `isMutedUser`, `getMuteTimeLeft`.
- **Persistenz:** Warnungen & Mutes werden pro Gruppe in
  `group.moderation._state` gespeichert (überleben Neustarts).
- **Auto-Aufräumen:** abgelaufene Mutes/alte Spam-Fenster werden periodisch
  entfernt; Verwarnungen verfallen nach 24 h Inaktivität.

**Konstanten (anpassbar):** `MUTE_MS = 10 min`, `SPAM_LIMIT = 6 / 10 s`,
`REPEAT_LIMIT = 4`, `warnLimit` default `3`.

### 6.4 Pro-Gruppe-Konfiguration
- `active` (Bot in Gruppe an/aus)
- `commands` (Rechte je Befehl)
- `moderation` (badwords, links, warnLimit, slowmode, extraBadwords + `_state`)
- `rules` (Text für `!regeln`)
- `welcome` (an/aus + Nachricht, Platzhalter `{user}`)
- `memberStats`, `banLog` (siehe 6.9)

### 6.5 Community-Funktionen
- WhatsApp-**Communities** werden erkannt (Hauptgruppe = Parent-JID).
- Der **Inhaber** wird automatisch als Ersteller der Community-Hauptgruppe
  erkannt (Override per `OWNER_JIDS`).
- **Community-Bann:** eine Person dauerhaft aus *allen* Gruppen der Community
  sperren (gespeichert in `communityBans[parentJid]`).
- Community-weite **Sammeleinstellungen**: Moderation/Welcome/Regeln/Status auf
  alle Gruppen einer Community gleichzeitig anwenden + optionale Ankündigung.

### 6.6 Willkommensnachrichten
- Neue Mitglieder werden begrüßt (`group-participants.update`), wenn aktiviert.
- Platzhalter `{user}` = Nummer/Mention des neuen Mitglieds.

### 6.7 DM-Assistent / Anliegen
- Standardmäßig **aus** (`settings.dmAssistant`).
- Wenn an: schreibt jemand dem Bot **privat** (mit Präfix), wird das **Anliegen**
  gespeichert, die gemeinsamen Gruppen/Communities werden erkannt und an die
  Admins weitergeleitet. In der Web-UI abrufbar (offen/erledigt).

### 6.8 Meldungen (`!melden`)
- Jedes Mitglied kann eine **Meldung** an die Admins schicken; sie landet in
  `config.reports` mit Gruppe, Absender, Text, Zeit. In der Web-UI einsehbar.

### 6.9 Statistiken & Logs
- **memberStats** pro Gruppe & Nummer: `messages`, `commands`, `warnings`,
  `lastSeen` (treibt `!top`, `!stats`, Mitglied-Profil, Aktivitäts-Leaderboard).
- **banLog** pro Gruppe: `{ num, bannedBy, reason, at }` (max 500).
- **activityLog** (RAM): die letzten ~100 Bot-Aktionen.
- **errorLog** (RAM): die letzten ~200 Warnungen/Fehler.

### 6.10 Web-Oberfläche (Ist-Zustand)
Alles passwortgeschützt (Cookie-Session nach Login mit `QR_PASSWORD`), außer
`/ping`, `/healthz`, `/` (Login) und `/status`. Vorhandene Seiten (zur Referenz,
**werden im Zwischenschritt entfernt**, im Neuaufbau modern neu gebaut):

- **Login & QR:** `/`, `/login`, `/logout`, `/qr`
- **Gesundheit:** `/ping`, `/healthz`, `/status`, `/robots.txt`
- **Gruppen:** `/settings` (Liste), `/group` + `/group/save` (Konfig),
  `/group/members`, `/group/stats` (Aktivitäts-Leaderboard)
- **Mitglieder:** `/member` (Profil), `/member/action` (mute/kick/warn/…)
- **Daten:** `/reports`, `/banlog`, `/anliegen` (+ `/anliegen/done`),
  `/activity`, `/fehlerlog`
- **Community:** `/community`, `/community/toggle`, `/community/settings`
  (+ save), `/community/global` (+ save)
- **Werkzeuge:** `/lookup` (Nummer), `/search`, `/befehle` (Referenz)
- **Monitoring:** `/dashboard`, `/api/stats`, `/server`
- **Steuerung:** `/power/on`, `/power/off`, `/bot/restart`, `/server/restart`

---

## 7. 🗄️ Daten-Schema (vollständige Referenz)

Das gesamte gespeicherte JSON (`config`) sieht so aus:

```jsonc
{
  "groups": {
    "<gruppenJid>": {
      "active": true,
      "commands": { "<befehl>": "all" | "admin" | false },
      "moderation": {
        "badwords": false,
        "links": false,
        "warnLimit": 3,
        "slowmode": 0,                 // Sekunden, 0 = aus
        "extraBadwords": ["idiot"],
        "_state": {                     // Laufzeit-Zustand, persistiert
          "warnings":   { "<jid>": { "count": 1, "lastAt": 0, "reasons": [ { "reason": "...", "by": "auto|admin", "at": 0 } ] } },
          "mutedUntil": { "<jid>": 1700000000000 }
        }
      },
      "rules": "1. Sei nett …" | null,
      "welcome": { "enabled": false, "message": "Willkommen @{user}!" | null },
      "memberStats": { "<nummer>": { "messages": 0, "commands": 0, "warnings": 0, "lastSeen": 0 } },
      "banLog": [ { "num": "49…", "bannedBy": "49…", "reason": "Spam", "at": 0 } ]
    }
  },
  "settings": { "dmAssistant": false },
  "anliegen": [ { "id": 0, "num": "49…", "text": "…", "at": 0, "groups": [], "communities": [], "status": "offen|erledigt" } ],
  "communityBans": { "<parentJid>": { "<nummer>": { "by": "49…", "reason": "…", "at": 0 } } },
  "reports": [ { "id": 0, "groupJid": "…", "groupName": "…", "senderNum": "49…", "text": "…", "at": 0 } ],
  "globalSettings": {
    "syncEnabled": false, "botActive": true,
    "welcome": { "enabled": false, "message": "…" },
    "moderation": { "badwords": false, "links": false, "warnLimit": 3, "slowmode": 0 },
    "announcement": ""
  },
  "mods": {},
  "botPowered": true
}
```

---

## 8. ⚠️ Schwächen der aktuellen Struktur (was neu/intelligenter werden muss)

> Das ist der Kern deiner Kritik: „Das System guckt nur, ist das *true* oder
> *false* – das soll intelligenter sein."

1. **Befehls-Routing ist ein Riesen-`switch`.** Jeder Befehl ist hartcodiert in
   einer riesigen `switch (cmd) { case … }`-Anweisung in einer 3000+-Zeilen-Datei.
   Unwartbar, unübersichtlich, fehleranfällig.
2. **Rechte = nur 3 Werte.** `all/admin/false` ist zu grob. Es fehlen: Cooldowns,
   Rate-Limits, Rollen (Owner/Admin/Mod/User), kontextabhängige Regeln,
   Bedingungen (z. B. „nur wenn Bot Admin ist", „nur in Communities").
3. **Keine Argument-/Eingabe-Validierung auf Systemebene.** Jeder Befehl parst
   seine Argumente selbst und unterschiedlich → inkonsistent.
4. **Alles in einer Datei.** HTTP, HTML, Bot-Logik, Persistenz vermischt.
5. **HTML als String-Templates** im Code → schwer zu pflegen, kein echtes UI.
6. **Kein einheitliches Antwort-/Fehler-Format.** Reaktionen sind ad hoc.
7. **Keine Tests, keine Typen.** Schwer abzusichern.

---

## 9. 🧠 Ziel-Architektur für den Neuaufbau (Vorschlag)

### 9.1 Modulare Ordnerstruktur (Vorschlag)
```
src/
  index.js              # nur Bootstrap: lädt Config, startet Bot + Webserver
  core/
    connection.js       # Baileys-Verbindung, Reconnect, Crash-Schutz
    storage.js          # Persistenz-Abstraktion (Turso/Mongo/Datei) – wie store.js
    config.js           # Config laden/speichern/defaults/migration
    logger.js
  bot/
    router.js           # intelligenter Befehls-Dispatcher (siehe 9.2)
    permissions.js      # Rollen- & Rechte-Engine
    middleware/         # cooldown, ratelimit, requireBotAdmin, validateArgs …
    commands/           # je Befehl eine Datei (Definition + Handler)
      moderation/…
      utility/…
    moderation.js       # Auto-Moderation (badwords/links/spam) – wie heute
    events.js           # group-participants.update (Welcome), messages.upsert
  web/
    server.js           # Express-Setup, Auth-Middleware
    routes/             # saubere, kleine Route-Module
    views/              # echte Templates / modernes Frontend (siehe Kapitel 10)
```

### 9.2 Intelligentes Befehlssystem (das Herzstück der Verbesserung)
Statt eines `switch` bekommt **jeder Befehl ein Objekt mit Metadaten**, und der
Router entscheidet zentral. Beispiel-Definition:

```js
module.exports = {
  name: 'kick',
  aliases: [],
  category: 'moderation',
  description: 'Entfernt ein getaggtes Mitglied.',
  usage: '!kick @user',
  // INTELLIGENTE REGELN statt nur true/false:
  access: 'admin',            // 'owner' | 'admin' | 'mod' | 'all'
  scope: 'group',             // 'group' | 'dm' | 'any'
  requiresBotAdmin: true,     // Bot muss Gruppen-Admin sein
  requiresTarget: true,       // ein @mention/Antwort nötig
  cooldownMs: 3000,           // pro Nutzer
  args: [{ name: 'reason', type: 'text', required: false }],
  async run(ctx) {            // ctx = { sock, msg, group, sender, args, reply, … }
    // … reine Befehlslogik, keine Rechteprüfung mehr hier …
  },
};
```

Der **Router** lädt alle Befehle aus `commands/` in ein Registry-Objekt
(`Map<name|alias, command>`) und führt für jeden eingehenden Befehl eine
**Middleware-Kette** aus:

```
eingehende Nachricht
  → ist Befehl? (Präfix)            → Befehl im Registry finden (inkl. Alias)
  → Gruppe aktiv? Befehl erlaubt?   → Scope prüfen (group/dm)
  → Rolle des Senders bestimmen     → access prüfen (owner/admin/mod/all)
  → requiresBotAdmin? requiresTarget?→ Cooldown/Rate-Limit?
  → Argumente validieren/parsen     → command.run(ctx)
  → einheitliches Fehler-Handling   → einheitliche Antwort
```

Vorteile: neue Befehle = **eine Datei**, keine Änderung am Kern; Rechte,
Cooldowns, Validierung **zentral und konsistent**; testbar.

### 9.3 Rollen-Engine
- **owner** (Community-Inhaber, automatisch erkannt + `OWNER_JIDS`-Override)
- **admin** (WhatsApp-Gruppen-Admin)
- **mod** (optional: vom Owner ernannt, gespeichert in `config.mods`)
- **user** (alle anderen)

Eine Funktion `resolveRole(sender, group) → role` liefert die effektive Rolle;
der Router vergleicht sie mit `command.access`.

### 9.4 Speicher-Abstraktion
`storage.js` bleibt wie das heutige `store.js` (Turso → Mongo → Datei), aber
als saubere, getestete Schnittstelle: `load()`, `save(config)`,
`backend()` (welches gerade aktiv ist). Schreibvorgänge **debounced**
(nicht bei jeder Kleinigkeit sofort schreiben).

---

## 10. 🎨 UI-Design-Spezifikation (für die neue Web-Oberfläche)

> Notiz für den Neuaufbau: So soll die Landingpage / Web-Oberfläche aussehen.

**Ziel:** Ein modernes, extrem flüssiges, visuell beeindruckendes UI. Absolut
**Mobile-First** (für Smartphones optimiert). Kein abgehackter oder blockiger Look.

**Stil & Farben**
- „**Dark Tech**" kombiniert mit „**Glassmorphism**".
- Haupthintergrund: tiefes, elegantes **Dunkelblau / Anthrazit**.
- Darauf weiche, ineinanderfließende **Gradients** in **Neon-Lila** und
  **Cyan / Elektro-Blau**.

**Formen & Ecken**
- Keine scharfen Kanten. Alle Boxen, Karten, Buttons mit großzügigen, sehr
  weichen Rundungen (**`border-radius: 20px` oder mehr**) → organisch & modern.

**Tiefe & Effekte**
- Inhaltselemente wirken wie **halbtransparentes Milchglas**, das über dem
  animierten Hintergrund schwebt (backdrop-filter: blur).
- Feine, leicht **leuchtende Kanten** (Glow-Effekt) an den Boxen.

**Animationen**
- Lebendig: sanfte, flüssige **CSS-Animationen** (langsames Schweben von
  Hintergrundelementen, weiche Transitions beim Berühren/Hovern von Buttons).

**Layout-Struktur**
- Cleaner Aufbau.
- **Ein großer, auffälliger Haupt-Button** direkt im sichtbaren Bereich
  (above the fold).
- Eine moderne **Sektion für die Bot-Befehle**.
- Ein vorbereiteter, **geschützter Login-Bereich**.
- Alles wirkt „**wie aus einem Guss**".

---

## 11. ✅ Pflicht-Verbesserungen („müssen rein")

1. **Intelligentes Befehls-/Rechte-System** (Kapitel 9.2/9.3) statt `switch` +
   true/false.
2. **Saubere modulare Struktur** (Kapitel 9.1) statt einer Mega-Datei.
3. **Modernes Mobile-First-UI** nach Design-Spezifikation (Kapitel 10).
4. **Speicher-Abstraktion** beibehalten (Turso → Mongo → Datei), inkl. einfacher
   **Backup/Export**-Möglichkeit des Config-JSON.
5. **Stabilität bewahren:** Crash-Schutz, Auto-Reconnect, Keep-Alive,
   persistente Warnungen/Mutes.
6. **Alle bestehenden Nicht-Spiel-Features** aus Kapitel 6 übernehmen.

---

## 12. 🚧 Bewusst nicht enthalten (kommt später)

Das komplette **Spiel-/Wirtschaftssystem** der alten Version
(Coins/Bank/Aktien, Casino, Shop, Quests, Gilden/Clans, Welt/RPG, Berufe,
Arena, Farming, Sozial-Profile) ist **absichtlich nicht** Teil dieses
Blueprints. Es lief nur mit Turso und war über 80 % des alten Codes. Es wird –
wenn überhaupt – **erst nach dem stabilen Kern** als optionales Modul wieder
angefügt.

---

## 13. 📦 Übergabe-Checkliste für die nächste Planung

- [ ] Speicher-Zugang testen (Turso-URL + Token → `kv.config` lesen).
- [ ] Aktuelles Config-JSON exportieren (= Backup aller Gruppen/Daten).
- [ ] Neue modulare Projektstruktur anlegen (Kapitel 9.1).
- [ ] Speicher-Abstraktion portieren (store.js → storage.js).
- [ ] Moderations-Engine portieren (moderation.js ist schon sauber).
- [ ] Intelligentes Befehlssystem bauen (Router + Permissions + Middleware).
- [ ] Befehle einzeln als Dateien anlegen (Texte aus command-catalog.js).
- [ ] Modernes UI nach Design-Spezifikation bauen (Kapitel 10).
- [ ] Verbindung/Keep-Alive/Reconnect/Crash-Schutz übernehmen.
- [ ] (Später) Spielmodul optional ergänzen.

---

*Dieses Dokument ist die einzige benötigte Datei für die Neuplanung. Es kann
kopiert, heruntergeladen und einer anderen KI Schritt für Schritt vorgelegt
werden.*
