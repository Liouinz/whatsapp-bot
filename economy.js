// NICHT AKTIV – manuell in index.js einbinden wenn bereit
// Dieses Modul wird vom Server NICHT automatisch geladen.
// Wenn du bereit bist: require('./economy') in index.js einfügen und
// EconomyManager initialisieren + ECONOMY_COMMANDS in den Switch-Block kopieren.

'use strict';

const { createClient } = require('@libsql/client');

// ====================================================================
// 130 einzigartige Häuser (Tier 1–5)
// ====================================================================
const HOUSES = [
  // --- Tier 1 (günstig, 1k–10k) ---
  { id: 'h001', name: 'Gartenlaube', desc: 'Ein kleines Holzhäuschen im Grünen.', price: 1000, tier: 1 },
  { id: 'h002', name: 'Stadtapartment', desc: 'Kompaktes Apartment im Zentrum.', price: 1500, tier: 1 },
  { id: 'h003', name: 'Campingwagen', desc: 'Mobiles Zuhause auf Rädern.', price: 1200, tier: 1 },
  { id: 'h004', name: 'Fischerhaus', desc: 'Gemütlich direkt am Seeufer.', price: 2000, tier: 1 },
  { id: 'h005', name: 'Waldhütte', desc: 'Abgeschieden im tiefen Wald.', price: 2500, tier: 1 },
  { id: 'h006', name: 'Dachkammer', desc: 'Kleines Zimmer unter dem Dach.', price: 800, tier: 1 },
  { id: 'h007', name: 'Kellerwohnung', desc: 'Günstig, aber dafür dein Eigentum.', price: 900, tier: 1 },
  { id: 'h008', name: 'Ziegelhütte', desc: 'Robuste kleine Behausung.', price: 1100, tier: 1 },
  { id: 'h009', name: 'Strandmobil', desc: 'Direkt an der Küste geparkt.', price: 1800, tier: 1 },
  { id: 'h010', name: 'Scheune', desc: 'Umgebaute Scheune mit Flair.', price: 2200, tier: 1 },
  { id: 'h011', name: 'Baumhaus', desc: 'Wohnen zwischen den Ästen.', price: 3000, tier: 1 },
  { id: 'h012', name: 'Hausboot (mini)', desc: 'Schwimmende Einzimmerwohnung.', price: 3500, tier: 1 },
  { id: 'h013', name: 'Tiny House', desc: 'Minimalistisch und effizient.', price: 4000, tier: 1 },
  { id: 'h014', name: 'Iglu', desc: 'Kühles Zuhause im Norden.', price: 1000, tier: 1 },
  { id: 'h015', name: 'Containerhaus', desc: 'Nachhaltiges Upcycling-Heim.', price: 4500, tier: 1 },
  { id: 'h016', name: 'Reihenendhaus', desc: 'Das letzte Haus in der Reihe.', price: 5000, tier: 1 },
  { id: 'h017', name: 'Dorfhaus', desc: 'Traditionelles Heim im Dorf.', price: 5500, tier: 1 },
  { id: 'h018', name: 'Bergkate', desc: 'Einsam und still in den Bergen.', price: 6000, tier: 1 },
  { id: 'h019', name: 'Hafenhaus', desc: 'Blick auf Boote und Wasser.', price: 7000, tier: 1 },
  { id: 'h020', name: 'Stadtrandbungalow', desc: 'Ruhige Lage am Stadtrand.', price: 8000, tier: 1 },
  { id: 'h021', name: 'Sommerhaus', desc: 'Perfekt für die warme Jahreszeit.', price: 9000, tier: 1 },
  { id: 'h022', name: 'Wohngemeinschaft', desc: 'Anteil an einer WG.', price: 1000, tier: 1 },
  { id: 'h023', name: 'Holzchalet', desc: 'Rustikales Chalet aus Holz.', price: 9500, tier: 1 },
  { id: 'h024', name: 'Apfelgartenhütte', desc: 'Umgeben von Obstbäumen.', price: 3200, tier: 1 },
  { id: 'h025', name: 'Strohhütte', desc: 'Ökologisches Strohballenbau.', price: 2800, tier: 1 },
  { id: 'h026', name: 'Bahnwärterhäuschen', desc: 'Historisch, ruhig, abgelegen.', price: 4200, tier: 1 },
  // --- Tier 2 (mittel, 10k–50k) ---
  { id: 'h027', name: 'Reihenmittelhaus', desc: 'Gemütlich in der Mitte der Reihe.', price: 12000, tier: 2 },
  { id: 'h028', name: 'Einfamilienhaus', desc: 'Klassisches Eigenheim.', price: 15000, tier: 2 },
  { id: 'h029', name: 'Doppelhaushälfte', desc: 'Die schönere Hälfte.', price: 13000, tier: 2 },
  { id: 'h030', name: 'Ferienwohnung', desc: 'Immer bereit für Gäste.', price: 18000, tier: 2 },
  { id: 'h031', name: 'Bauernhaus', desc: 'Landluft und viel Platz.', price: 20000, tier: 2 },
  { id: 'h032', name: 'Stadthaus', desc: 'Mehrstöckig mitten in der City.', price: 25000, tier: 2 },
  { id: 'h033', name: 'Strandhaus', desc: 'Meeresrauschen inklusive.', price: 28000, tier: 2 },
  { id: 'h034', name: 'Berghaus', desc: 'Panoramablick auf die Gipfel.', price: 30000, tier: 2 },
  { id: 'h035', name: 'Haus mit Pool', desc: 'Der Pool macht den Unterschied.', price: 35000, tier: 2 },
  { id: 'h036', name: 'Jugendstilhaus', desc: 'Ornamente und Geschichte.', price: 32000, tier: 2 },
  { id: 'h037', name: 'Altbau-Apartment', desc: 'Hohe Decken, viel Charme.', price: 22000, tier: 2 },
  { id: 'h038', name: 'Neubau-Apartment', desc: 'Frisch renoviert, modern.', price: 24000, tier: 2 },
  { id: 'h039', name: 'Hausboot (groß)', desc: 'Wohnkomfort auf dem Wasser.', price: 38000, tier: 2 },
  { id: 'h040', name: 'Wochenendhaus', desc: 'Der Rückzugsort für Freitage.', price: 19000, tier: 2 },
  { id: 'h041', name: 'Landhaus', desc: 'Ländliche Idylle mit Garten.', price: 27000, tier: 2 },
  { id: 'h042', name: 'Mühlenhaus', desc: 'Das Rad dreht sich noch immer.', price: 33000, tier: 2 },
  { id: 'h043', name: 'Pfarrhaus', desc: 'Großzügig und historisch.', price: 29000, tier: 2 },
  { id: 'h044', name: 'Reetdachhaus', desc: 'Nordsee-Feeling pur.', price: 40000, tier: 2 },
  { id: 'h045', name: 'Herrenhaus', desc: 'Für den gehobenen Anspruch.', price: 45000, tier: 2 },
  { id: 'h046', name: 'Penthouse-Starter', desc: 'Kleine Version des großen Traums.', price: 48000, tier: 2 },
  { id: 'h047', name: 'Klinkerbau', desc: 'Robust und norddeutsch.', price: 16000, tier: 2 },
  { id: 'h048', name: 'Atelierhaus', desc: 'Für kreative Köpfe.', price: 21000, tier: 2 },
  { id: 'h049', name: 'Gebirgschalet', desc: 'Alpen-Stil mit Gemütlichkeit.', price: 42000, tier: 2 },
  { id: 'h050', name: 'Gärtnerei-Heim', desc: 'Wohnen umgeben von Blumen.', price: 17000, tier: 2 },
  { id: 'h051', name: 'Forsthütte', desc: 'Das Zuhause des Waldläufers.', price: 11000, tier: 2 },
  { id: 'h052', name: 'Schullandheim', desc: 'Groß, günstig, viel Platz.', price: 14000, tier: 2 },
  // --- Tier 3 (gehoben, 50k–150k) ---
  { id: 'h053', name: 'Villa am See', desc: 'Luxuriös direkt am Ufer.', price: 60000, tier: 3 },
  { id: 'h054', name: 'Stadtpenthouse', desc: 'Über den Dächern der Stadt.', price: 75000, tier: 3 },
  { id: 'h055', name: 'Anwesen mit Park', desc: 'Weitläufiges Gartengelände.', price: 90000, tier: 3 },
  { id: 'h056', name: 'Luxusvilla', desc: 'Das Beste, was Geld kaufen kann.', price: 120000, tier: 3 },
  { id: 'h057', name: 'Herrenhaus mit Reitanlage', desc: 'Für Pferdeliebhaber.', price: 100000, tier: 3 },
  { id: 'h058', name: 'Loft-Penthouse', desc: 'Offen, licht, exklusiv.', price: 85000, tier: 3 },
  { id: 'h059', name: 'Schlosshotel-Suite', desc: 'Eine Suite im eigenen Schloss.', price: 110000, tier: 3 },
  { id: 'h060', name: 'Bergresidenz', desc: 'Hoch oben, weit weg vom Alltag.', price: 95000, tier: 3 },
  { id: 'h061', name: 'Meeresresidenz', desc: 'Wellen direkt vor der Tür.', price: 130000, tier: 3 },
  { id: 'h062', name: 'Historisches Gutshaus', desc: 'Geschichte zum Anfassen.', price: 140000, tier: 3 },
  { id: 'h063', name: 'Designer-Villa', desc: 'Architektur als Kunstwerk.', price: 145000, tier: 3 },
  { id: 'h064', name: 'Golf-Anwesen', desc: 'Eigener Putting Green.', price: 135000, tier: 3 },
  { id: 'h065', name: 'Weinbergresidenz', desc: 'Eigene Trauben, eigener Wein.', price: 115000, tier: 3 },
  { id: 'h066', name: 'Jagdschloss', desc: 'Trophäen nicht inbegriffen.', price: 125000, tier: 3 },
  { id: 'h067', name: 'Inselchalet', desc: 'Eine ganze Insel für dich.', price: 150000, tier: 3 },
  { id: 'h068', name: 'Panoramahaus', desc: 'Rundumsicht auf Natur.', price: 70000, tier: 3 },
  { id: 'h069', name: 'Strandresidenz', desc: 'Exklusiver Strandabschnitt.', price: 105000, tier: 3 },
  { id: 'h070', name: 'Wasserpalast', desc: 'Venedig-Flair im eigenen Heim.', price: 98000, tier: 3 },
  { id: 'h071', name: 'Atriumhaus', desc: 'Innenhof als Herzstück.', price: 65000, tier: 3 },
  { id: 'h072', name: 'Landgut', desc: 'Eigene Felder und Wälder.', price: 88000, tier: 3 },
  { id: 'h073', name: 'Turm-Wohnung', desc: 'Wohnen im historischen Turm.', price: 72000, tier: 3 },
  { id: 'h074', name: 'Kloster (umgebaut)', desc: 'Spirituell und weitläufig.', price: 80000, tier: 3 },
  { id: 'h075', name: 'Tropenvilla', desc: 'Palmen direkt vor dem Fenster.', price: 118000, tier: 3 },
  { id: 'h076', name: 'Loftstudio (XL)', desc: 'Industrie-Chic auf 300 m².', price: 78000, tier: 3 },
  { id: 'h077', name: 'Flussvilla', desc: 'Wasser fließt unter dem Haus.', price: 92000, tier: 3 },
  { id: 'h078', name: 'Château', desc: 'Französisches Landgut.', price: 148000, tier: 3 },
  // --- Tier 4 (exklusiv, 150k–300k) ---
  { id: 'h079', name: 'Privatinselvilla', desc: 'Eine Insel, eine Villa.', price: 200000, tier: 4 },
  { id: 'h080', name: 'Luxuspenthouse (XXL)', desc: 'Das gesamte Dachgeschoss.', price: 220000, tier: 4 },
  { id: 'h081', name: 'Schloss mit Graben', desc: 'Zugbrücke optional.', price: 250000, tier: 4 },
  { id: 'h082', name: 'Mega-Mansion', desc: 'Zehn Schlafzimmer, fünf Pools.', price: 280000, tier: 4 },
  { id: 'h083', name: 'Unterseebasis', desc: 'Leben unter dem Meeresspiegel.', price: 290000, tier: 4 },
  { id: 'h084', name: 'Wolkenkratzer-Suite', desc: 'Etage 80 bis 85 gehören dir.', price: 260000, tier: 4 },
  { id: 'h085', name: 'Festungsresidenz', desc: 'Mittelalter trifft Moderne.', price: 240000, tier: 4 },
  { id: 'h086', name: 'Bergpalast', desc: 'Auf dem höchsten Gipfel.', price: 270000, tier: 4 },
  { id: 'h087', name: 'Ozeanvilla', desc: 'Direkt im Riff gebaut.', price: 285000, tier: 4 },
  { id: 'h088', name: 'Sci-Fi-Haus', desc: 'Futuristisch und einzigartig.', price: 210000, tier: 4 },
  { id: 'h089', name: 'Baumkronendorf', desc: 'Mehrere Baumhäuser, verbunden.', price: 175000, tier: 4 },
  { id: 'h090', name: 'Dachterrassenpalast', desc: 'Endlose Außenfläche.', price: 195000, tier: 4 },
  { id: 'h091', name: 'Vulkanresidenz', desc: 'Heißes Pflaster, exklusiv.', price: 230000, tier: 4 },
  { id: 'h092', name: 'Polarvilla', desc: 'Nordlichter jeden Abend.', price: 185000, tier: 4 },
  { id: 'h093', name: 'Wüstenanwesen', desc: 'Stille und Weitblick.', price: 160000, tier: 4 },
  { id: 'h094', name: 'Dschungelresidenz', desc: 'Mitten im Regenwald.', price: 170000, tier: 4 },
  { id: 'h095', name: 'Himmelspalast', desc: 'Auf einem Bergrücken.', price: 245000, tier: 4 },
  { id: 'h096', name: 'Unterwasserbungalow', desc: 'Glaswände, Fischblick.', price: 275000, tier: 4 },
  { id: 'h097', name: 'Panoramapalast', desc: '360-Grad-Blick garantiert.', price: 215000, tier: 4 },
  { id: 'h098', name: 'Windturbinen-Heim', desc: 'Nachhaltig und einzigartig.', price: 165000, tier: 4 },
  { id: 'h099', name: 'Zeitkapsel-Haus', desc: 'Jede Epoche in einem Zimmer.', price: 190000, tier: 4 },
  { id: 'h100', name: 'Glaspalast', desc: 'Alles transparent, nichts versteckt.', price: 255000, tier: 4 },
  { id: 'h101', name: 'Goldenes Anwesen', desc: 'Vergoldete Beschläge, ernsthaft.', price: 295000, tier: 4 },
  { id: 'h102', name: 'Lavahaus', desc: 'Gebaut aus erkalteter Lava.', price: 180000, tier: 4 },
  { id: 'h103', name: 'Nordseeschloss', desc: 'Dem Meer getrotzt seit 1720.', price: 235000, tier: 4 },
  { id: 'h104', name: 'Mondpalast', desc: 'Terrestrisch, aber mondähnlich.', price: 298000, tier: 4 },
  // --- Tier 5 (legendär, 300k–500k) ---
  { id: 'h105', name: 'Palast der Reichen', desc: 'Der Inbegriff von Luxus.', price: 350000, tier: 5 },
  { id: 'h106', name: 'Goldenes Schloss', desc: 'Vergoldet. Wirklich.', price: 400000, tier: 5 },
  { id: 'h107', name: 'Korallenriff-Residenz', desc: 'Unter dem Ozean gebaut.', price: 380000, tier: 5 },
  { id: 'h108', name: 'Raumstation Alpha', desc: 'Im Orbit, über der Erde.', price: 499000, tier: 5 },
  { id: 'h109', name: 'Diamantenvilla', desc: 'Alles glitzert. Alles.', price: 450000, tier: 5 },
  { id: 'h110', name: 'Kaiserpalast', desc: 'Würde eines ganzen Reiches.', price: 490000, tier: 5 },
  { id: 'h111', name: 'Zeitloser Turm', desc: 'Gebaut für die Ewigkeit.', price: 420000, tier: 5 },
  { id: 'h112', name: 'Göttersitz', desc: 'Olympisch, majestätisch.', price: 480000, tier: 5 },
  { id: 'h113', name: 'Universalpalast', desc: 'Eine Residenz, alle Stile.', price: 360000, tier: 5 },
  { id: 'h114', name: 'Endlosvilla', desc: 'Das Grundstück hat kein Ende.', price: 470000, tier: 5 },
  { id: 'h115', name: 'Arkadien', desc: 'Das mythische Paradies.', price: 460000, tier: 5 },
  { id: 'h116', name: 'Residenz des Lichts', desc: 'Tausende Kristalle.', price: 430000, tier: 5 },
  { id: 'h117', name: 'Kronpalast', desc: 'Für den Herrscher dieser Welt.', price: 440000, tier: 5 },
  { id: 'h118', name: 'Himmelsweg-Villa', desc: 'Zwischen Wolken gebaut.', price: 410000, tier: 5 },
  { id: 'h119', name: 'Das Ultimatum', desc: 'Niemand besitzt mehr als das.', price: 500000, tier: 5 },
  { id: 'h120', name: 'Ewigkeitsresidenz', desc: 'Generationenübergreifend.', price: 395000, tier: 5 },
  { id: 'h121', name: 'Weltenpalast', desc: 'Architektur aus allen Welten.', price: 370000, tier: 5 },
  { id: 'h122', name: 'Drachenburg', desc: 'Stärke und Macht vereint.', price: 385000, tier: 5 },
  { id: 'h123', name: 'Nordlichter-Palast', desc: 'Gläserne Kuppel, ewiges Licht.', price: 415000, tier: 5 },
  { id: 'h124', name: 'Wächterturm', desc: 'Der höchste Punkt des Landes.', price: 340000, tier: 5 },
  { id: 'h125', name: 'Sonnenfeste', desc: 'Erbaut, um die Sonne zu ehren.', price: 455000, tier: 5 },
  { id: 'h126', name: 'Smaragdpalast', desc: 'Grüner Stein, grüner Neid.', price: 375000, tier: 5 },
  { id: 'h127', name: 'Silberburg', desc: 'Alles glänzt und schimmert.', price: 445000, tier: 5 },
  { id: 'h128', name: 'Titanresidenz', desc: 'Für Titanen unter den Reichen.', price: 465000, tier: 5 },
  { id: 'h129', name: 'Sternenpalast', desc: 'Dem Universum am nächsten.', price: 485000, tier: 5 },
  { id: 'h130', name: 'Das Einzigartige', desc: 'Existiert nur einmal. Für dich.', price: 500000, tier: 5 },
];

const TIER_LABELS = { 1: '⚪ Einfach', 2: '🟢 Komfort', 3: '🔵 Gehoben', 4: '🟣 Exklusiv', 5: '🟡 Legendär' };

// Starterkapital für neue Spieler
const STARTING_BALANCE = 5000;

// Preis eines Lotterie-Loses
const LOTTERY_TICKET_PRICE = 250;

// ---- Level/XP: quadratisch ansteigende Schwellen ----
// Level n erfordert insgesamt 100 * n^2 XP.
function xpForLevel(level) { return 100 * level * level; }
function levelFromXp(xp) { return Math.floor(Math.sqrt(Math.max(0, xp) / 100)); }

// ---- Achievements: Bedingung (test) + optionale Coin-Belohnung ----
const ACHIEVEMENTS = [
  // Haus-Meilensteine
  { id: 'first_house',    name: '🏠 Eigenheim',         desc: 'Kaufe dein erstes Haus.',        reward: 1000,   test: (c) => c.houses >= 1 },
  { id: 'five_houses',    name: '🏘️ Immobilienhai',     desc: 'Besitze 5 Häuser.',              reward: 5000,   test: (c) => c.houses >= 5 },
  { id: 'ten_houses',     name: '🏙️ Bauunternehmer',    desc: 'Besitze 10 Häuser.',             reward: 15000,  test: (c) => c.houses >= 10 },
  { id: 'twenty_houses',  name: '🌆 Immobilien-Mogul',  desc: 'Besitze 20 Häuser.',             reward: 40000,  test: (c) => c.houses >= 20 },
  { id: 'fifty_houses',   name: '🌇 Stadtentwickler',   desc: 'Besitze 50 Häuser.',             reward: 150000, test: (c) => c.houses >= 50 },
  { id: 'all_houses',     name: '🗺️ Monopoly-König',    desc: 'Besitze alle 130 Häuser.',       reward: 999999, test: (c) => c.houses >= 130 },
  // Vermögens-Meilensteine
  { id: 'rich_50k',       name: '💰 Wohlhabend',        desc: 'Erreiche 50.000 Vermögen.',      reward: 2500,   test: (c) => c.net >= 50000 },
  { id: 'rich_100k',      name: '💎 Reich',              desc: 'Erreiche 100.000 Vermögen.',     reward: 5000,   test: (c) => c.net >= 100000 },
  { id: 'rich_500k',      name: '💷 Großverdiener',      desc: 'Erreiche 500.000 Vermögen.',     reward: 20000,  test: (c) => c.net >= 500000 },
  { id: 'rich_1m',        name: '👑 Millionär',          desc: 'Erreiche 1.000.000 Vermögen.',   reward: 50000,  test: (c) => c.net >= 1000000 },
  { id: 'rich_5m',        name: '🏦 Multimillionär',     desc: 'Erreiche 5.000.000 Vermögen.',   reward: 200000, test: (c) => c.net >= 5000000 },
  { id: 'rich_10m',       name: '🌍 Tycoon',             desc: 'Erreiche 10.000.000 Vermögen.',  reward: 500000, test: (c) => c.net >= 10000000 },
  { id: 'rich_50m',       name: '🚀 Weltraumreich',      desc: 'Erreiche 50.000.000 Vermögen.',  reward: 2000000, test: (c) => c.net >= 50000000 },
  // Bargeld-Meilensteine
  { id: 'cash_25k',       name: '🤑 Bargeld-König',      desc: 'Halte 25.000 Bargeld.',          reward: 2000,   test: (c) => c.cash >= 25000 },
  { id: 'cash_100k',      name: '💵 Geldspeicher',       desc: 'Halte 100.000 Bargeld.',         reward: 8000,   test: (c) => c.cash >= 100000 },
  { id: 'cash_500k',      name: '💴 Schatzmeister',      desc: 'Halte 500.000 Bargeld.',         reward: 30000,  test: (c) => c.cash >= 500000 },
  // Bank-Meilensteine
  { id: 'bank_100k',      name: '🏦 Banker',             desc: 'Lege 100.000 auf die Bank.',     reward: 5000,   test: (c) => c.bankAmount >= 100000 },
  { id: 'bank_1m',        name: '🏛️ Investmenthai',      desc: 'Lege 1.000.000 auf die Bank.',   reward: 25000,  test: (c) => c.bankAmount >= 1000000 },
  // Level-Meilensteine
  { id: 'level_10',       name: '⭐ Aufsteiger',          desc: 'Erreiche Level 10.',             reward: 5000,   test: (c) => c.level >= 10 },
  { id: 'level_25',       name: '🌟 Erfahrener',          desc: 'Erreiche Level 25.',             reward: 15000,  test: (c) => c.level >= 25 },
  { id: 'level_50',       name: '💫 Meister',             desc: 'Erreiche Level 50.',             reward: 50000,  test: (c) => c.level >= 50 },
  // Prestige
  { id: 'prestige_1',     name: '✨ Prestige I',          desc: 'Führe deinen ersten Prestige durch.', reward: 100000, test: (c) => c.prestige >= 1 },
  { id: 'prestige_3',     name: '🌠 Prestige III',        desc: 'Erreiche Prestige 3.',           reward: 300000, test: (c) => c.prestige >= 3 },
  // Sozial
  { id: 'generous',       name: '💝 Großzügig',           desc: 'Überweise insgesamt 100.000 Coins.', reward: 5000, test: (c) => c.totalGiven >= 100000 },
  { id: 'whale',          name: '🐋 Wal',                 desc: 'Gib insgesamt 1.000.000 Coins aus.', reward: 25000, test: (c) => c.totalSpent >= 1000000 },
];

// ====================================================================
// EconomyManager — Datenbankoperationen
// ====================================================================
class EconomyManager {
  constructor(tursoUrl, tursoToken) {
    if (!tursoUrl || !tursoToken) throw new Error('Turso-Zugangsdaten fehlen');
    this.db = createClient({ url: tursoUrl, authToken: tursoToken });
  }

  async init() {
    await this.db.batch([
      'CREATE TABLE IF NOT EXISTS balances (user_id TEXT PRIMARY KEY, amount INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE IF NOT EXISTS owned_houses (user_id TEXT NOT NULL, house_id TEXT NOT NULL, bought_at INTEGER NOT NULL, PRIMARY KEY (user_id, house_id))',
      // Cooldowns & Spieler-Metadaten (last_daily, last_work, last_rent, xp, bank …)
      'CREATE TABLE IF NOT EXISTS player_meta (user_id TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, key))',
      // Bank: getrennt vom Bargeld, wirft täglich Zinsen ab
      'CREATE TABLE IF NOT EXISTS bank (user_id TEXT PRIMARY KEY, amount INTEGER NOT NULL DEFAULT 0)',
      // Freigeschaltete Achievements
      'CREATE TABLE IF NOT EXISTS achievements (user_id TEXT NOT NULL, ach_id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (user_id, ach_id))',
      // Lotterie-Lose der laufenden Ziehung
      'CREATE TABLE IF NOT EXISTS lottery (user_id TEXT NOT NULL, draw_seed INTEGER NOT NULL, tickets INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, draw_seed))',
    ], 'write');
  }

  // ================================================================
  // Bank – getrenntes Konto mit Tageszins (sicher vor Rauben)
  // ================================================================
  async getBank(userId) {
    const rs = await this.db.execute({ sql: 'SELECT amount FROM bank WHERE user_id=?', args: [userId] });
    return rs.rows[0] ? Number(rs.rows[0].amount) : 0;
  }
  async setBank(userId, amount) {
    await this.db.execute({ sql: 'INSERT OR REPLACE INTO bank(user_id,amount) VALUES(?,?)', args: [userId, Math.max(0, Math.floor(amount))] });
  }
  async deposit(userId, amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return { ok: false, reason: 'Betrag muss positiv sein.' };
    const remaining = await this.deductBalance(userId, amount);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Bargeld.' };
    const bank = await this.getBank(userId);
    await this.setBank(userId, bank + amount);
    return { ok: true, cash: remaining, bank: bank + amount };
  }
  async withdraw(userId, amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return { ok: false, reason: 'Betrag muss positiv sein.' };
    const bank = await this.getBank(userId);
    if (bank < amount) return { ok: false, reason: 'Nicht genug auf der Bank.' };
    await this.setBank(userId, bank - amount);
    const cash = await this.addBalance(userId, amount);
    return { ok: true, cash, bank: bank - amount };
  }
  async collectInterest(userId) {
    const last = await this.getMeta(userId, 'last_interest');
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (now - last < DAY) return { ok: false, waitMs: DAY - (now - last) };
    const bank = await this.getBank(userId);
    if (bank <= 0) return { ok: false, reason: 'Kein Guthaben auf der Bank.' };
    const interest = Math.floor(bank * 0.01); // 1 % pro Tag
    await this.setMeta(userId, 'last_interest', now);
    await this.setBank(userId, bank + interest);
    return { ok: true, interest, bank: bank + interest };
  }
  // Gesamtvermögen = Bargeld + Bank + Hauswerte
  async getNetWorth(userId) {
    const [cash, bank, inv] = await Promise.all([
      this.getBalance(userId), this.getBank(userId), this.getInventory(userId),
    ]);
    const houses = inv.reduce((s, e) => s + (e.house?.price || 0), 0);
    return { cash, bank, houses, total: cash + bank + houses };
  }

  // ================================================================
  // Level / XP
  // ================================================================
  async addXp(userId, amount) {
    const cur = await this.getMeta(userId, 'xp');
    const next = cur + Math.max(0, Math.floor(amount));
    await this.setMeta(userId, 'xp', next);
    const before = levelFromXp(cur);
    const after = levelFromXp(next);
    return { xp: next, level: after, leveledUp: after > before };
  }
  async getLevelInfo(userId) {
    const xp = await this.getMeta(userId, 'xp');
    const level = levelFromXp(xp);
    const cur = xpForLevel(level);
    const need = xpForLevel(level + 1);
    return { xp, level, intoLevel: xp - cur, levelSpan: need - cur, nextAt: need };
  }

  // ================================================================
  // Achievements
  // ================================================================
  async getAchievements(userId) {
    const rs = await this.db.execute({ sql: 'SELECT ach_id, unlocked_at FROM achievements WHERE user_id=?', args: [userId] });
    return rs.rows.map((r) => ({ id: r.ach_id, at: Number(r.unlocked_at), def: ACHIEVEMENTS.find((a) => a.id === r.ach_id) })).filter((r) => r.def);
  }
  async unlock(userId, achId) {
    const def = ACHIEVEMENTS.find((a) => a.id === achId);
    if (!def) return { ok: false };
    try {
      await this.db.execute({ sql: 'INSERT INTO achievements(user_id,ach_id,unlocked_at) VALUES(?,?,?)', args: [userId, achId, Date.now()] });
      if (def.reward) await this.addBalance(userId, def.reward);
      return { ok: true, def, reward: def.reward || 0 };
    } catch {
      return { ok: false, already: true }; // bereits freigeschaltet (PK-Konflikt)
    }
  }
  // Prüft alle Achievements und schaltet neu erreichte frei.
  async checkAchievements(userId) {
    const net = await this.getNetWorth(userId);
    const inv = await this.getInventory(userId);
    const levelInfo = await this.getLevelInfo(userId);
    const bankAmount = await this.getBank(userId);
    const totalGiven = await this.getMeta(userId, 'total_given');
    const totalSpent = await this.getMeta(userId, 'total_spent');
    const prestige = await this.getMeta(userId, 'prestige');
    const already = new Set((await this.getAchievements(userId)).map((a) => a.id));
    const ctx = {
      net: net.total, cash: net.cash, houses: inv.length,
      bankAmount, level: levelInfo.level, prestige, totalGiven, totalSpent,
    };
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (already.has(a.id)) continue;
      if (a.test(ctx)) { const r = await this.unlock(userId, a.id); if (r.ok) newly.push(r); }
    }
    return newly;
  }

  // ================================================================
  // Prestige-System – ab Level 50 zurücksetzen für doppelten XP-Bonus
  // ================================================================
  async prestige(userId) {
    const level = await this.getLevelInfo(userId);
    if (level.level < 50) return { ok: false, reason: `Du brauchst Level 50 für Prestige. Du bist Level ${level.level}.` };
    const p = await this.getMeta(userId, 'prestige');
    const newP = p + 1;
    // XP zurücksetzen, Prestige erhöhen
    await this.setMeta(userId, 'xp', 0);
    await this.setMeta(userId, 'prestige', newP);
    // Belohnung: 100.000 × Prestige-Stufe
    const reward = 100000 * newP;
    const balance = await this.addBalance(userId, reward);
    return { ok: true, prestige: newP, reward, balance };
  }

  async getPrestige(userId) {
    return this.getMeta(userId, 'prestige');
  }

  // ================================================================
  // Statistik-Tracking
  // ================================================================
  async addStat(userId, key, amount = 1) {
    const cur = await this.getMeta(userId, key);
    await this.setMeta(userId, key, cur + amount);
    return cur + amount;
  }

  async getStats(userId) {
    const keys = ['total_games', 'total_wins', 'total_earned', 'total_spent', 'total_given',
                  'total_robbed', 'total_daily', 'total_work', 'total_houses_bought'];
    const vals = await Promise.all(keys.map((k) => this.getMeta(userId, k)));
    return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  }

  // ================================================================
  // Handels-System – Spieler bieten Häuser zum Tausch an
  // ================================================================
  async createTradeOffer(fromId, houseId, askingPrice) {
    askingPrice = Math.floor(askingPrice);
    if (askingPrice <= 0) return { ok: false, reason: 'Preis muss positiv sein.' };
    const house = HOUSES.find((h) => h.id === houseId);
    if (!house) return { ok: false, reason: 'Haus nicht gefunden.' };
    const owned = await this.db.execute({ sql: 'SELECT 1 FROM owned_houses WHERE user_id=? AND house_id=?', args: [fromId, houseId] });
    if (!owned.rows.length) return { ok: false, reason: 'Du besitzt dieses Haus nicht.' };
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO trade_offers(seller_id,house_id,asking_price,created_at) VALUES(?,?,?,?)',
      args: [fromId, houseId, askingPrice, Date.now()],
    });
    return { ok: true, house, askingPrice };
  }

  async acceptTradeOffer(buyerId, houseId) {
    const rs = await this.db.execute({ sql: 'SELECT * FROM trade_offers WHERE house_id=?', args: [houseId] });
    if (!rs.rows.length) return { ok: false, reason: 'Kein Angebot für dieses Haus.' };
    const offer = rs.rows[0];
    if (offer.seller_id === buyerId) return { ok: false, reason: 'Du kannst dein eigenes Angebot nicht kaufen.' };
    const remaining = await this.deductBalance(buyerId, Number(offer.asking_price));
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const house = HOUSES.find((h) => h.id === houseId);
    // Haus übertragen
    await this.db.execute({ sql: 'DELETE FROM owned_houses WHERE user_id=? AND house_id=?', args: [offer.seller_id, houseId] });
    await this.db.execute({ sql: 'INSERT OR IGNORE INTO owned_houses(user_id,house_id,bought_at) VALUES(?,?,?)', args: [buyerId, houseId, Date.now()] });
    await this.addBalance(offer.seller_id, Number(offer.asking_price));
    await this.db.execute({ sql: 'DELETE FROM trade_offers WHERE house_id=?', args: [houseId] });
    return { ok: true, house, price: Number(offer.asking_price), sellerId: offer.seller_id, buyerBalance: remaining };
  }

  async listTradeOffers() {
    const rs = await this.db.execute('SELECT * FROM trade_offers ORDER BY created_at DESC LIMIT 20');
    return rs.rows.map((r) => ({
      sellerId: r.seller_id,
      house: HOUSES.find((h) => h.id === r.house_id),
      askingPrice: Number(r.asking_price),
      createdAt: Number(r.created_at),
    })).filter((o) => o.house);
  }

  async cancelTradeOffer(userId, houseId) {
    const rs = await this.db.execute({ sql: 'SELECT 1 FROM trade_offers WHERE seller_id=? AND house_id=?', args: [userId, houseId] });
    if (!rs.rows.length) return { ok: false, reason: 'Kein Angebot von dir für dieses Haus.' };
    await this.db.execute({ sql: 'DELETE FROM trade_offers WHERE seller_id=? AND house_id=?', args: [userId, houseId] });
    return { ok: true };
  }

  // ================================================================
  // Saisonale Boni – Datum-basierte Sonder-Events
  // ================================================================
  static currentSeason() {
    const d = new Date();
    const m = d.getMonth() + 1, day = d.getDate();
    if (m === 12 && day >= 24 && day <= 26) return { id: 'xmas', name: '🎄 Weihnachten', bonus: 3 };
    if (m === 1 && day === 1) return { id: 'newyear', name: '🎆 Neujahr', bonus: 5 };
    if (m === 10 && day === 31) return { id: 'halloween', name: '🎃 Halloween', bonus: 2 };
    if (m === 2 && day === 14) return { id: 'valentine', name: '💝 Valentinstag', bonus: 2 };
    if (m === 4 && day === 1) return { id: 'april', name: '🃏 April', bonus: 1.5 };
    return null;
  }

  async claimSeasonalBonus(userId) {
    const season = EconomyManager.currentSeason();
    if (!season) return { ok: false, reason: 'Heute gibt es kein saisonales Event.' };
    const key = `season_${season.id}_${new Date().getFullYear()}`;
    const already = await this.getMeta(userId, key);
    if (already) return { ok: false, reason: `Du hast den ${season.name}-Bonus schon abgeholt.` };
    await this.setMeta(userId, key, 1);
    const base = 1000;
    const reward = Math.floor(base * season.bonus);
    const balance = await this.addBalance(userId, reward);
    return { ok: true, season, reward, balance };
  }

  // ================================================================
  // Erweiterte init() mit neuen Tabellen
  // ================================================================
  async initExtra() {
    await this.db.batch([
      'CREATE TABLE IF NOT EXISTS trade_offers (seller_id TEXT NOT NULL, house_id TEXT NOT NULL, asking_price INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (seller_id, house_id))',
    ], 'write');
  }

  // ================================================================
  // Lotterie – täglicher Topf, Gewinner per Tages-Seed
  // ================================================================
  static lotterySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  async buyTicket(userId, count = 1) {
    count = Math.max(1, Math.floor(count));
    const cost = count * LOTTERY_TICKET_PRICE;
    const remaining = await this.deductBalance(userId, cost);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const seed = EconomyManager.lotterySeed();
    const rs = await this.db.execute({ sql: 'SELECT tickets FROM lottery WHERE user_id=? AND draw_seed=?', args: [userId, seed] });
    const have = rs.rows[0] ? Number(rs.rows[0].tickets) : 0;
    await this.db.execute({ sql: 'INSERT OR REPLACE INTO lottery(user_id,draw_seed,tickets) VALUES(?,?,?)', args: [userId, seed, have + count] });
    return { ok: true, tickets: have + count, cost, balance: remaining };
  }
  async getLotteryPot() {
    const seed = EconomyManager.lotterySeed();
    const rs = await this.db.execute({ sql: 'SELECT SUM(tickets) AS t, COUNT(*) AS p FROM lottery WHERE draw_seed=?', args: [seed] });
    const tickets = Number(rs.rows[0]?.t || 0);
    return { tickets, players: Number(rs.rows[0]?.p || 0), pot: tickets * LOTTERY_TICKET_PRICE };
  }

  // ---- Cooldown-Helfer ----
  async getMeta(userId, key) {
    const rs = await this.db.execute({ sql: 'SELECT value FROM player_meta WHERE user_id=? AND key=?', args: [userId, key] });
    return rs.rows[0] ? Number(rs.rows[0].value) : 0;
  }
  async setMeta(userId, key, value) {
    await this.db.execute({ sql: 'INSERT OR REPLACE INTO player_meta(user_id,key,value) VALUES(?,?,?)', args: [userId, key, Math.floor(value)] });
  }

  // ---- Tägliche Belohnung ----
  async claimDaily(userId) {
    const last = await this.getMeta(userId, 'last_daily');
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (now - last < DAY) {
      return { ok: false, waitMs: DAY - (now - last) };
    }
    // Streak-Bonus: aufeinanderfolgende Tage geben mehr.
    let streak = await this.getMeta(userId, 'daily_streak');
    streak = (now - last < 2 * DAY) ? streak + 1 : 1;
    const reward = 500 + Math.min(streak, 14) * 100; // bis +1400 Bonus
    await this.setMeta(userId, 'last_daily', now);
    await this.setMeta(userId, 'daily_streak', streak);
    const balance = await this.addBalance(userId, reward);
    return { ok: true, reward, streak, balance };
  }

  // ---- Arbeiten (kurzer Cooldown, kleiner Verdienst) ----
  async work(userId) {
    const last = await this.getMeta(userId, 'last_work');
    const now = Date.now();
    const COOLDOWN = 30 * 60 * 1000; // 30 Min
    if (now - last < COOLDOWN) return { ok: false, waitMs: COOLDOWN - (now - last) };
    const jobs = [
      { t: 'Du hast als Pizzabote gearbeitet', min: 150, max: 400 },
      { t: 'Du hast Code für eine Firma geschrieben', min: 300, max: 700 },
      { t: 'Du hast einen Stream gemacht', min: 100, max: 900 },
      { t: 'Du hast Pfandflaschen gesammelt', min: 50, max: 250 },
      { t: 'Du hast als DJ aufgelegt', min: 200, max: 600 },
      { t: 'Du hast Nachhilfe gegeben', min: 250, max: 500 },
      { t: 'Du hast Pakete ausgeliefert', min: 180, max: 450 },
      { t: 'Du hast als Barista gearbeitet', min: 120, max: 380 },
      { t: 'Du hast Fotos für Instagram bearbeitet', min: 200, max: 800 },
      { t: 'Du hast beim Supermarkt ausgeholfen', min: 100, max: 350 },
      { t: 'Du hast ein Haus gestrichen', min: 300, max: 900 },
      { t: 'Du hast Musik produziert', min: 150, max: 1200 },
      { t: 'Du hast als Tierarzthelfer gejobbt', min: 250, max: 550 },
      { t: 'Du hast Autos gewaschen', min: 80, max: 300 },
      { t: 'Du hast ein YouTube-Video hochgeladen', min: 50, max: 2000 },
      { t: 'Du hast Aktien-Tipps gegeben (illegal?)', min: 100, max: 1500 },
      { t: 'Du hast auf einem Festival gearbeitet', min: 300, max: 1000 },
      { t: 'Du hast als Fotograf gearbeitet', min: 200, max: 800 },
      { t: 'Du hast Websites gebaut', min: 400, max: 1200 },
      { t: 'Du hast als Sicherheitsmitarbeiter gejobbt', min: 200, max: 500 },
    ];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const earned = job.min + Math.floor(Math.random() * (job.max - job.min + 1));
    await this.setMeta(userId, 'last_work', now);
    await this.addStat(userId, 'total_work');
    await this.addStat(userId, 'total_earned', earned);
    const balance = await this.addBalance(userId, earned);
    return { ok: true, text: job.t, earned, balance };
  }

  // ---- Geld an eine andere Person überweisen ----
  async pay(fromId, toId, amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return { ok: false, reason: 'Betrag muss positiv sein.' };
    const remaining = await this.deductBalance(fromId, amount);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const toBal = await this.addBalance(toId, amount);
    return { ok: true, amount, fromBalance: remaining, toBalance: toBal };
  }

  // ---- Mieteinnahmen aus eigenen Häusern (alle 24h) ----
  async collectRent(userId) {
    const last = await this.getMeta(userId, 'last_rent');
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (now - last < DAY) return { ok: false, waitMs: DAY - (now - last) };
    const inv = await this.getInventory(userId);
    if (!inv.length) return { ok: false, reason: 'Du besitzt keine Häuser.' };
    // 2 % des Hauswerts pro Tag als Miete.
    const rent = inv.reduce((s, e) => s + Math.floor((e.house?.price || 0) * 0.02), 0);
    await this.setMeta(userId, 'last_rent', now);
    const balance = await this.addBalance(userId, rent);
    return { ok: true, rent, houses: inv.length, balance };
  }

  async getBalance(userId) {
    const rs = await this.db.execute({ sql: 'SELECT amount FROM balances WHERE user_id=?', args: [userId] });
    return rs.rows[0] ? Number(rs.rows[0].amount) : STARTING_BALANCE;
  }

  async setBalance(userId, amount) {
    await this.db.execute({ sql: 'INSERT OR REPLACE INTO balances(user_id,amount) VALUES(?,?)', args: [userId, Math.max(0, Math.floor(amount))] });
  }

  async addBalance(userId, amount) {
    const cur = await this.getBalance(userId);
    await this.setBalance(userId, cur + amount);
    return cur + amount;
  }

  async deductBalance(userId, amount) {
    const cur = await this.getBalance(userId);
    if (cur < amount) return null;
    await this.setBalance(userId, cur - amount);
    return cur - amount;
  }

  async getInventory(userId) {
    const rs = await this.db.execute({ sql: 'SELECT house_id, bought_at FROM owned_houses WHERE user_id=? ORDER BY bought_at DESC', args: [userId] });
    return rs.rows.map((r) => ({ houseId: r.house_id, boughtAt: Number(r.bought_at), house: HOUSES.find((h) => h.id === r.house_id) })).filter((r) => r.house);
  }

  async buyHouse(userId, houseId, overridePrice = null) {
    const house = HOUSES.find((h) => h.id === houseId);
    if (!house) return { ok: false, reason: 'Haus nicht gefunden.' };
    const owned = await this.db.execute({ sql: 'SELECT 1 FROM owned_houses WHERE user_id=? AND house_id=?', args: [userId, houseId] });
    if (owned.rows.length) return { ok: false, reason: 'Du besitzt dieses Haus bereits.' };
    const price = overridePrice !== null ? overridePrice : house.price;
    const remaining = await this.deductBalance(userId, price);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    await this.db.execute({ sql: 'INSERT INTO owned_houses(user_id,house_id,bought_at) VALUES(?,?,?)', args: [userId, houseId, Date.now()] });
    return { ok: true, house, price, remaining };
  }

  async sellHouse(userId, houseId) {
    const house = HOUSES.find((h) => h.id === houseId);
    if (!house) return { ok: false, reason: 'Haus nicht gefunden.' };
    const owned = await this.db.execute({ sql: 'SELECT 1 FROM owned_houses WHERE user_id=? AND house_id=?', args: [userId, houseId] });
    if (!owned.rows.length) return { ok: false, reason: 'Du besitzt dieses Haus nicht.' };
    const sellPrice = Math.floor(house.price * 0.7);
    await this.db.execute({ sql: 'DELETE FROM owned_houses WHERE user_id=? AND house_id=?', args: [userId, houseId] });
    const newBal = await this.addBalance(userId, sellPrice);
    return { ok: true, house, sellPrice, newBalance: newBal };
  }

  getDailyOffer() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const pick = (i) => HOUSES[(seed * (i + 1) * 31337) % HOUSES.length];
    const seen = new Set();
    const offers = [];
    for (let i = 0; offers.length < 3; i++) {
      const h = pick(i);
      if (!seen.has(h.id)) { seen.add(h.id); offers.push({ ...h, salePrice: Math.floor(h.price * 0.8) }); }
    }
    return offers;
  }

  async getLeaderboard() {
    const rs = await this.db.execute('SELECT user_id, SUM(0) as total FROM owned_houses GROUP BY user_id LIMIT 10');
    const rows = rs.rows;
    const results = await Promise.all(rows.map(async (r) => {
      const inv = await this.getInventory(r.user_id);
      const totalValue = inv.reduce((s, e) => s + (e.house?.price || 0), 0);
      const balance = await this.getBalance(r.user_id);
      return { userId: r.user_id, houseCount: inv.length, totalValue, balance };
    }));
    return results.sort((a, b) => (b.totalValue + b.balance) - (a.totalValue + a.balance));
  }
}

// ====================================================================
// Formatter-Hilfsfunktionen
// ====================================================================
function formatBalance(n) {
  return n.toLocaleString('de-DE') + ' 🪙';
}

function houseCard(house, extra = '') {
  return `*${house.name}* [${house.id}]\n${TIER_LABELS[house.tier]} · ${formatBalance(house.price)}\n_${house.desc}_${extra ? '\n' + extra : ''}`;
}

function marketPage(page = 0, tierFilter = null) {
  const perPage = 10;
  const filtered = tierFilter ? HOUSES.filter((h) => h.tier === tierFilter) : HOUSES;
  const start = page * perPage;
  const slice = filtered.slice(start, start + perPage);
  if (!slice.length) return 'Keine Häuser auf dieser Seite.';
  const header = `🏘️ *Immobilienmarkt* (Seite ${page + 1}/${Math.ceil(filtered.length / perPage)})\n\n`;
  return header + slice.map((h) => `▸ [${h.id}] ${h.name} – ${formatBalance(h.price)} ${TIER_LABELS[h.tier]}`).join('\n');
}

// ====================================================================
// ECONOMY_COMMANDS — Zum Einbauen in den Switch-Block von index.js
// Kopiere diese Cases in den messages.upsert switch, nachdem du
// `const economy = new EconomyManager(...)` initialisiert hast.
// ====================================================================

/*

  case 'balance': {
    const bal = await economy.getBalance(senderJid);
    await reply(`🪙 Dein Kontostand: *${formatBalance(bal)}*`);
    break;
  }
  case 'kaufen': {
    const houseId = args[0]?.toLowerCase();
    if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}kaufen <Haus-ID>\nBeispiel: ${COMMAND_PREFIX}kaufen h001\nSiehe ${COMMAND_PREFIX}markt für alle Häuser.`); break; }
    const result = await economy.buyHouse(senderJid, houseId);
    if (!result.ok) { await reply(`❌ ${result.reason}`); break; }
    await reply(`🏘️ Du hast *${result.house.name}* für ${formatBalance(result.price)} gekauft!\nVerbleibend: ${formatBalance(result.remaining)}`);
    break;
  }
  case 'verkaufen': {
    const houseId = args[0]?.toLowerCase();
    if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}verkaufen <Haus-ID>`); break; }
    const result = await economy.sellHouse(senderJid, houseId);
    if (!result.ok) { await reply(`❌ ${result.reason}`); break; }
    await reply(`💰 *${result.house.name}* verkauft für ${formatBalance(result.sellPrice)}.\nNeuer Kontostand: ${formatBalance(result.newBalance)}`);
    break;
  }
  case 'inventar': {
    const inv = await economy.getInventory(senderJid);
    if (!inv.length) { await reply('🏘️ Du besitzt noch keine Häuser. Stöbere mit !markt!'); break; }
    const total = inv.reduce((s, e) => s + (e.house?.price || 0), 0);
    const list = inv.map((e) => `▸ ${e.house.name} [${e.house.id}] – ${TIER_LABELS[e.house.tier]}`).join('\n');
    await reply(`🏠 *Deine Immobilien* (${inv.length} Häuser, Wert: ${formatBalance(total)})\n\n${list}`);
    break;
  }
  case 'markt': {
    const page = Math.max(0, (Number(args[0]) || 1) - 1);
    const tierArg = args[0]?.startsWith('t') ? Number(args[0].slice(1)) : null;
    await reply(marketPage(tierArg ? 0 : page, tierArg || null));
    break;
  }
  case 'angebot': {
    const offers = economy.getDailyOffer();
    const lines = offers.map((h) => `✨ *${h.name}* [${h.id}]\n${TIER_LABELS[h.tier]}\n~~${formatBalance(h.price)}~~ → *${formatBalance(h.salePrice)}* (-20%)\n_${h.desc}_`).join('\n\n');
    await reply(`🎟️ *Tagesangebote* – nur heute 20% günstiger!\n\n${lines}`);
    break;
  }
  case 'reich': {
    const board = await economy.getLeaderboard();
    if (!board.length) { await reply('Noch keine Daten.'); break; }
    const medals = ['🥇', '🥈', '🥉'];
    const lines = board.slice(0, 10).map((r, i) => {
      const m = medals[i] || `${i + 1}.`;
      return `${m} @${r.userId.split('@')[0]} – ${r.houseCount} Häuser · ${formatBalance(r.totalValue + r.balance)}`;
    });
    const mentions = board.slice(0, 10).map((r) => r.userId);
    await sock.sendMessage(jid, { text: `🏆 *Reichsten Spieler*\n\n${lines.join('\n')}`, mentions }, { quoted: msg });
    break;
  }

  // ---- Bank ----
  case 'einzahlen': case 'deposit': {
    const r = await economy.deposit(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🏦 Eingezahlt.\nBargeld: ${formatBalance(r.cash)}\nBank: ${formatBalance(r.bank)}`);
    break;
  }
  case 'auszahlen': case 'withdraw': {
    const r = await economy.withdraw(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🏦 Ausgezahlt.\nBargeld: ${formatBalance(r.cash)}\nBank: ${formatBalance(r.bank)}`);
    break;
  }
  case 'zinsen': {
    const r = await economy.collectInterest(senderJid);
    if (!r.ok) { await reply(r.reason || '⏳ Zinsen gibt es einmal pro Tag.'); break; }
    await reply(`💵 Zinsen erhalten: ${formatBalance(r.interest)}\nBank: ${formatBalance(r.bank)}`);
    break;
  }
  case 'vermögen': case 'networth': {
    const n = await economy.getNetWorth(senderJid);
    await reply(`📊 *Vermögen*\nBargeld: ${formatBalance(n.cash)}\nBank: ${formatBalance(n.bank)}\nHäuser: ${formatBalance(n.houses)}\n*Gesamt: ${formatBalance(n.total)}*`);
    break;
  }

  // ---- Level & Achievements ----
  case 'level': case 'rang': {
    const l = await economy.getLevelInfo(senderJid);
    await reply(`⭐ Level *${l.level}*\nXP: ${l.intoLevel}/${l.levelSpan} bis Level ${l.level + 1}`);
    break;
  }
  case 'achievements': case 'erfolge': {
    const list = await economy.getAchievements(senderJid);
    if (!list.length) { await reply('Noch keine Erfolge. Kauf ein Haus oder werde reich! 🏆'); break; }
    await reply('🏆 *Deine Erfolge*\n\n' + list.map((a) => `${a.def.name} – ${a.def.desc}`).join('\n'));
    break;
  }

  // ---- Lotterie ----
  case 'lotto': case 'lotterie': {
    const n = Math.max(1, Number(args[0]) || 1);
    const r = await economy.buyTicket(senderJid, n);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const pot = await economy.getLotteryPot();
    await reply(`🎟️ ${n} Los(e) gekauft (${formatBalance(r.cost)}).\nDu hast ${r.tickets} Lose.\nJackpot heute: ${formatBalance(pot.pot)} (${pot.players} Spieler)`);
    break;
  }
  case 'jackpot': {
    const pot = await economy.getLotteryPot();
    await reply(`💰 *Lotto-Jackpot*\nHeute: ${formatBalance(pot.pot)}\nSpieler: ${pot.players}\nLose gesamt: ${pot.tickets}\nEin Los kostet ${formatBalance(250)}.`);
    break;
  }

  // ---- Prestige ----
  case 'prestige': {
    if (args[0] === 'info') {
      const p = await economy.getPrestige(senderJid);
      const l = await economy.getLevelInfo(senderJid);
      await reply(`✨ *Prestige-Info*\nDein Prestige: ${p} ⭐\nLevel: ${l.level} (brauchst Level 50)\nBelohnung: ${formatBalance(100000 * (p + 1))} + Doppel-XP-Bonus`);
      break;
    }
    const r = await economy.prestige(senderJid);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`✨ *PRESTIGE ${r.prestige}!* XP zurückgesetzt.\nBelohnung: ${formatBalance(r.reward)}\nDu erhältst jetzt doppelte XP!\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Statistiken ----
  case 'stats': case 'statistik': {
    const s = await economy.getStats(senderJid);
    const l = await economy.getLevelInfo(senderJid);
    const p = await economy.getPrestige(senderJid);
    await reply(`📊 *Deine Statistik*\n\n⭐ Level: ${l.level} | Prestige: ${p}\n🎮 Spiele: ${s.total_games}\n🏆 Gewonnen: ${s.total_wins}\n💸 Verdient: ${formatBalance(s.total_earned)}\n💰 Ausgegeben: ${formatBalance(s.total_spent)}\n💝 Verschenkt: ${formatBalance(s.total_given)}\n🦹 Geraubt: ${formatBalance(s.total_robbed)}\n🏡 Häuser gekauft: ${s.total_houses_bought}`);
    break;
  }

  // ---- Handel ----
  case 'anbieten': case 'handelsangebot': {
    const houseId = (args[0] || '').toLowerCase();
    const price = Number(args[1]);
    if (!houseId || !price) { await reply(`Nutzung: ${COMMAND_PREFIX}anbieten <Haus-ID> <Preis>`); break; }
    const r = await economy.createTradeOffer(senderJid, houseId, price);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🤝 *${r.house.name}* wird zum Handel angeboten für ${formatBalance(r.askingPrice)}.\nAndere können es mit ${COMMAND_PREFIX}handel ${houseId} kaufen.`);
    break;
  }
  case 'handel': case 'kaufen-handel': {
    const houseId = (args[0] || '').toLowerCase();
    if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}handel <Haus-ID>`); break; }
    const r = await economy.acceptTradeOffer(senderJid, houseId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await sock.sendMessage(jid, { text: `🤝 *${r.house.name}* erworben für ${formatBalance(r.price)} von @${r.sellerId.split('@')[0]}!\nKontostand: ${formatBalance(r.buyerBalance)}`, mentions: [r.sellerId] });
    break;
  }
  case 'handelsmarkt': case 'trade': {
    const offers = await economy.listTradeOffers();
    if (!offers.length) { await reply('🤝 Kein Angebot auf dem Handelsmarkt.'); break; }
    const lines = offers.slice(0, 10).map((o) => `▸ [${o.house.id}] ${o.house.name} – ${formatBalance(o.askingPrice)}\nVerkäufer: @${o.sellerId.split('@')[0]}`);
    await reply(`🏪 *Handelsmarkt*\n\n${lines.join('\n\n')}\nKaufen mit: ${COMMAND_PREFIX}handel <ID>`);
    break;
  }
  case 'handelabbrechen': {
    const houseId = (args[0] || '').toLowerCase();
    if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}handelabbrechen <Haus-ID>`); break; }
    const r = await economy.cancelTradeOffer(senderJid, houseId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply('✅ Handelsangebot zurückgezogen.');
    break;
  }

  // ---- Saisonaler Bonus ----
  case 'saisonbonus': case 'event-bonus': {
    const r = await economy.claimSeasonalBonus(senderJid);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`${r.season.name} Bonus! +${formatBalance(r.reward)}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

*/

// ====================================================================
// Investitions-System – Spieler kaufen "Aktien" und warten auf Rendite
// ====================================================================
const STOCKS = [
  { id: 'tech', name: '💻 TechCorp', minPrice: 500, maxPrice: 2000, volatility: 0.3, baseReturn: 0.08 },
  { id: 'food', name: '🍔 FastFood AG', minPrice: 200, maxPrice: 800, volatility: 0.15, baseReturn: 0.05 },
  { id: 'energy', name: '⚡ EnergyPlus', minPrice: 300, maxPrice: 1500, volatility: 0.25, baseReturn: 0.07 },
  { id: 'crypto', name: '🪙 CryptoCoin', minPrice: 100, maxPrice: 5000, volatility: 0.6, baseReturn: 0.12 },
  { id: 'realty', name: '🏗️ Immo GmbH', minPrice: 1000, maxPrice: 3000, volatility: 0.1, baseReturn: 0.04 },
  { id: 'health', name: '💊 MedPharm', minPrice: 400, maxPrice: 1200, volatility: 0.2, baseReturn: 0.06 },
  { id: 'auto', name: '🚗 AutoWerk', minPrice: 600, maxPrice: 2500, volatility: 0.22, baseReturn: 0.065 },
  { id: 'space', name: '🚀 SpaceVenture', minPrice: 800, maxPrice: 8000, volatility: 0.7, baseReturn: 0.15 },
];

// Tages-Seed für Aktienkurse (deterministisch pro Tag)
function stockDaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Seeded PRNG (Mulberry32)
function seededRng(seed) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getStockPrice(stock) {
  const rng = seededRng(stockDaySeed() + stock.id.charCodeAt(0));
  const t = rng();
  return Math.floor(stock.minPrice + t * (stock.maxPrice - stock.minPrice));
}

// ====================================================================
// Tages-Challenge – zufällige Aufgabe, einmal pro Tag einlösbar
// ====================================================================
const DAILY_CHALLENGES = [
  { id: 'dc_slots', desc: 'Spiele 5x Slots', event: 'slots', target: 5, reward: 500 },
  { id: 'dc_work', desc: 'Arbeite 3x', event: 'work', target: 3, reward: 400 },
  { id: 'dc_win', desc: 'Gewinne 3 Casinospiele', event: 'win', target: 3, reward: 600 },
  { id: 'dc_roulette', desc: 'Spiele 3x Roulette', event: 'roulette', target: 3, reward: 450 },
  { id: 'dc_blackjack', desc: 'Spiele 4x Blackjack', event: 'blackjack', target: 4, reward: 500 },
  { id: 'dc_daily', desc: 'Claime den Daily-Bonus', event: 'daily', target: 1, reward: 300 },
  { id: 'dc_spend', desc: 'Gib 1.000 Coins aus', event: 'spend', target: 1000, reward: 350 },
  { id: 'dc_earn', desc: 'Verdiene 2.000 Coins', event: 'earn', target: 2000, reward: 400 },
  { id: 'dc_poker', desc: 'Spiele 3x Poker', event: 'poker', target: 3, reward: 700 },
  { id: 'dc_keno', desc: 'Spiele 5x Keno', event: 'keno', target: 5, reward: 450 },
  { id: 'dc_horse', desc: 'Setze auf 3 Pferderennen', event: 'horserace', target: 3, reward: 500 },
  { id: 'dc_crash', desc: 'Spiele 4x Crash', event: 'crash', target: 4, reward: 550 },
];

function todaysChallenge() {
  const seed = stockDaySeed();
  const rng = seededRng(seed + 999);
  const idx = Math.floor(rng() * DAILY_CHALLENGES.length);
  return DAILY_CHALLENGES[idx];
}

// ====================================================================
// Schatz-System – verborgene Schätze (zufällige Fundorte, einmal täglich)
// ====================================================================
const TREASURE_SPOTS = [
  '🏝️ einer einsamen Insel', '🌋 dem Krater eines Vulkans', '🏔️ einem Berggipfel',
  '🏚️ einer verlassenen Villa', '🌊 dem Meeresgrund', '🗺️ einem alten Kartenarchiv',
  '⛏️ einer aufgelassenen Mine', '🏜️ der Wüste', '🌲 dem alten Wald', '🏰 einem Burgkeller',
];

// ====================================================================
// Passive-Income-Tracking – Gesamtrendite des Spielers berechnen
// ====================================================================
function calcPassiveIncome(houses, items) {
  // Basis: Mieteinnahmen
  let rental = 0;
  for (const h of houses) {
    const tier = h.tier || 1;
    rental += tier * 50; // 50/100/150/200/250 pro Stufe
  }
  // Item-Boni werden in ShopManager.getEffects() berechnet
  return rental;
}

// ====================================================================
// Reichtums-Klassen – Titel basierend auf Gesamtvermögen
// ====================================================================
const WEALTH_TIERS = [
  { label: '🪨 Mittellos', threshold: 0 },
  { label: '🥉 Arbeiter', threshold: 1000 },
  { label: '🥈 Kaufmann', threshold: 10000 },
  { label: '🥇 Händler', threshold: 50000 },
  { label: '💎 Unternehmer', threshold: 200000 },
  { label: '👑 Millionär', threshold: 1000000 },
  { label: '🌟 Oligarch', threshold: 5000000 },
  { label: '🚀 Magnit', threshold: 20000000 },
];

function getWealthTier(netWorth) {
  let tier = WEALTH_TIERS[0];
  for (const t of WEALTH_TIERS) {
    if (netWorth >= t.threshold) tier = t;
  }
  return tier;
}

// ====================================================================
// Steuer-System – automatische Steuer bei Überweisungen > 10k
// ====================================================================
const TAX_THRESHOLD = 10000;
const TAX_RATE = 0.05; // 5 %

function calcTax(amount) {
  if (amount <= TAX_THRESHOLD) return 0;
  return Math.floor(amount * TAX_RATE);
}

// ====================================================================
// Lotterie-Ziehung – einmal täglich (manuell oder via Cron auslösen)
// ====================================================================
async function drawLottery(eco) {
  const seed = EconomyManager.lotterySeed();
  const rs = await eco.db.execute({ sql: 'SELECT user_id, tickets FROM lottery WHERE draw_seed=?', args: [seed] });
  if (!rs.rows.length) return { ok: false, reason: 'Keine Teilnehmer.' };
  const pool = [];
  for (const row of rs.rows) {
    const count = Number(row.tickets);
    for (let i = 0; i < count; i++) pool.push(row.user_id);
  }
  const winnerId = pool[Math.floor(Math.random() * pool.length)];
  const pot = pool.length * LOTTERY_TICKET_PRICE;
  await eco.addBalance(winnerId, pot);
  return { ok: true, winnerId, pot, participants: rs.rows.length };
}

// ====================================================================
// Rang-Belohnungen – wöchentliche Auszahlung für Top-10-Spieler
// ====================================================================
const RANK_REWARDS = [500000, 200000, 100000, 50000, 30000, 20000, 15000, 10000, 7000, 5000];

async function distributeRankRewards(eco) {
  const top = await eco.getLeaderboard(10);
  const results = [];
  for (let i = 0; i < top.length; i++) {
    const reward = RANK_REWARDS[i] || 0;
    if (reward > 0) {
      await eco.addBalance(top[i].userId, reward);
      results.push({ userId: top[i].userId, rank: i + 1, reward });
    }
  }
  return results;
}

// ====================================================================
// Inflations-Mechanismus – Häuserpreise steigen leicht mit der Zeit
// ====================================================================
function inflatedPrice(basePrice, monthsSinceLaunch) {
  const rate = 0.02; // 2 % pro Monat
  return Math.floor(basePrice * Math.pow(1 + rate, Math.min(monthsSinceLaunch, 24)));
}

// ====================================================================
// Wirtschaftsbericht – tägliche Zusammenfassung für den Chat
// ====================================================================
async function generateEconomyReport(eco) {
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;
  // Aktive Spieler der letzten 24h (grobe Schätzung via player_meta)
  const rs = await eco.db.execute({ sql: 'SELECT COUNT(*) as c FROM player_meta WHERE key=? AND value>?', args: ['last_work', yesterday] });
  const activeWorkers = Number(rs.rows[0]?.c || 0);
  const top = await eco.getLeaderboard(3);
  const topStr = top.map((p, i) => `${['🥇','🥈','🥉'][i]} @${p.userId.split('@')[0]}: ${formatBalance(p.balance)}`).join('\n');
  const pot = await eco.getLotteryPot();
  return {
    activeWorkers,
    topStr,
    lotteryPot: pot.pot,
    lotteryCandidates: pot.players,
  };
}

// ====================================================================
// Geldhahn-Logik – verhindert zu viele Coins im Umlauf (Sink-Mechanismen)
// Sinks: Käufe, Lotterie, Craft-Kosten, Verzauberungen, Steuern, Clan-Gründung
// ====================================================================
const ECONOMIC_SINKS = [
  { name: 'Hauskauf', estimatedDaily: 50000 },
  { name: 'Item-Kauf', estimatedDaily: 30000 },
  { name: 'Lotterie-Einsätze', estimatedDaily: 20000 },
  { name: 'Verzauberungen', estimatedDaily: 10000 },
  { name: 'Clan-Gründung', estimatedDaily: 5000 },
  { name: 'Steuer (>10k-Überweisungen)', estimatedDaily: 3000 },
];

// Gibt eine Zusammenfassung aller Geld-Quellen & Senken zurück (für Admin-Dashboard)
function economyBalance() {
  const sources = [
    { name: 'Tagesbonus (Streak)', perPlayer: 500 },
    { name: 'Arbeit (30min CD)', perPlayer: 400 },
    { name: 'Mieteinnahmen', perPlayer: 200 },
    { name: 'Passivincome (Items)', perPlayer: 500 },
    { name: 'Casino-Gewinne (netto)', perPlayer: -100 },
  ];
  return { sources, sinks: ECONOMIC_SINKS };
}

// ====================================================================
// ADDITIONAL ECONOMY COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Aktien ----
  case 'aktien': case 'stocks': {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'kaufen') {
      const stockId = (args[1] || '').toLowerCase();
      const anzahl = Math.max(1, Number(args[2]) || 1);
      const stock = STOCKS.find((s) => s.id === stockId);
      if (!stock) { await reply(`Unbekannte Aktie. IDs: ${STOCKS.map((s) => s.id).join(', ')}`); break; }
      const price = getStockPrice(stock);
      const total = price * anzahl;
      const r = await economy.deductBalance(senderJid, total);
      if (r === null) { await reply(`❌ Nicht genug Coins. Kurs: ${formatBalance(price)}/Aktie, gesamt: ${formatBalance(total)}`); break; }
      // Speichere Kauf in player_meta
      const key = `stock_${stock.id}`;
      const have = await economy.getMeta(senderJid, key);
      await economy.setMeta(senderJid, key, have + anzahl);
      const costKey = `stockcost_${stock.id}`;
      const haveCost = await economy.getMeta(senderJid, costKey);
      await economy.setMeta(senderJid, costKey, haveCost + total);
      await reply(`📈 ${anzahl}x ${stock.name} für je ${formatBalance(price)} gekauft. Gesamt: ${formatBalance(total)}`);
      break;
    }
    if (sub === 'verkaufen') {
      const stockId = (args[1] || '').toLowerCase();
      const anzahl = Math.max(1, Number(args[2]) || 1);
      const stock = STOCKS.find((s) => s.id === stockId);
      if (!stock) { await reply(`Unbekannte Aktie.`); break; }
      const key = `stock_${stock.id}`;
      const have = await economy.getMeta(senderJid, key);
      if (have < anzahl) { await reply(`Du hast nur ${have} Aktien von ${stock.name}.`); break; }
      const price = getStockPrice(stock);
      const total = price * anzahl;
      await economy.setMeta(senderJid, key, have - anzahl);
      const balance = await economy.addBalance(senderJid, total);
      await reply(`📉 ${anzahl}x ${stock.name} für je ${formatBalance(price)} verkauft. +${formatBalance(total)}\nKontostand: ${formatBalance(balance)}`);
      break;
    }
    if (sub === 'depot') {
      const lines = [];
      for (const stock of STOCKS) {
        const key = `stock_${stock.id}`;
        const have = await economy.getMeta(senderJid, key);
        if (have > 0) {
          const price = getStockPrice(stock);
          lines.push(`${stock.name}: ${have} Stk. × ${formatBalance(price)} = ${formatBalance(have * price)}`);
        }
      }
      if (!lines.length) { await reply('Du besitzt keine Aktien. Schau dir den !aktien markt an.'); break; }
      await reply(`📊 *Dein Depot*\n\n${lines.join('\n')}`);
      break;
    }
    // Default: Marktübersicht
    const mLines = STOCKS.map((s) => {
      const p = getStockPrice(s);
      const trend = s.volatility > 0.4 ? '🔴 Risiko' : s.volatility > 0.2 ? '🟡 Mittel' : '🟢 Stabil';
      return `${s.name} [${s.id}]\nKurs: ${formatBalance(p)} | ${trend}`;
    });
    await reply(`📈 *Aktienmarkt* (Kurse gültig heute)\n\n${mLines.join('\n\n')}\nKaufen: ${COMMAND_PREFIX}aktien kaufen <id> <anzahl>\nVerkaufen: ${COMMAND_PREFIX}aktien verkaufen <id> <anzahl>\nDepot: ${COMMAND_PREFIX}aktien depot`);
    break;
  }

  // ---- Tages-Challenge ----
  case 'challenge': case 'aufgabe': {
    const ch = todaysChallenge();
    const key = `challenge_progress_${ch.id}_${EconomyManager.lotterySeed()}`;
    const progress = await economy.getMeta(senderJid, key);
    const claimed = await economy.getMeta(senderJid, `challenge_claimed_${EconomyManager.lotterySeed()}`);
    if (claimed) { await reply(`✅ Tages-Challenge bereits abgeholt!\nMorgen gibt es eine neue.`); break; }
    const done = progress >= ch.target;
    await reply(`🎯 *Tages-Challenge*\n\n${ch.desc}\nFortschritt: ${Math.min(progress, ch.target)}/${ch.target}\nBelohnung: ${formatBalance(ch.reward)}\n\n${done ? `Tippe ${COMMAND_PREFIX}challenge claim zum Einlösen!` : 'Noch nicht fertig.'}`);
    break;
  }
  case 'challenge-claim': {
    const ch = todaysChallenge();
    const key = `challenge_progress_${ch.id}_${EconomyManager.lotterySeed()}`;
    const progress = await economy.getMeta(senderJid, key);
    const claimedKey = `challenge_claimed_${EconomyManager.lotterySeed()}`;
    if (await economy.getMeta(senderJid, claimedKey)) { await reply('Du hast die Challenge heute schon eingelöst.'); break; }
    if (progress < ch.target) { await reply(`❌ Noch nicht fertig! ${progress}/${ch.target}`); break; }
    await economy.setMeta(senderJid, claimedKey, 1);
    const balance = await economy.addBalance(senderJid, ch.reward);
    await reply(`🎉 Challenge abgeschlossen! +${formatBalance(ch.reward)}\nKontostand: ${formatBalance(balance)}`);
    break;
  }

  // ---- Reichtums-Klasse ----
  case 'titel': case 'klasse': {
    const b = await economy.getBalance(senderJid);
    const h = await economy.getHouses(senderJid);
    const houseWorth = h.reduce((s, hs) => s + (HOUSES.find((hd) => hd.id === hs.houseId)?.price || 0), 0);
    const net = b + houseWorth;
    const tier = getWealthTier(net);
    await reply(`${tier.label}\nGesamtvermögen: ${formatBalance(net)}`);
    break;
  }

  // ---- Schatz finden ----
  case 'suchen': case 'erkunden': {
    const last = await economy.getMeta(senderJid, 'last_explore');
    const now = Date.now();
    const CD = 8 * 60 * 60 * 1000; // 8 Stunden
    if (now - last < CD) { await reply(`⏳ Du bist noch erschöpft vom letzten Ausflug. Warte noch ${fmtWait(CD - (now - last))}.`); break; }
    await economy.setMeta(senderJid, 'last_explore', now);
    const chance = Math.random();
    const spot = TREASURE_SPOTS[Math.floor(Math.random() * TREASURE_SPOTS.length)];
    if (chance < 0.05) {
      const reward = 5000 + Math.floor(Math.random() * 15000);
      const balance = await economy.addBalance(senderJid, reward);
      await reply(`🗺️ Du erkundest ${spot} und findest einen versteckten Schatz!\n💰 *${formatBalance(reward)}* gefunden!\nKontostand: ${formatBalance(balance)}`);
    } else if (chance < 0.35) {
      const reward = 200 + Math.floor(Math.random() * 800);
      const balance = await economy.addBalance(senderJid, reward);
      await reply(`🗺️ Du erkundest ${spot}...\nDu findest etwas Kleingeld: ${formatBalance(reward)}\nKontostand: ${formatBalance(balance)}`);
    } else {
      await reply(`🗺️ Du erkundest ${spot}... und findest – nichts. Besser nächstes Mal!`);
    }
    break;
  }

  // ---- Überweisung mit Steuer ----
  case 'pay': case 'überweisen': {
    const target = getTargetJid(msg);
    const amount = Number(args.find((a) => /^\d+$/.test(a)));
    if (!target || !amount) { await reply(`Nutzung: ${COMMAND_PREFIX}pay @person <Betrag>`); break; }
    const tax = calcTax(amount);
    const r = await economy.pay(senderJid, target, amount);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    if (tax > 0) {
      // Steuer geht in den Lotterie-Topf
      await economy.addBalance('jackpot_system', tax);
      await sock.sendMessage(jid, {
        text: `💸 Du hast @${target.split('@')[0]} ${formatBalance(amount)} überwiesen.\n🏛️ Steuer (5%): ${formatBalance(tax)} → Jackpot`,
        mentions: [target],
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { text: `💸 Du hast @${target.split('@')[0]} ${formatBalance(amount)} überwiesen.`, mentions: [target] }, { quoted: msg });
    }
    break;
  }

  // ---- Vermögensstatus ----
  case 'networth': case 'vermögen': {
    const b = await economy.getBalance(senderJid);
    const houses = await economy.getHouses(senderJid);
    const houseWorth = houses.reduce((s, h) => s + (HOUSES.find((hd) => hd.id === h.houseId)?.price || 0), 0);
    const stockWorth = (await Promise.all(STOCKS.map(async (s) => {
      const held = await economy.getMeta(senderJid, `stock_${s.id}`);
      return held * getStockPrice(s);
    }))).reduce((a, b) => a + b, 0);
    const net = b + houseWorth + stockWorth;
    const tier = getWealthTier(net);
    const l = await economy.getLevelInfo(senderJid);
    await reply(`💰 *Gesamtvermögen*\n\n${tier.label}\n\n💵 Coins: ${formatBalance(b)}\n🏠 Häuser: ${formatBalance(houseWorth)} (${houses.length} Stk.)\n📈 Aktien: ${formatBalance(stockWorth)}\n─────────────\n🌟 Gesamt: ${formatBalance(net)}\n⭐ Level: ${l.level}`);
    break;
  }

*/

// ====================================================================
// Freundschafts-Bonus – zwei Spieler spielen zusammen oft = Bonus
// ====================================================================
async function checkFriendBonus(eco, userA, userB) {
  const key = `friend_${[userA, userB].sort().join('_')}`;
  const interactions = await eco.getMeta(userA, key);
  const bonusTiers = [
    { at: 10, bonus: 500, label: '🤝 Kumpel' },
    { at: 25, bonus: 1500, label: '👫 Guter Freund' },
    { at: 50, bonus: 3000, label: '💫 Bester Freund' },
    { at: 100, bonus: 5000, label: '🌟 Unzertrennlich' },
  ];
  const tier = bonusTiers.slice().reverse().find((t) => interactions >= t.at);
  return { interactions, tier };
}

async function recordFriendInteraction(eco, userA, userB) {
  const key = `friend_${[userA, userB].sort().join('_')}`;
  const current = await eco.getMeta(userA, key);
  await eco.setMeta(userA, key, current + 1);
  await eco.setMeta(userB, key, current + 1);
}

// ====================================================================
// Münz-Multiplikator-Events – zeitlich begrenzter globaler Bonus
// ====================================================================
let globalMultiplierEvent = null;

function setGlobalMultiplier(multiplier, durationMs, label) {
  globalMultiplierEvent = { multiplier, endTime: Date.now() + durationMs, label };
}

function getGlobalMultiplier() {
  if (!globalMultiplierEvent) return 1;
  if (Date.now() > globalMultiplierEvent.endTime) { globalMultiplierEvent = null; return 1; }
  return globalMultiplierEvent.multiplier;
}

function getGlobalMultiplierInfo() {
  if (!globalMultiplierEvent || Date.now() > globalMultiplierEvent.endTime) return null;
  const mins = Math.ceil((globalMultiplierEvent.endTime - Date.now()) / 60000);
  return { ...globalMultiplierEvent, remainingMins: mins };
}

// ====================================================================
// COMPLETE ECONOMY CORE COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Balance & Vermögen ----
  case 'balance': case 'kontostand': case 'geld': {
    const b = await economy.getBalance(senderJid);
    const bank = await economy.getBankBalance(senderJid);
    const l = await economy.getLevelInfo(senderJid);
    await reply(`💰 *Dein Konto*\n\nBrieftasche: ${formatBalance(b)}\nBank: ${formatBalance(bank)}\n⭐ Level ${l.level} (${l.intoLevel}/${l.levelSpan} XP)`);
    break;
  }

  // ---- Markt (Häuser) ----
  case 'markt': case 'immobilien': {
    const sub = (args[0] || 'all').toLowerCase();
    const tierMap = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
    const tier = tierMap[sub];
    const page = Number(args[1]) || 1;
    const { pages, items } = marketPage(HOUSES, tier, page);
    const lines = items.map((h) => `[${h.id}] ${h.name} – ${formatBalance(h.price)} (Tier ${h.tier})`).join('\n');
    await reply(`🏠 *Immobilienmarkt* ${tier ? `Tier ${tier}` : ''}(Seite ${page}/${pages})\n\n${lines}\nKaufen: ${COMMAND_PREFIX}kaufen <id>`);
    break;
  }

  // ---- Haus kaufen ----
  case 'kaufen': {
    const houseId = (args[0] || '').toLowerCase();
    if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}kaufen <haus-id>. Markt: ${COMMAND_PREFIX}markt`); break; }
    const r = await economy.buyHouse(senderJid, houseId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'buyhouse');
    await quest.trackAchievementQuest(senderJid, 'buyhouse');
    await reply(`🏠 *${r.house.name}* gekauft für ${formatBalance(r.price)}!\nKontostand: ${formatBalance(r.balance)}`);
    await economy.checkAchievements(senderJid);
    break;
  }

  // ---- Haus verkaufen ----
  case 'verkaufen': {
    const houseId = (args[0] || '').toLowerCase();
    if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}verkaufen <haus-id>`); break; }
    const r = await economy.sellHouse(senderJid, houseId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`✅ *${r.house.name}* verkauft für ${formatBalance(r.sellPrice)}.\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Inventar ----
  case 'inventar': case 'häuser': {
    const houses = await economy.getHouses(senderJid);
    if (!houses.length) { await reply('Du besitzt noch keine Häuser. Schau dir den !markt an!'); break; }
    const lines = houses.map((h) => {
      const hd = HOUSES.find((hd) => hd.id === h.houseId);
      return hd ? `[${hd.id}] ${hd.name} (Tier ${hd.tier})` : h.houseId;
    }).join('\n');
    const totalWorth = houses.reduce((s, h) => {
      const hd = HOUSES.find((hd) => hd.id === h.houseId);
      return s + (hd ? hd.price : 0);
    }, 0);
    await reply(`🏡 *Deine Häuser* (${houses.length})\n\n${lines}\n\nGesamtwert: ${formatBalance(totalWorth)}`);
    break;
  }

  // ---- Bank: einzahlen ----
  case 'einzahlen': case 'deposit': {
    const amount = Number(args[0]);
    if (!amount || amount <= 0) { await reply(`Nutzung: ${COMMAND_PREFIX}einzahlen <betrag>`); break; }
    const r = await economy.bankDeposit(senderJid, amount);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🏦 ${formatBalance(r.amount)} eingezahlt.\nBrieftasche: ${formatBalance(r.walletBalance)} | Bank: ${formatBalance(r.bankBalance)}`);
    await economy.checkAchievements(senderJid);
    break;
  }

  // ---- Bank: auszahlen ----
  case 'auszahlen': case 'withdraw': {
    const amount = Number(args[0]);
    if (!amount || amount <= 0) { await reply(`Nutzung: ${COMMAND_PREFIX}auszahlen <betrag>`); break; }
    const r = await economy.bankWithdraw(senderJid, amount);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`💵 ${formatBalance(r.amount)} abgehoben.\nBrieftasche: ${formatBalance(r.walletBalance)} | Bank: ${formatBalance(r.bankBalance)}`);
    break;
  }

  // ---- Zinsen ----
  case 'zinsen': case 'interest': {
    const r = await economy.claimInterest(senderJid);
    if (!r.ok) { await reply(`⏳ Zinsen sind erst wieder verfügbar in ${fmtWait ? fmtWait(r.waitMs) : '...'}.`); break; }
    await reply(`💹 Tages-Zinsen: *+${formatBalance(r.interest)}* (1% auf ${formatBalance(r.bankAmount)})\nBank: ${formatBalance(r.bankBalance)}`);
    break;
  }

  // ---- Rangliste ----
  case 'reich': case 'rangliste': case 'top': {
    const top = await economy.getLeaderboard(10);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((p, i) => `${medals[i] || `${i + 1}.`} @${p.userId.split('@')[0]}: ${formatBalance(p.balance)}`);
    await reply(`💰 *Reichste Spieler*\n\n${lines.join('\n')}`);
    break;
  }

*/

// ====================================================================
// Schnell-Abfrage-Helfer – für Index.js ohne vollen EconomyManager-Import
// ====================================================================
function fmtNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function fmtPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// Berechnet den Hauswert nach Tier
function houseValue(house) {
  return house.price;
}

// Gibt den Gesamt-Hauswert einer Liste zurück
function totalHouseValue(houseIds) {
  return houseIds.reduce((s, id) => {
    const h = HOUSES.find((h) => h.id === id);
    return s + (h ? h.price : 0);
  }, 0);
}

module.exports = {
  EconomyManager, HOUSES, TIER_LABELS, ACHIEVEMENTS,
  STARTING_BALANCE, LOTTERY_TICKET_PRICE,
  formatBalance, houseCard, marketPage,
  xpForLevel, levelFromXp,
  STOCKS, DAILY_CHALLENGES, WEALTH_TIERS, TREASURE_SPOTS, RANK_REWARDS, ECONOMIC_SINKS,
  getStockPrice, getWealthTier, calcTax, todaysChallenge, calcPassiveIncome,
  drawLottery, distributeRankRewards, inflatedPrice, generateEconomyReport, economyBalance,
  checkFriendBonus, recordFriendInteraction,
  setGlobalMultiplier, getGlobalMultiplier, getGlobalMultiplierInfo,
  fmtNumber, fmtPercent, houseValue, totalHouseValue,
  // Seasonal helper (static, no instance needed)
  getCurrentSeason: EconomyManager.currentSeason,
  getLotterySeed: EconomyManager.lotterySeed,
};
