// 🎮 SPIELE-MODUL – NICHT AKTIV
// Wird von index.js NICHT geladen. Baut auf ../economy.js auf (Coins & Häuser).
// Einbau später gemäß INTEGRATION.md. Alle Spiele laufen nur in der Spiel-Gruppe
// (GAME_GROUP_JID), die der Inhaber festlegt.

'use strict';

const { EconomyManager, HOUSES, TIER_LABELS, formatBalance } = require('../economy');

// ====================================================================
// Hilfen
// ====================================================================
function fmtWait(ms) {
  const m = Math.ceil(ms / 60000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}min`;
  return `${m} Min`;
}
const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ====================================================================
// GameManager – nutzt EconomyManager für alle Geldbewegungen
// ====================================================================
class GameManager {
  constructor(economy) {
    if (!(economy instanceof EconomyManager)) throw new Error('GameManager braucht eine EconomyManager-Instanz');
    this.eco = economy;
  }

  // ---- Slots 🎰 ----
  async slots(userId, bet) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
    const reel = [pick(symbols), pick(symbols), pick(symbols)];
    let mult = 0;
    if (reel[0] === reel[1] && reel[1] === reel[2]) {
      mult = reel[0] === '7️⃣' ? 20 : reel[0] === '💎' ? 12 : 6; // Jackpot
    } else if (reel[0] === reel[1] || reel[1] === reel[2] || reel[0] === reel[2]) {
      mult = 1.5; // zwei gleiche
    }
    const win = Math.floor(bet * mult);
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, reel, bet, win, mult, balance };
  }

  // ---- Coinflip 🪙 ----
  async coinflip(userId, bet, choice) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    if (!['kopf', 'zahl'].includes(choice)) return { ok: false, reason: 'Wähle kopf oder zahl.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const result = Math.random() < 0.5 ? 'kopf' : 'zahl';
    const won = result === choice;
    const balance = won ? await this.eco.addBalance(userId, bet * 2) : remaining;
    return { ok: true, result, won, bet, balance };
  }

  // ---- Würfelwette 🎲 (gegen den Bot, höhere Augenzahl gewinnt) ----
  async diceBet(userId, bet) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const you = rnd(1, 6);
    const bot = rnd(1, 6);
    let balance = remaining;
    let outcome = 'verloren';
    if (you > bot) { balance = await this.eco.addBalance(userId, bet * 2); outcome = 'gewonnen'; }
    else if (you === bot) { balance = await this.eco.addBalance(userId, bet); outcome = 'unentschieden'; }
    return { ok: true, you, bot, outcome, bet, balance };
  }

  // ---- Rauben 🦹 (riskant: Person mit Coins beklauen) ----
  async rob(userId, targetId) {
    const last = await this.eco.getMeta(userId, 'last_rob');
    const now = Date.now();
    const COOLDOWN = 60 * 60 * 1000;
    if (now - last < COOLDOWN) return { ok: false, reason: `Zu früh. Warte noch ${fmtWait(COOLDOWN - (now - last))}.` };
    const targetBal = await this.eco.getBalance(targetId);
    if (targetBal < 200) return { ok: false, reason: 'Das Ziel hat zu wenig Coins zum Rauben.' };
    await this.eco.setMeta(userId, 'last_rob', now);
    const success = Math.random() < 0.5;
    if (success) {
      const stolen = Math.floor(targetBal * (0.1 + Math.random() * 0.2)); // 10–30 %
      await this.eco.deductBalance(targetId, stolen);
      const balance = await this.eco.addBalance(userId, stolen);
      return { ok: true, success: true, stolen, balance };
    }
    // Erwischt: Strafe
    const fine = Math.min(await this.eco.getBalance(userId), rnd(100, 500));
    const balance = await this.eco.deductBalance(userId, fine) ?? 0;
    return { ok: true, success: false, fine, balance };
  }

  // ---- Tagesangebot der Häuser (3 Stück, -20 %) ----
  dailyOffers() {
    return this.eco.getDailyOffer();
  }
}

// ====================================================================
// GAME_COMMANDS – Vorlage für den switch-Block in index.js
// Aktiv nur, wenn jid === GAME_GROUP_JID. Siehe INTEGRATION.md.
// ====================================================================
/*

  case 'daily': {
    const r = await economy.claimDaily(senderJid);
    if (!r.ok) { await reply(`⏳ Schon abgeholt. Komm in ${fmtWait(r.waitMs)} wieder.`); break; }
    await reply(`🎁 Tagesbonus: *${formatBalance(r.reward)}* (Streak: ${r.streak} 🔥)\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'arbeiten': case 'work': {
    const r = await economy.work(senderJid);
    if (!r.ok) { await reply(`😴 Du bist müde. Arbeite wieder in ${fmtWait(r.waitMs)}.`); break; }
    await reply(`💼 ${r.text} und +${formatBalance(r.earned)} verdient!\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'miete': {
    const r = await economy.collectRent(senderJid);
    if (!r.ok) { await reply(r.reason || `⏳ Miete gibt's wieder in ${fmtWait(r.waitMs)}.`); break; }
    await reply(`🏠 Mieteinnahmen aus ${r.houses} Häusern: *${formatBalance(r.rent)}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'pay': case 'überweisen': {
    const target = getTargetJid(msg);
    const amount = Number(args.find((a) => /^\d+$/.test(a)));
    if (!target || !amount) { await reply(`Nutzung: ${COMMAND_PREFIX}pay @person <Betrag>`); break; }
    const r = await economy.pay(senderJid, target, amount);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await sock.sendMessage(jid, { text: `💸 Du hast @${target.split('@')[0]} ${formatBalance(r.amount)} überwiesen.`, mentions: [target] }, { quoted: msg });
    break;
  }
  case 'slots': {
    const r = await game.slots(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const line = r.reel.join(' | ');
    await reply(`🎰 [ ${line} ]\n${r.win > 0 ? `🎉 Gewinn: ${formatBalance(r.win)} (x${r.mult})` : '💸 Leider verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'coinflip': case 'cf': {
    const r = await game.coinflip(senderJid, Number(args[1]) || 0, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🪙 ${r.result.toUpperCase()}! Du hast ${r.won ? 'gewonnen 🎉' : 'verloren 💸'}.\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'würfelwette': case 'dicebet': {
    const r = await game.diceBet(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🎲 Du: ${r.you} – Bot: ${r.bot} → *${r.outcome}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'rauben': case 'rob': {
    const target = getTargetJid(msg);
    if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}rauben @person`); break; }
    const r = await game.rob(senderJid, target);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    if (r.success) await sock.sendMessage(jid, { text: `🦹 Erfolg! Du hast @${target.split('@')[0]} ${formatBalance(r.stolen)} geklaut.`, mentions: [target] });
    else await reply(`🚔 Erwischt! Strafe: ${formatBalance(r.fine)}.`);
    break;
  }

*/

module.exports = { GameManager, fmtWait };
