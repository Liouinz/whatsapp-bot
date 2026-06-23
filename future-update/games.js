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
// Kartendeck – für Poker & Blackjack
// ====================================================================
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, value: RANKS.indexOf(rank) + 2 });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardStr(c) { return `${c.rank}${c.suit}`; }
function handStr(hand) { return hand.map(cardStr).join(' '); }

// Blackjack-Handwert (Ass = 11 oder 1)
function bjValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else total += Math.min(10, c.value);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// Poker-Handbewertung (5 Karten)
function pokerRank(hand) {
  const counts = {};
  const suitCounts = {};
  for (const c of hand) {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }
  const vals = Object.values(counts).sort((a, b) => b - a);
  const sorted = hand.map((c) => c.value).sort((a, b) => a - b);
  const isFlush = Object.values(suitCounts).some((v) => v === 5);
  const isStraight = sorted[4] - sorted[0] === 4 && new Set(sorted).size === 5;
  const hasAceLow = sorted[4] === 14 && sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5;

  if ((isFlush && isStraight) || (isFlush && hasAceLow)) {
    if (sorted[0] === 10 || (hasAceLow === false && sorted[0] === 10)) return { tier: 9, name: '🌈 Royal Flush', mult: 250 };
    return { tier: 8, name: '🔥 Straight Flush', mult: 100 };
  }
  if (vals[0] === 4) return { tier: 7, name: '4️⃣ Vierling', mult: 40 };
  if (vals[0] === 3 && vals[1] === 2) return { tier: 6, name: '🏠 Full House', mult: 12 };
  if (isFlush) return { tier: 5, name: '♠️ Flush', mult: 7 };
  if (isStraight || hasAceLow) return { tier: 4, name: '➡️ Straße', mult: 5 };
  if (vals[0] === 3) return { tier: 3, name: '3️⃣ Drilling', mult: 3 };
  if (vals[0] === 2 && vals[1] === 2) return { tier: 2, name: '2️⃣ Zwei Paare', mult: 2 };
  if (vals[0] === 2) return { tier: 1, name: '1️⃣ Ein Paar', mult: 1.5 };
  return { tier: 0, name: '❌ High Card', mult: 0 };
}

// ====================================================================
// Pferderennen – 6 Pferde mit unterschiedlichen Chancen
// ====================================================================
const HORSES = [
  { id: 1, name: '🐎 Blitz',       emoji: '⚡', weight: 30 },
  { id: 2, name: '🐎 Sturmwind',   emoji: '🌪️', weight: 22 },
  { id: 3, name: '🐎 Donner',      emoji: '⛈️', weight: 18 },
  { id: 4, name: '🐎 Sonnenkind',  emoji: '☀️', weight: 14 },
  { id: 5, name: '🐎 Mondschein',  emoji: '🌙', weight: 10 },
  { id: 6, name: '🐎 Komet',       emoji: '☄️', weight:  6 },
];
// Gewinnquote = 100 / weight (gerundet)
function horseOdds(h) { return +(100 / h.weight).toFixed(1); }
function pickWeighted(horses) {
  const total = horses.reduce((s, h) => s + h.weight, 0);
  let r = Math.random() * total;
  for (const h of horses) { r -= h.weight; if (r <= 0) return h; }
  return horses[horses.length - 1];
}

// ====================================================================
// Keno-Gewinntabelle (Spieler wählt 5 aus 20, Ziehung: 10 Zahlen)
// ====================================================================
const KENO_PAYOUTS = [0, 0, 1, 3, 8, 25]; // 0–5 Treffer → Multiplikator auf Einsatz

// ====================================================================
// Crash-Multiplikator-Generator (haus-biased, festes Seed-XOR)
// ====================================================================
function genCrashPoint() {
  // 10 % Sofort-Crash (1.0x), sonst 1.0 bis 50x (exponential-verteilt)
  if (Math.random() < 0.10) return 1.0;
  const r = Math.random();
  return Math.max(1.0, +(1 / (1 - r) * 0.65).toFixed(2));
}

// ====================================================================
// Mines-Lite (3x3-Grid, Spieler sucht Schatz, eine Mine)
// ====================================================================
const MINE_GRID = 9;
const MINE_PAYOUTS_BY_MINES = {
  1: [0, 1.08, 1.17, 1.27, 1.38, 1.50, 1.63, 1.77, 1.92],
  2: [0, 1.08, 1.19, 1.31, 1.46, 1.63, 1.83, 2.08, 2.42],
  3: [0, 1.07, 1.20, 1.36, 1.57, 1.83, 2.20, 2.78, 3.75],
};

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
      mult = reel[0] === '7️⃣' ? 20 : reel[0] === '💎' ? 12 : 6;
    } else if (reel[0] === reel[1] || reel[1] === reel[2] || reel[0] === reel[2]) {
      mult = 1.5;
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
      const stolen = Math.floor(targetBal * (0.1 + Math.random() * 0.2));
      await this.eco.deductBalance(targetId, stolen);
      const balance = await this.eco.addBalance(userId, stolen);
      return { ok: true, success: true, stolen, balance };
    }
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
    const isDozen = choice === '1d' || choice === '2d' || choice === '3d';
    const num = /^\d+$/.test(choice) ? Number(choice) : null;
    if (!isColor && !isDozen && (num === null || num > 36)) {
      return { ok: false, reason: 'Wähle rot, schwarz, 1d/2d/3d (Dutzend) oder eine Zahl 0–36.' };
    }
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const result = rnd(0, 36);
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const color = result === 0 ? 'grün' : reds.has(result) ? 'rot' : 'schwarz';
    let win = 0;
    if (isColor && color === choice) win = bet * 2;
    else if (isDozen) {
      const d = choice === '1d' ? 1 : choice === '2d' ? 2 : 3;
      if (result >= (d - 1) * 12 + 1 && result <= d * 12) win = bet * 3;
    } else if (num !== null && num === result) win = bet * 36;
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

  // ---- Blackjack 🃏 (volle Version mit echtem Deck & Ass-Logik) ----
  async blackjack(userId, bet) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const deck = shuffleDeck(makeDeck());
    let playerHand = [deck.pop(), deck.pop()];
    let dealerHand = [deck.pop(), deck.pop()];
    // Spieler zieht bis er ≥17 ist (vereinfachte Auto-Logik)
    while (bjValue(playerHand) < 17) playerHand.push(deck.pop());
    while (bjValue(dealerHand) < 17) dealerHand.push(deck.pop());
    const pv = bjValue(playerHand);
    const dv = bjValue(dealerHand);
    let outcome, win = 0;
    if (pv === 21 && playerHand.length === 2) { outcome = 'Blackjack! 🎊'; win = Math.floor(bet * 2.5); }
    else if (pv > 21) { outcome = 'Bust – verloren 💸'; }
    else if (dv > 21) { outcome = 'Dealer bust – du gewinnst! 🎉'; win = bet * 2; }
    else if (pv > dv) { outcome = 'Gewonnen! 🎉'; win = bet * 2; }
    else if (pv === dv) { outcome = 'Push – Einsatz zurück 🤝'; win = bet; }
    else { outcome = 'Verloren 💸'; }
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, playerHand: handStr(playerHand), dealerHand: handStr(dealerHand), pv, dv, outcome, win, bet, balance };
  }

  // ---- Poker-Lite 🃏 (5-Card Draw gegen Bot) ----
  async poker(userId, bet) {
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    if (bet > 50000) return { ok: false, reason: 'Max. Einsatz: 50.000 Coins.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const deck = shuffleDeck(makeDeck());
    const playerHand = deck.splice(0, 5);
    const botHand = deck.splice(0, 5);
    const playerRank = pokerRank(playerHand);
    const botRank = pokerRank(botHand);
    let win = 0, outcome;
    if (playerRank.tier > botRank.tier) {
      win = Math.floor(bet * Math.max(2, playerRank.mult));
      outcome = `Du gewinnst mit *${playerRank.name}*! 🎉`;
    } else if (playerRank.tier < botRank.tier) {
      outcome = `Bot gewinnt mit *${botRank.name}*. 💸`;
    } else {
      // gleiches Tier – höchste Karte entscheidet
      const pMax = Math.max(...playerHand.map((c) => c.value));
      const bMax = Math.max(...botHand.map((c) => c.value));
      if (pMax > bMax) { win = bet * 2; outcome = 'Du gewinnst! (High Card) 🎉'; }
      else if (pMax < bMax) { outcome = 'Bot gewinnt! (High Card) 💸'; }
      else { win = bet; outcome = 'Unentschieden 🤝'; }
    }
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return {
      ok: true,
      playerHand: handStr(playerHand), playerRank: playerRank.name,
      botHand: handStr(botHand), botRank: botRank.name,
      outcome, win, bet, balance,
    };
  }

  // ---- Crash 💥 (steigender Multiplikator, auto-cashout) ----
  async crash(userId, bet, cashoutAt) {
    bet = Math.floor(bet);
    cashoutAt = Math.max(1.01, Number(cashoutAt) || 2.0);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    if (cashoutAt > 1000) return { ok: false, reason: 'Cashout-Ziel max. 1000x.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const crashAt = genCrashPoint();
    if (crashAt < cashoutAt) {
      return { ok: true, crashAt, cashoutAt, won: false, balance: remaining, bet };
    }
    const win = Math.floor(bet * cashoutAt);
    const balance = await this.eco.addBalance(userId, win);
    return { ok: true, crashAt, cashoutAt, won: true, win, bet, balance };
  }

  // ---- Keno 🎯 (5 Zahlen aus 1–20 wählen) ----
  async keno(userId, bet, chosen) {
    // chosen = Array von 5 Zahlen
    bet = Math.floor(bet);
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    if (!Array.isArray(chosen) || chosen.length !== 5) return { ok: false, reason: 'Wähle genau 5 Zahlen (1–20).' };
    const nums = chosen.map(Number);
    if (nums.some((n) => n < 1 || n > 20 || !Number.isInteger(n))) return { ok: false, reason: 'Zahlen müssen 1–20 sein.' };
    if (new Set(nums).size !== 5) return { ok: false, reason: 'Keine Duplikate erlaubt.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    // Ziehung: 10 aus 20
    const pool = Array.from({ length: 20 }, (_, i) => i + 1);
    const drawn = shuffleDeck(pool).slice(0, 10);
    const hits = nums.filter((n) => drawn.includes(n));
    const mult = KENO_PAYOUTS[hits.length] || 0;
    const win = Math.floor(bet * mult);
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, chosen: nums, drawn: drawn.sort((a, b) => a - b), hits: hits.length, mult, win, bet, balance };
  }

  // ---- Baccarat 🎴 (Spieler vs. Bank, nearest-9) ----
  async baccarat(userId, bet, side) {
    bet = Math.floor(bet);
    side = String(side || '').toLowerCase();
    if (!['spieler', 'bank', 'tie'].includes(side)) return { ok: false, reason: 'Wähle spieler, bank oder tie.' };
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const deck = shuffleDeck(makeDeck());
    const bacVal = (hand) => hand.reduce((s, c) => (s + Math.min(10, c.value)) % 10, 0);
    let player = [deck.pop(), deck.pop()];
    let banker = [deck.pop(), deck.pop()];
    const pv = bacVal(player);
    const bv = bacVal(banker);
    // Naturals
    if (pv < 8 && bv < 8) {
      if (pv <= 5) { player.push(deck.pop()); }
      const pv2 = bacVal(player);
      const thirdVal = player.length === 3 ? (Math.min(10, player[2].value) % 10) : null;
      // Bank draw rule (simplified)
      if (bv <= 2) banker.push(deck.pop());
      else if (bv === 3 && (thirdVal === null || thirdVal !== 8)) banker.push(deck.pop());
      else if (bv === 4 && thirdVal !== null && [2,3,4,5,6,7].includes(thirdVal)) banker.push(deck.pop());
      else if (bv === 5 && thirdVal !== null && [4,5,6,7].includes(thirdVal)) banker.push(deck.pop());
      else if (bv === 6 && thirdVal !== null && [6,7].includes(thirdVal)) banker.push(deck.pop());
    }
    const finalP = bacVal(player);
    const finalB = bacVal(banker);
    const winner = finalP > finalB ? 'spieler' : finalB > finalP ? 'bank' : 'tie';
    let win = 0;
    if (side === winner) {
      if (side === 'tie') win = bet * 8;
      else if (side === 'bank') win = Math.floor(bet * 1.95); // 5% Kommission
      else win = bet * 2;
    }
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return {
      ok: true,
      playerHand: handStr(player), playerValue: finalP,
      bankerHand: handStr(banker), bankerValue: finalB,
      winner, side, win, bet, balance,
    };
  }

  // ---- Pferderennen 🐎 (bet auf ein Pferd) ----
  async horseRace(userId, bet, horseId) {
    bet = Math.floor(bet);
    horseId = Number(horseId);
    const horse = HORSES.find((h) => h.id === horseId);
    if (!horse) return { ok: false, reason: `Ungültige Pferd-ID. Wähle 1–${HORSES.length}.` };
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const winner = pickWeighted(HORSES);
    const won = winner.id === horse.id;
    const odds = horseOdds(horse);
    const win = won ? Math.floor(bet * odds) : 0;
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    // Simuliere Rennen als Textausgabe (Positionen)
    const finish = [...HORSES].sort(() => Math.random() - 0.5);
    const finishStr = finish.map((h, i) => `${i + 1}. ${h.name}`).join('\n');
    return { ok: true, horse, winner, won, odds, win, bet, balance, finishStr };
  }

  // ---- Mines-Lite 💣 (3x3, versteckte Mine) ----
  async mines(userId, bet, mineCount, revealCell) {
    bet = Math.floor(bet);
    mineCount = Math.max(1, Math.min(3, Number(mineCount) || 1));
    revealCell = Math.max(1, Math.min(MINE_GRID, Number(revealCell) || 1)) - 1; // 0-indexed
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    // Platziere Minen zufällig
    const minePositions = new Set();
    while (minePositions.size < mineCount) minePositions.add(Math.floor(Math.random() * MINE_GRID));
    if (minePositions.has(revealCell)) {
      return { ok: true, hit: true, minePositions: [...minePositions], bet, balance: remaining };
    }
    // Sicher – Multiplikator aus Tabelle (wie viele sichere Felder wurden aufgedeckt = 1)
    const payTable = MINE_PAYOUTS_BY_MINES[mineCount] || MINE_PAYOUTS_BY_MINES[1];
    const mult = payTable[1]; // genau 1 Feld aufgedeckt
    const win = Math.floor(bet * mult);
    const balance = await this.eco.addBalance(userId, win);
    return { ok: true, hit: false, minePositions: [...minePositions], mult, win, bet, balance };
  }

  // ---- Dice-Tower 🎲🗼 (N Würfel werfen, Summe bestimmt Preis) ----
  async diceTower(userId, bet, diceCount) {
    bet = Math.floor(bet);
    diceCount = Math.max(2, Math.min(6, Number(diceCount) || 2));
    if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
    const remaining = await this.eco.deductBalance(userId, bet);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    const rolls = Array.from({ length: diceCount }, () => rnd(1, 6));
    const total = rolls.reduce((s, r) => s + r, 0);
    const max = diceCount * 6;
    const min = diceCount;
    const pct = (total - min) / (max - min);
    let mult = 0;
    if (pct >= 0.95) mult = 10;
    else if (pct >= 0.85) mult = 5;
    else if (pct >= 0.75) mult = 3;
    else if (pct >= 0.60) mult = 2;
    else if (pct >= 0.45) mult = 1.5;
    const win = Math.floor(bet * mult);
    const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
    return { ok: true, rolls, total, max, mult, win, bet, balance };
  }

  // ---- Dice-Duell PvP 🎲⚔️ (zwei Spieler, beide setzen gleich viel) ----
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
// Aktiv nur, wenn isGameGroup(config, jid) true ist. Siehe INTEGRATION.md.
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
    // Nutzung: !roulette rot 500  oder  !roulette 17 500  oder  !roulette 1d 500
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
    await reply(`🃏 Deine Hand: ${r.playerHand} (${r.pv})\nDealer: ${r.dealerHand} (${r.dv})\n*${r.outcome}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Poker ----
  case 'poker': {
    const r = await game.poker(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🃏 *Poker* (Einsatz: ${formatBalance(r.bet)})\n\nDeine Hand: ${r.playerHand}\n_${r.playerRank}_\n\nBot-Hand: ${r.botHand}\n_${r.botRank}_\n\n${r.outcome}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Crash ----
  case 'crash': {
    // !crash <Einsatz> <Cashout-Ziel>  z. B.: !crash 500 2.5
    const bet = Number(args[0]) || 0;
    const co = Number(args[1]) || 2.0;
    const r = await game.crash(senderJid, bet, co);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const txt = r.won
      ? `🚀 Cashout bei ${r.cashoutAt}x! Gewinn: ${formatBalance(r.win)}\n(Crash wäre bei ${r.crashAt}x gewesen)`
      : `💥 CRASH bei ${r.crashAt}x – Cashout-Ziel ${r.cashoutAt}x nicht erreicht.`;
    await reply(`${txt}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Keno ----
  case 'keno': {
    // !keno <Einsatz> <z1> <z2> <z3> <z4> <z5>
    const bet = Number(args[0]) || 0;
    const chosen = args.slice(1, 6).map(Number);
    const r = await game.keno(senderJid, bet, chosen);
    if (!r.ok) { await reply(`❌ ${r.reason}\nNutzung: ${COMMAND_PREFIX}keno <Einsatz> <5 Zahlen 1–20>`); break; }
    const markedDraw = r.drawn.map((n) => r.chosen.includes(n) ? `*${n}*` : `${n}`).join(' ');
    const txt = r.win > 0 ? `🎉 ${r.hits} Treffer (x${r.mult}) → Gewinn: ${formatBalance(r.win)}` : `💸 ${r.hits} Treffer – kein Gewinn.`;
    await reply(`🎯 *Keno*\nDeine Zahlen: ${r.chosen.join(' ')}\nZiehung: ${markedDraw}\n${txt}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Baccarat ----
  case 'baccarat': case 'bac': {
    // !baccarat spieler 500
    const r = await game.baccarat(senderJid, Number(args[1]) || 0, args[0]);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const txt = r.win > 0 ? `🎉 Gewinn: ${formatBalance(r.win)}` : '💸 Verloren.';
    await reply(`🎴 *Baccarat*\nSpieler: ${r.playerHand} (${r.playerValue})\nBank: ${r.bankerHand} (${r.bankerValue})\nGewinner: *${r.winner}*\n${txt}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Pferderennen ----
  case 'rennen': case 'pferd': {
    // !rennen <Pferd-Nr 1-6> <Einsatz>
    // Zeige zuerst die Pferde: !rennen info
    if ((args[0] || '').toLowerCase() === 'info') {
      const lines = HORSES.map((h) => `${h.id}. ${h.name} ${h.emoji} | Quote: ${horseOdds(h).toFixed(1)}x`).join('\n');
      await reply(`🐎 *Pferderennen*\n\n${lines}\n\nSetze: ${COMMAND_PREFIX}rennen <Nr> <Einsatz>`);
      break;
    }
    const r = await game.horseRace(senderJid, Number(args[1]) || 0, args[0]);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const result = r.won
      ? `🏆 ${r.horse.name} ${r.horse.emoji} GEWINNT! Quote: ${r.odds}x → +${formatBalance(r.win)}`
      : `💸 ${r.winner.name} ${r.winner.emoji} hat gewonnen. Du hast verloren.`;
    await reply(`🏇 *Rennergebnis*\n\n${r.finishStr}\n\n${result}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Mines ----
  case 'mines': {
    // !mines <Einsatz> <Minen 1-3> <Zelle 1-9>
    const r = await game.mines(senderJid, Number(args[0]) || 0, Number(args[1]) || 1, Number(args[2]) || 1);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const grid = Array.from({ length: 9 }, (_, i) => {
      if (r.hit && r.minePositions.includes(i)) return '💣';
      if (!r.hit && i === Number(args[2] || 1) - 1) return '💰';
      if (!r.hit && r.minePositions.includes(i)) return '💣';
      return '🟩';
    });
    const gridStr = [0, 3, 6].map((s) => grid.slice(s, s + 3).join(' ')).join('\n');
    const txt = r.hit ? `💥 Mine! Verloren (${formatBalance(r.bet)})` : `✅ Sicher! x${r.mult} → +${formatBalance(r.win)}`;
    await reply(`💣 *Mines* (${r.minePositions.length} Minen)\n\n${gridStr}\n\n${txt}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Dice Tower ----
  case 'turm': case 'dicetower': {
    // !turm <Einsatz> <Anzahl Würfel 2-6>
    const r = await game.diceTower(senderJid, Number(args[0]) || 0, Number(args[1]) || 2);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const diceStr = r.rolls.map((d) => ['⚀','⚁','⚂','⚃','⚄','⚅'][d - 1]).join(' ');
    const txt = r.win > 0 ? `🎉 Summe ${r.total}/${r.max} → x${r.mult} = ${formatBalance(r.win)}` : `💸 Summe ${r.total}/${r.max} – kein Gewinn.`;
    await reply(`🎲🗼 *Dice Tower*\n${diceStr}\n${txt}\nKontostand: ${formatBalance(r.balance)}`);
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

*/

// ====================================================================
// Video-Poker (Jacks or Better) – 5 Karten, bis zu 2 Tausch-Runden
// Auszahlungstabelle:
//   Royal Flush: 250x, Straight Flush: 50x, Vierling: 25x, Full House: 9x,
//   Flush: 6x, Straight: 4x, Drilling: 3x, Zwei Pärchen: 2x, Pärchen Bs+: 1x
// ====================================================================
const VP_PAY = { 9: 250, 8: 50, 7: 25, 6: 9, 5: 6, 4: 4, 3: 3, 2: 2, 1: 1 };

function vpPayout(hand) {
  const r = pokerRank(hand);
  // Pärchen nur wenn J, Q, K oder A
  if (r.tier === 1) {
    const counts = {};
    for (const c of hand) counts[c.rank] = (counts[c.rank] || 0) + 1;
    const highPair = ['J', 'Q', 'K', 'A'].some((rk) => counts[rk] >= 2);
    if (!highPair) return { tier: 0, name: '❌ Kein Gewinn', mult: 0 };
  }
  return { tier: r.tier, name: r.name, mult: VP_PAY[r.tier] || 0 };
}

// Session-Store für Video-Poker (userId → { deck, hand, bet })
const vpSessions = new Map();

GameManager.prototype.videoPoker = async function (userId, bet) {
  bet = Math.floor(bet);
  if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
  const remaining = await this.eco.deductBalance(userId, bet);
  if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
  const deck = shuffleDeck(makeDeck());
  const hand = deck.splice(0, 5);
  vpSessions.set(userId, { deck, hand: [...hand], bet, balance: remaining });
  return { ok: true, hand: hand.map(cardStr), balance: remaining, phase: 'hold' };
};

GameManager.prototype.videoPokerHold = async function (userId, holdIndexes) {
  const session = vpSessions.get(userId);
  if (!session) return { ok: false, reason: 'Kein aktives Video-Poker-Spiel. Starte mit !vpoker <einsatz>.' };
  vpSessions.delete(userId);
  const { deck, hand, bet } = session;
  for (let i = 0; i < 5; i++) {
    if (!holdIndexes.includes(i)) hand[i] = deck.pop();
  }
  const result = vpPayout(hand);
  const win = Math.floor(bet * result.mult);
  const balance = win > 0 ? await this.eco.addBalance(userId, win) : session.balance;
  return { ok: true, hand: hand.map(cardStr), result, win, bet, balance, phase: 'done' };
};

// ====================================================================
// War – Kartenspiel (höhere Karte gewinnt, bei Gleichstand: Krieg!)
// ====================================================================
GameManager.prototype.war = async function (userId, bet) {
  bet = Math.floor(bet);
  if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
  const remaining = await this.eco.deductBalance(userId, bet);
  if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
  const deck = shuffleDeck(makeDeck());
  const playerCard = deck.pop();
  const botCard = deck.pop();
  let outcome;
  let win = 0;
  if (playerCard.value > botCard.value) {
    outcome = 'win';
    win = Math.floor(bet * 1.9);
  } else if (playerCard.value === botCard.value) {
    // Krieg – ziehe jeweils 2 Karten; höhere gewinnt Jackpot
    const pExtra = deck.pop();
    const bExtra = deck.pop();
    if (pExtra.value >= bExtra.value) {
      outcome = 'war_win';
      win = Math.floor(bet * 4);
    } else {
      outcome = 'war_lose';
    }
  } else {
    outcome = 'lose';
  }
  const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
  return { ok: true, playerCard: cardStr(playerCard), botCard: cardStr(botCard), outcome, win, bet, balance };
};

// ====================================================================
// Slot Machine Deluxe – 5×3 Reel mit mehreren Gewinnlinien
// Symbole: 🍒🍋🍊🍇🔔💎🃏🎰 (8 Symbole, gewichtet)
// ====================================================================
const SLOT_SYMBOLS_DLX = [
  { sym: '🍒', weight: 25, mult: 2 },
  { sym: '🍋', weight: 22, mult: 2.5 },
  { sym: '🍊', weight: 18, mult: 3 },
  { sym: '🍇', weight: 15, mult: 4 },
  { sym: '🔔', weight: 10, mult: 7 },
  { sym: '💎', weight: 6, mult: 15 },
  { sym: '🃏', weight: 3, mult: 50 },
  { sym: '🎰', weight: 1, mult: 250 },
];
const DLX_TOTAL_WEIGHT = SLOT_SYMBOLS_DLX.reduce((s, x) => s + x.weight, 0);

function pickDlxSym() {
  let r = Math.random() * DLX_TOTAL_WEIGHT;
  for (const s of SLOT_SYMBOLS_DLX) { r -= s.weight; if (r <= 0) return s; }
  return SLOT_SYMBOLS_DLX[0];
}

// Drei Reihen, fünf Rollen (5×3 Grid)
function spinDlxGrid() {
  return Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => pickDlxSym()));
}

// Prüfe Gewinnlinie (links nach rechts, mind. 3 gleiche)
function evalDlxLine(row) {
  let count = 1;
  for (let i = 1; i < row.length; i++) {
    if (row[i].sym === row[0].sym) count++; else break;
  }
  if (count >= 3) return { sym: row[0].sym, count, mult: row[0].mult * (count - 2) };
  return null;
}

GameManager.prototype.slotsDeluxe = async function (userId, bet) {
  bet = Math.floor(bet);
  if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
  const remaining = await this.eco.deductBalance(userId, bet);
  if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
  const grid = spinDlxGrid();
  const winLines = grid.map((row, i) => ({ row: i + 1, result: evalDlxLine(row) })).filter((l) => l.result);
  const totalMult = winLines.reduce((s, l) => s + l.result.mult, 0);
  const win = totalMult > 0 ? Math.floor(bet * totalMult) : 0;
  const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
  return { ok: true, grid: grid.map((row) => row.map((s) => s.sym)), winLines, totalMult, win, bet, balance };
};

// ====================================================================
// Spin-The-Bottle – Würfelspiel für die Gruppe (kein Einsatz nötig)
// Wählt zufällig einen der aktiven Spieler aus.
// ====================================================================
GameManager.prototype.spinBottle = function (participants) {
  if (!participants || participants.length < 2) return { ok: false, reason: 'Mindestens 2 Spieler nötig.' };
  const chosen = participants[Math.floor(Math.random() * participants.length)];
  return { ok: true, chosen };
};

// ====================================================================
// Nummern-Duel – Spieler wählt 1–10, Bot wählt zufällig; trifft = 5x
// ====================================================================
GameManager.prototype.numberDuel = async function (userId, bet, guess) {
  bet = Math.floor(bet);
  guess = Math.max(1, Math.min(10, Number(guess) || 5));
  if (bet <= 0) return { ok: false, reason: 'Einsatz muss positiv sein.' };
  const remaining = await this.eco.deductBalance(userId, bet);
  if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
  const botNumber = rnd(1, 10);
  const hit = guess === botNumber;
  const win = hit ? Math.floor(bet * 5) : 0;
  const balance = win > 0 ? await this.eco.addBalance(userId, win) : remaining;
  return { ok: true, guess, botNumber, hit, win, bet, balance };
};

// ====================================================================
// Coin-Harvest – Clicker-Mini-Spiel (einmal alle 2h, zufällige Ausbeute)
// ====================================================================
GameManager.prototype.harvest = async function (userId) {
  const last = await this.eco.getMeta(userId, 'last_harvest');
  const now = Date.now();
  const CD = 2 * 60 * 60 * 1000;
  if (now - last < CD) return { ok: false, waitMs: CD - (now - last) };
  await this.eco.setMeta(userId, 'last_harvest', now);
  const base = 100 + Math.floor(Math.random() * 400);
  const jackpot = Math.random() < 0.02;
  const reward = jackpot ? base * 10 : base;
  const balance = await this.eco.addBalance(userId, reward);
  return { ok: true, reward, jackpot, balance };
};

// ====================================================================
// Tournament Scoring Helper – wird von EventManager.addTournamentScore() genutzt
// Gibt normalisierten Score für jedes Spiel zurück.
// ====================================================================
function normalizeTournamentScore(game, rawResult) {
  if (!rawResult || !rawResult.ok) return 0;
  if (rawResult.win > 0) return rawResult.win;
  if (rawResult.won) return rawResult.bet * 2;
  return 0;
}

// ====================================================================
// Casino-Statistiken – verfolgt Spiel-Verlauf pro Spieler
// ====================================================================
const TRACKABLE_GAMES = ['slots', 'roulette', 'blackjack', 'poker', 'crash', 'keno', 'baccarat', 'horserace', 'mines', 'dicetower', 'coinflip', 'war', 'vpoker'];

async function recordGameResult(eco, userId, game, bet, win) {
  await eco.addStat(userId, 'total_games');
  await eco.addStat(userId, `game_${game}`);
  if (win > 0) {
    await eco.addStat(userId, 'total_wins');
    await eco.addStat(userId, `game_${game}_wins`);
  }
  await eco.addStat(userId, 'total_wagered', bet);
  if (win > 0) await eco.addStat(userId, 'total_won', win);
}

// ====================================================================
// Tisch-Limits pro Spiel – verhindert zu hohe Einsätze
// ====================================================================
const TABLE_LIMITS = {
  slots: { min: 10, max: 10000 },
  roulette: { min: 50, max: 25000 },
  blackjack: { min: 100, max: 50000 },
  poker: { min: 200, max: 100000 },
  crash: { min: 50, max: 20000 },
  keno: { min: 100, max: 15000 },
  baccarat: { min: 100, max: 30000 },
  horserace: { min: 50, max: 20000 },
  mines: { min: 50, max: 15000 },
  dicetower: { min: 50, max: 20000 },
  coinflip: { min: 10, max: 10000 },
  war: { min: 100, max: 30000 },
  vpoker: { min: 50, max: 25000 },
  slots_deluxe: { min: 50, max: 20000 },
};

function checkTableLimit(game, bet) {
  const limit = TABLE_LIMITS[game] || { min: 10, max: 100000 };
  if (bet < limit.min) return { ok: false, reason: `Mindesteinsatz für ${game}: ${limit.min} Coins.` };
  if (bet > limit.max) return { ok: false, reason: `Maximaleinsatz für ${game}: ${limit.max.toLocaleString()} Coins.` };
  return { ok: true };
}

// ====================================================================
// Jackpot-Slot – 1-in-1000-Chance auf den Jackpot-Topf beim Slots-Spiel
// ====================================================================
let jackpotPool = 50000; // Startwert, wächst mit jedem Slots-Verlust um 5%

function addToJackpotPool(amount) {
  jackpotPool += Math.floor(amount * 0.05);
}
function checkJackpotWin() {
  if (Math.random() < 0.001) { // 0.1% Chance
    const won = jackpotPool;
    jackpotPool = 50000; // Reset
    return won;
  }
  return 0;
}
function getJackpotPool() { return jackpotPool; }

// ====================================================================
// Kombo-Bonus – wenn jemand 3 Spiele hintereinander gewinnt
// ====================================================================
const winStreaks = new Map(); // userId → count

function recordWin(userId) {
  const streak = (winStreaks.get(userId) || 0) + 1;
  winStreaks.set(userId, streak);
  return streak;
}
function recordLoss(userId) {
  winStreaks.delete(userId);
}
function getWinStreak(userId) {
  return winStreaks.get(userId) || 0;
}
function comboBonus(streak) {
  if (streak >= 5) return 1.5;
  if (streak >= 3) return 1.25;
  return 1.0;
}

// ====================================================================
// ADDITIONAL GAME COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Video Poker ----
  case 'vpoker': case 'videopoker': {
    if ((args[0] || '').toLowerCase() === 'halten') {
      const holdIdxs = args.slice(1).map((n) => Number(n) - 1).filter((n) => n >= 0 && n < 5);
      const r = await game.videoPokerHold(senderJid, holdIdxs);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      const held = holdIdxs.length ? `Gehalten: Karten ${holdIdxs.map((i) => i + 1).join(', ')}` : 'Alle Karten getauscht';
      await reply(`🃏 *Video Poker – Ergebnis*\n${held}\nHand: ${r.hand.join(' ')}\n${r.result.name} → ${r.win > 0 ? `+${formatBalance(r.win)}` : 'Kein Gewinn'}\nKontostand: ${formatBalance(r.balance)}`);
      break;
    }
    const r = await game.videoPoker(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🃏 *Video Poker* (Jacks or Better)\nDeine Karten: ${r.hand.join(' ')}\n\nWelche behältst du? (Nutzung: ${COMMAND_PREFIX}vpoker halten 1 3 5)\nOder tausch alle: ${COMMAND_PREFIX}vpoker halten`);
    break;
  }

  // ---- War Kartenspiel ----
  case 'war': case 'kartenkrieg': {
    const r = await game.war(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const outcomes = {
      win: `✅ Du gewinnst! (${r.playerCard} > ${r.botCard}) +${formatBalance(r.win)}`,
      lose: `❌ Du verlierst. (${r.playerCard} < ${r.botCard})`,
      war_win: `⚔️ *KRIEG & SIEG!* +${formatBalance(r.win)} (4x!)`,
      war_lose: `⚔️ *KRIEG & NIEDERLAGE!* Alles verloren.`,
    };
    await reply(`🃏 *Kartenkrieg*\nDeine Karte: ${r.playerCard}\nBot-Karte: ${r.botCard}\n\n${outcomes[r.outcome]}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Slots Deluxe ----
  case 'slots-deluxe': case 'superslots': {
    const r = await game.slotsDeluxe(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const gridStr = r.grid.map((row) => row.join(' ')).join('\n');
    const winStr = r.winLines.length
      ? r.winLines.map((l) => `Reihe ${l.row}: ${l.result.sym} ×${l.result.count} → x${l.result.mult}`).join('\n')
      : 'Keine Gewinnlinie.';
    await reply(`🎰 *Slots Deluxe (5×3)*\n\n${gridStr}\n\n${winStr}\n${r.win > 0 ? `Gesamt: x${r.totalMult} → +${formatBalance(r.win)}` : '💸 Verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Nummern-Duel ----
  case 'zahlduell': case 'numduell': {
    const guess = Number(args[0]);
    const bet = Number(args[1]) || 0;
    if (!guess || guess < 1 || guess > 10) { await reply(`Nutzung: ${COMMAND_PREFIX}zahlduell <Zahl 1-10> <Einsatz>`); break; }
    const r = await game.numberDuel(senderJid, bet, guess);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🔢 Du: ${r.guess} | Bot: ${r.botNumber}\n${r.hit ? `🎉 Getroffen! +${formatBalance(r.win)}` : '❌ Daneben!'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Coin Harvest ----
  case 'ernten': case 'harvest': {
    const r = await game.harvest(senderJid);
    if (!r.ok) { await reply(`⏳ Nächste Ernte in ${fmtWait(r.waitMs)}.`); break; }
    const emoji = r.jackpot ? '🌟 SUPER-ERNTE!' : '🌾 Gute Ernte!';
    await reply(`${emoji} +${formatBalance(r.reward)}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

*/

// ====================================================================
// Komplette GAME_COMMANDS Vorlage (alle Spiele in einem Block)
// Kopiere diesen Block VOLLSTÄNDIG in den switch(cmd) von index.js
// ====================================================================
/*

  // ====== KERN-CASINO-BEFEHLE ======

  case 'slots': {
    const limit = checkTableLimit('slots', Number(args[0]) || 0);
    if (!limit.ok) { await reply(`❌ ${limit.reason}`); break; }
    const r = await game.slots(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'slots');
    await quest.track(senderJid, 'gamble');
    await quest.trackGlobal('gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); }
    else { recordLoss(senderJid); addToJackpotPool(r.bet); }
    const jackpotWin = r.win > 0 ? checkJackpotWin() : 0;
    let txt = `🎰 ${r.reel.join(' | ')}\n`;
    if (r.win > 0) txt += `✨ ${r.combo} → x${r.mult} = *+${formatBalance(r.win)}*`;
    else txt += '💸 Leider nichts.';
    if (jackpotWin > 0) txt += `\n🌟 *JACKPOT! +${formatBalance(jackpotWin)}!!!*`;
    txt += `\nKontostand: ${formatBalance(jackpotWin > 0 ? r.balance + jackpotWin : r.balance)}`;
    const streak = getWinStreak(senderJid);
    if (streak >= 3) txt += `\n🔥 Gewinn-Streak: ${streak}x!`;
    await reply(txt);
    await economy.checkAchievements(senderJid);
    break;
  }

  case 'coinflip': case 'cf': {
    const side = (args[0] || '').toLowerCase();
    const bet = Number(args[1] || args[0]) || 0;
    if (!['kopf', 'zahl', 'k', 'z'].includes(side) || !bet) {
      await reply(`Nutzung: ${COMMAND_PREFIX}coinflip <kopf|zahl> <einsatz>`); break;
    }
    const r = await game.coinflip(senderJid, bet, side.startsWith('k') ? 'kopf' : 'zahl');
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🪙 ${r.result === 'kopf' ? '🦅 Kopf' : '🔢 Zahl'}\n${r.win > 0 ? `✅ Gewonnen! +${formatBalance(r.win)}` : '❌ Verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'roulette': {
    const bet = (args[args.length - 1]) || '0';
    const choice = args.slice(0, -1).join(' ') || args[0];
    const r = await game.roulette(senderJid, Number(bet) || 0, choice);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'roulette');
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🎡 Kugel: *${r.number}* (${r.color})\n${r.win > 0 ? `🎉 +${formatBalance(r.win)} (x${r.mult})` : '💸 Verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'blackjack': case 'bj': {
    const r = await game.blackjack(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'blackjack');
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🃏 *Blackjack*\nDu: ${r.playerHand} (${r.playerValue})\nDealer: ${r.dealerHand} (${r.dealerValue})\n${r.win > 0 ? `🏆 Gewonnen! +${formatBalance(r.win)}` : r.tie ? '🤝 Unentschieden.' : '💸 Verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'poker': {
    const r = await game.poker(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'poker');
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🂡 *5-Card-Poker*\nDeine Hand: ${r.playerHand}\nBot-Hand: ${r.dealerHand}\n${r.playerRank.name} vs ${r.dealerRank.name}\n${r.win > 0 ? `🏆 +${formatBalance(r.win)} (x${r.mult})` : '💸 Verloren.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'crash': {
    const r = await game.crash(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'crash');
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🚀 *Crash* – Multiplikator: ${r.crashPoint}x\n${r.win > 0 ? `✅ Vor dem Crash ausgestiegen → +${formatBalance(r.win)}` : `💥 Crash bei ${r.crashPoint}x!`}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'keno': {
    const bet = Number(args[0]) || 0;
    const picks = args.slice(1, 6).map(Number).filter((n) => n >= 1 && n <= 20);
    if (picks.length < 1) { await reply(`Nutzung: ${COMMAND_PREFIX}keno <einsatz> <zahl1> [zahl2-5]\nZahlen 1–20, bis zu 5 Zahlen.`); break; }
    const r = await game.keno(senderJid, bet, picks);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'keno');
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    const drawnStr = r.drawn.map((n) => picks.includes(n) ? `*${n}*` : n).join(' ');
    await reply(`🔢 *Keno*\nGezogen: ${drawnStr}\nTreffer: ${r.hits}/${picks.length} → x${r.mult}\n${r.win > 0 ? `🎉 +${formatBalance(r.win)}` : '💸 Kein Gewinn.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'glücksrad': case 'wheel': {
    const r = await game.spinWheel(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🎡 *Glücksrad*\nSegment: *${r.segment.label}* (x${r.segment.mult})\n${r.win > 0 ? `+${formatBalance(r.win)}` : '💸 Null.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'rubbellos': case 'scratch': {
    const r = await game.scratch(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'gamble');
    if (r.win > 0) { recordWin(senderJid); await quest.track(senderJid, 'win'); } else recordLoss(senderJid);
    await reply(`🎫 *Rubbellos*\n${r.grid.join(' ')} ${r.grid.join(' ')} ${r.grid.join(' ')}\n${r.win > 0 ? `🎉 ${r.prize}! +${formatBalance(r.win)}` : '💸 Kein Gewinn.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  case 'rauben': case 'rob': {
    const target = getTargetJid(msg);
    if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}rauben @person`); break; }
    const r = await game.rob(senderJid, target);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'rob');
    if (r.success) {
      await sock.sendMessage(jid, { text: `🦹 @${senderJid.split('@')[0]} hat @${target.split('@')[0]} ausgeraubt und ${formatBalance(r.stolen)} gestohlen!`, mentions: [senderJid, target] });
    } else {
      await reply(`👮 Erwischt! Die Polizei hat dich gefasst. Strafe: ${formatBalance(r.fine)}\nKontostand: ${formatBalance(r.balance)}`);
    }
    break;
  }

*/

module.exports = {
  GameManager, fmtWait, isGameGroup, setGameGroup,
  HORSES, horseOdds, KENO_PAYOUTS, pokerRank,
  SLOT_SYMBOLS_DLX, vpSessions, normalizeTournamentScore,
  TABLE_LIMITS, checkTableLimit, TRACKABLE_GAMES, recordGameResult,
  jackpotPool: { add: addToJackpotPool, check: checkJackpotWin, get: getJackpotPool },
  winStreaks: { record: recordWin, loss: recordLoss, get: getWinStreak, bonus: comboBonus },
};
