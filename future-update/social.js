'use strict';

// Reputation titles — gained when others give you +ruf
const REP_TITLES = [
  { rep: 0,    title: 'Unbekannt',    emoji: '👤' },
  { rep: 10,   title: 'Bekannt',      emoji: '🙂' },
  { rep: 50,   title: 'Beliebt',      emoji: '😊' },
  { rep: 100,  title: 'Geachtet',     emoji: '🌟' },
  { rep: 250,  title: 'Respektiert',  emoji: '⭐' },
  { rep: 500,  title: 'Berühmt',      emoji: '🏅' },
  { rep: 1000, title: 'Legende',      emoji: '👑' },
];

class SocialManager {
  constructor(economyMgr) {
    this.eco = economyMgr;
    this.db = economyMgr.db;
    this.marriageProposals = new Map(); // targetJid → fromJid
    this.repCooldowns = new Map();      // giverJid → Map<recipientJid, timestamp>
    this.REP_COOLDOWN = 24 * 60 * 60 * 1000;
  }

  async init() {
    await this.db.batch([
      `CREATE TABLE IF NOT EXISTS player_social (
        user_id      TEXT PRIMARY KEY,
        bio          TEXT    DEFAULT '',
        custom_title TEXT    DEFAULT '',
        spouse_id    TEXT    DEFAULT NULL,
        married_at   INTEGER DEFAULT NULL,
        reputation   INTEGER DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS friendships (
        user1_id TEXT,
        user2_id TEXT,
        since    INTEGER,
        PRIMARY KEY(user1_id, user2_id)
      )`,
      `CREATE TABLE IF NOT EXISTS friend_requests (
        from_id  TEXT,
        to_id    TEXT,
        sent_at  INTEGER,
        PRIMARY KEY(from_id, to_id)
      )`,
    ]);
  }

  async _ensure(userId) {
    await this.db.execute({ sql: 'INSERT OR IGNORE INTO player_social (user_id) VALUES (?)', args: [userId] });
  }

  async _getSocial(userId) {
    const r = await this.db.execute({ sql: 'SELECT * FROM player_social WHERE user_id = ?', args: [userId] });
    return r.rows[0] || { user_id: userId, bio: '', custom_title: '', spouse_id: null, married_at: null, reputation: 0 };
  }

  _getRepTitle(rep) {
    let t = REP_TITLES[0];
    for (const rt of REP_TITLES) { if (rep >= rt.rep) t = rt; }
    return t;
  }

  // ── Profile ──────────────────────────────────────────────────────────
  async getProfile(userId) {
    const social = await this._getSocial(userId);
    const level    = Number(await this.eco.getMeta(userId, 'level').catch(() => 1))   || 1;
    const xp       = Number(await this.eco.getMeta(userId, 'xp').catch(() => 0))      || 0;
    const prestige = Number(await this.eco.getMeta(userId, 'prestige').catch(() => 0))|| 0;
    const balance  = await this.eco.getBalance(userId).catch(() => 0);
    const bankBal  = await this.eco.getBankBalance(userId).catch(() => 0);
    const repTitle = this._getRepTitle(social.reputation || 0);
    return {
      userId, level, xp, prestige, balance, bankBal,
      wealth: balance + bankBal,
      bio: social.bio || '',
      customTitle: social.custom_title || '',
      spouseId: social.spouse_id || null,
      marriedAt: social.married_at || null,
      reputation: social.reputation || 0,
      repTitle: repTitle.title,
      repEmoji: repTitle.emoji,
    };
  }

  async setBio(userId, bio) {
    if (!bio || bio.length < 1)   return { ok: false, reason: 'Bio darf nicht leer sein.' };
    if (bio.length > 150)          return { ok: false, reason: 'Bio max. 150 Zeichen.' };
    await this._ensure(userId);
    await this.db.execute({ sql: 'UPDATE player_social SET bio = ? WHERE user_id = ?', args: [bio, userId] });
    return { ok: true };
  }

  async setTitle(userId, title) {
    if (!title || title.length < 1) return { ok: false, reason: 'Titel darf nicht leer sein.' };
    if (title.length > 30)           return { ok: false, reason: 'Titel max. 30 Zeichen.' };
    await this._ensure(userId);
    await this.db.execute({ sql: 'UPDATE player_social SET custom_title = ? WHERE user_id = ?', args: [title, userId] });
    return { ok: true };
  }

  // ── Reputation ───────────────────────────────────────────────────────
  async giveRep(fromId, toId) {
    if (fromId === toId) return { ok: false, reason: 'Du kannst dir keinen Ruf geben.' };
    const map = this.repCooldowns.get(fromId) || new Map();
    if (map.has(toId) && Date.now() - map.get(toId) < this.REP_COOLDOWN) {
      const wait = this.REP_COOLDOWN - (Date.now() - map.get(toId));
      const h = Math.ceil(wait / 3_600_000);
      return { ok: false, reason: `Du kannst diesem Spieler erst in ${h}h wieder Ruf geben.` };
    }
    await this._ensure(toId);
    await this.db.execute({ sql: 'UPDATE player_social SET reputation = reputation + 1 WHERE user_id = ?', args: [toId] });
    map.set(toId, Date.now());
    this.repCooldowns.set(fromId, map);
    const r = await this._getSocial(toId);
    return { ok: true, newRep: r.reputation, repTitle: this._getRepTitle(r.reputation) };
  }

  async getTopRep() {
    const r = await this.db.execute('SELECT user_id, reputation FROM player_social ORDER BY reputation DESC LIMIT 10');
    return r.rows.map((row) => ({ userId: row.user_id, rep: row.reputation || 0, ...this._getRepTitle(row.reputation || 0) }));
  }

  // ── Friends ──────────────────────────────────────────────────────────
  async sendFriendRequest(fromId, toId) {
    if (fromId === toId) return { ok: false, reason: 'Du kannst dir nicht selbst eine Anfrage senden.' };
    const fr = await this.db.execute({
      sql: 'SELECT 1 FROM friendships WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)',
      args: [fromId, toId, toId, fromId],
    });
    if (fr.rows.length) return { ok: false, reason: 'Ihr seid bereits Freunde.' };

    const existing = await this.db.execute({ sql: 'SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?', args: [fromId, toId] });
    if (existing.rows.length) return { ok: false, reason: 'Du hast bereits eine Anfrage gesendet.' };

    // Auto-accept if reverse request exists
    const reverse = await this.db.execute({ sql: 'SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?', args: [toId, fromId] });
    if (reverse.rows.length) {
      await this.db.execute({ sql: 'DELETE FROM friend_requests WHERE from_id=? AND to_id=?', args: [toId, fromId] });
      await this.db.execute({ sql: 'INSERT OR IGNORE INTO friendships (user1_id,user2_id,since) VALUES (?,?,?)', args: [fromId, toId, Date.now()] });
      return { ok: true, autoAccepted: true };
    }
    await this.db.execute({ sql: 'INSERT OR IGNORE INTO friend_requests (from_id,to_id,sent_at) VALUES (?,?,?)', args: [fromId, toId, Date.now()] });
    return { ok: true, autoAccepted: false };
  }

  async acceptFriendRequest(userId, fromId) {
    const req = await this.db.execute({ sql: 'SELECT 1 FROM friend_requests WHERE from_id=? AND to_id=?', args: [fromId, userId] });
    if (!req.rows.length) return { ok: false, reason: 'Keine Anfrage von dieser Person.' };
    await this.db.execute({ sql: 'DELETE FROM friend_requests WHERE from_id=? AND to_id=?', args: [fromId, userId] });
    await this.db.execute({ sql: 'INSERT OR IGNORE INTO friendships (user1_id,user2_id,since) VALUES (?,?,?)', args: [userId, fromId, Date.now()] });
    return { ok: true };
  }

  async declineFriendRequest(userId, fromId) {
    await this.db.execute({ sql: 'DELETE FROM friend_requests WHERE from_id=? AND to_id=?', args: [fromId, userId] });
    return { ok: true };
  }

  async removeFriend(userId, friendId) {
    await this.db.execute({
      sql: 'DELETE FROM friendships WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)',
      args: [userId, friendId, friendId, userId],
    });
    return { ok: true };
  }

  async getFriends(userId) {
    const r = await this.db.execute({
      sql: 'SELECT user1_id, user2_id, since FROM friendships WHERE user1_id=? OR user2_id=?',
      args: [userId, userId],
    });
    return r.rows.map((row) => ({
      friendId: row.user1_id === userId ? row.user2_id : row.user1_id,
      since: row.since,
    }));
  }

  async getPendingRequests(userId) {
    const r = await this.db.execute({ sql: 'SELECT from_id, sent_at FROM friend_requests WHERE to_id=?', args: [userId] });
    return r.rows;
  }

  // ── Marriage ─────────────────────────────────────────────────────────
  async propose(fromId, toId) {
    if (fromId === toId) return { ok: false, reason: 'Du kannst dich nicht selbst heiraten.' };
    const [fromS, toS] = await Promise.all([this._getSocial(fromId), this._getSocial(toId)]);
    if (fromS.spouse_id) return { ok: false, reason: 'Du bist bereits verheiratet. Nutze !scheidung zuerst.' };
    if (toS.spouse_id)   return { ok: false, reason: 'Diese Person ist bereits verheiratet.' };
    this.marriageProposals.set(toId, fromId);
    return { ok: true };
  }

  async acceptMarriage(toId, fromId) {
    const pending = this.marriageProposals.get(toId);
    if (!pending || pending !== fromId) return { ok: false, reason: 'Kein Heiratsantrag von dieser Person gefunden.' };
    this.marriageProposals.delete(toId);
    // Recheck
    const [fromS, toS] = await Promise.all([this._getSocial(fromId), this._getSocial(toId)]);
    if (fromS.spouse_id) return { ok: false, reason: 'Diese Person hat inzwischen jemand anderen geheiratet.' };
    if (toS.spouse_id)   return { ok: false, reason: 'Du bist inzwischen bereits verheiratet.' };
    await this._ensure(fromId);
    await this._ensure(toId);
    const now = Date.now();
    await this.db.execute({ sql: 'UPDATE player_social SET spouse_id=?,married_at=? WHERE user_id=?', args: [toId,  now, fromId] });
    await this.db.execute({ sql: 'UPDATE player_social SET spouse_id=?,married_at=? WHERE user_id=?', args: [fromId, now, toId]   });
    return { ok: true, marriedAt: now };
  }

  declineMarriage(toId) {
    const from = this.marriageProposals.get(toId);
    if (!from) return { ok: false, reason: 'Kein offener Heiratsantrag.' };
    this.marriageProposals.delete(toId);
    return { ok: true, fromId: from };
  }

  async divorce(userId) {
    const social = await this._getSocial(userId);
    if (!social.spouse_id) return { ok: false, reason: 'Du bist nicht verheiratet.' };
    const spouseId = social.spouse_id;
    await this.db.execute({ sql: 'UPDATE player_social SET spouse_id=NULL,married_at=NULL WHERE user_id=?', args: [userId]  });
    await this.db.execute({ sql: 'UPDATE player_social SET spouse_id=NULL,married_at=NULL WHERE user_id=?', args: [spouseId] });
    return { ok: true, spouseId };
  }

  // ── Compare ──────────────────────────────────────────────────────────
  async compareProfiles(userId1, userId2) {
    const [p1, p2] = await Promise.all([this.getProfile(userId1), this.getProfile(userId2)]);
    return { p1, p2 };
  }
}

module.exports = { SocialManager, REP_TITLES };
