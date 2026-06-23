# 🔌 Einbau-Anleitung (Update 6.0)

> Erst ausführen, wenn du das Update live haben willst. Vorher passiert **nichts**.
> Reihenfolge einhalten. Nach jedem Schritt `node -c index.js` ausführen.

---

## Schritt 0 – Vorbereitung
1. Keine neue Render-Variable nötig. Spiele werden pro Gruppe per `!spielgruppe an`
   (nur Inhaber) freigeschaltet – gespeichert in `config.gameGroups`.
2. `TURSO_*`-Variablen sind bereits gesetzt.

---

## Schritt 1 – Wirtschaft & Spiele (`economy.js` + `future-update/games.js`)

**Oben in `index.js` (bei den require-Zeilen):**
```js
const { EconomyManager, HOUSES, TIER_LABELS, formatBalance, houseCard, marketPage } = require('./economy');
const { GameManager, fmtWait, isGameGroup, setGameGroup } = require('./future-update/games');
const { ShopManager, shopList } = require('./future-update/shop');
const { QuestManager } = require('./future-update/quests');
const { EventManager } = require('./future-update/events');
let economy = null, game = null, shop = null, quest = null, events = null;
const duels = new Map(); // für PvP-Würfelduelle: key = `${jid}:${gegnerNum}`
```

**Im Startup-Block** (nach `store.loadConfig(...).then(...)`):
```js
if (!config.gameGroups || typeof config.gameGroups !== 'object') config.gameGroups = {};
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  economy = new EconomyManager(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  await economy.init();
  shop = new ShopManager(economy); await shop.init();
  game = new GameManager(economy);
  quest = new QuestManager(economy);
  events = new EventManager(economy);
  logger.info('Wirtschaft, Shop, Quests, Events & Spiele bereit');
}
```

**Im `switch (cmd)`-Block:** die Cases aus den Kommentaren in `economy.js`
(`ECONOMY_COMMANDS`), `future-update/games.js` (`GAME_COMMANDS`),
`future-update/shop.js` (`SHOP_COMMANDS`), `future-update/quests.js`
(`QUEST_COMMANDS`) und `future-update/events.js` (`EVENT_COMMANDS`) einfügen.
Der `spielgruppe`-Case (Inhaber) gehört dazu.

**Inhaber-Freigabe pro Gruppe** – zentrale Sperre direkt vor allen Spiel-/Wirtschaftscases
(außer `spielgruppe` selbst):
```js
const GAME_CMDS = ['balance','vermögen','networth','kaufen','verkaufen','inventar','markt',
  'angebot','reich','daily','arbeiten','work','miete','pay','überweisen','level','rang',
  'achievements','erfolge','einzahlen','deposit','auszahlen','withdraw','zinsen','lotto',
  'lotterie','jackpot','slots','coinflip','cf','würfelwette','dicebet','roulette','hl',
  'higherlower','bj','blackjack','duell','annehmen','rauben','rob','shop','kaufenitem',
  'buyitem','verkaufenitem','sellitem','items','meineitems','einkommen','tagesdeal',
  'quests','aufgaben','claim','event','ereignis','glücksrad','wheel','rubbellos',
  'scratch','box'];
if (GAME_CMDS.includes(cmd)) {
  if (!economy) { await reply('🎮 Spielmodus nicht verfügbar (keine Datenbank).'); break; }
  if (!isGameGroup(config, jid)) { await reply('🚫 Spiele sind hier nicht freigeschaltet. Der Inhaber kann sie mit !spielgruppe an aktivieren.'); break; }
}
```

**COMMANDS-Registry & ALIAS** um die neuen Befehle ergänzen (sonst zeigt der `!hilfe`-Filter sie nicht).

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

**Fertige Seiten-Renderer** (am einfachsten):
```js
// Dashboard
res.send(webui.renderDashboard([
  { k: 'Nummer', v: escapeHtml(nummer) },
  { k: 'Laufzeit', v: uptime },
  { k: 'Aktive Gruppen', v: activeGroupCount() },
  { k: 'Speicher', v: speicher, badge: 'OK', badgeType: 'good' },
], keyParam));

// Login-Seite
res.send(webui.renderLogin(keyParam, fehlerText));

// Gruppen-Liste
res.send(webui.renderGroups(botState.groups, keyParam));

// Reichste Spieler (aus economy.getLeaderboard())
res.send(webui.renderEconomyBoard(rows, keyParam));

// Einstellungen mit Animations-Schaltern
res.send(webui.renderSettings([{ label: 'DM-Assistent', name: 'dm', checked: config.settings?.dmAssistant }], keyParam));
```
Einzelne Komponenten (`webui.table`, `webui.progressBar`, `webui.toggleSwitch`, `webui.groupCard`)
lassen sich auch frei in eigenes HTML einsetzen. Routen einzeln umstellen – das alte UI bleibt
funktionsfähig, bis alles migriert ist.

---

## Schritt 3.5 – Quest-Fortschritt melden (optional, empfohlen)
An den passenden Cases `await quest.track(...)` einfügen, z. B.:
```js
await quest.track(senderJid, 'slots');             // im slots-Case
await quest.track(senderJid, 'work');              // im arbeiten-Case
await quest.track(senderJid, 'gamble');            // in jedem Casino-Case
await quest.track(senderJid, 'win');               // wenn ein Casino-Spiel gewonnen
await quest.track(senderJid, 'earn', verdienst);   // wenn Coins verdient wurden
await quest.track(senderJid, 'buyhouse');          // im kaufen-Case
await quest.track(senderJid, 'daily');             // im daily-Case
```
Achievements nach Geldänderungen prüfen: `const neu = await economy.checkAchievements(senderJid);`
und bei `neu.length` eine kurze Glückwunsch-Nachricht senden.

## Schritt 4 – Testen
- `node -c index.js` → fehlerfrei.
- Lokal/Render starten, Log prüfen: „Wirtschaft, Shop, Quests & Spiele bereit", „Turso verbunden".
- Als Inhaber `!spielgruppe an` in einer Testgruppe; dann:
  `!daily`, `!arbeiten`, `!markt`, `!kaufen h001`, `!slots 100`, `!roulette rot 100`,
  `!shop`, `!kaufenitem pet_cat`, `!quests`, `!einzahlen 1000`, `!zinsen`, `!lotto 2`.
- In einer NICHT freigeschalteten Gruppe → Spielbefehle werden abgelehnt.
- `!menu` zeigt rollenabhängige Menüs; `!modallow @x moderation` als Inhaber testen.
- Web-UI im Browser prüfen (Hell/Dunkel-Umschalter oben rechts, Animationen).

---

## Rückbau / Not-Aus
Da nichts automatisch geladen wird, genügt es, die in Schritt 1–3 hinzugefügten
`require`- und Case-Zeilen wieder zu entfernen. Die Module selbst sind nebenwirkungsfrei.
