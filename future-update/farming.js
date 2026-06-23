'use strict';

const CROPS = [
  { id: 'weizen',       name: 'Weizen',        emoji: '🌾', seedCost: 50,    sellPrice: 180,    growMs: 30 * 60_000,   xp: 8  },
  { id: 'kartoffel',    name: 'Kartoffel',      emoji: '🥔', seedCost: 80,    sellPrice: 280,    growMs: 45 * 60_000,   xp: 14 },
  { id: 'karotte',      name: 'Karotte',        emoji: '🥕', seedCost: 130,   sellPrice: 460,    growMs: 60 * 60_000,   xp: 22 },
  { id: 'kohl',         name: 'Kohl',           emoji: '🥬', seedCost: 220,   sellPrice: 780,    growMs: 90 * 60_000,   xp: 35 },
  { id: 'tomate',       name: 'Tomate',         emoji: '🍅', seedCost: 380,   sellPrice: 1_350,  growMs: 2 * 3_600_000, xp: 55 },
  { id: 'beere',        name: 'Beere',          emoji: '🫐', seedCost: 650,   sellPrice: 2_300,  growMs: 3 * 3_600_000, xp: 85 },
  { id: 'kürbis',       name: 'Kürbis',         emoji: '🎃', seedCost: 1_100, sellPrice: 4_000,  growMs: 5 * 3_600_000, xp: 130 },
  { id: 'melone',       name: 'Melone',         emoji: '🍈', seedCost: 1_800, sellPrice: 6_500,  growMs: 8 * 3_600_000, xp: 200 },
  { id: 'zauberpflanze',name: 'Zauberpflanze',  emoji: '🌿', seedCost: 4_500, sellPrice: 18_000, growMs: 16 * 3_600_000,xp: 450 },
  { id: 'drachenfrucht',name: 'Drachenfrucht',  emoji: '🐉', seedCost: 12_000,sellPrice: 50_000, growMs: 24 * 3_600_000,xp: 1200},
];

const MAX_PLOTS = 6;
const WATER_SPEEDUP = 0.75; // watering = 25% faster (mult growMs by this)
const WATER_VALID_MS = 4 * 3_600_000; // watering valid for 4h

class FarmManager {
  constructor(economyMgr) {
    this.eco = economyMgr;
    this.db = economyMgr.db;
  }

  async init() {
    await this.db.batch([
      `CREATE TABLE IF NOT EXISTS farm_plots (
        user_id    TEXT,
        slot       INTEGER,
        crop_id    TEXT    DEFAULT NULL,
        planted_at INTEGER DEFAULT NULL,
        watered_at INTEGER DEFAULT NULL,
        PRIMARY KEY(user_id, slot)
      )`,
      `CREATE TABLE IF NOT EXISTS farm_meta (
        user_id         TEXT PRIMARY KEY,
        total_plots     INTEGER DEFAULT 2,
        farm_xp         INTEGER DEFAULT 0,
        total_harvested INTEGER DEFAULT 0
      )`,
    ]);
  }

  findCrop(id) { return CROPS.find((c) => c.id === id) || null; }

  async _getMeta(userId) {
    let r = await this.db.execute({ sql: 'SELECT * FROM farm_meta WHERE user_id = ?', args: [userId] });
    if (!r.rows.length) {
      await this.db.execute({ sql: 'INSERT OR IGNORE INTO farm_meta (user_id) VALUES (?)', args: [userId] });
      r = await this.db.execute({ sql: 'SELECT * FROM farm_meta WHERE user_id = ?', args: [userId] });
    }
    return r.rows[0];
  }

  async _getPlots(userId, totalPlots) {
    const r = await this.db.execute({ sql: 'SELECT * FROM farm_plots WHERE user_id = ? ORDER BY slot', args: [userId] });
    const slotMap = new Map(r.rows.map((p) => [p.slot, p]));
    return Array.from({ length: totalPlots }, (_, i) =>
      slotMap.get(i) || { user_id: userId, slot: i, crop_id: null, planted_at: null, watered_at: null }
    );
  }

  _growMs(crop, wateredAt) {
    const isWatered = wateredAt && (Date.now() - wateredAt < WATER_VALID_MS);
    return isWatered ? Math.floor(crop.growMs * WATER_SPEEDUP) : crop.growMs;
  }

  async getFarm(userId) {
    const meta  = await this._getMeta(userId);
    const plots = await this._getPlots(userId, meta.total_plots);
    const now   = Date.now();
    const farmLevel = Math.floor((meta.farm_xp || 0) / 500) + 1;

    const plotsInfo = plots.map((p) => {
      const crop = p.crop_id ? this.findCrop(p.crop_id) : null;
      if (!crop || !p.planted_at) {
        return { slot: p.slot, crop: null, status: 'leer', progress: 0, readyIn: null };
      }
      const totalMs  = this._growMs(crop, p.watered_at);
      const elapsed  = now - p.planted_at;
      const progress = Math.min(100, Math.round((elapsed / totalMs) * 100));
      const readyIn  = Math.max(0, p.planted_at + totalMs - now);
      return {
        slot: p.slot,
        crop,
        status: progress >= 100 ? 'bereit' : 'wächst',
        progress,
        readyIn,
        watered: Boolean(p.watered_at && (now - p.watered_at < WATER_VALID_MS)),
      };
    });

    return { meta: { ...meta, farmLevel }, plots: plotsInfo };
  }

  async plant(userId, slot, cropId) {
    const meta = await this._getMeta(userId);
    if (slot < 0 || slot >= meta.total_plots) {
      return { ok: false, reason: `Ungültiger Slot. Du hast Felder 0 bis ${meta.total_plots - 1}.` };
    }
    const crop = this.findCrop(cropId);
    if (!crop) return { ok: false, reason: `Pflanze "${cropId}" unbekannt. Nutze !farmshop für die Liste.` };

    const existing = await this.db.execute({ sql: 'SELECT crop_id FROM farm_plots WHERE user_id=? AND slot=?', args: [userId, slot] });
    if (existing.rows.length && existing.rows[0].crop_id) {
      return { ok: false, reason: `Slot ${slot} ist belegt. Ernte mit !farmernte zuerst.` };
    }

    const bal = await this.eco.getBalance(userId);
    if (bal < crop.seedCost) return { ok: false, reason: `Nicht genug Coins. Samen kostet ${crop.seedCost}.` };

    await this.eco.deductBalance(userId, crop.seedCost);
    await this.db.execute({
      sql: 'INSERT OR REPLACE INTO farm_plots (user_id,slot,crop_id,planted_at,watered_at) VALUES (?,?,?,?,NULL)',
      args: [userId, slot, cropId, Date.now()],
    });
    return { ok: true, crop, slot };
  }

  async water(userId) {
    const meta  = await this._getMeta(userId);
    const plots = await this._getPlots(userId, meta.total_plots);
    const growing = plots.filter((p) => p.crop_id && p.planted_at);
    if (!growing.length) return { ok: false, reason: 'Keine bepflanzten Felder zum Gießen.' };

    const now = Date.now();
    for (const p of growing) {
      await this.db.execute({ sql: 'UPDATE farm_plots SET watered_at=? WHERE user_id=? AND slot=?', args: [now, userId, p.slot] });
    }
    return { ok: true, count: growing.length };
  }

  async harvest(userId) {
    const meta  = await this._getMeta(userId);
    const plots = await this._getPlots(userId, meta.total_plots);
    const now   = Date.now();

    let totalEarned = 0, totalXp = 0;
    const harvested = [];

    for (const p of plots) {
      if (!p.crop_id || !p.planted_at) continue;
      const crop    = this.findCrop(p.crop_id);
      if (!crop) continue;
      const totalMs = this._growMs(crop, p.watered_at);
      if (now - p.planted_at < totalMs) continue;

      await this.eco.addBalance(userId, crop.sellPrice);
      await this.eco.addXp(userId, crop.xp);
      await this.db.execute({
        sql: 'UPDATE farm_plots SET crop_id=NULL, planted_at=NULL, watered_at=NULL WHERE user_id=? AND slot=?',
        args: [userId, p.slot],
      });
      totalEarned += crop.sellPrice;
      totalXp     += crop.xp;
      harvested.push({ crop, slot: p.slot });
    }

    if (!harvested.length) return { ok: false, reason: 'Keine Ernte bereit. Status: !farm' };

    const newXp  = (meta.farm_xp || 0) + totalXp;
    const newHar = (meta.total_harvested || 0) + harvested.length;
    await this.db.execute({
      sql: 'UPDATE farm_meta SET farm_xp=?, total_harvested=? WHERE user_id=?',
      args: [newXp, newHar, userId],
    });

    return { ok: true, harvested, totalEarned, totalXp, count: harvested.length };
  }

  async buyPlot(userId) {
    const meta = await this._getMeta(userId);
    if ((meta.total_plots || 2) >= MAX_PLOTS) return { ok: false, reason: `Maximale Felder (${MAX_PLOTS}) bereits erreicht.` };
    const cost = meta.total_plots * 8_000;
    const bal  = await this.eco.getBalance(userId);
    if (bal < cost) return { ok: false, reason: `Neues Feld kostet ${cost} Coins.` };
    await this.eco.deductBalance(userId, cost);
    await this.db.execute({ sql: 'UPDATE farm_meta SET total_plots = total_plots + 1 WHERE user_id = ?', args: [userId] });
    return { ok: true, newTotal: (meta.total_plots || 2) + 1, cost };
  }

  getCropList() { return CROPS; }
}

module.exports = { FarmManager, CROPS, MAX_PLOTS };
