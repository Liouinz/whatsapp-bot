// 🛒 SHOP-MODUL – NICHT AKTIV
// Gegenstände jenseits von Häusern: Autos, Haustiere, Boosts.
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
// ====================================================================
const ITEMS = [
  // --- Autos 🚗 (Prestige) ---
  { id: 'car_polo',     name: '🚗 Kleinwagen',      price: 8000,   type: 'cosmetic' },
  { id: 'car_bmw',      name: '🚙 Limousine',       price: 35000,  type: 'cosmetic' },
  { id: 'car_sport',    name: '🏎️ Sportwagen',      price: 120000, type: 'cosmetic' },
  { id: 'car_super',    name: '🏎️ Supersportler',   price: 280000, type: 'cosmetic' },
  // --- Haustiere 🐾 (kleines Tageseinkommen) ---
  { id: 'pet_cat',      name: '🐱 Katze',           price: 5000,   type: 'income', value: 100 },
  { id: 'pet_dog',      name: '🐶 Hund',            price: 9000,   type: 'income', value: 180 },
  { id: 'pet_dragon',   name: '🐉 Drache',          price: 150000, type: 'income', value: 2500 },
  // --- Boosts ⚡ ---
  { id: 'boost_xp',     name: '⚡ XP-Boost',        price: 15000,  type: 'xp_boost', value: 2 },
  { id: 'boost_luck',   name: '🍀 Glücksbringer',   price: 40000,  type: 'luck',     value: 5 },
  { id: 'boost_income', name: '💼 Geschäftslizenz', price: 60000,  type: 'income',   value: 1500 },
];

const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

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
    await this.db.execute('CREATE TABLE IF NOT EXISTS owned_items (user_id TEXT NOT NULL, item_id TEXT NOT NULL, bought_at INTEGER NOT NULL, PRIMARY KEY (user_id, item_id))');
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
    const refund = Math.floor(item.price * 0.6);
    await this.db.execute({ sql: 'DELETE FROM owned_items WHERE user_id=? AND item_id=?', args: [userId, itemId] });
    const balance = await this.eco.addBalance(userId, refund);
    return { ok: true, item, refund, balance };
  }

  // Summierte Effekte aller besessenen Items (für Casino/XP/Einkommen)
  async getEffects(userId) {
    const items = await this.getItems(userId);
    const eff = { xpMult: 1, luckBonus: 0, dailyIncome: 0 };
    for (const { def } of items) {
      if (def.type === 'xp_boost') eff.xpMult *= def.value;
      else if (def.type === 'luck') eff.luckBonus += def.value;
      else if (def.type === 'income') eff.dailyIncome += def.value;
    }
    return eff;
  }

  // Passives Tageseinkommen aus Items (Haustiere, Lizenzen) einsammeln
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
    const item = ITEMS[(seed * 7919) % ITEMS.length];
    return { ...item, salePrice: Math.floor(item.price * 0.75) };
  }
}

function shopList() {
  const groups = { '🚗 Autos': [], '🐾 Haustiere': [], '⚡ Boosts': [] };
  for (const i of ITEMS) {
    const g = i.id.startsWith('car_') ? '🚗 Autos' : i.id.startsWith('pet_') ? '🐾 Haustiere' : '⚡ Boosts';
    groups[g].push(`▸ [${i.id}] ${i.name} – ${formatBalance(i.price)}`);
  }
  return '🛒 *Shop*\n\n' + Object.entries(groups).map(([k, v]) => `*${k}*\n${v.join('\n')}`).join('\n\n');
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
    await reply('🎒 *Deine Items*\n\n' + items.map((i) => `${i.def.name} [${i.itemId}]`).join('\n'));
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

*/

module.exports = { ShopManager, ITEMS, ITEM_BY_ID, shopList };
