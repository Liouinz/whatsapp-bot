// 🛒 SHOP-MODUL – NICHT AKTIV
// Gegenstände jenseits von Häusern: Autos, Haustiere, Boosts, Crafting, Marktplatz.
// Wird von index.js NICHT geladen. Baut auf ../economy.js (Coins) auf.
// Einbau später gemäß INTEGRATION.md.

'use strict';

const { EconomyManager, formatBalance } = require('../economy');

// ====================================================================
// Katalog – jedes Item hat einen Effekt-Typ:
//  - cosmetic: nur Prestige (Anzeige im Profil)
//  - xp_boost: erhöht XP-Gewinn (mult)
//  - luck:     erhöht Casino-Gewinnchance leicht (value als +%)
//  - income:   passives Tageseinkommen (value Coins/Tag)
//  - craft:    nur durch Crafting erhältlich (kein direkter Kauf)
// ====================================================================
const ITEMS = [
  // --- Autos 🚗 (Prestige) ---
  { id: 'car_polo',      name: '🚗 Kleinwagen',         price: 8000,    type: 'cosmetic' },
  { id: 'car_van',       name: '🚐 Camper-Van',          price: 22000,   type: 'cosmetic' },
  { id: 'car_bike',      name: '🏍️ Motorrad',            price: 18000,   type: 'cosmetic' },
  { id: 'car_truck',     name: '🚚 Truck',               price: 48000,   type: 'cosmetic' },
  { id: 'car_bmw',       name: '🚙 Limousine',           price: 35000,   type: 'cosmetic' },
  { id: 'car_sport',     name: '🏎️ Sportwagen',          price: 120000,  type: 'cosmetic' },
  { id: 'car_super',     name: '🏎️ Supersportler',       price: 280000,  type: 'cosmetic' },
  { id: 'car_jet',       name: '🛩️ Privatjet',           price: 450000,  type: 'cosmetic' },
  { id: 'car_yacht',     name: '🛥️ Yacht',               price: 600000,  type: 'income',  value: 4000 },
  { id: 'car_heli',      name: '🚁 Hubschrauber',        price: 350000,  type: 'cosmetic' },
  { id: 'car_ship',      name: '🚢 Kreuzfahrtschiff',    price: 800000,  type: 'income',  value: 8000 },
  { id: 'car_rocket',    name: '🚀 Rakete',              price: 1500000, type: 'cosmetic' },
  // --- Haustiere 🐾 (kleines Tageseinkommen) ---
  { id: 'pet_cat',       name: '🐱 Katze',               price: 5000,    type: 'income',  value: 100 },
  { id: 'pet_dog',       name: '🐶 Hund',                price: 9000,    type: 'income',  value: 180 },
  { id: 'pet_parrot',    name: '🦜 Papagei',             price: 7000,    type: 'income',  value: 140 },
  { id: 'pet_horse',     name: '🐴 Pferd',               price: 30000,   type: 'income',  value: 500 },
  { id: 'pet_lion',      name: '🦁 Löwe',                price: 75000,   type: 'income',  value: 1200 },
  { id: 'pet_dragon',    name: '🐉 Drache',              price: 150000,  type: 'income',  value: 2500 },
  { id: 'pet_unicorn',   name: '🦄 Einhorn',             price: 250000,  type: 'luck',    value: 8 },
  { id: 'pet_phoenix',   name: '🦅 Phönix',              price: 500000,  type: 'luck',    value: 15 },
  { id: 'pet_shark',     name: '🦈 Hai',                 price: 120000,  type: 'income',  value: 2000 },
  { id: 'pet_bear',      name: '🐻 Bär',                 price: 45000,   type: 'income',  value: 750 },
  // --- Boosts ⚡ ---
  { id: 'boost_xp',      name: '⚡ XP-Boost',            price: 15000,   type: 'xp_boost', value: 2 },
  { id: 'boost_xp3',     name: '⚡ XP-Boost MAX',        price: 50000,   type: 'xp_boost', value: 3 },
  { id: 'boost_luck',    name: '🍀 Glücksbringer',       price: 40000,   type: 'luck',     value: 5 },
  { id: 'boost_luck2',   name: '🌟 Goldhufeisen',        price: 90000,   type: 'luck',     value: 10 },
  { id: 'boost_income',  name: '💼 Geschäftslizenz',     price: 60000,   type: 'income',   value: 1500 },
  { id: 'boost_incmax',  name: '🏢 Konzernlizenz',       price: 200000,  type: 'income',   value: 5000 },
  // --- Prestige/Sammler 💎 ---
  { id: 'col_watch',     name: '⌚ Luxusuhr',            price: 80000,   type: 'cosmetic' },
  { id: 'col_ring',      name: '💍 Diamantring',          price: 130000,  type: 'cosmetic' },
  { id: 'col_crown',     name: '👑 Goldene Krone',        price: 750000,  type: 'cosmetic' },
  { id: 'col_trophy',    name: '🏆 Pokal des Reichtums',  price: 1000000, type: 'cosmetic' },
  { id: 'col_coin',      name: '🥇 Goldmünze',           price: 25000,   type: 'cosmetic' },
  { id: 'col_painting',  name: '🖼️ Meistergemälde',      price: 200000,  type: 'income',   value: 3000 },
  { id: 'col_castle',    name: '🏰 Schloss-Modell',       price: 500000,  type: 'cosmetic' },
  // --- Crafting-Ergebnisse (nur durch Crafting) ---
  { id: 'craft_sword',   name: '⚔️ Legendäres Schwert',  price: 0,       type: 'luck',     value: 20, craft: true },
  { id: 'craft_staff',   name: '🪄 Magischer Stab',       price: 0,       type: 'xp_boost', value: 5,  craft: true },
  { id: 'craft_shield',  name: '🛡️ Diamantschild',        price: 0,       type: 'income',   value: 6000, craft: true },

  // --- Waffen ⚔️ (Kampf-Schadensboni in der Welt) ---
  { id: 'wpn_dagger',    name: '🗡️ Dolch',               price: 5000,    type: 'combat',   value: 5,  combatType: 'atk' },
  { id: 'wpn_sword',     name: '⚔️ Schwert',              price: 15000,   type: 'combat',   value: 12, combatType: 'atk' },
  { id: 'wpn_axe',       name: '🪓 Axt',                  price: 25000,   type: 'combat',   value: 18, combatType: 'atk' },
  { id: 'wpn_staff',     name: '🪄 Zauberstab',           price: 40000,   type: 'combat',   value: 25, combatType: 'atk' },
  { id: 'wpn_bow',       name: '🏹 Bogen',                price: 35000,   type: 'combat',   value: 22, combatType: 'atk' },
  { id: 'wpn_spear',     name: '🔱 Speer',                price: 55000,   type: 'combat',   value: 30, combatType: 'atk' },

  // --- Rüstungen 🛡️ (Verteidigung) ---
  { id: 'arm_cloth',     name: '👘 Stoff-Rüstung',        price: 4000,    type: 'combat',   value: 4,  combatType: 'def' },
  { id: 'arm_leather',   name: '🥋 Leder-Rüstung',        price: 12000,   type: 'combat',   value: 10, combatType: 'def' },
  { id: 'arm_chain',     name: '⛓️ Kettenhemd',           price: 22000,   type: 'combat',   value: 16, combatType: 'def' },
  { id: 'arm_plate',     name: '🛡️ Plattenrüstung',       price: 45000,   type: 'combat',   value: 25, combatType: 'def' },
  { id: 'arm_dragon',    name: '🐉 Drachenschuppen-Rüstung', price: 120000, type: 'combat',  value: 45, combatType: 'def' },
  { id: 'arm_divine',    name: '✨ Göttliche Rüstung',    price: 350000,  type: 'combat',   value: 70, combatType: 'def' },

  // --- Reise-Ausrüstung 🗺️ (Reisekosten-Reduzierung & Erkunder-Drops) ---
  { id: 'trv_boots',     name: '👢 Wanderstiefel',         price: 6000,    type: 'travel',   value: 10, travelType: 'discount' },
  { id: 'trv_horse',     name: '🐎 Reisepferd',            price: 18000,   type: 'travel',   value: 20, travelType: 'discount' },
  { id: 'trv_map',       name: '🗺️ Detailkarte',          price: 10000,   type: 'travel',   value: 25, travelType: 'drop_bonus' },
  { id: 'trv_compass',   name: '🧭 Goldkompass',           price: 25000,   type: 'travel',   value: 35, travelType: 'drop_bonus' },
  { id: 'trv_wagon',     name: '🛒 Reisewagen',            price: 40000,   type: 'travel',   value: 30, travelType: 'discount' },
  { id: 'trv_portal',    name: '🌀 Teleportstein',         price: 100000,  type: 'travel',   value: 50, travelType: 'discount' },

  // --- Berufs-Werkzeuge 🔧 (Beruf-XP-Boost) ---
  { id: 'tool_hammer',   name: '🔨 Schmiedehammer',        price: 8000,    type: 'prof_boost', value: 25, profId: 'blacksmith' },
  { id: 'tool_rod',      name: '🎣 Angelrute (Profi)',     price: 7000,    type: 'prof_boost', value: 25, profId: 'fisherman' },
  { id: 'tool_plow',     name: '🌾 Pflug',                 price: 6000,    type: 'prof_boost', value: 25, profId: 'farmer' },
  { id: 'tool_pickaxe',  name: '⛏️ Eisenspitzhacke',      price: 9000,    type: 'prof_boost', value: 25, profId: 'miner' },
  { id: 'tool_knife',    name: '🔪 Kochklinge',            price: 5000,    type: 'prof_boost', value: 25, profId: 'chef' },
  { id: 'tool_scale',    name: '⚖️ Händler-Waage',         price: 7500,    type: 'prof_boost', value: 25, profId: 'merchant' },

  // --- Tränke 🧪 (temporäre Buffs, 1h Wirkung) ---
  { id: 'pot_xp',        name: '🧪 XP-Trank',             price: 3000,    type: 'potion',   value: 50, potionType: 'xp_pct', duration: 3600000 },
  { id: 'pot_luck',      name: '🍀 Glückstrank',           price: 4000,    type: 'potion',   value: 5,  potionType: 'luck_add', duration: 3600000 },
  { id: 'pot_combat',    name: '💪 Kampftrank',            price: 5000,    type: 'potion',   value: 15, potionType: 'atk_pct', duration: 3600000 },
  { id: 'pot_defense',   name: '🛡️ Schutztrank',          price: 5000,    type: 'potion',   value: 15, potionType: 'def_pct', duration: 3600000 },
  { id: 'pot_income',    name: '💰 Reichtums-Elixier',     price: 7000,    type: 'potion',   value: 30, potionType: 'income_pct', duration: 3600000 },
  { id: 'pot_mega',      name: '⚡ Mega-Elixier',          price: 15000,   type: 'potion',   value: 100, potionType: 'all_pct', duration: 1800000 },
];

const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// ====================================================================
// Crafting-Rezepte: 3 Zutaten → Ergebnis
// ====================================================================
const CRAFT_RECIPES = [
  {
    id: 'recipe_sword',
    ingredients: ['col_watch', 'boost_luck2', 'pet_dragon'],
    result: 'craft_sword',
    desc: 'Uhr + Goldhufeisen + Drache → Legendäres Schwert',
  },
  {
    id: 'recipe_staff',
    ingredients: ['boost_xp3', 'pet_unicorn', 'col_ring'],
    result: 'craft_staff',
    desc: 'XP-Boost MAX + Einhorn + Diamantring → Magischer Stab',
  },
  {
    id: 'recipe_shield',
    ingredients: ['car_yacht', 'pet_phoenix', 'col_crown'],
    result: 'craft_shield',
    desc: 'Yacht + Phönix + Goldene Krone → Diamantschild',
  },
  {
    id: 'recipe_rocket',
    ingredients: ['car_jet', 'car_heli', 'col_trophy'],
    result: 'car_rocket',
    desc: 'Privatjet + Hubschrauber + Pokal → Rakete',
  },
];

// ====================================================================
// ShopManager
// ====================================================================
class ShopManager {
  constructor(economy) {
    if (!(economy instanceof EconomyManager)) throw new Error('ShopManager braucht eine EconomyManager-Instanz');
    this.eco = economy;
    this.db = economy.db;
  }

  async init() {
    await this.db.batch([
      'CREATE TABLE IF NOT EXISTS owned_items (user_id TEXT NOT NULL, item_id TEXT NOT NULL, bought_at INTEGER NOT NULL, PRIMARY KEY (user_id, item_id))',
      'CREATE TABLE IF NOT EXISTS item_market (seller_id TEXT NOT NULL, item_id TEXT NOT NULL, ask_price INTEGER NOT NULL, listed_at INTEGER NOT NULL, PRIMARY KEY (seller_id, item_id))',
    ], 'write');
  }

  async getItems(userId) {
    const rs = await this.db.execute({ sql: 'SELECT item_id, bought_at FROM owned_items WHERE user_id=? ORDER BY bought_at DESC', args: [userId] });
    return rs.rows.map((r) => ({ itemId: r.item_id, boughtAt: Number(r.bought_at), def: ITEM_BY_ID[r.item_id] })).filter((r) => r.def);
  }

  async owns(userId, itemId) {
    const rs = await this.db.execute({ sql: 'SELECT 1 FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
    return rs.rows.length > 0;
  }

  async buyItem(userId, itemId) {
    const item = ITEM_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'Item nicht gefunden.' };
    if (item.craft) return { ok: false, reason: 'Dieses Item kann nur durch Crafting hergestellt werden.' };
    if (await this.owns(userId, itemId)) return { ok: false, reason: 'Du besitzt dieses Item bereits.' };
    const remaining = await this.eco.deductBalance(userId, item.price);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    await this.db.execute({ sql: 'INSERT INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [userId, itemId, Date.now()] });
    return { ok: true, item, remaining };
  }

  async sellItem(userId, itemId) {
    const item = ITEM_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'Item nicht gefunden.' };
    if (!(await this.owns(userId, itemId))) return { ok: false, reason: 'Du besitzt dieses Item nicht.' };
    const refund = item.craft ? Math.floor(item.price * 0.3) : Math.floor(item.price * 0.6);
    await this.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
    const balance = await this.eco.addBalance(userId, refund);
    return { ok: true, item, refund, balance };
  }

  // Summierte Effekte aller besessenen Items
  async getEffects(userId) {
    const items = await this.getItems(userId);
    const eff = {
      xpMult: 1, luckBonus: 0, dailyIncome: 0,
      combatAtk: 0, combatDef: 0,
      travelDiscount: 0, dropBonus: 0,
      profBoosts: {},        // { profId: bonusPct }
      activePotion: null,    // highest-priority active potion
    };
    const now = Date.now();
    for (const { def } of items) {
      if (def.type === 'xp_boost') eff.xpMult *= def.value;
      else if (def.type === 'luck') eff.luckBonus += def.value;
      else if (def.type === 'income') eff.dailyIncome += def.value;
      else if (def.type === 'combat') {
        if (def.combatType === 'atk') eff.combatAtk += def.value;
        else if (def.combatType === 'def') eff.combatDef += def.value;
      } else if (def.type === 'travel') {
        if (def.travelType === 'discount') eff.travelDiscount += def.value;
        else if (def.travelType === 'drop_bonus') eff.dropBonus += def.value;
      } else if (def.type === 'prof_boost' && def.profId) {
        eff.profBoosts[def.profId] = (eff.profBoosts[def.profId] || 0) + def.value;
      }
    }
    // Check active potions from player_meta
    try {
      const potionExpiry = await this.eco.getMeta(userId, 'potion_expiry');
      const potionType = await this.eco.getMeta(userId, 'potion_type');
      const potionValue = await this.eco.getMeta(userId, 'potion_value');
      if (potionExpiry > now && potionType) {
        eff.activePotion = { type: potionType, value: potionValue, expiresAt: potionExpiry };
        if (String(potionType) === 'xp_pct') eff.xpMult *= (1 + potionValue / 100);
        else if (String(potionType) === 'luck_add') eff.luckBonus += potionValue;
        else if (String(potionType) === 'atk_pct') eff.combatAtk = Math.floor(eff.combatAtk * (1 + potionValue / 100));
        else if (String(potionType) === 'def_pct') eff.combatDef = Math.floor(eff.combatDef * (1 + potionValue / 100));
        else if (String(potionType) === 'income_pct') eff.dailyIncome = Math.floor(eff.dailyIncome * (1 + potionValue / 100));
        else if (String(potionType) === 'all_pct') { eff.xpMult *= (1 + potionValue / 100); eff.luckBonus += 10; eff.dailyIncome = Math.floor(eff.dailyIncome * 1.3); }
      }
    } catch (_) {}
    return eff;
  }

  // Trank aktivieren (einmalig verbrauchen)
  async usePotion(userId, itemId) {
    const item = ITEM_BY_ID[itemId];
    if (!item || item.type !== 'potion') return { ok: false, reason: 'Das ist kein Trank.' };
    const rs = await this.db.execute({ sql: 'SELECT 1 FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
    if (!rs.rows.length) return { ok: false, reason: 'Du besitzt diesen Trank nicht.' };
    await this.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=? LIMIT 1', args: [userId, itemId] });
    const expiry = Date.now() + item.duration;
    await this.eco.setMeta(userId, 'potion_expiry', expiry);
    await this.eco.setMeta(userId, 'potion_value', item.value);
    // Store potion type as string via a separate text meta approach — use numeric encoding
    const typeMap = { xp_pct: 1, luck_add: 2, atk_pct: 3, def_pct: 4, income_pct: 5, all_pct: 6 };
    await this.eco.setMeta(userId, 'potion_type', typeMap[item.potionType] || 0);
    return { ok: true, item, expiresAt: expiry };
  }

  // Passives Tageseinkommen aus Items einsammeln
  async collectIncome(userId) {
    const last = await this.eco.getMeta(userId, 'last_item_income');
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (now - last < DAY) return { ok: false, waitMs: DAY - (now - last) };
    const eff = await this.getEffects(userId);
    if (eff.dailyIncome <= 0) return { ok: false, reason: 'Du hast keine einkommensbringenden Items.' };
    await this.eco.setMeta(userId, 'last_item_income', now);
    const balance = await this.eco.addBalance(userId, eff.dailyIncome);
    return { ok: true, income: eff.dailyIncome, balance };
  }

  // Tagesrabatt auf ein Item (Seed = Datum)
  dailyDeal() {
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const buyable = ITEMS.filter((i) => !i.craft && i.price > 0);
    const item = buyable[(seed * 7919) % buyable.length];
    return { ...item, salePrice: Math.floor(item.price * 0.75) };
  }

  // ================================================================
  // Crafting – 3 Items kombinieren → neues Item
  // ================================================================
  async craft(userId, ingredientIds) {
    if (!Array.isArray(ingredientIds) || ingredientIds.length !== 3) {
      return { ok: false, reason: 'Crafting benötigt genau 3 Item-IDs.' };
    }
    const sorted = [...ingredientIds].sort();
    const recipe = CRAFT_RECIPES.find((r) => {
      const rSorted = [...r.ingredients].sort();
      return rSorted.every((id, i) => id === sorted[i]);
    });
    if (!recipe) {
      const known = CRAFT_RECIPES.map((r) => `${r.desc}`).join('\n');
      return { ok: false, reason: `Unbekannte Kombination.\n\nBekannte Rezepte:\n${known}` };
    }
    // Prüfen ob alle Zutaten vorhanden
    for (const id of recipe.ingredients) {
      if (!(await this.owns(userId, id))) {
        return { ok: false, reason: `Du hast ${ITEM_BY_ID[id]?.name || id} nicht.` };
      }
    }
    const result = ITEM_BY_ID[recipe.result];
    if (!result) return { ok: false, reason: 'Interner Fehler: Ergebnis-Item nicht gefunden.' };
    if (await this.owns(userId, recipe.result)) return { ok: false, reason: `Du hast ${result.name} bereits.` };
    // Zutaten verbrauchen
    for (const id of recipe.ingredients) {
      await this.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, id] });
    }
    // Ergebnis hinzufügen
    await this.db.execute({ sql: 'INSERT INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [userId, recipe.result, Date.now()] });
    return { ok: true, recipe, result };
  }

  // ================================================================
  // Item-Marktplatz – Spieler stellen Items ein, andere kaufen
  // ================================================================
  async listItemOnMarket(userId, itemId, askPrice) {
    askPrice = Math.floor(askPrice);
    if (askPrice <= 0) return { ok: false, reason: 'Preis muss positiv sein.' };
    const item = ITEM_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'Item nicht gefunden.' };
    if (!(await this.owns(userId, itemId))) return { ok: false, reason: 'Du hast dieses Item nicht.' };
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO item_market(seller_id,item_id,ask_price,listed_at) VALUES(?,?,?,?)',
      args: [userId, itemId, askPrice, Date.now()],
    });
    return { ok: true, item, askPrice };
  }

  async buyFromMarket(buyerId, itemId) {
    const rs = await this.db.execute({ sql: 'SELECT * FROM item_market WHERE item_id=?', args: [itemId] });
    if (!rs.rows.length) return { ok: false, reason: 'Kein Marktangebot für dieses Item.' };
    const listing = rs.rows[0];
    if (listing.seller_id === buyerId) return { ok: false, reason: 'Du kannst dein eigenes Angebot nicht kaufen.' };
    if (await this.owns(buyerId, itemId)) return { ok: false, reason: 'Du besitzt dieses Item bereits.' };
    const price = Number(listing.ask_price);
    const remaining = await this.eco.deductBalance(buyerId, price);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    // Item übertragen
    await this.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=?', args: [listing.seller_id, itemId] });
    await this.db.execute({ sql: 'INSERT INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [buyerId, itemId, Date.now()] });
    await this.eco.addBalance(listing.seller_id, price);
    await this.db.execute({ sql: 'DELETE FROM item_market WHERE item_id=?', args: [itemId] });
    const item = ITEM_BY_ID[itemId];
    return { ok: true, item, price, sellerId: listing.seller_id, buyerBalance: remaining };
  }

  async getMarketListings() {
    const rs = await this.db.execute('SELECT * FROM item_market ORDER BY listed_at DESC LIMIT 20');
    return rs.rows.map((r) => ({
      sellerId: r.seller_id,
      item: ITEM_BY_ID[r.item_id],
      askPrice: Number(r.ask_price),
      listedAt: Number(r.listed_at),
    })).filter((l) => l.item);
  }

  async cancelMarketListing(userId, itemId) {
    const rs = await this.db.execute({ sql: 'SELECT 1 FROM item_market WHERE seller_id=? AND item_id=?', args: [userId, itemId] });
    if (!rs.rows.length) return { ok: false, reason: 'Kein Angebot von dir.' };
    await this.db.execute({ sql: 'DELETE FROM item_market WHERE seller_id=? AND item_id=?', args: [userId, itemId] });
    return { ok: true };
  }

  // Item an einen anderen Spieler verschenken
  async giftItem(fromId, toId, itemId) {
    const item = ITEM_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'Item nicht gefunden.' };
    if (!(await this.owns(fromId, itemId))) return { ok: false, reason: 'Du hast dieses Item nicht.' };
    if (await this.owns(toId, itemId)) return { ok: false, reason: 'Der Empfänger hat dieses Item bereits.' };
    await this.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=?', args: [fromId, itemId] });
    await this.db.execute({ sql: 'INSERT INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [toId, itemId, Date.now()] });
    return { ok: true, item };
  }
}

function shopList() {
  const groups = { '🚗 Fahrzeuge': [], '🐾 Haustiere': [], '⚡ Boosts': [], '💎 Sammler': [], '🔨 Nur Crafting': [] };
  for (const i of ITEMS) {
    const g = i.craft ? '🔨 Nur Crafting'
      : i.id.startsWith('car_') ? '🚗 Fahrzeuge'
      : i.id.startsWith('pet_') ? '🐾 Haustiere'
      : i.id.startsWith('col_') ? '💎 Sammler' : '⚡ Boosts';
    const priceStr = i.craft ? '(Crafting)' : formatBalance(i.price);
    groups[g].push(`▸ [${i.id}] ${i.name} – ${priceStr}`);
  }
  return '🛒 *Shop*\n\n' + Object.entries(groups).map(([k, v]) => `*${k}*\n${v.join('\n')}`).join('\n\n');
}

function craftingList() {
  const lines = CRAFT_RECIPES.map((r) => {
    const ingNames = r.ingredients.map((id) => ITEM_BY_ID[id]?.name || id).join(' + ');
    const res = ITEM_BY_ID[r.result];
    return `🔨 ${ingNames} → ${res?.name || r.result}`;
  }).join('\n');
  return `🧪 *Crafting-Rezepte*\n\n${lines}\n\nCraften: !crafting <id1> <id2> <id3>`;
}

// ====================================================================
// SHOP_COMMANDS – Vorlage für index.js (siehe INTEGRATION.md)
// ====================================================================
/*

  case 'shop': {
    await reply(shopList());
    break;
  }
  case 'kaufenitem': case 'buyitem': {
    const r = await shop.buyItem(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`✅ ${r.item.name} gekauft!\nKontostand: ${formatBalance(r.remaining)}`);
    break;
  }
  case 'verkaufenitem': case 'sellitem': {
    const r = await shop.sellItem(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`💰 ${r.item.name} verkauft für ${formatBalance(r.refund)}.`);
    break;
  }
  case 'meineitems': case 'items': {
    const items = await shop.getItems(senderJid);
    if (!items.length) { await reply('Du besitzt keine Items. Schau in den !shop!'); break; }
    const eff = await shop.getEffects(senderJid);
    await reply(`🎒 *Deine Items* (${items.length})\n\n${items.map((i) => `${i.def.name} [${i.itemId}]`).join('\n')}\n\n⚡ XP-Mult: x${eff.xpMult} | 🍀 Glück: +${eff.luckBonus}% | 💼 Einkommen: ${formatBalance(eff.dailyIncome)}/Tag`);
    break;
  }
  case 'einkommen': {
    const r = await shop.collectIncome(senderJid);
    if (!r.ok) { await reply(r.reason || `⏳ Einkommen gibt es einmal pro Tag.`); break; }
    await reply(`💼 Tageseinkommen: ${formatBalance(r.income)}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'tagesdeal': {
    const d = shop.dailyDeal();
    await reply(`✨ *Tagesdeal*: ${d.name}\n~~${formatBalance(d.price)}~~ → *${formatBalance(d.salePrice)}* (-25%)\nKaufen: ${COMMAND_PREFIX}kaufenitem ${d.id}`);
    break;
  }
  case 'crafting': case 'craft': {
    if (!args[0]) { await reply(craftingList()); break; }
    const r = await shop.craft(senderJid, args.slice(0, 3));
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🧪 *Crafting erfolgreich!*\n${r.recipe.ingredients.map((id) => ITEM_BY_ID[id]?.name).join(' + ')} → *${r.result.name}*`);
    break;
  }
  case 'itemmarkt': {
    const listings = await shop.getMarketListings();
    if (!listings.length) { await reply('📭 Item-Marktplatz ist leer.'); break; }
    const lines = listings.slice(0, 10).map((l) => `▸ [${l.item.id}] ${l.item.name} – ${formatBalance(l.askPrice)}\nVon: @${l.sellerId.split('@')[0]}`).join('\n\n');
    await reply(`🏪 *Item-Marktplatz*\n\n${lines}\n\nKaufen: ${COMMAND_PREFIX}kaufenmarkt <item-id>`);
    break;
  }
  case 'anbieteitem': {
    const r = await shop.listItemOnMarket(senderJid, args[0], Number(args[1]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`✅ *${r.item.name}* für ${formatBalance(r.askPrice)} auf dem Markt angeboten.`);
    break;
  }
  case 'kaufenmarkt': {
    const r = await shop.buyFromMarket(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await sock.sendMessage(jid, { text: `✅ *${r.item.name}* für ${formatBalance(r.price)} von @${r.sellerId.split('@')[0]} gekauft!\nKontostand: ${formatBalance(r.buyerBalance)}`, mentions: [r.sellerId] });
    break;
  }
  case 'schenkitem': case 'giftitem': {
    const target = getTargetJid(msg);
    if (!target || !args[1]) { await reply(`Nutzung: ${COMMAND_PREFIX}schenkitem @person <item-id>`); break; }
    const r = await shop.giftItem(senderJid, target, args[1].toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await sock.sendMessage(jid, { text: `🎁 @${senderJid.split('@')[0]} schenkt @${target.split('@')[0]} *${r.item.name}*!`, mentions: [senderJid, target] });
    break;
  }

*/

// ====================================================================
// Saisonale Items – erscheinen je nach Jahreszeit automatisch
// ====================================================================
const SEASONAL_ITEMS = [
  // Weihnachten (Dezember)
  { id: 'xmas_tree',    name: '🎄 Weihnachtsbaum',      price: 15000,  type: 'income',  value: 500,  season: 'xmas' },
  { id: 'xmas_star',    name: '⭐ Weihnachtsstern',     price: 8000,   type: 'luck',    value: 5,    season: 'xmas' },
  { id: 'xmas_sack',    name: '🎁 Geschenksack',        price: 5000,   type: 'cosmetic',            season: 'xmas' },
  { id: 'xmas_rudolf',  name: '🦌 Rentier Rudolf',      price: 30000,  type: 'income',  value: 1500, season: 'xmas' },
  // Halloween (Oktober)
  { id: 'hal_pumpkin',  name: '🎃 Riesig-Kürbis',       price: 10000,  type: 'luck',    value: 7,    season: 'halloween' },
  { id: 'hal_witch',    name: '🧙 Hexenbesen',           price: 20000,  type: 'xp_boost', value: 2,  season: 'halloween' },
  { id: 'hal_bat',      name: '🦇 Fledermaus-Schwarm',  price: 6000,   type: 'income',  value: 300,  season: 'halloween' },
  { id: 'hal_skull',    name: '💀 Totenkopf-Trophäe',   price: 25000,  type: 'cosmetic',            season: 'halloween' },
  // Silvester (Januar/Dezember)
  { id: 'ny_firework',  name: '🎆 Feuerwerk-Set',       price: 12000,  type: 'luck',    value: 10,   season: 'newyear' },
  { id: 'ny_champagne', name: '🥂 Champagner-Dusche',   price: 9000,   type: 'xp_boost', value: 3,   season: 'newyear' },
  // Valentinstag (Februar)
  { id: 'val_roses',    name: '🌹 Rosen-Strauß',        price: 5000,   type: 'luck',    value: 3,    season: 'valentine' },
  { id: 'val_heart',    name: '💝 Herz-Amulett',        price: 18000,  type: 'income',  value: 800,  season: 'valentine' },
  // Ostern (April – season: 'april' für Fools Day, aber auch Oster-Items)
  { id: 'easter_egg',   name: '🥚 Goldenes Osterei',    price: 7000,   type: 'luck',    value: 6,    season: 'april' },
  { id: 'easter_bunny', name: '🐰 Oster-Hase',          price: 22000,  type: 'income',  value: 900,  season: 'april' },
];

// Alle Items zusammen (kaufbarer Shop inkl. Saisonal)
function getAllItems(currentSeasonId) {
  const base = ITEMS.filter((i) => !i.craft);
  const seasonal = SEASONAL_ITEMS.filter((i) => i.season === currentSeasonId);
  return [...base, ...seasonal];
}

// ====================================================================
// Item-Verzauberung (Enchantment) – verstärkt existierende Items
// ====================================================================
const ENCHANTMENTS = [
  { id: 'ench_power', name: '🔮 Kraft-Verzauberung', costMultiplier: 0.3, effect: 'value', modifier: 1.25, desc: '+25% Effektstärke' },
  { id: 'ench_speed', name: '💫 Schnell-Verzauberung', costMultiplier: 0.2, effect: 'cooldown', modifier: 0.8, desc: '-20% Cooldown' },
  { id: 'ench_lucky', name: '🍀 Glücks-Verzauberung', costMultiplier: 0.25, effect: 'luck', modifier: 3, desc: '+3% Glück' },
  { id: 'ench_golden', name: '✨ Gold-Verzauberung', costMultiplier: 0.5, effect: 'value', modifier: 1.5, desc: '+50% Effektstärke (max 1x)' },
];

ShopManager.prototype.enchant = async function (userId, itemId, enchantId) {
  const item = ITEM_BY_ID[itemId];
  if (!item) return { ok: false, reason: 'Unbekanntes Item.' };
  const ench = ENCHANTMENTS.find((e) => e.id === enchantId);
  if (!ench) return { ok: false, reason: `Unbekannte Verzauberung. IDs: ${ENCHANTMENTS.map((e) => e.id).join(', ')}` };
  const rs = await this.eco.db.execute({ sql: 'SELECT 1 FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
  if (!rs.rows.length) return { ok: false, reason: `Du besitzt kein ${item.name}.` };
  const enchKey = `ench_${itemId}_${enchantId}`;
  const alreadyDone = await this.eco.getMeta(userId, enchKey);
  if (alreadyDone && enchantId === 'ench_golden') return { ok: false, reason: 'Gold-Verzauberung kann nur einmal angewendet werden.' };
  const cost = Math.floor((item.price || 10000) * ench.costMultiplier);
  const remaining = await this.eco.deductBalance(userId, cost);
  if (remaining === null) return { ok: false, reason: `Nicht genug Coins. Kosten: ${cost}` };
  await this.eco.setMeta(userId, enchKey, (alreadyDone || 0) + 1);
  return { ok: true, item, ench, cost, balance: remaining };
};

ShopManager.prototype.getEnchantments = async function (userId, itemId) {
  const item = ITEM_BY_ID[itemId];
  if (!item) return [];
  const result = [];
  for (const ench of ENCHANTMENTS) {
    const key = `ench_${itemId}_${ench.id}`;
    const level = await this.eco.getMeta(userId, key);
    if (level > 0) result.push({ ench, level });
  }
  return result;
};

// ====================================================================
// Bundle-Deals – Gruppen von Items zu Rabatt kaufen
// ====================================================================
const BUNDLES = [
  {
    id: 'bundle_starter',
    name: '🎒 Starter-Paket',
    items: ['pet_cat', 'boost_xp', 'col_coin'],
    price: 30000, // statt ~45000
    desc: 'Katze + XP-Boost + Goldmünze – 33% Rabatt',
  },
  {
    id: 'bundle_rich',
    name: '💼 Investor-Paket',
    items: ['boost_income', 'col_painting', 'pet_lion'],
    price: 300000, // statt ~355000
    desc: 'Geschäftslizenz + Meistergemälde + Löwe – 15% Rabatt',
  },
  {
    id: 'bundle_lucky',
    name: '🍀 Glücks-Paket',
    items: ['boost_luck', 'boost_luck2', 'pet_unicorn'],
    price: 350000, // statt ~380000
    desc: 'Glücksbringer + Goldhufeisen + Einhorn – 8% Rabatt',
  },
  {
    id: 'bundle_speed',
    name: '⚡ Speed-Paket',
    items: ['boost_xp', 'boost_xp3', 'boost_income'],
    price: 100000, // statt ~125000
    desc: 'XP-Boost + XP-Boost MAX + Geschäftslizenz – 20% Rabatt',
  },
];

ShopManager.prototype.buyBundle = async function (userId, bundleId) {
  const bundle = BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return { ok: false, reason: `Unbekanntes Bundle. IDs: ${BUNDLES.map((b) => b.id).join(', ')}` };
  const remaining = await this.eco.deductBalance(userId, bundle.price);
  if (remaining === null) return { ok: false, reason: `Nicht genug Coins. Bundle kostet ${bundle.price}.` };
  for (const itemId of bundle.items) {
    const rs = await this.eco.db.execute({ sql: 'SELECT 1 FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
    if (!rs.rows.length) {
      await this.eco.db.execute({ sql: 'INSERT OR IGNORE INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [userId, itemId, Date.now()] });
    }
  }
  return { ok: true, bundle, balance: remaining };
};

ShopManager.prototype.bundleList = function () {
  const lines = BUNDLES.map((b) => {
    const items = b.items.map((id) => ITEM_BY_ID[id]?.name || id).join(', ');
    return `*${b.name}* [${b.id}]\n${b.desc}\nInhalt: ${items}\nPreis: ${b.price.toLocaleString()} Coins`;
  });
  return `📦 *Bundle-Angebote*\n\n${lines.join('\n\n')}\nKaufen: !bundle <id>`;
};

// ====================================================================
// Legendäre Items – extrem selten (nur via Zufall-Drop oder Event)
// ====================================================================
const LEGENDARY_ITEMS = [
  { id: 'leg_zeus', name: '⚡ Blitz des Zeus', effect: 'luck', value: 50, desc: '+50% Glück in allen Spielen' },
  { id: 'leg_midas', name: '👑 Hand des Midas', effect: 'income', value: 20000, desc: '+20.000 Coins/Tag Passiveinkommen' },
  { id: 'leg_excalibur', name: '🗡️ Excalibur', effect: 'xp_boost', value: 10, desc: '×10 XP auf alles' },
  { id: 'leg_philosophers', name: '🧪 Stein der Weisen', effect: 'all', value: 1.5, desc: '+50% auf alle Boni' },
];

// Legendäre Items werden nur durch Events gedroppt, nicht kaufbar.
// Sie werden in owned_items mit dem Präfix 'leg_' gespeichert.

ShopManager.prototype.getLegendaryItems = async function (userId) {
  const result = [];
  for (const item of LEGENDARY_ITEMS) {
    const rs = await this.eco.db.execute({ sql: 'SELECT 1 FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, item.id] });
    if (rs.rows.length) result.push(item);
  }
  return result;
};

ShopManager.prototype.awardLegendary = async function (userId, itemId) {
  const item = LEGENDARY_ITEMS.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: 'Unbekanntes Legendäres Item.' };
  await this.eco.db.execute({ sql: 'INSERT OR IGNORE INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [userId, item.id, Date.now()] });
  return { ok: true, item };
};

// ====================================================================
// Item-Upgrade-System – Items auf Stufe 2 oder 3 upgraden
// ====================================================================
const ITEM_UPGRADES = {
  'pet_cat':      { to: 'pet_dog',     cost: 5000,  desc: 'Katze → Hund' },
  'pet_dog':      { to: 'pet_horse',   cost: 20000, desc: 'Hund → Pferd' },
  'pet_horse':    { to: 'pet_lion',    cost: 45000, desc: 'Pferd → Löwe' },
  'pet_lion':     { to: 'pet_dragon',  cost: 80000, desc: 'Löwe → Drache' },
  'pet_dragon':   { to: 'pet_unicorn', cost: 100000, desc: 'Drache → Einhorn' },
  'boost_xp':     { to: 'boost_xp3',  cost: 40000, desc: 'XP-Boost → XP-Boost MAX' },
  'boost_luck':   { to: 'boost_luck2', cost: 55000, desc: 'Glücksbringer → Goldhufeisen' },
  'car_polo':     { to: 'car_bmw',    cost: 28000, desc: 'Kleinwagen → Limousine' },
  'car_bmw':      { to: 'car_sport',  cost: 90000, desc: 'Limousine → Sportwagen' },
  'car_sport':    { to: 'car_super',  cost: 165000, desc: 'Sportwagen → Supersportler' },
  'car_super':    { to: 'car_heli',   cost: 100000, desc: 'Supersportler → Hubschrauber' },
  'boost_income': { to: 'boost_incmax', cost: 145000, desc: 'Geschäftslizenz → Konzernlizenz' },
};

ShopManager.prototype.upgradeItem = async function (userId, itemId) {
  const upgrade = ITEM_UPGRADES[itemId];
  if (!upgrade) return { ok: false, reason: 'Dieses Item kann nicht geupgradet werden.' };
  const fromItem = ITEM_BY_ID[itemId];
  const toItem = ITEM_BY_ID[upgrade.to];
  if (!fromItem || !toItem) return { ok: false, reason: 'Item-Konfiguration fehlt.' };
  // Prüfe ob Spieler das Item besitzt
  const rs = await this.eco.db.execute({ sql: 'SELECT 1 FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
  if (!rs.rows.length) return { ok: false, reason: `Du besitzt kein ${fromItem.name}.` };
  // Prüfe Coins
  const remaining = await this.eco.deductBalance(userId, upgrade.cost);
  if (remaining === null) return { ok: false, reason: `Nicht genug Coins. Upgrade kostet ${upgrade.cost.toLocaleString()}.` };
  // Ersetze Item
  await this.eco.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
  await this.eco.db.execute({ sql: 'INSERT OR IGNORE INTO owned_items(user_id,item_id,bought_at) VALUES(?,?,?)', args: [userId, upgrade.to, Date.now()] });
  return { ok: true, from: fromItem, to: toItem, cost: upgrade.cost, balance: remaining };
};

ShopManager.prototype.upgradeList = function () {
  const lines = Object.entries(ITEM_UPGRADES).map(([fromId, u]) => {
    const from = ITEM_BY_ID[fromId];
    const to = ITEM_BY_ID[u.to];
    if (!from || !to) return null;
    return `${from.name} → ${to.name} (${u.cost.toLocaleString()} Coins)`;
  }).filter(Boolean);
  return `🔧 *Upgrade-Pfade*\n\n${lines.join('\n')}\nUpgraden: !upgrade <item-id>`;
};

// ====================================================================
// Tages-Angebot-Rotation – mehrere Tagesdeals gleichzeitig
// ====================================================================
ShopManager.prototype.dailyDeals = function () {
  const seed = Math.floor(Date.now() / 86400000);
  const rng = () => {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  };
  const r = rng();
  const buyable = ITEMS.filter((i) => !i.craft && i.price > 0);
  const picks = [];
  const used = new Set();
  while (picks.length < 3 && picks.length < buyable.length) {
    const idx = Math.floor(r() * buyable.length);
    if (!used.has(idx)) { used.add(idx); picks.push(buyable[idx]); }
  }
  return picks.map((item) => ({ ...item, salePrice: Math.floor(item.price * 0.75) }));
};

// ====================================================================
// Wunschliste – Spieler merken sich Items für später
// ====================================================================
ShopManager.prototype.addToWishlist = async function (userId, itemId) {
  const item = ITEM_BY_ID[itemId];
  if (!item) return { ok: false, reason: 'Unbekanntes Item.' };
  const key = `wishlist_${itemId}`;
  const existing = await this.eco.getMeta(userId, key);
  if (existing) return { ok: false, reason: `${item.name} ist bereits auf deiner Wunschliste.` };
  await this.eco.setMeta(userId, key, 1);
  return { ok: true, item };
};

ShopManager.prototype.getWishlist = async function (userId) {
  const result = [];
  for (const item of ITEMS) {
    const key = `wishlist_${item.id}`;
    const on = await this.eco.getMeta(userId, key);
    if (on) result.push(item);
  }
  return result;
};

ShopManager.prototype.removeFromWishlist = async function (userId, itemId) {
  const key = `wishlist_${itemId}`;
  await this.eco.setMeta(userId, key, 0);
  return { ok: true };
};

// ====================================================================
// ADDITIONAL SHOP COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Verzaubern ----
  case 'verzaubern': case 'enchant': {
    const itemId = (args[0] || '').toLowerCase();
    const enchId = (args[1] || '').toLowerCase();
    if (!itemId || !enchId) {
      const enchLines = ENCHANTMENTS.map((e) => `${e.id}: ${e.name} – ${e.desc}`).join('\n');
      await reply(`Nutzung: ${COMMAND_PREFIX}verzaubern <item-id> <verzauberungs-id>\n\n🔮 Verfügbar:\n${enchLines}`);
      break;
    }
    const r = await shop.enchant(senderJid, itemId, enchId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`✨ *${r.item.name}* wurde mit *${r.ench.name}* verzaubert!\nKosten: ${formatBalance(r.cost)}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Bundle kaufen ----
  case 'bundle': {
    if (!args[0]) { await reply(shop.bundleList()); break; }
    const r = await shop.buyBundle(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const items = r.bundle.items.map((id) => ITEM_BY_ID[id]?.name || id).join(', ');
    await reply(`📦 *${r.bundle.name}* gekauft!\nEnthalten: ${items}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Saisonaler Shop ----
  case 'saisonshop': case 'seasonal': {
    const season = EconomyManager.currentSeason();
    if (!season) { await reply('Aktuell kein saisonales Event aktiv.'); break; }
    const items = SEASONAL_ITEMS.filter((i) => i.season === season.id);
    if (!items.length) { await reply('Keine saisonalen Items verfügbar.'); break; }
    const lines = items.map((i) => `${i.name} [${i.id}] – ${formatBalance(i.price)}`).join('\n');
    await reply(`${season.name} *Saison-Shop*\n\n${lines}\n\nKaufen: ${COMMAND_PREFIX}kaufenitem <id>`);
    break;
  }

  // ---- Legendäre Items anzeigen ----
  case 'legendary': case 'legendarmy': {
    const items = await shop.getLegendaryItems(senderJid);
    if (!items.length) { await reply('Du besitzt noch keine legendären Items. Sie können durch Events gedroppt werden.'); break; }
    await reply(`🌟 *Legendäre Items*\n\n${items.map((i) => `${i.name}\n${i.desc}`).join('\n\n')}`);
    break;
  }

*/

// ====================================================================
// COMPLETE SHOP_COMMANDS Vorlage (alle Shop-Befehle in einem Block)
// ====================================================================
/*

  // ---- Shop anzeigen ----
  case 'shop': {
    const season = EconomyManager.currentSeason();
    await reply(shopList(season?.id));
    break;
  }

  // ---- Item kaufen ----
  case 'kaufenitem': case 'buyitem': {
    const itemId = (args[0] || '').toLowerCase();
    if (!itemId) { await reply(`Nutzung: ${COMMAND_PREFIX}kaufenitem <item-id>\nShop anzeigen: ${COMMAND_PREFIX}shop`); break; }
    const r = await shop.buyItem(senderJid, itemId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'buyitem');
    await reply(`✅ *${r.item.name}* gekauft für ${formatBalance(r.price)}!\nKontostand: ${formatBalance(r.balance)}`);
    await economy.checkAchievements(senderJid);
    break;
  }

  // ---- Items anzeigen ----
  case 'items': case 'meineitems': {
    const items = await shop.getItems(senderJid);
    if (!items.length) { await reply('Du besitzt keine Items. Schau in den !shop!'); break; }
    const eff = await shop.getEffects(senderJid);
    const legs = await shop.getLegendaryItems(senderJid);
    let txt = `🎒 *Deine Items* (${items.length + legs.length})\n\n`;
    txt += items.map((i) => `${i.def.name} [${i.itemId}]`).join('\n');
    if (legs.length) txt += '\n\n🌟 *Legendär:*\n' + legs.map((l) => l.name).join('\n');
    txt += `\n\n⚡ XP: x${eff.xpMult} | 🍀 Glück: +${eff.luckBonus}% | 💼 Income: ${formatBalance(eff.dailyIncome)}/Tag`;
    await reply(txt);
    break;
  }

  // ---- Upgrade ----
  case 'upgrade': {
    const itemId = (args[0] || '').toLowerCase();
    if (!itemId) { await reply(shop.upgradeList()); break; }
    const r = await shop.upgradeItem(senderJid, itemId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🔧 *Upgrade erfolgreich!*\n${r.from.name} → *${r.to.name}*\nKosten: ${formatBalance(r.cost)}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Wunschliste ----
  case 'wunschliste': case 'wishlist': {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'add' || sub === 'hinzu') {
      const r = await shop.addToWishlist(senderJid, args[1] || '');
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`❤️ *${r.item.name}* zur Wunschliste hinzugefügt.`);
      break;
    }
    if (sub === 'remove' || sub === 'entfernen') {
      await shop.removeFromWishlist(senderJid, args[1] || '');
      await reply('✅ Von der Wunschliste entfernt.');
      break;
    }
    const list = await shop.getWishlist(senderJid);
    if (!list.length) { await reply('Deine Wunschliste ist leer. Hinzufügen: !wunschliste add <item-id>'); break; }
    await reply(`❤️ *Wunschliste*\n\n${list.map((i) => `${i.name} [${i.id}] – ${formatBalance(i.price)}`).join('\n')}`);
    break;
  }

  // ---- Mehrere Tagesdeals ----
  case 'tagesdeal': case 'deals': {
    const deals = shop.dailyDeals();
    const lines = deals.map((d) => `${d.name} [${d.id}]\n~~${formatBalance(d.price)}~~ → *${formatBalance(d.salePrice)}* (-25%)`).join('\n\n');
    await reply(`✨ *Tages-Deals* (bis Mitternacht)\n\n${lines}\nKaufen: ${COMMAND_PREFIX}kaufenitem <id>`);
    break;
  }

*/

module.exports = {
  ShopManager, ITEMS, ITEM_BY_ID, CRAFT_RECIPES,
  SEASONAL_ITEMS, ENCHANTMENTS, BUNDLES, LEGENDARY_ITEMS, ITEM_UPGRADES,
  getAllItems, shopList, craftingList,
};
