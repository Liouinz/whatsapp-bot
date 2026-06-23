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
  { id: 'first_house', name: '🏠 Eigenheim', desc: 'Kaufe dein erstes Haus.', reward: 1000, test: (c) => c.houses >= 1 },
  { id: 'five_houses', name: '🏘️ Immobilienhai', desc: 'Besitze 5 Häuser.', reward: 5000, test: (c) => c.houses >= 5 },
  { id: 'ten_houses', name: '🏙️ Bauunternehmer', desc: 'Besitze 10 Häuser.', reward: 15000, test: (c) => c.houses >= 10 },
  { id: 'rich_50k', name: '💰 Wohlhabend', desc: 'Erreiche 50.000 Vermögen.', reward: 2500, test: (c) => c.net >= 50000 },
  { id: 'rich_100k', name: '💎 Reich', desc: 'Erreiche 100.000 Vermögen.', reward: 5000, test: (c) => c.net >= 100000 },
  { id: 'rich_1m', name: '👑 Millionär', desc: 'Erreiche 1.000.000 Vermögen.', reward: 50000, test: (c) => c.net >= 1000000 },
  { id: 'cash_25k', name: '🤑 Bargeld-König', desc: 'Halte 25.000 Bargeld.', reward: 2000, test: (c) => c.cash >= 25000 },
  { id: 'cash_100k', name: '💵 Geldspeicher', desc: 'Halte 100.000 Bargeld.', reward: 8000, test: (c) => c.cash >= 100000 },
  { id: 'twenty_houses', name: '🌆 Immobilien-Mogul', desc: 'Besitze 20 Häuser.', reward: 40000, test: (c) => c.houses >= 20 },
  { id: 'rich_500k', name: '💷 Großverdiener', desc: 'Erreiche 500.000 Vermögen.', reward: 20000, test: (c) => c.net >= 500000 },
  { id: 'rich_5m', name: '🏦 Multimillionär', desc: 'Erreiche 5.000.000 Vermögen.', reward: 200000, test: (c) => c.net >= 5000000 },
  { id: 'rich_10m', name: '🌍 Tycoon', desc: 'Erreiche 10.000.000 Vermögen.', reward: 500000, test: (c) => c.net >= 10000000 },
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
    const already = new Set((await this.getAchievements(userId)).map((a) => a.id));
    const ctx = { net: net.total, cash: net.cash, houses: inv.length };
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (already.has(a.id)) continue;
      if (a.test(ctx)) { const r = await this.unlock(userId, a.id); if (r.ok) newly.push(r); }
    }
    return newly;
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
    ];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const earned = job.min + Math.floor(Math.random() * (job.max - job.min + 1));
    await this.setMeta(userId, 'last_work', now);
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

*/

module.exports = {
  EconomyManager, HOUSES, TIER_LABELS, ACHIEVEMENTS,
  STARTING_BALANCE, LOTTERY_TICKET_PRICE,
  formatBalance, houseCard, marketPage,
  xpForLevel, levelFromXp,
};
