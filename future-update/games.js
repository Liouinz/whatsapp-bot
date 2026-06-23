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

  // ---- Roulette 🎡 (Farbe rot/schwarz oder Zahl 0–36) ----
  async roulette(userId, bet, choice) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    choice = String(choice).toLowerCase();
    const isColor = choice === 'rot' || choice === 'schwarz';
    const num = /^\d+$/.test(choice) ? Number(choice) : null;
    if (!isColor && (num === null || num > 36)) return { ok: false, reason: 'Wähle rot, schwarz oder eine Zahl 0–36.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const result = rnd(0, 36);
    // 0 = grün; klassische rote Zahlen
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const color = result === 0 ? 'grün' : reds.has(result) ? 'rot' : 'schwarz';
    let win = 0;
    if (isColor && color === choice) win = bet * 2;
    else if (num !== null && num === result) win = bet * 36; // volle Zahl
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, result, color, win, bet, balance };
  }

  // ---- Higher-Lower 🔼🔽 (nächste Zahl höher oder tiefer?) ----
  async higherLower(userId, bet, guess) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    guess = String(guess).toLowerCase();
    if (!['höher', 'hoeher', 'tiefer'].includes(guess)) return { ok: false, reason: 'Wähle höher oder tiefer.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const first = rnd(1, 100);
    const second = rnd(1, 100);
    const higher = second > first;
    const won = (guess === 'tiefer') ? !higher : higher;
    const balance = won ? await this.eco.addBalance(userId, Math.floor(bet * 1.9)) : remaining;
    return { ok: true, first, second, won, bet, balance };
  }

  // ---- Blackjack-lite 🃏 (eine Runde gegen den Dealer) ----
  async blackjack(userId, bet) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const draw = () => rnd(2, 11);
    let you = draw() + draw();
    let dealer = draw() + draw();
    // Spieler zieht bis 17, Dealer bis 16 (vereinfacht/automatisch)
    while (you < 17) you += draw();
    while (dealer < 16) dealer += draw();
    let outcome, win = 0;
    if (you > 21) outcome = 'überkauft – verloren';
    else if (dealer > 21 || you > dealer) { outcome = 'gewonnen'; win = bet * 2; }
    else if (you === dealer) { outcome = 'unentschieden'; win = bet; }
    else outcome = 'verloren';
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, you, dealer, outcome, win, bet, balance };
  }

  // ---- Dice-Duell PvP 🎲⚔️ (zwei Spieler, beide setzen gleich viel) ----
  // Ablauf wird über offene Herausforderungen (Map) in index.js gesteuert; hier die Abrechnung.
  async settleDuel(challengerId, opponentId, bet) {
    bet = Math.floor(bet);
    const a = await this.eco.deductBalance(challengerId, bet);
    if (a === null) return { ok: false, reason: 'Herausforderer hat nicht genug Coins.' };
    const b = await this.eco.deductBalance(opponentId, bet);
    if (b === null) { await this.eco.addBalance(challengerId, bet); return { ok: false, reason: 'Gegner hat nicht genug Coins.' }; }
    const rollA = rnd(1, 6) + rnd(1, 6);
    const rollB = rnd(1, 6) + rnd(1, 6);
    let winner = null;
    if (rollA > rollB) { winner = challengerId; await this.eco.addBalance(challengerId, bet * 2); }
    else if (rollB > rollA) { winner = opponentId; await this.eco.addBalance(opponentId, bet * 2); }
    else { await this.eco.addBalance(challengerId, bet); await this.eco.addBalance(opponentId, bet); }
    return { ok: true, rollA, rollB, winner, bet };
  }

  // ---- Tagesangebot der Häuser (3 Stück, -20 %) ----
  dailyOffers() {
    return this.eco.getDailyOffer();
  }
}

// ====================================================================
// GameGate – Inhaber schaltet Spiele pro Gruppe frei (config.gameGroups)
// ====================================================================
function isGameGroup(config, jid) {
  return Boolean(config.gameGroups && config.gameGroups[jid]);
}
function setGameGroup(config, jid, enable) {
  if (!config.gameGroups) config.gameGroups = {};
  if (enable) config.gameGroups[jid] = true;
  else delete config.gameGroups[jid];
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
  case 'roulette': {
    const r = await game.roulette(senderJid, Number(args[1]) || 0, args[0]);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🎡 Kugel: *${r.result}* (${r.color})\n${r.win > 0 ? `🎉 Gewinn: ${formatBalance(r.win)}` : '💸 Verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'hl': case 'higherlower': {
    const r = await game.higherLower(senderJid, Number(args[1]) || 0, args[0]);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🔼🔽 Erste: ${r.first} → Zweite: ${r.second}\n${r.won ? '🎉 Richtig!' : '💸 Daneben.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'bj': case 'blackjack': {
    const r = await game.blackjack(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🃏 Du: ${r.you} – Dealer: ${r.dealer} → *${r.outcome}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Dice-Duell PvP: Herausforderung mit offener Annahme ----
  // Benötigt oben in index.js: const duels = new Map(); // key = `${jid}:${opponentNum}`
  case 'duell': {
    const target = getTargetJid(msg);
    const bet = Number(args.find((a) => /^\d+$/.test(a)));
    if (!target || !bet) { await reply(`Nutzung: ${COMMAND_PREFIX}duell @person <Einsatz>`); break; }
    duels.set(`${jid}:${target.split('@')[0]}`, { challenger: senderJid, bet, at: Date.now() });
    await sock.sendMessage(jid, { text: `🎲⚔️ @${senderJid.split('@')[0]} fordert @${target.split('@')[0]} zum Würfelduell um ${formatBalance(bet)} heraus!\nAntworte mit ${COMMAND_PREFIX}annehmen (60s).`, mentions: [senderJid, target] });
    break;
  }
  case 'annehmen': {
    const d = duels.get(`${jid}:${senderNum}`);
    if (!d || Date.now() - d.at > 60000) { await reply('Keine offene Herausforderung.'); break; }
    duels.delete(`${jid}:${senderNum}`);
    const r = await game.settleDuel(d.challenger, senderJid, d.bet);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const txt = r.winner ? `🏆 Gewinner: @${r.winner.split('@')[0]}` : '🤝 Unentschieden – Einsätze zurück.';
    await sock.sendMessage(jid, { text: `🎲 ${d.challenger.split('@')[0]}: ${r.rollA} vs ${senderNum}: ${r.rollB}\n${txt}`, mentions: [d.challenger, senderJid] });
    break;
  }

  // ---- Inhaber: Spiele in dieser Gruppe an/aus ----
  case 'spielgruppe': {
    if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Community-Inhaber.'); break; }
    const onoff = (args[0] || '').toLowerCase();
    if (onoff !== 'an' && onoff !== 'aus') { await reply(`Nutzung: ${COMMAND_PREFIX}spielgruppe an|aus`); break; }
    setGameGroup(config, jid, onoff === 'an');
    await persist();
    await reply(onoff === 'an' ? '🎮 Spiele & Wirtschaft sind in dieser Gruppe jetzt AKTIV.' : '🚫 Spiele & Wirtschaft hier deaktiviert.');
    break;
  }

  // HINWEIS: Spiel-/Wirtschaftsbefehle nur ausführen, wenn isGameGroup(config, jid) true ist
  // (siehe INTEGRATION.md – eine zentrale Sperre vor allen ECO/GAME-Cases).

*/

module.exports = { GameManager, fmtWait, isGameGroup, setGameGroup };
