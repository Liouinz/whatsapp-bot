// 🎲 EVENTS-MODUL – NICHT AKTIV
// Zufalls-Events & Mini-Spiele: Mystery-Box, Rubbellos, Glücksrad, Zufallsereignisse,
// Turniere, saisonale Events und globale Community-Challenges.
// Wird von index.js NICHT geladen. Baut auf ../economy.js auf. Einbau gemäß INTEGRATION.md.

'use strict';

const { EconomyManager, formatBalance } = require('../economy');

const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ====================================================================
// Zufalls-Ereignisse (für !event) – positive & negative Überraschungen
// ====================================================================
const RANDOM_EVENTS = [
  // Positiv
  { text: '💼 Du hast auf der Straße eine Brieftasche gefunden!',       delta: () => rnd(200, 1500)  },
  { text: '🎰 Ein Fremder schenkt dir Casino-Chips!',                    delta: () => rnd(300, 2000)  },
  { text: '📈 Deine Aktien sind gestiegen!',                             delta: () => rnd(500, 3000)  },
  { text: '🏦 Steuerrückzahlung erhalten!',                              delta: () => rnd(400, 2500)  },
  { text: '🎁 Ein Geheimnisvoller hinterlässt dir ein Geschenk.',        delta: () => rnd(250, 1800)  },
  { text: '🏆 Du hast einen lokalen Wettbewerb gewonnen!',               delta: () => rnd(800, 4000)  },
  { text: '🎵 Dein Song ist viral gegangen – Streaming-Einnahmen!',      delta: () => rnd(1000, 5000) },
  { text: '🔑 Du hast ein vergessenes Sparbuch gefunden!',               delta: () => rnd(500, 3500)  },
  { text: '🎲 Glückssträhne – du findest überall Kleingeld!',            delta: () => rnd(100, 800)   },
  { text: '💡 Eine Geschäftsidee zahlt sich aus!',                       delta: () => rnd(2000, 8000) },
  { text: '🎉 Geburtstagsgeld von der Oma!',                             delta: () => rnd(150, 600)   },
  { text: '📦 Ein Amazon-Paket war für dich – mit Coins gefüllt.',       delta: () => rnd(300, 1200)  },
  { text: '🌐 Du wurdest für ein Sponsoring ausgewählt!',                delta: () => rnd(1500, 6000) },
  { text: '🏠 Dein Mieter hat die Kaution überlassen.',                   delta: () => rnd(500, 2000)  },
  { text: '🎟️ Du hast bei einem Online-Gewinnspiel gewonnen!',           delta: () => rnd(400, 2500)  },
  // Negativ
  { text: '🚕 Du musstest ein teures Taxi nehmen.',                      delta: () => -rnd(100, 800)  },
  { text: '🩺 Arztrechnung bezahlt.',                                    delta: () => -rnd(200, 1200) },
  { text: '📉 Deine Aktien sind gefallen.',                              delta: () => -rnd(300, 1500) },
  { text: '🍕 Du hast die ganze Truppe zum Essen eingeladen.',           delta: () => -rnd(150, 900)  },
  { text: '🐦 Ein Vogel hat dein Auto getroffen – Waschanlage fällig.',  delta: () => -rnd(50, 400)   },
  { text: '🔧 Auto-Reparatur: Zahnriemen gerissen.',                     delta: () => -rnd(400, 2000) },
  { text: '💻 Laptop kaputt – Reparaturkosten.',                         delta: () => -rnd(200, 1000) },
  { text: '📱 Dein Handy ist ins Wasser gefallen.',                      delta: () => -rnd(300, 1200) },
  { text: '🎮 Du hast versehentlich In-App-Käufe getätigt.',             delta: () => -rnd(100, 600)  },
  { text: '🌧️ Wasserschaden in der Wohnung – Handwerkerrechnung.',       delta: () => -rnd(500, 2500) },
];

// ====================================================================
// Glücksrad-Segmente (für !glücksrad) – Multiplikator auf den Einsatz
// ====================================================================
const WHEEL = [
  { label: '0x 💀',   mult: 0   },
  { label: '0.5x',    mult: 0.5 },
  { label: '1x ↩️',   mult: 1   },
  { label: '1.5x ✨',  mult: 1.5 },
  { label: '2x 🎉',   mult: 2   },
  { label: '0x 💀',   mult: 0   },
  { label: '3x 🔥',   mult: 3   },
  { label: '1x ↩️',   mult: 1   },
  { label: '5x 💎',   mult: 5   },
  { label: '0.5x',    mult: 0.5 },
  { label: '2x 🎉',   mult: 2   },
  { label: '10x 👑',  mult: 10  },
  { label: '0x 💀',   mult: 0   },
  { label: '1.5x ✨',  mult: 1.5 },
  { label: '4x 🌟',   mult: 4   },
  { label: '0x 💀',   mult: 0   },
  { label: '7x 🚀',   mult: 7   },
  { label: '0.5x',    mult: 0.5 },
  { label: '25x 🌈',  mult: 25  },
  { label: '1x ↩️',   mult: 1   },
];

// ====================================================================
// Mystery-Box-Stufen (für !box) – fester Preis, zufälliger Inhalt
// ====================================================================
const BOXES = {
  bronze:  { name: '🥉 Bronze-Box',    price: 1000,   min: 0,      max: 3000   },
  silber:  { name: '🥈 Silber-Box',    price: 5000,   min: 1000,   max: 15000  },
  gold:    { name: '🥇 Gold-Box',      price: 20000,  min: 5000,   max: 60000  },
  diamant: { name: '💎 Diamant-Box',   price: 100000, min: 30000,  max: 300000 },
  titan:   { name: '🌌 Titan-Box',     price: 500000, min: 200000, max: 1500000 },
  omega:   { name: '♾️ Omega-Box',     price: 2000000, min: 500000, max: 10000000 },
};

// ====================================================================
// Turnier-System – ein laufendes Turnier pro Gruppe
// ====================================================================
const tournaments = new Map(); // jid → { game, players: Map<userId, score>, endsAt, prize }

const TOURNAMENT_GAMES = ['slots', 'coinflip', 'roulette', 'blackjack', 'poker', 'keno'];

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
    if (bet > 100000) return { ok: false, reason: 'Max. Einsatz: 100.000 Coins.' };
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
    const roll = Math.random();
    let prize = 0, symbol = '❌', label = 'Kein Gewinn';
    if      (roll < 0.45) { prize = 0;      symbol = '❌'; label = 'Kein Gewinn'; }
    else if (roll < 0.70) { prize = 500;    symbol = '🍀'; label = 'Kleine Chance'; }
    else if (roll < 0.85) { prize = 1500;   symbol = '⭐'; label = 'Gut!'; }
    else if (roll < 0.94) { prize = 5000;   symbol = '💎'; label = 'Toll!'; }
    else if (roll < 0.98) { prize = 15000;  symbol = '🏅'; label = 'Super!'; }
    else if (roll < 0.995) { prize = 50000; symbol = '👑'; label = 'Megagewinn!'; }
    else                  { prize = 200000; symbol = '🌈'; label = 'JACKPOT!!!'; }
    const balance = prize > 0 ? await this.eco.addBalance(userId, prize) : remaining;
    return { ok: true, prize, symbol, label, cost: PRICE, balance };
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

  // ---- Turnier starten (nur Admins/Inhaber) ----
  startTournament(jid, game, durationMinutes = 10, prize = 10000) {
    if (tournaments.has(jid)) return { ok: false, reason: 'Es läuft bereits ein Turnier in dieser Gruppe.' };
    if (!TOURNAMENT_GAMES.includes(game)) return { ok: false, reason: `Wähle: ${TOURNAMENT_GAMES.join(', ')}` };
    tournaments.set(jid, {
      game,
      players: new Map(), // userId → score
      endsAt: Date.now() + durationMinutes * 60 * 1000,
      prize,
    });
    return { ok: true, game, durationMinutes, prize };
  }

  // Punktestand melden (nach jedem Spiel aufrufen wenn Turnier aktiv)
  addTournamentScore(jid, userId, score) {
    const t = tournaments.get(jid);
    if (!t) return;
    if (Date.now() > t.endsAt) return;
    const cur = t.players.get(userId) || 0;
    t.players.set(userId, cur + score);
  }

  // Turnier beenden und Gewinner ermitteln
  async endTournament(jid, sock) {
    const t = tournaments.get(jid);
    if (!t) return { ok: false, reason: 'Kein aktives Turnier.' };
    tournaments.delete(jid);
    if (!t.players.size) return { ok: true, cancelled: true, reason: 'Kein Spieler hat teilgenommen.' };
    const sorted = [...t.players.entries()].sort((a, b) => b[1] - a[1]);
    const [winnerId, winnerScore] = sorted[0];
    await this.eco.addBalance(winnerId, t.prize);
    const lines = sorted.slice(0, 5).map(([uid, score], i) =>
      `${i + 1}. @${uid.split('@')[0]} – ${score} Punkte`);
    return { ok: true, winnerId, winnerScore, prize: t.prize, leaderboard: lines, mentions: sorted.slice(0, 5).map(([uid]) => uid) };
  }

  getTournament(jid) {
    const t = tournaments.get(jid);
    if (!t) return null;
    const timeLeft = Math.max(0, t.endsAt - Date.now());
    const sorted = [...t.players.entries()].sort((a, b) => b[1] - a[1]);
    return { ...t, timeLeft, sorted };
  }

  // ---- Tägliche Glücksbox (1× kostenlos, dann 500 Coins) ----
  async dailyBox(userId) {
    const last = await this.eco.getMeta(userId, 'last_daily_box');
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const isFree = now - last >= DAY;
    const cost = isFree ? 0 : 500;
    if (!isFree) {
      const remaining = await this.eco.deductBalance(userId, cost);
      if (remaining === null) return { ok: false, reason: 'Nicht genug Coins (kostet 500 außerhalb der Tageszuteilung).' };
    }
    if (isFree) await this.eco.setMeta(userId, 'last_daily_box', now);
    const prizes = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 25000];
    const prize = prizes[Math.floor(Math.random() * prizes.length)];
    const balance = await this.eco.addBalance(userId, prize);
    return { ok: true, prize, balance, free: isFree };
  }

  // ---- Saisonales Mega-Event (nur während aktiver Season) ----
  async seasonalEvent(userId) {
    const { EconomyManager: EM } = require('../economy');
    const season = EM.currentSeason();
    if (!season) return { ok: false, reason: 'Kein aktives saisonales Event.' };
    const key = `se_${season.id}_${userId}_${new Date().getFullYear()}`;
    const done = await this.eco.getMeta(userId, key);
    if (done) return { ok: false, reason: `Das ${season.name}-Event hast du schon genutzt.` };
    await this.eco.setMeta(userId, key, 1);
    const baseMin = 2000, baseMax = 10000;
    const prize = rnd(baseMin, baseMax) * season.bonus;
    const balance = await this.eco.addBalance(userId, prize);
    return { ok: true, season, prize, balance };
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
    await reply(`🎫 Rubbellos: ${r.symbol} *${r.label}*\n${r.prize > 0 ? `Gewonnen: ${formatBalance(r.prize)}` : 'Leider kein Gewinn.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'box': {
    const r = await events.openBox(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}\nStufen: ${Object.keys(BOXES).join(', ')}`); break; }
    const p = r.profit >= 0 ? `Gewinn: +${formatBalance(r.profit)}` : `Verlust: ${formatBalance(r.profit)}`;
    await reply(`📦 ${r.box.name} geöffnet!\nInhalt: ${formatBalance(r.content)} (${p})\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }
  case 'tagesbox': {
    const r = await events.dailyBox(senderJid);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🎁 Tägliche Box ${r.free ? '(kostenlos!)' : ''}:\n*+${formatBalance(r.prize)}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Turnier (nur Admin/Inhaber) ----
  case 'turnier': {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start') {
      if (!isAdmin(meta, senderJid) && !(await isCommunityOwner(senderJid, jid))) { await reply('Nur Admins.'); break; }
      const game = args[1] || 'slots';
      const mins = Number(args[2]) || 10;
      const prize = Number(args[3]) || 10000;
      const r = events.startTournament(jid, game, mins, prize);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`🏆 *Turnier gestartet!*\nSpiel: ${r.game}\nDauer: ${r.durationMinutes} Min\nPreis: ${formatBalance(r.prize)}\nSpiele ${r.game} für Punkte!`);
    } else if (sub === 'ende') {
      if (!isAdmin(meta, senderJid) && !(await isCommunityOwner(senderJid, jid))) { await reply('Nur Admins.'); break; }
      const r = await events.endTournament(jid, sock);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      if (r.cancelled) { await reply(`🏆 Turnier beendet. ${r.reason}`); break; }
      await sock.sendMessage(jid, { text: `🏆 *Turnier beendet!*\n\n${r.leaderboard.join('\n')}\n\n🥇 Gewinner: @${r.winnerId.split('@')[0]} erhält ${formatBalance(r.prize)}!`, mentions: r.mentions });
    } else {
      const t = events.getTournament(jid);
      if (!t) { await reply('Kein aktives Turnier. Starte mit: !turnier start <spiel> <minuten> <preis>'); break; }
      const mins = Math.ceil(t.timeLeft / 60000);
      const board = t.sorted.slice(0, 5).map(([uid, sc], i) => `${i+1}. @${uid.split('@')[0]}: ${sc}`).join('\n');
      await reply(`🏆 *Turnier läuft* (${mins} Min übrig)\nSpiel: ${t.game}\nPreis: ${formatBalance(t.prize)}\n\n${board || 'Noch keine Teilnehmer.'}`);
    }
    break;
  }

*/

// ====================================================================
// Boss-Encounter-System – gruppen-weiter Bosskampf
// Der Boss erscheint zufällig und alle können angreifen.
// ====================================================================
const BOSSES = [
  { id: 'goblin', name: '👺 Münzgoblin', hp: 500, reward: 2000, desc: 'Ein gieriger Kobold hat die Kasse geplündert!' },
  { id: 'dragon', name: '🐉 Golddrache', hp: 2000, reward: 10000, desc: 'Ein mächtiger Drache bewacht seinen Schatz!' },
  { id: 'bandit', name: '🦹 Straßenräuber', hp: 300, reward: 1500, desc: 'Ein bewaffneter Bandit blockiert den Weg!' },
  { id: 'troll', name: '🧌 Brückentroll', hp: 800, reward: 4000, desc: 'Ein riesiger Troll fordert Tribut!' },
  { id: 'pirate', name: '🏴‍☠️ Pirate Kaptn', hp: 1200, reward: 6000, desc: 'Ein berüchtigter Piratenkapitän ist aufgetaucht!' },
  { id: 'witch', name: '🧙‍♀️ Zauberhexe', hp: 600, reward: 3000, desc: 'Eine böse Hexe hat den Chat verflucht!' },
  { id: 'alien', name: '👾 Münzfresser-Alien', hp: 1500, reward: 8000, desc: 'Ein Alien will eure Münzen stehlen!' },
  { id: 'titan', name: '⚡ Coin-Titan', hp: 5000, reward: 25000, desc: 'Der mächtige Coin-Titan ist erwacht! ALLE kämpfen!' },
];

// Aktive Boss-Sessions: groupJid → { boss, hp, attackers: Map<userId, damage>, startedAt }
const bossEncounters = new Map();

EventManager.prototype.spawnBoss = function (groupJid) {
  if (bossEncounters.has(groupJid)) return { ok: false, reason: 'Es gibt bereits einen aktiven Boss!' };
  const boss = BOSSES[Math.floor(Math.random() * BOSSES.length)];
  bossEncounters.set(groupJid, {
    boss: { ...boss },
    hp: boss.hp,
    attackers: new Map(),
    startedAt: Date.now(),
  });
  return { ok: true, boss };
};

EventManager.prototype.attackBoss = async function (groupJid, userId, weapon = 'fist') {
  const enc = bossEncounters.get(groupJid);
  if (!enc) return { ok: false, reason: 'Kein aktiver Boss! Warte auf das nächste Erscheinen.' };
  const now = Date.now();
  const lastAtk = enc.attackers.get(userId + '_last') || 0;
  if (now - lastAtk < 30000) return { ok: false, reason: 'Du musst 30 Sekunden warten!' };
  const damage = 10 + Math.floor(Math.random() * 40);
  enc.hp = Math.max(0, enc.hp - damage);
  enc.attackers.set(userId, (enc.attackers.get(userId) || 0) + damage);
  enc.attackers.set(userId + '_last', now);
  if (enc.hp <= 0) {
    // Boss besiegt – Schaden-anteiliger Preis
    const totalDmg = [...enc.attackers.entries()]
      .filter(([k]) => !k.endsWith('_last'))
      .reduce((s, [, d]) => s + d, 0);
    const rewards = new Map();
    for (const [uid, dmg] of enc.attackers.entries()) {
      if (uid.endsWith('_last')) continue;
      const share = dmg / totalDmg;
      const r = Math.floor(enc.boss.reward * share);
      rewards.set(uid, r);
      if (r > 0) await this.eco.addBalance(uid, r);
    }
    bossEncounters.delete(groupJid);
    return { ok: true, defeated: true, boss: enc.boss, damage, hp: 0, rewards };
  }
  return { ok: true, defeated: false, boss: enc.boss, damage, hp: enc.hp };
};

EventManager.prototype.getBossStatus = function (groupJid) {
  return bossEncounters.get(groupJid) || null;
};

// ====================================================================
// Gruppen-Lotterie – alle Mitspieler zahlen ein, einer gewinnt alles
// ====================================================================
const groupLotteries = new Map(); // groupJid → { pot, players: Set, endTime }

EventManager.prototype.startGroupLotto = function (groupJid, durationMinutes = 5) {
  if (groupLotteries.has(groupJid)) return { ok: false, reason: 'Schon eine laufende Gruppen-Lotterie!' };
  groupLotteries.set(groupJid, {
    pot: 0,
    players: new Set(),
    endTime: Date.now() + durationMinutes * 60000,
  });
  return { ok: true, durationMinutes };
};

EventManager.prototype.joinGroupLotto = async function (groupJid, userId, bet = 500) {
  const lotto = groupLotteries.get(groupJid);
  if (!lotto) return { ok: false, reason: 'Keine aktive Gruppen-Lotterie.' };
  if (Date.now() > lotto.endTime) return { ok: false, reason: 'Lotterie abgelaufen.' };
  if (lotto.players.has(userId)) return { ok: false, reason: 'Du nimmst bereits teil.' };
  bet = Math.max(100, Math.min(10000, Math.floor(bet)));
  const remaining = await this.eco.deductBalance(userId, bet);
  if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
  lotto.pot += bet;
  lotto.players.add(userId);
  return { ok: true, pot: lotto.pot, players: lotto.players.size, bet };
};

EventManager.prototype.drawGroupLotto = async function (groupJid) {
  const lotto = groupLotteries.get(groupJid);
  if (!lotto) return { ok: false, reason: 'Keine Lotterie.' };
  groupLotteries.delete(groupJid);
  const players = [...lotto.players];
  if (!players.length) return { ok: false, reason: 'Keine Teilnehmer.' };
  const winner = players[Math.floor(Math.random() * players.length)];
  const winBalance = await this.eco.addBalance(winner, lotto.pot);
  return { ok: true, winner, pot: lotto.pot, players: players.length, winBalance };
};

// ====================================================================
// Saisonale Mega-Events – große Community-Aktionen
// ====================================================================
const MEGA_EVENTS = [
  {
    id: 'gold_rush', name: '🏅 Gold-Rush!',
    desc: 'Alle Einnahmen (Arbeit, Miete) sind 3× so hoch!',
    incomeMultiplier: 3, casinoMultiplier: 1, duration: 60 * 60 * 1000,
  },
  {
    id: 'casino_night', name: '🎰 Casino-Nacht!',
    desc: 'Alle Gewinne im Casino sind doppelt!',
    incomeMultiplier: 1, casinoMultiplier: 2, duration: 30 * 60 * 1000,
  },
  {
    id: 'tax_holiday', name: '🏖️ Steuerferien!',
    desc: 'Keine Überweisungssteuer für 1 Stunde!',
    incomeMultiplier: 1, casinoMultiplier: 1, taxFree: true, duration: 60 * 60 * 1000,
  },
  {
    id: 'xp_frenzy', name: '⭐ XP-Rausch!',
    desc: 'Alle XP-Gewinne sind 5× so hoch!',
    incomeMultiplier: 1, casinoMultiplier: 1, xpMultiplier: 5, duration: 45 * 60 * 1000,
  },
];

// Aktives globales Event (serverweiter State)
let activeMegaEvent = null;

EventManager.prototype.triggerMegaEvent = function () {
  if (activeMegaEvent && Date.now() < activeMegaEvent.endTime) {
    return { ok: false, reason: 'Schon ein Mega-Event aktiv.' };
  }
  const evt = MEGA_EVENTS[Math.floor(Math.random() * MEGA_EVENTS.length)];
  activeMegaEvent = { ...evt, endTime: Date.now() + evt.duration };
  return { ok: true, event: activeMegaEvent };
};

EventManager.prototype.getActiveMegaEvent = function () {
  if (!activeMegaEvent || Date.now() >= activeMegaEvent.endTime) {
    activeMegaEvent = null;
    return null;
  }
  return activeMegaEvent;
};

// ====================================================================
// ADDITIONAL EVENT COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Boss-Encounter ----
  case 'boss': {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'angriff' || sub === 'attack') {
      const r = await events.attackBoss(jid, senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      if (r.defeated) {
        const rewardLines = [...r.rewards.entries()].map(([uid, rwd]) => `@${uid.split('@')[0]}: +${formatBalance(rwd)}`);
        await sock.sendMessage(jid, {
          text: `💀 *${r.boss.name}* wurde besiegt!\n\n🏆 Belohnungen:\n${rewardLines.join('\n')}`,
          mentions: [...r.rewards.keys()],
        });
      } else {
        await reply(`⚔️ Du triffst ${r.boss.name} für *${r.damage} Schaden*!\nVerbleibendes HP: ${r.hp}/${r.boss.hp}`);
      }
      break;
    }
    const status = events.getBossStatus(jid);
    if (!status) { await reply(`👾 Kein aktiver Boss. Vielleicht erscheint bald einer...`); break; }
    const pct = Math.floor((status.hp / status.boss.hp) * 100);
    await reply(`${status.boss.name}\nHP: ${status.hp}/${status.boss.hp} (${pct}%)\nBelohnung: ${formatBalance(status.boss.reward)}\nAngriff: ${COMMAND_PREFIX}boss angriff`);
    break;
  }

  // ---- Gruppen-Lotterie ----
  case 'gruppenlos': {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start') {
      if (!isAdmin(meta, senderJid) && !(await isCommunityOwner(senderJid, jid))) { await reply('Nur Admins.'); break; }
      const mins = Number(args[1]) || 5;
      const r = events.startGroupLotto(jid, mins);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`🎟️ *Gruppen-Lotterie gestartet!* (${mins} Min)\nEinsatz: 100–10.000 Coins\nMitmachen: ${COMMAND_PREFIX}gruppenlos join <einsatz>`);
      break;
    }
    if (sub === 'join' || sub === 'mitmachen') {
      const r = await events.joinGroupLotto(jid, senderJid, Number(args[1]) || 500);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`🎟️ Du bist dabei! Topf: ${formatBalance(r.pot)} | Spieler: ${r.players}`);
      break;
    }
    if (sub === 'ziehen') {
      if (!isAdmin(meta, senderJid) && !(await isCommunityOwner(senderJid, jid))) { await reply('Nur Admins.'); break; }
      const r = await events.drawGroupLotto(jid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await sock.sendMessage(jid, {
        text: `🎊 *Gruppen-Lotterie – Ziehung!*\n${r.players} Spieler, Topf: ${formatBalance(r.pot)}\n\n🥇 Gewinner: @${r.winner.split('@')[0]} erhält ${formatBalance(r.pot)}!`,
        mentions: [r.winner],
      });
      break;
    }
    await reply(`Nutzung: ${COMMAND_PREFIX}gruppenlos start|join|ziehen`);
    break;
  }

  // ---- Mega-Event-Status ----
  case 'megaevent': {
    const evt = events.getActiveMegaEvent();
    if (!evt) { await reply('Aktuell kein Mega-Event aktiv. Manchmal triggern sie zufällig!'); break; }
    const mins = Math.ceil((evt.endTime - Date.now()) / 60000);
    await reply(`🌟 *${evt.name}*\n${evt.desc}\nNoch ${mins} Min aktiv!`);
    break;
  }

*/

// ====================================================================
// Event-Cooldown-Manager – verhindert zu schnelle Event-Nutzung
// ====================================================================
const EVENT_COOLDOWNS = {
  event: 15 * 60 * 1000,       // 15 Min
  glücksrad: 60 * 60 * 1000,   // 1h
  rubbellos: 30 * 60 * 1000,   // 30 Min
  box: 0,                       // kein Cooldown (Kosten sind die Bremse)
  tagesbox: 24 * 60 * 60 * 1000, // 24h
};

EventManager.prototype.checkEventCooldown = async function (userId, eventType) {
  const cd = EVENT_COOLDOWNS[eventType];
  if (!cd) return { ok: true };
  const last = await this.eco.getMeta(userId, `last_${eventType}`);
  const now = Date.now();
  if (now - last < cd) return { ok: false, waitMs: cd - (now - last) };
  await this.eco.setMeta(userId, `last_${eventType}`, now);
  return { ok: true };
};

// ====================================================================
// Vollständige EVENT_COMMANDS Vorlage
// ====================================================================
/*

  // ---- Glücksrad ----
  case 'glücksrad': case 'wheel': {
    const cdCheck = await events.checkEventCooldown(senderJid, 'glücksrad');
    if (!cdCheck.ok) { await reply(`⏳ Nächste Drehung in ${fmtWait(cdCheck.waitMs)}.`); break; }
    const r = await events.spinWheel(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'gamble');
    await reply(`🎡 Glücksrad dreht sich...\nSegment: *${r.segment.label}* (x${r.segment.mult})\n${r.win > 0 ? `✨ +${formatBalance(r.win)}` : '💸 Kein Gewinn.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Rubbellos ----
  case 'rubbellos': case 'scratch': {
    const cdCheck = await events.checkEventCooldown(senderJid, 'rubbellos');
    if (!cdCheck.ok) { await reply(`⏳ Nächstes Rubbellos in ${fmtWait(cdCheck.waitMs)}.`); break; }
    const r = await events.scratch(senderJid, Number(args[0]) || 0);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await quest.track(senderJid, 'gamble');
    await reply(`🎫 *Rubbellos*\n${r.grid.join(' ')} | ${r.grid.join(' ')} | ${r.grid.join(' ')}\n${r.win > 0 ? `🎉 ${r.prize}! +${formatBalance(r.win)}` : '💸 Kein Gewinn.'}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Mystery Box ----
  case 'box': {
    const tier = (args[0] || 'basic').toLowerCase();
    const tiers = { basic: 0, silber: 1, gold: 2, platin: 3, titan: 4, omega: 5 };
    const tierIdx = tiers[tier];
    if (tierIdx === undefined) {
      const tierList = BOXES.map((b, i) => `${Object.keys(tiers)[i]}: ${formatBalance(b.cost)}`).join('\n');
      await reply(`📦 *Mystery Boxes*\n\n${tierList}\n\nNutzung: ${COMMAND_PREFIX}box <tier>`);
      break;
    }
    const r = await events.openBox(senderJid, tierIdx);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`📦 *${tier.charAt(0).toUpperCase() + tier.slice(1)}-Box* geöffnet!\n🎁 Inhalt: *${formatBalance(r.prize)}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Tages-Box ----
  case 'tagesbox': case 'dailybox': {
    const r = await events.dailyBox(senderJid);
    if (!r.ok) { await reply(`⏳ Tages-Box schon geöffnet. Morgen wieder!`); break; }
    await reply(`🎁 *Tages-Box* ${r.free ? '(kostenlos!)' : ''}\nInhalt: *+${formatBalance(r.prize)}*\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Random Event ----
  case 'event': case 'ereignis': {
    const cdCheck = await events.checkEventCooldown(senderJid, 'event');
    if (!cdCheck.ok) { await reply(`⏳ Nächstes Event in ${fmtWait(cdCheck.waitMs)}.`); break; }
    const r = await events.randomEvent(senderJid);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🎲 *Zufallsereignis*\n\n${r.event.name}\n${r.event.desc}\n\n${r.effect > 0 ? `🎉 +${formatBalance(r.effect)}` : `💸 ${formatBalance(Math.abs(r.effect))}`}\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Saisonaler Mega-Event-Trigger (Inhaber) ----
  case 'triggermegaevent': {
    if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Inhaber.'); break; }
    const r = events.triggerMegaEvent();
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    const mins = Math.ceil(r.event.duration / 60000);
    await reply(`🌟 *Mega-Event gestartet!*\n*${r.event.name}*\n${r.event.desc}\nDauer: ${mins} Minuten`);
    break;
  }

*/

module.exports = {
  EventManager, RANDOM_EVENTS, WHEEL, BOXES, TOURNAMENT_GAMES,
  BOSSES, MEGA_EVENTS, bossEncounters, groupLotteries, EVENT_COOLDOWNS,
};
