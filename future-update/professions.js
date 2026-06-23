'use strict';

// ====================================================================
// PROFESSIONS MODULE – NICHT AKTIV
// Berufs-System mit passivem Einkommen, Profession-XP, Spezialaktionen.
// Baut auf ../economy.js auf. Einbau gemäß INTEGRATION.md.
// ====================================================================

// ====================================================================
// PROFESSIONS DATA
// ====================================================================
const PROFESSIONS = [
  {
    id: 'farmer',
    name: 'Bauer',
    emoji: '👨‍🌾',
    description: 'Bestell deine Felder und ernte reiche Ernten. Zuverlässiges passives Einkommen.',
    passiveIncomePerHour: 200,
    xpBonus: 1.1,
    workXpPerUse: 25,
    workCooldownMs: 20 * 60 * 1000,
    workRewardMin: 100,
    workRewardMax: 400,
    levelBonuses: [
      { level: 5,  desc: '+20 passive Coins/h',        bonusType: 'passive',  bonusValue: 20 },
      { level: 10, desc: '+50 passive Coins/h',        bonusType: 'passive',  bonusValue: 50 },
      { level: 15, desc: 'Ernte-Bonus: +15% Verdienst', bonusType: 'workBonus', bonusValue: 0.15 },
      { level: 20, desc: '+100 passive Coins/h',       bonusType: 'passive',  bonusValue: 100 },
    ],
    specialActions: ['anpflanzen', 'ernten', 'düngen'],
  },
  {
    id: 'miner',
    name: 'Bergmann',
    emoji: '⛏️',
    description: 'Schürfe wertvolle Erze tief im Berg. Höheres passives Einkommen als ein Bauer.',
    passiveIncomePerHour: 350,
    xpBonus: 1.2,
    workXpPerUse: 30,
    workCooldownMs: 25 * 60 * 1000,
    workRewardMin: 150,
    workRewardMax: 600,
    levelBonuses: [
      { level: 5,  desc: 'Bessere Erze: +10% Verdienst',  bonusType: 'workBonus', bonusValue: 0.10 },
      { level: 10, desc: '+80 passive Coins/h',           bonusType: 'passive',  bonusValue: 80 },
      { level: 15, desc: 'Seltene Funde: +20% Verdienst', bonusType: 'workBonus', bonusValue: 0.20 },
      { level: 20, desc: '+150 passive Coins/h',          bonusType: 'passive',  bonusValue: 150 },
    ],
    specialActions: ['graben', 'sprengen', 'schürfen'],
  },
  {
    id: 'merchant',
    name: 'Händler',
    emoji: '🏪',
    description: 'Kaufe günstig, verkaufe teuer. Kürzere Cooldowns und gute Verhandlungsboni.',
    passiveIncomePerHour: 150,
    xpBonus: 1.15,
    workXpPerUse: 20,
    workCooldownMs: 15 * 60 * 1000,
    workRewardMin: 200,
    workRewardMax: 800,
    levelBonuses: [
      { level: 5,  desc: 'Handelsnetz: +15% Verdienst',   bonusType: 'workBonus', bonusValue: 0.15 },
      { level: 10, desc: '+60 passive Coins/h',           bonusType: 'passive',  bonusValue: 60 },
      { level: 15, desc: 'Großhändler: +25% Verdienst',   bonusType: 'workBonus', bonusValue: 0.25 },
      { level: 20, desc: 'Handelsimperium: +120 passive', bonusType: 'passive',  bonusValue: 120 },
    ],
    specialActions: ['handeln', 'feilschen', 'investieren'],
  },
  {
    id: 'soldier',
    name: 'Soldat',
    emoji: '⚔️',
    description: 'Diene und schütze. Starker XP-Bonus und solides Einkommen aus Aufträgen.',
    passiveIncomePerHour: 100,
    xpBonus: 1.25,
    workXpPerUse: 35,
    workCooldownMs: 30 * 60 * 1000,
    workRewardMin: 200,
    workRewardMax: 700,
    levelBonuses: [
      { level: 5,  desc: 'Kampferfahrung: +10% XP-Bonus', bonusType: 'xpBonus',  bonusValue: 0.10 },
      { level: 10, desc: 'Veteran: +20% Verdienst',       bonusType: 'workBonus', bonusValue: 0.20 },
      { level: 15, desc: 'Offizier: +60 passive Coins/h', bonusType: 'passive',  bonusValue: 60 },
      { level: 20, desc: 'General: +30% Verdienst',       bonusType: 'workBonus', bonusValue: 0.30 },
    ],
    specialActions: ['patrouillieren', 'trainieren', 'wachen'],
  },
  {
    id: 'mage',
    name: 'Magier',
    emoji: '🧙',
    description: 'Meistere arkane Kräfte. Höchster XP-Bonus, aber kein passives Einkommen.',
    passiveIncomePerHour: 0,
    xpBonus: 1.5,
    workXpPerUse: 50,
    workCooldownMs: 45 * 60 * 1000,
    workRewardMin: 300,
    workRewardMax: 1200,
    levelBonuses: [
      { level: 5,  desc: 'Arkanwissen: +15% XP-Bonus',   bonusType: 'xpBonus',  bonusValue: 0.15 },
      { level: 10, desc: 'Erzmagier: +25% Verdienst',    bonusType: 'workBonus', bonusValue: 0.25 },
      { level: 15, desc: 'Magiemeister: +20% XP-Bonus',  bonusType: 'xpBonus',  bonusValue: 0.20 },
      { level: 20, desc: 'Archmage: +40% Verdienst',     bonusType: 'workBonus', bonusValue: 0.40 },
    ],
    specialActions: ['zaubern', 'studieren', 'beschwören'],
  },
  {
    id: 'thief',
    name: 'Dieb',
    emoji: '🗡️',
    description: 'Leben in den Schatten. Hohe Varianz – kleiner Treffer oder großer Fang.',
    passiveIncomePerHour: 0,
    xpBonus: 1.3,
    workXpPerUse: 40,
    workCooldownMs: 20 * 60 * 1000,
    workRewardMin: 100,
    workRewardMax: 1500,
    levelBonuses: [
      { level: 5,  desc: 'Fingerfertig: +10% Max-Verdienst', bonusType: 'workBonus', bonusValue: 0.10 },
      { level: 10, desc: 'Schattenkünstler: +20% XP-Bonus',  bonusType: 'xpBonus',  bonusValue: 0.20 },
      { level: 15, desc: 'Meisterdieb: +25% Max-Verdienst',  bonusType: 'workBonus', bonusValue: 0.25 },
      { level: 20, desc: 'Gildenmeister: +35% Verdienst',    bonusType: 'workBonus', bonusValue: 0.35 },
    ],
    specialActions: ['schleichen', 'klauen', 'spionieren'],
  },
  {
    id: 'chef',
    name: 'Koch',
    emoji: '🍳',
    description: 'Verwöhne Gäste mit köstlichen Gerichten. Gutes passives Einkommen, kurzer Cooldown.',
    passiveIncomePerHour: 300,
    xpBonus: 1.05,
    workXpPerUse: 18,
    workCooldownMs: 15 * 60 * 1000,
    workRewardMin: 80,
    workRewardMax: 300,
    levelBonuses: [
      { level: 5,  desc: 'Sterne-Küche: +50 passive/h',    bonusType: 'passive',  bonusValue: 50 },
      { level: 10, desc: 'Chefkoch: +10% Verdienst',       bonusType: 'workBonus', bonusValue: 0.10 },
      { level: 15, desc: 'Gourmet: +80 passive/h',         bonusType: 'passive',  bonusValue: 80 },
      { level: 20, desc: 'Kulinarik-Legende: +20% Verd.',  bonusType: 'workBonus', bonusValue: 0.20 },
    ],
    specialActions: ['kochen', 'backen', 'braten'],
  },
  {
    id: 'blacksmith',
    name: 'Schmied',
    emoji: '🔨',
    description: 'Schmiede mächtige Waffen und Rüstungen. Kein Passiveinkommen, dafür hoher Verdienst.',
    passiveIncomePerHour: 0,
    xpBonus: 1.4,
    workXpPerUse: 45,
    workCooldownMs: 35 * 60 * 1000,
    workRewardMin: 250,
    workRewardMax: 900,
    levelBonuses: [
      { level: 5,  desc: 'Meisterschmied: +15% Verdienst', bonusType: 'workBonus', bonusValue: 0.15 },
      { level: 10, desc: 'Waffenkundiger: +20% XP-Bonus',  bonusType: 'xpBonus',  bonusValue: 0.20 },
      { level: 15, desc: 'Legendenschmied: +25% Verd.',    bonusType: 'workBonus', bonusValue: 0.25 },
      { level: 20, desc: 'Schmiedekunst: +35% Verdienst',  bonusType: 'workBonus', bonusValue: 0.35 },
    ],
    specialActions: ['schmieden', 'schärfen', 'härten'],
  },
  {
    id: 'fisherman',
    name: 'Fischer',
    emoji: '🎣',
    description: 'Wirf dein Netz aus und bring reiche Beute ein. Bestes passives Einkommen.',
    passiveIncomePerHour: 400,
    xpBonus: 1.2,
    workXpPerUse: 28,
    workCooldownMs: 20 * 60 * 1000,
    workRewardMin: 50,
    workRewardMax: 500,
    levelBonuses: [
      { level: 5,  desc: 'Fangnetz: +70 passive Coins/h',   bonusType: 'passive',  bonusValue: 70 },
      { level: 10, desc: 'Seefahrer: +15% Verdienst',       bonusType: 'workBonus', bonusValue: 0.15 },
      { level: 15, desc: 'Hochseefischer: +100 passive/h',  bonusType: 'passive',  bonusValue: 100 },
      { level: 20, desc: 'Fischerfürst: +25% Verdienst',    bonusType: 'workBonus', bonusValue: 0.25 },
    ],
    specialActions: ['angeln', 'netzwerfen', 'tauchen'],
  },
  {
    id: 'alchemist',
    name: 'Alchemist',
    emoji: '⚗️',
    description: 'Verwandle Zutaten in Gold. Höchster XP-Bonus aller Berufe, lange Wartezeit.',
    passiveIncomePerHour: 0,
    xpBonus: 1.6,
    workXpPerUse: 60,
    workCooldownMs: 50 * 60 * 1000,
    workRewardMin: 400,
    workRewardMax: 1800,
    levelBonuses: [
      { level: 5,  desc: 'Elixierkunde: +20% XP-Bonus',    bonusType: 'xpBonus',  bonusValue: 0.20 },
      { level: 10, desc: 'Transmutation: +25% Verdienst',  bonusType: 'workBonus', bonusValue: 0.25 },
      { level: 15, desc: 'Großalchemist: +25% XP-Bonus',   bonusType: 'xpBonus',  bonusValue: 0.25 },
      { level: 20, desc: 'Stein der Weisen: +40% Verd.',   bonusType: 'workBonus', bonusValue: 0.40 },
    ],
    specialActions: ['brauen', 'destillieren', 'experimentieren'],
  },
  {
    id: 'explorer',
    name: 'Erkunder',
    emoji: '🗺️',
    description: 'Entdecke unbekannte Lande und kartografiere deine Funde. Vielseitiger XP-Bonus.',
    passiveIncomePerHour: 0,
    xpBonus: 1.35,
    workXpPerUse: 38,
    workCooldownMs: 30 * 60 * 1000,
    workRewardMin: 150,
    workRewardMax: 600,
    levelBonuses: [
      { level: 5,  desc: 'Kundschafter: +15% Verdienst',   bonusType: 'workBonus', bonusValue: 0.15 },
      { level: 10, desc: 'Kartograf: +15% XP-Bonus',       bonusType: 'xpBonus',  bonusValue: 0.15 },
      { level: 15, desc: 'Abenteurer: +25% Verdienst',     bonusType: 'workBonus', bonusValue: 0.25 },
      { level: 20, desc: 'Weltentdecker: +20% XP-Bonus',   bonusType: 'xpBonus',  bonusValue: 0.20 },
    ],
    specialActions: ['erkunden', 'kartografieren', 'entdecken'],
  },
  {
    id: 'banker',
    name: 'Banker',
    emoji: '💰',
    description: 'Verwalte Kapital und lass Zinsen für dich arbeiten. Höchstes passives Einkommen.',
    passiveIncomePerHour: 500,
    xpBonus: 1.1,
    workXpPerUse: 22,
    workCooldownMs: 60 * 60 * 1000,
    workRewardMin: 500,
    workRewardMax: 2000,
    levelBonuses: [
      { level: 5,  desc: 'Zinsstratege: +100 passive/h',   bonusType: 'passive',  bonusValue: 100 },
      { level: 10, desc: 'Investmentprofi: +15% Verd.',    bonusType: 'workBonus', bonusValue: 0.15 },
      { level: 15, desc: 'Bankdirektor: +200 passive/h',   bonusType: 'passive',  bonusValue: 200 },
      { level: 20, desc: 'Finanzmagnat: +25% Verdienst',   bonusType: 'workBonus', bonusValue: 0.25 },
    ],
    specialActions: ['investieren', 'zinsen', 'spekulieren'],
  },
];

// ====================================================================
// HELPER – find profession by id or name
// ====================================================================
function findProfession(idOrName) {
  const q = idOrName.toLowerCase();
  return PROFESSIONS.find(p => p.id === q || p.name.toLowerCase() === q) || null;
}

// ====================================================================
// XP / LEVEL HELPERS
// ====================================================================
const MAX_PROF_LEVEL = 20;

/** XP needed to reach level n from level n-1 (i.e. cost of level n). */
function xpForLevel(level) {
  return level * 100;
}

/** Total XP needed to reach a given level from scratch. */
function totalXpForLevel(level) {
  let total = 0;
  for (let l = 2; l <= level; l++) total += xpForLevel(l);
  return total;
}

/** Compute profession level + progress from raw accumulated XP. */
function computeProfLevel(totalXp) {
  let level = 1;
  let remaining = totalXp;
  while (level < MAX_PROF_LEVEL) {
    const cost = xpForLevel(level + 1);
    if (remaining < cost) break;
    remaining -= cost;
    level++;
  }
  const intoLevel = remaining;
  const levelSpan = level < MAX_PROF_LEVEL ? xpForLevel(level + 1) : xpForLevel(MAX_PROF_LEVEL);
  return { level, intoLevel, levelSpan };
}

/** Effective work-bonus multiplier from level bonuses. */
function getWorkBonusMultiplier(profession, profLevel) {
  let bonus = 1.0;
  for (const lb of profession.levelBonuses) {
    if (profLevel >= lb.level && lb.bonusType === 'workBonus') {
      bonus += lb.bonusValue;
    }
  }
  return bonus;
}

/** Effective passive income from level bonuses. */
function getEffectivePassiveIncome(profession, profLevel) {
  let income = profession.passiveIncomePerHour;
  for (const lb of profession.levelBonuses) {
    if (profLevel >= lb.level && lb.bonusType === 'passive') {
      income += lb.bonusValue;
    }
  }
  return income;
}

/** Effective XP multiplier from level bonuses. */
function getEffectiveXpBonus(profession, profLevel) {
  let bonus = profession.xpBonus;
  for (const lb of profession.levelBonuses) {
    if (profLevel >= lb.level && lb.bonusType === 'xpBonus') {
      bonus += lb.bonusValue;
    }
  }
  return bonus;
}

/** Random integer between min and max inclusive. */
function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ====================================================================
// SPECIAL ACTION FLAVOR TEXTS & REWARD OVERRIDES
// ====================================================================
const SPECIAL_ACTION_DATA = {
  // farmer
  anpflanzen:    { flavor: 'Du pflanzt Samen in frisch gepflügten Boden. Die Saat geht auf!',          mult: 1.15 },
  ernten:        { flavor: 'Die goldene Ernte füllt deine Scheune bis zum Rand!',                      mult: 1.25 },
  düngen:        { flavor: 'Reichhaltiger Dünger verspricht üppige Erträge in der nächsten Saison.',   mult: 1.10 },
  // miner
  graben:        { flavor: 'Du gräbst tief und stößt auf eine verborgene Erzader!',                   mult: 1.20 },
  sprengen:      { flavor: 'Die Sprengladung legt einen reichen Erzkörper frei!',                     mult: 1.30 },
  schürfen:      { flavor: 'Dein Sieb fängt schimmernde Nuggets aus dem Fluss.',                      mult: 1.15 },
  // merchant
  handeln:       { flavor: 'Geschicktes Verhandeln bringt dir einen glänzenden Abschluss!',           mult: 1.20 },
  feilschen:     { flavor: 'Du drückst den Preis und erzielst maximalen Gewinn!',                     mult: 1.25 },
  investieren:   { flavor: 'Deine Investition trägt früher als erwartet Früchte.',                    mult: 1.30 },
  // soldier
  patrouillieren:{ flavor: 'Beim Patrouillieren entdeckst du eine Schatzkiste der Feinde!',           mult: 1.20 },
  trainieren:    { flavor: 'Intensives Training wird mit einem Sold-Bonus belohnt.',                   mult: 1.15 },
  wachen:        { flavor: 'Deine Wachsamkeit verhindert einen Überfall – Belohnung folgt!',          mult: 1.25 },
  // mage
  zaubern:       { flavor: 'Dein Zauber materialisiert Münzen aus dem Äther!',                        mult: 1.30 },
  studieren:     { flavor: 'Tiefes Studium arkaner Schriften enthüllt einen Goldmachertrick.',        mult: 1.20 },
  beschwören:    { flavor: 'Das beschworene Wesen bringt dir reiche Schätze aus anderen Sphären.',    mult: 1.35 },
  // thief
  schleichen:    { flavor: 'Lautlos wie ein Schatten greifst du zu – großer Coup!',                  mult: 1.30 },
  klauen:        { flavor: 'Fingerfertig und blitzschnell – die Beute ist beträchtlich!',             mult: 1.40 },
  spionieren:    { flavor: 'Wertvolle Informationen lassen sich teuer verkaufen.',                    mult: 1.25 },
  // chef
  kochen:        { flavor: 'Dein Gericht begeistert die Gäste – das Trinkgeld sprudelt!',            mult: 1.20 },
  backen:        { flavor: 'Das duftende Brot verkauft sich weg wie warme Semmeln.',                  mult: 1.15 },
  braten:        { flavor: 'Der perfekte Braten bringt dir eine exklusive Bestellung!',              mult: 1.25 },
  // blacksmith
  schmieden:     { flavor: 'Du schmiedest eine legendäre Klinge – der Preis ist stolz!',             mult: 1.30 },
  schärfen:      { flavor: 'Deine Schärfkunst ist weithin bekannt – Aufträge häufen sich.',          mult: 1.20 },
  härten:        { flavor: 'Das gehärtete Metall ist begehrt – Händler zahlen top!',                 mult: 1.25 },
  // fisherman
  angeln:        { flavor: 'Du angelst einen mächtigen Fisch – Rekordpreis auf dem Markt!',          mult: 1.25 },
  netzwerfen:    { flavor: 'Das Netz kommt prall gefüllt zurück – reiche Beute!',                    mult: 1.30 },
  tauchen:       { flavor: 'Unter Wasser findest du eine versunkene Schatztruhe!',                   mult: 1.40 },
  // alchemist
  brauen:        { flavor: 'Das fertige Elixier ergibt sich für einen Goldpreis!',                   mult: 1.30 },
  destillieren:  { flavor: 'Das gereinigte Extrakt ist eine Rarität – Sammler zahlen viel.',         mult: 1.25 },
  experimentieren:{ flavor: 'Dein Experiment gelingt überraschend – ein neues Rezept ist entdeckt!', mult: 1.35 },
  // explorer
  erkunden:      { flavor: 'Du stößt auf einen vergessenen Ort voller antiker Schätze!',             mult: 1.30 },
  kartografieren:{ flavor: 'Deine seltene Karte ergibt sich für einen Vermögen!',                   mult: 1.25 },
  entdecken:     { flavor: 'Eine neue Entdeckung bringt dir Ruhm und Reichtum!',                     mult: 1.35 },
  // banker
  zinsen:        { flavor: 'Die Zinszahlungen übersteigen deine Erwartungen!',                       mult: 1.20 },
  spekulieren:   { flavor: 'Deine Spekulation geht auf – enormer Kursgewinn!',                       mult: 1.40 },
};

// ====================================================================
// PROFESSION MANAGER CLASS
// ====================================================================
class ProfessionManager {
  constructor(economyManager) {
    this.eco = economyManager;
  }

  // ------------------------------------------------------------------
  // chooseProfession(userId, professionId)
  // ------------------------------------------------------------------
  async chooseProfession(userId, professionId) {
    const profession = findProfession(professionId);
    if (!profession) return { ok: false, error: 'Unbekannter Beruf.' };

    const existing = await this._getRow(userId);

    if (existing) {
      // switching costs 10,000 coins and resets profession XP
      const remaining = await this.eco.deductBalance(userId, 10000);
      if (remaining === null) {
        return { ok: false, error: 'Nicht genug Coins für den Berufswechsel (10.000 benötigt).' };
      }
      await this.eco.db.execute({
        sql: 'UPDATE player_profession SET profession_id=?, level=1, xp=0, last_work=0 WHERE user_id=?',
        args: [profession.id, userId],
      });
      return { ok: true, profession, switched: true, cost: 10000 };
    }

    // first time – free
    await this.eco.db.execute({
      sql: 'INSERT INTO player_profession (user_id, profession_id, level, xp, last_work) VALUES (?,?,1,0,0)',
      args: [userId, profession.id],
    });
    return { ok: true, profession, switched: false, cost: 0 };
  }

  // ------------------------------------------------------------------
  // getProfession(userId)
  // ------------------------------------------------------------------
  async getProfession(userId) {
    const row = await this._getRow(userId);
    if (!row) return null;

    const profession = findProfession(row.profession_id);
    if (!profession) return null;

    const xp = Number(row.xp) || 0;
    const { level, intoLevel, levelSpan } = computeProfLevel(xp);
    const passiveIncome = getEffectivePassiveIncome(profession, level);
    const xpBonus = getEffectiveXpBonus(profession, level);

    return { profession, level, xp, intoLevel, levelSpan, passiveIncome, xpBonus };
  }

  // ------------------------------------------------------------------
  // professionWork(userId)
  // ------------------------------------------------------------------
  async professionWork(userId) {
    const row = await this._getRow(userId);
    if (!row) return { ok: false, error: 'Du hast noch keinen Beruf. Wähle einen mit !beruf wählen <name>.' };

    const profession = findProfession(row.profession_id);
    if (!profession) return { ok: false, error: 'Berufsdaten nicht gefunden.' };

    const now = Date.now();
    const lastWork = Number(row.last_work) || 0;
    const elapsed = now - lastWork;
    if (elapsed < profession.workCooldownMs) {
      return { ok: false, waitMs: profession.workCooldownMs - elapsed };
    }

    // Calculate reward with level-based work bonus
    const currentXp = Number(row.xp) || 0;
    const { level } = computeProfLevel(currentXp);
    const workMult = getWorkBonusMultiplier(profession, level);
    const base = randBetween(profession.workRewardMin, profession.workRewardMax);
    const earned = Math.floor(base * workMult);

    // Add coins
    const balance = await this.eco.addBalance(userId, earned);

    // Add profession XP
    const newXp = currentXp + profession.workXpPerUse;
    const { level: newLevel } = computeProfLevel(newXp);
    const leveledUp = newLevel > level;

    await this.eco.db.execute({
      sql: 'UPDATE player_profession SET xp=?, level=?, last_work=? WHERE user_id=?',
      args: [newXp, newLevel, now, userId],
    });

    // Level-up coin bonus
    if (leveledUp) {
      const lvlBonus = (newLevel - level) * 50;
      await this.eco.addBalance(userId, lvlBonus);
    }

    // Give general XP with profession's xpBonus
    const xpBonus = getEffectiveXpBonus(profession, newLevel);
    const generalXp = Math.floor(20 * xpBonus);
    await this.eco.addXp(userId, generalXp);

    return {
      ok: true,
      earned,
      profXp: profession.workXpPerUse,
      profLevel: newLevel,
      leveledUp,
      waitMs: 0,
      balance,
    };
  }

  // ------------------------------------------------------------------
  // collectPassiveIncome(userId)
  // ------------------------------------------------------------------
  async collectPassiveIncome(userId) {
    const row = await this._getRow(userId);
    if (!row) return { ok: false, error: 'Du hast noch keinen Beruf.' };

    const profession = findProfession(row.profession_id);
    if (!profession) return { ok: false, error: 'Berufsdaten nicht gefunden.' };

    if (profession.passiveIncomePerHour === 0) {
      return { ok: false, error: `${profession.name} hat kein passives Einkommen.` };
    }

    const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    const lastCollect = await this.eco.getMeta(userId, 'prof_passive_ts');
    const elapsed = now - (lastCollect || 0);

    if (elapsed < COOLDOWN_MS) {
      return { ok: false, waitMs: COOLDOWN_MS - elapsed };
    }

    const { level } = computeProfLevel(Number(row.xp) || 0);
    const incomePerHour = getEffectivePassiveIncome(profession, level);

    const hoursRaw = elapsed / COOLDOWN_MS;
    const hours = Math.min(hoursRaw, 24); // cap at 24h
    const earned = Math.floor(incomePerHour * hours);

    const balance = await this.eco.addBalance(userId, earned);
    await this.eco.setMeta(userId, 'prof_passive_ts', now);

    return { ok: true, earned, hours: Math.floor(hours * 10) / 10, balance, waitMs: 0 };
  }

  // ------------------------------------------------------------------
  // getProfessionBonus(userId)
  // ------------------------------------------------------------------
  async getProfessionBonus(userId) {
    const row = await this._getRow(userId);
    if (!row) return { xpMultiplier: 1.0, passiveIncomeBonus: 0, specialAbilities: [] };

    const profession = findProfession(row.profession_id);
    if (!profession) return { xpMultiplier: 1.0, passiveIncomeBonus: 0, specialAbilities: [] };

    const { level } = computeProfLevel(Number(row.xp) || 0);
    const xpMultiplier = getEffectiveXpBonus(profession, level);
    const passiveIncomeBonus = getEffectivePassiveIncome(profession, level) - profession.passiveIncomePerHour;

    const specialAbilities = profession.levelBonuses
      .filter(lb => level >= lb.level)
      .map(lb => lb.desc);

    return { xpMultiplier, passiveIncomeBonus, specialAbilities };
  }

  // ------------------------------------------------------------------
  // getProfessionLeaderboard()
  // ------------------------------------------------------------------
  async getProfessionLeaderboard() {
    const result = await this.eco.db.execute({
      sql: 'SELECT user_id, profession_id, level, xp FROM player_profession ORDER BY level DESC, xp DESC LIMIT 10',
      args: [],
    });

    const rows = result.rows || [];
    return rows.map((r, i) => {
      const profession = findProfession(r.profession_id);
      const xp = Number(r.xp) || 0;
      const { level } = computeProfLevel(xp);
      return {
        rank: i + 1,
        userId: r.user_id,
        profession: profession ? `${profession.emoji} ${profession.name}` : r.profession_id,
        level,
        xp,
      };
    });
  }

  // ------------------------------------------------------------------
  // getSpecialActionResult(userId, action)
  // ------------------------------------------------------------------
  async getSpecialActionResult(userId, action) {
    const row = await this._getRow(userId);
    if (!row) return { ok: false, error: 'Du hast noch keinen Beruf.' };

    const profession = findProfession(row.profession_id);
    if (!profession) return { ok: false, error: 'Berufsdaten nicht gefunden.' };

    const normalizedAction = action.toLowerCase();
    if (!profession.specialActions.includes(normalizedAction)) {
      return {
        ok: false,
        error: `Die Aktion "${action}" gehört nicht zu deinem Beruf (${profession.name}). Verfügbar: ${profession.specialActions.join(', ')}.`,
      };
    }

    // 20 min global cooldown across all special actions
    const COOLDOWN_MS = 20 * 60 * 1000;
    const now = Date.now();
    const lastSpecial = await this.eco.getMeta(userId, 'prof_special_ts');
    const elapsed = now - (lastSpecial || 0);

    if (elapsed < COOLDOWN_MS) {
      return { ok: false, waitMs: COOLDOWN_MS - elapsed };
    }

    const currentXp = Number(row.xp) || 0;
    const { level } = computeProfLevel(currentXp);
    const workMult = getWorkBonusMultiplier(profession, level);

    const actionData = SPECIAL_ACTION_DATA[normalizedAction] || { flavor: 'Du verrichtest deine Arbeit gewissenhaft.', mult: 1.2 };
    const base = randBetween(profession.workRewardMin, profession.workRewardMax);
    const earned = Math.floor(base * workMult * actionData.mult);

    const balance = await this.eco.addBalance(userId, earned);
    await this.eco.setMeta(userId, 'prof_special_ts', now);

    // Small profession XP bonus for special actions
    const specialXp = Math.floor(profession.workXpPerUse * 0.5);
    const newXp = currentXp + specialXp;
    const { level: newLevel } = computeProfLevel(newXp);
    await this.eco.db.execute({
      sql: 'UPDATE player_profession SET xp=?, level=? WHERE user_id=?',
      args: [newXp, newLevel, userId],
    });

    return {
      ok: true,
      action: normalizedAction,
      flavor: actionData.flavor,
      earned,
      profXp: specialXp,
      balance,
    };
  }

  // ------------------------------------------------------------------
  // getProfessionList()
  // ------------------------------------------------------------------
  getProfessionList() {
    return PROFESSIONS.map(p => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      description: p.description,
      passiveIncomePerHour: p.passiveIncomePerHour,
      xpBonus: p.xpBonus,
      workCooldownMin: Math.floor(p.workCooldownMs / 60000),
      workRewardMin: p.workRewardMin,
      workRewardMax: p.workRewardMax,
      specialActions: p.specialActions,
    }));
  }

  // ------------------------------------------------------------------
  // getProfessionInfo(professionId)
  // ------------------------------------------------------------------
  getProfessionInfo(professionId) {
    const profession = findProfession(professionId);
    if (!profession) return null;
    return {
      ...profession,
      workCooldownMin: Math.floor(profession.workCooldownMs / 60000),
    };
  }

  // ------------------------------------------------------------------
  // INTERNAL: load DB row for user
  // ------------------------------------------------------------------
  async _getRow(userId) {
    const result = await this.eco.db.execute({
      sql: 'SELECT user_id, profession_id, level, xp, last_work FROM player_profession WHERE user_id=?',
      args: [userId],
    });
    const rows = result.rows || [];
    return rows.length > 0 ? rows[0] : null;
  }
}

// ====================================================================
// EXPORTS
// ====================================================================
module.exports = { ProfessionManager, PROFESSIONS, findProfession };
