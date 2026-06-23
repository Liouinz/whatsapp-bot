// 🎲 EVENTS-MODUL – NICHT AKTIV
// Zufalls-Events & Mini-Spiele: Mystery-Box, Rubbellos, Glücksrad, Zufallsereignisse.
// Wird von index.js NICHT geladen. Baut auf ../economy.js auf. Einbau gemäß INTEGRATION.md.

'use strict';

const { EconomyManager, formatBalance } = require('../economy');

const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ====================================================================
// Zufalls-Ereignisse (für !event) – positive & negative Überraschungen
// ====================================================================
const RANDOM_EVENTS = [
  { text: '💼 Du hast auf der Straße eine Brieftasche gefunden!', delta: () => rnd(200, 1500) },
  { text: '🎰 Ein Fremder schenkt dir Casino-Chips!', delta: () => rnd(300, 2000) },
  { text: '📈 Deine Aktien sind gestiegen!', delta: () => rnd(500, 3000) },
  { text: '🏦 Steuerrückzahlung erhalten!', delta: () => rnd(400, 2500) },
  { text: '🎁 Ein Geheimnisvoller hinterlässt dir ein Geschenk.', delta: () => rnd(250, 1800) },
  { text: '🚕 Du musstest ein teures Taxi nehmen.', delta: () => -rnd(100, 800) },
  { text: '🩺 Arztrechnung bezahlt.', delta: () => -rnd(200, 1200) },
  { text: '📉 Deine Aktien sind gefallen.', delta: () => -rnd(300, 1500) },
  { text: '🍕 Du hast die ganze Truppe zum Essen eingeladen.', delta: () => -rnd(150, 900) },
  { text: '🐦 Ein Vogel hat dein Auto getroffen – Waschanlage fällig.', delta: () => -rnd(50, 400) },
];

// ====================================================================
// Glücksrad-Segmente (für !glücksrad) – Multiplikator auf den Einsatz
// ====================================================================
const WHEEL = [
  { label: '0x 💀', mult: 0 }, { label: '0.5x', mult: 0.5 }, { label: '1x', mult: 1 },
  { label: '1.5x', mult: 1.5 }, { label: '2x ✨', mult: 2 }, { label: '0x 💀', mult: 0 },
  { label: '3x 🔥', mult: 3 }, { label: '1x', mult: 1 }, { label: '5x 💎', mult: 5 },
  { label: '0.5x', mult: 0.5 }, { label: '2x ✨', mult: 2 }, { label: '10x 👑', mult: 10 },
];

// ====================================================================
// Mystery-Box-Stufen (für !box) – fester Preis, zufälliger Inhalt
// ====================================================================
const BOXES = {
  bronze: { name: '🥉 Bronze-Box', price: 1000, min: 0, max: 3000 },
  silber: { name: '🥈 Silber-Box', price: 5000, min: 1000, max: 15000 },
  gold:   { name: '🥇 Gold-Box',   price: 20000, min: 5000, max: 60000 },
  diamant:{ name: '💎 Diamant-Box', price: 100000, min: 30000, max: 300000 },
};

// ====================================================================
// EventManager
// ====================================================================
class EventManager {
  constructor(economy) {
    if (!(economy instanceof EconomyManager)) throw new Error('EventManager braucht eine EconomyManager-Instanz');
    this.eco = economy;
  }

  // ---- Zufallsereignis (Cooldown 30 Min) ----
  async randomEvent(userId) {
    const last = await this.eco.getMeta(userId, 'last_event');
    const now = Date.now();
    const CD = 30 * 60 * 1000;
    if (now - last < CD) return { ok: false, waitMs: CD - (now - last) };
    await this.eco.setMeta(userId, 'last_event', now);
    const ev = pick(RANDOM_EVENTS);
    const delta = ev.delta();
    let balance;
    if (delta >= 0) balance = await this.eco.addBalance(userId, delta);
    else balance = (await this.eco.deductBalance(userId, -delta)) ?? 0;
    return { ok: true, text: ev.text, delta, balance };
  }

  // ---- Glücksrad ----
  async wheel(userId, bet) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const seg = pick(WHEEL);
    const win = Math.floor(bet * seg.mult);
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, segment: seg.label, mult: seg.mult, win, bet, balance };
  }

  // ---- Rubbellos (fester Preis 500, gestaffelte Gewinne) ----
  async scratch(userId) {
    const PRICE = 500;
    const remaining = await this.eco.deductBalance(userId, PRICE);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    // Gewinnverteilung
    const roll = Math.random();
    let prize = 0, symbol = '❌';
    if (roll < 0.50) { prize = 0; symbol = '❌'; }
    else if (roll < 0.80) { prize = 500; symbol = '🍀'; }
    else if (roll < 0.93) { prize = 1500; symbol = '⭐'; }
    else if (roll < 0.99) { prize = 5000; symbol = '💎'; }
    else { prize = 25000; symbol = '👑'; }
    const balance = prize > 0 ? await this.eco.addBalance(userId, prize) : remaining;
    return { ok: true, prize, symbol, cost: PRICE, balance };
  }

  // ---- Mystery-Box ----
  async openBox(userId, tier) {
    const box = BOXES[tier];
    if (!box) return { ok: false, reason: `Unbekannte Box. Wähle: ${Object.keys(BOXES).join(', ')}` };
    const remaining = await this.eco.deductBalance(userId, box.price);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const content = rnd(box.min, box.max);
    const balance = await this.eco.addBalance(userId, content);
    const profit = content - box.price;
    return { ok: true, box, content, profit, balance };
  }
}

// ====================================================================
// EVENT_COMMANDS – Vorlage für index.js (siehe INTEGRATION.md)
// ====================================================================
/*

  case 'event': case 'ereignis': {
    const r = await events.randomEvent(senderJid);
    if (!r.ok) { await reply(`⏳ Nächstes Ereignis in ${fmtWait(r.waitMs)}.`); break; }
    const sign = r.delta >= 0 ? `+${formatBalance(r.delta)}` : `-${formatBalance(-r.delta)}`;
    await reply(`${r.text}\n${sign}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'glücksrad': case 'wheel': {
    const r = await events.wheel(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🎡 Das Rad zeigt: *${r.segment}*\n${r.win > 0 ? `Gewinn: ${formatBalance(r.win)}` : '💸 Nichts.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'rubbellos': case 'scratch': {
    const r = await events.scratch(senderJid);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🎫 Rubbellos: ${r.symbol}\n${r.prize > 0 ? `Gewonnen: ${formatBalance(r.prize)}` : 'Leider kein Gewinn.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'box': {
    const r = await events.openBox(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const p = r.profit >= 0 ? `Gewinn: +${formatBalance(r.profit)}` : `Verlust: ${formatBalance(r.profit)}`;
    await reply(`📦 ${r.box.name} geöffnet!\nInhalt: ${formatBalance(r.content)} (${p})\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

*/

module.exports = { EventManager, RANDOM_EVENTS, WHEEL, BOXES };
