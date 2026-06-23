# 🚀 Großes Update (Update 6.0) – Vorbereitung

> **WICHTIG – NICHT AKTIV.** Keine Datei in diesem Ordner wird von `index.js`
> geladen oder ausgeführt. Der laufende Bot bleibt davon **komplett unberührt**.
> Selbst wenn dieser Ordner auf den Server kommt, ändert sich am Verhalten des
> Bots **nichts** – bis du die Module bewusst gemäß `INTEGRATION.md` einbindest.

Damit kannst du das Update in Ruhe vorbereiten, ohne dass sich der Server neu
startet oder etwas am Live-Betrieb kaputt geht.

---

## Was hier entsteht

| Modul | Datei | Zweck | Status |
|-------|-------|-------|--------|
| 🏠 Wirtschaft | `../economy.js` | 130 Häuser, Coins, Kauf/Verkauf, Tagesangebote, Miete, **Bank+Zinsen, Level/XP, Achievements, Lotterie** | ausgebaut |
| 🎮 Spiele | `games.js` | Slots, Coinflip, Würfelwette, **Roulette, Blackjack, Higher-Lower, PvP-Duell** + Inhaber-Freigabe pro Gruppe | ausgebaut |
| 🛒 Shop | `shop.js` | Autos, Haustiere, Boosts (XP/Glück/Einkommen) + Tagesdeal | NEU |
| 🎯 Quests | `quests.js` | 3 Tagesquests mit Fortschritt & Belohnung (Coins + XP) | NEU |
| 📋 Menüs | `menus.js` | `!menu`, `!adminmenu`, `!modmenu` – Befehle nach Rolle; Inhaber steuert Mod-Rechte | ausgebaut |
| 🎨 Web-UI | `webui.js` | Neues cleanes Design (Apple/Samsung-Stil), Animationen, fertige Seiten-Renderer | ausgebaut |
| 🔌 Einbau | `INTEGRATION.md` | Schritt-für-Schritt, wie jedes Modul in `index.js` eingehängt wird | — |

---

## Rollen-Modell (wer darf was)

1. **Inhaber (Owner)** – das bist du. Wird automatisch als Ersteller/Superadmin
   der Community-Hauptgruppe erkannt (siehe `isCommunityOwner` in `index.js`).
   Nur der Inhaber darf festlegen, welche Befehle Moderatoren nutzen dürfen.
2. **Moderator** – von dir bestimmte Personen. Dürfen nur, was du freigibst.
3. **Admin** – WhatsApp-Gruppenadmin (klassische Moderationsbefehle).
4. **Benutzer** – alle anderen (Spiele, Spaßbefehle).

---

## Spiele pro Gruppe freischalten (Inhaber)

Spiele & Wirtschaft sind **standardmäßig aus**. Nur der Community-Inhaber schaltet sie
pro Gruppe frei: `!spielgruppe an` (bzw. `!spielgruppe aus`). Gespeichert in
`config.gameGroups[jid]` – überlebt Neustarts via Turso. Keine feste `GAME_GROUP_JID`-Variable nötig.

## Umgebungsvariablen

| Variable | Zweck |
|----------|-------|
| `TURSO_DATABASE_URL` | bereits gesetzt – wird auch für Coins/Häuser/Bank/Items genutzt |
| `TURSO_AUTH_TOKEN` | bereits gesetzt |

---

## Reihenfolge beim späteren Einbau

1. `economy.js` + `games.js` zusammen einbinden (Wirtschaft ist Basis der Spiele).
2. `menus.js` einbinden (ordnet alle – auch neue – Befehle in Menüs ein).
3. `webui.js` einbinden (ersetzt schrittweise das alte Dashboard-HTML).

Jeder Schritt ist in `INTEGRATION.md` mit fertigem Copy-Paste-Code beschrieben.
