# 🔌 Einbau-Anleitung (Update 6.0)

> Erst ausführen, wenn du das Update live haben willst. Vorher passiert **nichts**.
> Reihenfolge einhalten. Nach jedem Schritt `node -c index.js` ausführen.

---

## Schritt 0 – Vorbereitung
1. In Render eine Variable `GAME_GROUP_JID` mit der JID der Spiel-Gruppe anlegen
   (JID bekommst du mit `!id` in der gewünschten Gruppe).
2. `TURSO_*`-Variablen sind bereits gesetzt.

---

## Schritt 1 – Wirtschaft & Spiele (`economy.js` + `future-update/games.js`)

**Oben in `index.js` (bei den require-Zeilen):**
```js
const { EconomyManager, HOUSES, TIER_LABELS, formatBalance, houseCard, marketPage } = require('./economy');
const { GameManager, fmtWait } = require('./future-update/games');
const GAME_GROUP_JID = process.env.GAME_GROUP_JID || '';
let economy = null, game = null;
```

**Im Startup-Block** (nach `store.loadConfig(...).then(...)`, vor/nach `startBot()`):
```js
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  economy = new EconomyManager(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  await economy.init();
  game = new GameManager(economy);
  logger.info('Wirtschaft & Spiele aktiv');
}
```

**Im `switch (cmd)`-Block:** die Cases aus dem Kommentar in `economy.js`
(`ECONOMY_COMMANDS`) und `future-update/games.js` (`GAME_COMMANDS`) einfügen.

**Spiel-Gruppen-Sperre** – direkt vor diesen Cases:
```js
const ECO_CMDS = ['balance','kaufen','verkaufen','inventar','markt','angebot','reich',
                  'daily','arbeiten','work','miete','pay','überweisen','slots','coinflip',
                  'cf','würfelwette','dicebet','rauben','rob'];
if (ECO_CMDS.includes(cmd) && GAME_GROUP_JID && jid !== GAME_GROUP_JID) {
  await reply('🎮 Spiele laufen nur in der Spiel-Gruppe.'); break;
}
```

**COMMANDS-Registry & ALIAS** um die neuen Befehle ergänzen (sonst `!hilfe`-Filter zeigt sie nicht).

---

## Schritt 2 – Menüs & Moderator-Rechte (`future-update/menus.js`)

**Require oben:**
```js
const menus = require('./future-update/menus');
const { getModCategories } = menus;
```

**`config.mods` beim Laden absichern** (im Startup-Block):
```js
if (!config.mods || typeof config.mods !== 'object') config.mods = {};
```

**Cases** aus dem `MENU_COMMANDS`-Kommentar in `menus.js` in den switch kopieren
(`menu`, `adminmenu`, `modmenu`, `modallow`, `moddeny`, `modlist`).

**Moderator-Gate** – im Befehls-Gate (wo bisher Admin geprüft wird) erweitern, damit
freigegebene Moderatoren ihre Kategorie nutzen dürfen:
```js
// Beispiel für Moderationsbefehle:
const modKat = 'moderation';
const darfMod = menus.isModeratorFor(config, senderNum, modKat);
if (!isAdmin(metaForAdmin, senderJid) && !darfMod && !(await isCommunityOwner(senderJid, jid))) continue;
```

---

## Schritt 3 – Neues Web-Design (`future-update/webui.js`)

**Require oben:**
```js
const webui = require('./future-update/webui');
```

**Pro Route** das alte Inline-HTML ersetzen, z. B. das Dashboard:
```js
const cards = [
  webui.statCard('Nummer', escapeHtml(nummer)),
  webui.statCard('Laufzeit', uptime),
  webui.statCard('Aktive Gruppen', activeGroupCount()),
  webui.statCard('Speicher', speicher, { badge: 'OK', badgeType: 'good' }),
];
const body = `<div class="section-title">Übersicht</div>${webui.statGrid(cards)}`;
res.send(webui.pageShell('Dashboard', body, { active: 'dashboard', keyParam }));
```
Routen einzeln umstellen – so bleibt das alte UI funktionsfähig, bis alles migriert ist.

---

## Schritt 4 – Testen
- `node -c index.js` → fehlerfrei.
- Lokal/Render starten, Log prüfen: „Wirtschaft & Spiele aktiv", „Turso verbunden".
- In der Spiel-Gruppe: `!daily`, `!arbeiten`, `!markt`, `!kaufen h001`, `!slots 100`.
- `!menu` zeigt rollenabhängige Menüs; `!modallow @x moderation` als Inhaber testen.
- Web-UI im Browser prüfen (Hell/Dunkel-Umschalter oben rechts).

---

## Rückbau / Not-Aus
Da nichts automatisch geladen wird, genügt es, die in Schritt 1–3 hinzugefügten
`require`- und Case-Zeilen wieder zu entfernen. Die Module selbst sind nebenwirkungsfrei.
