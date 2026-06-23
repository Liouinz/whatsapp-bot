'use strict';

const ARENA_TITLES = [
  { wins: 0,   title: 'Neuling',       emoji: '🥋' },
  { wins: 5,   title: 'Kämpfer',       emoji: '⚔️' },
  { wins: 15,  title: 'Gladiator',     emoji: '🗡️' },
  { wins: 30,  title: 'Champion',      emoji: '🏆' },
  { wins: 50,  title: 'Legende',       emoji: '👑' },
  { wins: 100, title: 'Unbesiegbar',   emoji: '💎' },
  { wins: 200, title: 'Götterkrieger', emoji: '⚡' },
];

class ArenaManager {
  constructor(economyMgr) {
    this.eco = economyMgr;
    this.db = economyMgr.db;
    this.pending = new Map(); // targetJid -> { challengerJid, bet, expiresAt }
    this.EXPIRE_MS = 5 * 60 * 1000;
  }

  async init() {
    await this.db.execute(`CREATE TABLE IF NOT EXISTS arena_stats (
      user_id     TEXT PRIMARY KEY,
      wins        INTEGER DEFAULT 0,
      losses      INTEGER DEFAULT 0,
      streak      INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      coins_won   INTEGER DEFAULT 0,
      coins_lost  INTEGER DEFAULT 0
    )`);
  }

  _expireOld() {
    const now = Date.now();
    for (const [k, v] of this.pending) {
      if (now > v.expiresAt) this.pending.delete(k);
    }
  }

  async _getStats(userId) {
    const r = await this.db.execute({ sql: 'SELECT * FROM arena_stats WHERE user_id = ?', args: [userId] });
    return r.rows[0] || { user_id: userId, wins: 0, losses: 0, streak: 0, best_streak: 0, coins_won: 0, coins_lost: 0 };
  }

  async _updateStats(userId, won, betAmount) {
    const cur = await this._getStats(userId);
    const wins   = (cur.wins   || 0) + (won ? 1 : 0);
    const losses = (cur.losses || 0) + (won ? 0 : 1);
    const streak = won ? (cur.streak || 0) + 1 : 0;
    const best_streak = Math.max(cur.best_streak || 0, streak);
    const coins_won  = (cur.coins_won  || 0) + (won ? betAmount : 0);
    const coins_lost = (cur.coins_lost || 0) + (won ? 0 : betAmount);
    await this.db.execute({
      sql: `INSERT INTO arena_stats (user_id,wins,losses,streak,best_streak,coins_won,coins_lost)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
              wins=excluded.wins, losses=excluded.losses,
              streak=excluded.streak, best_streak=excluded.best_streak,
              coins_won=excluded.coins_won, coins_lost=excluded.coins_lost`,
      args: [userId, wins, losses, streak, best_streak, coins_won, coins_lost],
    });
  }

  _getTitle(wins) {
    let t = ARENA_TITLES[0];
    for (const at of ARENA_TITLES) { if (wins >= at.wins) t = at; }
    return t;
  }

  async challenge(challengerJid, targetJid, bet) {
    this._expireOld();
    if (challengerJid === targetJid) return { ok: false, reason: 'Du kannst nicht gegen dich selbst kämpfen.' };
    if (bet < 100)       return { ok: false, reason: 'Mindesteinsatz: 100 Coins.' };
    if (bet > 2_000_000) return { ok: false, reason: 'Maximaleinsatz: 2.000.000 Coins.' };

    if (this.pending.has(targetJid)) return { ok: false, reason: 'Dieser Spieler hat schon eine offene Herausforderung.' };
    // Check if this challenger already issued a challenge
    for (const [, v] of this.pending) {
      if (v.challengerJid === challengerJid) return { ok: false, reason: 'Du hast schon eine offene Herausforderung.' };
    }

    const cBal = await this.eco.getBalance(challengerJid);
    if (cBal < bet) return { ok: false, reason: `Nicht genug Coins. Du hast ${cBal}.` };

    this.pending.set(targetJid, { challengerJid, bet, expiresAt: Date.now() + this.EXPIRE_MS });
    return { ok: true, bet };
  }

  async acceptChallenge(targetJid) {
    this._expireOld();
    const ch = this.pending.get(targetJid);
    if (!ch) return { ok: false, reason: 'Keine offene Herausforderung an dich. (Abgelaufen oder nicht vorhanden.)' };

    const { challengerJid, bet } = ch;
    this.pending.delete(targetJid);

    const cBal = await this.eco.getBalance(challengerJid);
    const tBal = await this.eco.getBalance(targetJid);
    if (cBal < bet) return { ok: false, reason: 'Der Herausforderer hat nicht mehr genug Coins.' };
    if (tBal < bet) return { ok: false, reason: `Du brauchst mindestens ${bet} Coins.` };

    const cLevel = Number(await this.eco.getMeta(challengerJid, 'level').catch(() => 1)) || 1;
    const tLevel = Number(await this.eco.getMeta(targetJid, 'level').catch(() => 1)) || 1;

    const result = this._resolveFight(challengerJid, cLevel, targetJid, tLevel);
    const { winner, loser } = result;

    const tax = Math.max(0, Math.floor(bet * 0.05));
    const prize = bet - tax;

    await this.eco.deductBalance(loser, bet);
    await this.eco.addBalance(winner, prize);

    await this._updateStats(challengerJid, winner === challengerJid, bet);
    await this._updateStats(targetJid,    winner === targetJid,    bet);

    return { ok: true, winner, loser, prize, tax, bet, rounds: result.rounds, log: result.log };
  }

  declineChallenge(targetJid) {
    const ch = this.pending.get(targetJid);
    if (!ch) return { ok: false, reason: 'Keine offene Herausforderung.' };
    this.pending.delete(targetJid);
    return { ok: true, challengerJid: ch.challengerJid };
  }

  getPendingChallenge(targetJid) {
    this._expireOld();
    return this.pending.get(targetJid) || null;
  }

  async getStats(userId) {
    const s = await this._getStats(userId);
    const t = this._getTitle(s.wins || 0);
    const total = (s.wins || 0) + (s.losses || 0);
    const winrate = total > 0 ? Math.round(((s.wins || 0) / total) * 100) : 0;
    return { ...s, title: t.title, titleEmoji: t.emoji, winrate };
  }

  async getLeaderboard() {
    const r = await this.db.execute(
      'SELECT user_id, wins, losses, best_streak, coins_won FROM arena_stats ORDER BY wins DESC LIMIT 10'
    );
    return r.rows.map((row) => ({
      userId: row.user_id,
      wins: row.wins || 0,
      losses: row.losses || 0,
      bestStreak: row.best_streak || 0,
      coinsWon: row.coins_won || 0,
      ...this._getTitle(row.wins || 0),
    }));
  }

  _resolveFight(aId, aLevel, bId, bLevel) {
    let aHp = 100 + aLevel * 20;
    let bHp = 100 + bLevel * 20;
    const log = [];
    let round = 0;

    while (aHp > 0 && bHp > 0 && round < 15) {
      round++;
      const aAtk = Math.max(1, Math.floor(aLevel * 6 + Math.random() * aLevel * 10));
      const bDef = Math.max(0, Math.floor(bLevel * 2 + Math.random() * bLevel * 4));
      const dmgToB = Math.max(1, aAtk - bDef);
      bHp -= dmgToB;

      const bAtk = Math.max(1, Math.floor(bLevel * 6 + Math.random() * bLevel * 10));
      const aDef = Math.max(0, Math.floor(aLevel * 2 + Math.random() * aLevel * 4));
      const dmgToA = Math.max(1, bAtk - aDef);
      aHp -= dmgToA;

      if (round <= 5) log.push(`R${round}: ⚔️-${dmgToB} 🛡️-${dmgToA}`);
    }

    const winner = aHp >= bHp ? aId : bId;
    const loser  = winner === aId ? bId : aId;
    return { winner, loser, rounds: round, log };
  }
}

module.exports = { ArenaManager, ARENA_TITLES };
