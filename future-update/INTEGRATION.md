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

---

## Schritt 5 – Clan-System (`future-update/clan.js`)

**Require oben:**
```js
const { ClanManager, CLAN_LEVELS, clanLevelInfo } = require('./future-update/clan');
let clan = null;
```

**Im Startup-Block:**
```js
if (economy) {
  clan = new ClanManager(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  await clan.init();
  logger.info('Clan-System bereit');
}
```

**Cases aus dem CLAN_COMMANDS-Kommentar in clan.js einfügen.**

Clan-XP beim Spielen hinzufügen:
```js
// Nach jedem Casino-Gewinn:
if (clan) await clan.addClanXp(senderJid, Math.floor(win / 100));
// Nach jeder Arbeit:
if (clan) await clan.contributeMemberXp(senderJid, 10);
```

---

## Schritt 6 – Investitionen & Aktien (`economy.js` Erweiterung)

Die `STOCKS`-Konstante und `getStockPrice()` sind bereits in `economy.js` definiert.
Neue Cases aus dem `ADDITIONAL ECONOMY COMMANDS`-Kommentar einfügen.

**GAME_CMDS-Liste erweitern:**
```js
// Füge zur GAME_CMDS-Liste hinzu:
'aktien','stocks','challenge','aufgabe','challenge-claim','erkunden','suchen',
'networth','vermögen','titel','klasse'
```

---

## Schritt 7 – Erweiterte Spielmodi (`future-update/games.js` Erweiterung)

Neue Spielcases aus `ADDITIONAL GAME COMMANDS`-Kommentar einfügen:

| Befehl | Funktion |
|--------|----------|
| `!vpoker <einsatz>` | Video Poker starten |
| `!vpoker halten 1 3 5` | Karten 1, 3, 5 behalten |
| `!war <einsatz>` | Kartenkrieg |
| `!slots-deluxe <einsatz>` | 5×3 Slot-Grid |
| `!zahlduell <1-10> <einsatz>` | Nummern-Duel |
| `!ernten` | Coin-Harvest (alle 2h) |

**GAME_CMDS erweitern:**
```js
'vpoker','videopoker','war','kartenkrieg','slots-deluxe','superslots',
'zahlduell','numduell','ernten','harvest'
```

---

## Schritt 8 – Shop-Erweiterungen (`future-update/shop.js`)

Neue Cases aus `ADDITIONAL SHOP COMMANDS`:

| Befehl | Funktion |
|--------|----------|
| `!verzaubern <item> <enchant>` | Item verzaubern |
| `!bundle` | Bundle-Liste |
| `!bundle <id>` | Bundle kaufen |
| `!saisonshop` | Saisonale Items |
| `!legendary` | Legendäre Items |

---

## Schritt 9 – Quest-Erweiterungen (`future-update/quests.js`)

Neue Cases aus `ADDITIONAL QUEST COMMANDS`:

| Befehl | Funktion |
|--------|----------|
| `!meilensteine` | Achievement-Quests |
| `!meilenstein-claim <id>` | Meilenstein einlösen |
| `!saisonquests` | Saisonale Quests |

---

## Schritt 10 – Event-Erweiterungen (`future-update/events.js`)

Neue Cases aus `ADDITIONAL EVENT COMMANDS`:

| Befehl | Funktion |
|--------|----------|
| `!boss` | Boss-Status |
| `!boss angriff` | Boss angreifen |
| `!gruppenlos start [min]` | Gruppen-Lotterie starten |
| `!gruppenlos join [einsatz]` | Mitmachen |
| `!gruppenlos ziehen` | Gewinner ziehen |
| `!megaevent` | Aktives Mega-Event anzeigen |

---

## Vollständige Befehlsübersicht (alle Module)

### 💰 Wirtschaft
| Befehl | Beschreibung |
|--------|-------------|
| `!balance` | Kontostand anzeigen |
| `!daily` | Tagesbonus (Streak-System) |
| `!arbeiten` | Coins verdienen (30min CD) |
| `!miete` | Mieteinnahmen einsammeln |
| `!markt` | Häuser-Marktübersicht |
| `!kaufen <id>` | Haus kaufen |
| `!verkaufen <id>` | Haus verkaufen |
| `!inventar` | Eigene Häuser |
| `!pay @person <betrag>` | Überweisung (>10k: 5% Steuer) |
| `!networth` | Gesamtvermögen (Coins+Häuser+Aktien) |
| `!titel` | Reichtums-Klasse anzeigen |
| `!level` | Level & XP-Fortschritt |
| `!prestige` | Prestige durchführen (ab Lv 50) |
| `!prestige info` | Prestige-Status |
| `!achievements` | Freigeschaltete Erfolge |
| `!statistik` | Vollständige Spielstatistik |
| `!lotto <anzahl>` | Lotterie-Los kaufen |
| `!jackpot` | Aktueller Jackpot |

### 🏦 Bank
| Befehl | Beschreibung |
|--------|-------------|
| `!einzahlen <betrag>` | Coins einzahlen |
| `!auszahlen <betrag>` | Coins abheben |
| `!zinsen` | Tageszinsen (1 % auf Guthaben) |

### 🏠 Immobilien-Handel
| Befehl | Beschreibung |
|--------|-------------|
| `!anbieten <haus-id> <preis>` | Haus auf Handelsmarkt anbieten |
| `!handel <haus-id>` | Haus kaufen |
| `!handelsmarkt` | Offene Angebote |
| `!handelabbrechen <haus-id>` | Angebot zurückziehen |

### 📈 Aktien
| Befehl | Beschreibung |
|--------|-------------|
| `!aktien` | Marktübersicht (tagesaktuelle Kurse) |
| `!aktien kaufen <id> <anzahl>` | Aktien kaufen |
| `!aktien verkaufen <id> <anzahl>` | Aktien verkaufen |
| `!aktien depot` | Eigenes Depot |

### 🎯 Quests
| Befehl | Beschreibung |
|--------|-------------|
| `!quests` | Tages- & Wochenquests |
| `!claim <id>` | Quest einlösen |
| `!community` | Community-Challenge-Status |
| `!meilensteine` | Einmalige Achievement-Quests |
| `!meilenstein-claim <id>` | Meilenstein-Belohnung holen |
| `!saisonquests` | Saisonale Quests |
| `!challenge` | Tages-Challenge anzeigen |
| `!challenge-claim` | Tages-Challenge einlösen |

### 🎲 Casino (nur freigegebene Gruppen)
| Befehl | Beschreibung |
|--------|-------------|
| `!slots <einsatz>` | Klassischer Einarmiger Bandit |
| `!slots-deluxe <einsatz>` | 5×3 Slot-Maschine mit Gewinnlinien |
| `!coinflip <einsatz>` | Kopf oder Zahl |
| `!würfelwette <einsatz>` | Würfeln gegen den Bot |
| `!roulette <farbe/dozen> <einsatz>` | Roulette (rot/schwarz/grün, 1d/2d/3d) |
| `!blackjack <einsatz>` | Blackjack mit echtem Deck |
| `!poker <einsatz>` | 5-Card-Draw gegen Bot |
| `!vpoker <einsatz>` | Video Poker (Jacks or Better) |
| `!hl <einsatz>` | Higher-Lower |
| `!crash <einsatz>` | Crash-Spiel |
| `!keno <einsatz> <zahl1> ... <zahl5>` | Keno (5 aus 20) |
| `!baccarat <spieler/bank/tie> <einsatz>` | Baccarat |
| `!rennen info` | Pferde-Quoten anzeigen |
| `!rennen <1-6> <einsatz>` | Auf Pferd setzen |
| `!mines <einsatz> <minen 1-3> <zelle 1-9>` | Minenfeld |
| `!turm <einsatz> <würfel 2-6>` | Dice Tower |
| `!war <einsatz>` | Kartenkrieg |
| `!zahlduell <1-10> <einsatz>` | Nummern-Duel |
| `!ernten` | Coin-Harvest (2h Cooldown) |
| `!duell @person <einsatz>` | PvP Würfelduell |
| `!annehmen` | Duell-Herausforderung annehmen |
| `!rauben @person` | Spieler ausrauben |
| `!lotto <anzahl>` | Lotterie-Los |
| `!glücksrad <einsatz>` | Glücksrad drehen |
| `!rubbellos <einsatz>` | Rubbellos |
| `!box <titan/omega/...>` | Mystery-Box öffnen |
| `!tagesbox` | Kostenlose Tagesbox (einmal täglich) |
| `!event` | Zufallsereignis auslösen |
| `!suchen` | Erkunden (8h CD, Zufallsfund) |

### 🛒 Shop
| Befehl | Beschreibung |
|--------|-------------|
| `!shop` | Shop ansehen |
| `!kaufenitem <id>` | Item kaufen |
| `!items` | Eigene Items |
| `!einkommen` | Tages-Passiveinkommen |
| `!tagesdeal` | Tages-Sonderangebot (-25%) |
| `!crafting` | Crafting-Rezepte |
| `!craften <id1> <id2> <id3>` | Item craften |
| `!itemposter <item-id> <preis>` | Item auf Marktplatz stellen |
| `!itemkaufen <item-id>` | Item vom Marktplatz kaufen |
| `!itemmarkt` | Marktplatz anzeigen |
| `!itemabbruch <item-id>` | Eigenes Angebot zurückziehen |
| `!schenken @person <item-id>` | Item verschenken |
| `!verzaubern <item-id> <enchant-id>` | Item verzaubern |
| `!bundle` | Bundle-Angebote |
| `!bundle <id>` | Bundle kaufen |
| `!saisonshop` | Saisonale Items (nur bei Event) |
| `!legendary` | Legendäre Items anzeigen |

### 🏆 Turnier
| Befehl | Beschreibung |
|--------|-------------|
| `!turnier start <spiel> [min] [preis]` | Turnier starten (Admin) |
| `!turnier status` | Aktueller Turnier-Stand |
| `!turnier ende` | Turnier beenden & Sieger küren (Admin) |

### 👾 Boss & Events
| Befehl | Beschreibung |
|--------|-------------|
| `!boss` | Boss-Status anzeigen |
| `!boss angriff` | Boss angreifen (30s CD) |
| `!gruppenlos start [min]` | Gruppen-Lotterie starten (Admin) |
| `!gruppenlos join [einsatz]` | An Lotterie teilnehmen |
| `!gruppenlos ziehen` | Gewinner ziehen (Admin) |
| `!megaevent` | Aktives Mega-Event |
| `!saisonbonus` | Saisonalen Bonus holen |

### ⚔️ Clan
| Befehl | Beschreibung |
|--------|-------------|
| `!clan info` | Eigener Clan |
| `!clan erstellen <name>` | Clan gründen (5.000 Coins) |
| `!clan suche <name>` | Clan suchen |
| `!clan beitritt <name>` | Clan beitreten |
| `!clan verlassen` | Clan verlassen |
| `!clan spenden <betrag>` | In Schatzkammer einzahlen |
| `!clan kick @person` | Mitglied kicken (Leader) |
| `!clan übertragen @person` | Leadership übergeben |
| `!clan beschreibung <text>` | Beschreibung setzen |
| `!clan top` | Clan-Rangliste |
| `!clan auflösen` | Clan auflösen (Leader) |

### 🛡️ Administration
| Befehl | Beschreibung |
|--------|-------------|
| `!spielgruppe an` | Spiele in Gruppe aktivieren (Inhaber) |
| `!spielgruppe aus` | Spiele deaktivieren (Inhaber) |
| `!communitykick @person` | Aus ALLEN Gruppen bannen |
| `!communityunban @person` | Bann aufheben |
| `!communitybanlist` | Alle gesperrten Nutzer |
| `!modallow @person <kategorie>` | Moderator-Rechte vergeben |
| `!moddeny @person <kategorie>` | Moderator-Rechte entziehen |
| `!modlist` | Alle Moderatoren |
| `!menu` | Vollständiges Menü |
| `!menu kompakt` | Kurzmenü |
| `!hilfesuche <begriff>` | Befehl suchen |

---

## Häufige Fehler & Lösungen

### „Wirtschaft nicht verfügbar"
→ `TURSO_DATABASE_URL` und `TURSO_AUTH_TOKEN` nicht gesetzt.
Prüfe Render-Umgebungsvariablen.

### „Spiele sind hier nicht freigeschaltet"
→ Als Inhaber: `!spielgruppe an` in der gewünschten Gruppe tippen.

### Quest-Fortschritt wird nicht gezählt
→ `await quest.track(senderJid, 'event_name')` fehlt im entsprechenden Case.
Alle Tracking-Punkte aus dem `QUEST_COMMANDS`-Kommentar in `quests.js` einfügen.

### Boss erscheint nicht
→ Boss-Encounter werden manuell über `events.spawnBoss(jid)` gestartet oder
können in einem Cron-Job zufällig getriggert werden.

### Aktien-Kurse wechseln täglich
→ Korrekt – sie sind tages-seed-basiert. Für Echtzeit-Kurse wäre eine API nötig.

---

## Datenbankstruktur (Turso-Tabellen)

```sql
-- Kern-Economy (economy.js)
CREATE TABLE IF NOT EXISTS players (user_id TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, bank INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS owned_houses (user_id TEXT, house_id TEXT, bought_at INTEGER, PRIMARY KEY (user_id, house_id));
CREATE TABLE IF NOT EXISTS player_meta (user_id TEXT, key TEXT, value INTEGER, PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS achievements (user_id TEXT, achievement_id TEXT, earned_at INTEGER, PRIMARY KEY (user_id, achievement_id));
CREATE TABLE IF NOT EXISTS lottery (user_id TEXT, draw_seed INTEGER, tickets INTEGER, PRIMARY KEY (user_id, draw_seed));
CREATE TABLE IF NOT EXISTS trade_offers (seller_id TEXT, house_id TEXT, asking_price INTEGER, created_at INTEGER, PRIMARY KEY (seller_id, house_id));

-- Shop (shop.js)
CREATE TABLE IF NOT EXISTS owned_items (user_id TEXT, item_id TEXT, bought_at INTEGER, PRIMARY KEY (user_id, item_id));
CREATE TABLE IF NOT EXISTS item_market (seller_id TEXT, item_id TEXT, ask_price INTEGER, listed_at INTEGER, PRIMARY KEY (seller_id, item_id));

-- Quests (quests.js)
CREATE TABLE IF NOT EXISTS quest_progress (user_id TEXT, quest_id TEXT, progress INTEGER, date_seed INTEGER, PRIMARY KEY (user_id, quest_id, date_seed));
CREATE TABLE IF NOT EXISTS quest_claims (user_id TEXT, quest_id TEXT, date_seed INTEGER, PRIMARY KEY (user_id, quest_id, date_seed));
CREATE TABLE IF NOT EXISTS global_challenge (event TEXT, progress INTEGER, date_seed INTEGER, PRIMARY KEY (event, date_seed));

-- Clans (clan.js)
CREATE TABLE IF NOT EXISTS clans (id TEXT PRIMARY KEY, name TEXT UNIQUE, leader_id TEXT, xp INTEGER DEFAULT 0, treasury INTEGER DEFAULT 0, description TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS clan_members (clan_id TEXT, user_id TEXT, role TEXT DEFAULT 'member', xp_contributed INTEGER DEFAULT 0, joined_at INTEGER, PRIMARY KEY (clan_id, user_id));
```

---

## Performance-Tipps

- **Cooldowns** werden über `player_meta` gespeichert. Für häufig gecheckte Cooldowns
  (Arbeit, Miete) kannst du auch einen In-Memory-Cache vorschalten.
- **Turso Free Tier** hat 500 Reads/s. Economy-Operationen sind i.d.R. < 10 Reads pro Befehl.
- **Render Free Plan** schläft nach 15 Min. Der Keep-Alive in `index.js` verhindert das.
- **Lotterieziehung** muss täglich manuell oder per Cron ausgelöst werden (z. B. via Web-Hook).

---

## Versionierung

| Version | Features |
|---------|---------|
| 5.0 | Basis-Bot: Befehle, Community-Bann, Keep-Alive |
| 6.0 | Web-Redesign, Economy-Grundgerüst, erste Spiele |
| 6.1 | Prestige, Handel, 25 Achievements, 20 Jobs |
| 6.2 | Clan-System, Aktien, Boss-Encounter |
| 6.3 | Video Poker, War, Slots Deluxe, Enchantments |
| 6.4 | Gruppen-Lotterie, Mega-Events, Achievement-Quests |
| 6.5 | Turnier-System, Wochenquests, Community-Challenge |
| _7.0_ | _Vollständige Integration in index.js (geplant)_ |
