// 🏰 CLAN-MODUL – NICHT AKTIV
// Spieler können Clans gründen, beitreten und gemeinsam Clanziele erfüllen.
// Wird von index.js NICHT geladen. Baut auf ../economy.js auf.
// Einbau später gemäß INTEGRATION.md.

'use strict';

const { EconomyManager, formatBalance } = require('../economy');

// ====================================================================
// Clan-Ebenen – basierend auf der Clan-XP
// ====================================================================
const CLAN_LEVELS = [
  { level: 1, name: '⚪ Neuling',    minXp: 0,      maxMembers: 5,  perks: 'Clanchat' },
  { level: 2, name: '🟢 Aufsteiger', minXp: 500,    maxMembers: 8,  perks: '+5% Tagesbonus' },
  { level: 3, name: '🔵 Etabliert',  minXp: 2000,   maxMembers: 12, perks: '+10% Tagesbonus, Clantresor' },
  { level: 4, name: '🟣 Erfahren',   minXp: 6000,   maxMembers: 18, perks: '+15% Tagesbonus, Clanjagd' },
  { level: 5, name: '🟡 Elite',      minXp: 15000,  maxMembers: 25, perks: '+20% Tagesbonus, exklusive Farbe' },
  { level: 6, name: '🔴 Meister',    minXp: 35000,  maxMembers: 35, perks: '+25% Tagesbonus, Turnier-Bonus' },
  { level: 7, name: '🌟 Legende',    minXp: 80000,  maxMembers: 50, perks: 'Alle Boni, Legendenstatus' },
];

function clanLevelInfo(xp) {
  let level = CLAN_LEVELS[0];
  for (const l of CLAN_LEVELS) { if (xp >= l.minXp) level = l; else break; }
  const nextLevel = CLAN_LEVELS[CLAN_LEVELS.indexOf(level) + 1] || null;
  return { ...level, xp, nextAt: nextLevel?.minXp || null, nextName: nextLevel?.name || null };
}

// ====================================================================
// ClanManager – Turso-Tabellen: clans, clan_members
// ====================================================================
class ClanManager {
  constructor(economy) {
    if (!(economy instanceof EconomyManager)) throw new Error('ClanManager braucht eine EconomyManager-Instanz');
    this.eco = economy;
    this.db = economy.db;
  }

  async init() {
    await this.db.batch([
      `CREATE TABLE IF NOT EXISTS clans (
        clan_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tag TEXT NOT NULL,
        leader_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        treasury INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS clan_members (
        clan_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at INTEGER NOT NULL,
        contribution_xp INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (clan_id, user_id)
      )`,
    ], 'write');
  }

  // ---- Clan erstellen ----
  async createClan(leaderId, name, tag) {
    name = String(name).trim().slice(0, 30);
    tag = String(tag).trim().toUpperCase().slice(0, 5).replace(/[^A-Z0-9]/g, '');
    if (name.length < 3) return { ok: false, reason: 'Name muss mindestens 3 Zeichen haben.' };
    if (tag.length < 2) return { ok: false, reason: 'Tag muss 2–5 Buchstaben/Zahlen haben.' };
    // Prüfen ob bereits in Clan
    if (await this.getMemberClan(leaderId)) return { ok: false, reason: 'Du bist bereits in einem Clan.' };
    const existing = await this.db.execute({ sql: 'SELECT 1 FROM clans WHERE name=? OR tag=?', args: [name, tag] });
    if (existing.rows.length) return { ok: false, reason: 'Name oder Tag bereits vergeben.' };
    // Gründungskosten: 5.000 Coins
    const COST = 5000;
    const remaining = await this.eco.deductBalance(leaderId, COST);
    if (remaining === null) return { ok: false, reason: `Gründungskosten: ${formatBalance(COST)} (nicht genug Coins).` };
    const clanId = `clan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    await this.db.execute({ sql: 'INSERT INTO clans(clan_id,name,tag,leader_id,created_at) VALUES(?,?,?,?,?)', args: [clanId, name, tag, leaderId, now] });
    await this.db.execute({ sql: 'INSERT INTO clan_members(clan_id,user_id,role,joined_at) VALUES(?,?,?,?)', args: [clanId, leaderId, 'leader', now] });
    return { ok: true, clanId, name, tag, cost: COST };
  }

  // ---- Clan auflösen (nur Anführer) ----
  async dissolveClan(leaderId) {
    const clan = await this.getMemberClan(leaderId);
    if (!clan) return { ok: false, reason: 'Du bist in keinem Clan.' };
    const info = await this.getClan(clan.clan_id);
    if (info.leader_id !== leaderId) return { ok: false, reason: 'Nur der Anführer kann den Clan auflösen.' };
    // Clantresor an Anführer auszahlen
    if (info.treasury > 0) await this.eco.addBalance(leaderId, Number(info.treasury));
    await this.db.execute({ sql: 'DELETE FROM clan_members WHERE clan_id=?', args: [clan.clan_id] });
    await this.db.execute({ sql: 'DELETE FROM clans WHERE clan_id=?', args: [clan.clan_id] });
    return { ok: true, name: info.name, treasuryReturned: Number(info.treasury) };
  }

  // ---- Clan suchen & beitreten ----
  async searchClans(query = '') {
    const rs = query
      ? await this.db.execute({ sql: "SELECT * FROM clans WHERE name LIKE ? OR tag=? ORDER BY xp DESC LIMIT 10", args: [`%${query}%`, query.toUpperCase()] })
      : await this.db.execute('SELECT * FROM clans ORDER BY xp DESC LIMIT 10');
    return Promise.all(rs.rows.map((r) => this.enrichClan(r)));
  }

  async joinClan(userId, clanId) {
    if (await this.getMemberClan(userId)) return { ok: false, reason: 'Du bist bereits in einem Clan.' };
    const clan = await this.getClan(clanId);
    if (!clan) return { ok: false, reason: 'Clan nicht gefunden.' };
    const lvlInfo = clanLevelInfo(Number(clan.xp));
    const members = await this.getMembers(clanId);
    if (members.length >= lvlInfo.maxMembers) return { ok: false, reason: `Clan ist voll (max. ${lvlInfo.maxMembers} Mitglieder).` };
    await this.db.execute({ sql: 'INSERT INTO clan_members(clan_id,user_id,role,joined_at) VALUES(?,?,?,?)', args: [clanId, userId, 'member', Date.now()] });
    return { ok: true, clan, members: members.length + 1 };
  }

  async leaveClan(userId) {
    const membership = await this.getMemberClan(userId);
    if (!membership) return { ok: false, reason: 'Du bist in keinem Clan.' };
    if (membership.role === 'leader') return { ok: false, reason: 'Anführer kann nicht austreten. Nutze !clan auflösen oder übergib die Führung.' };
    await this.db.execute({ sql: 'DELETE FROM clan_members WHERE clan_id=? AND user_id=?', args: [membership.clan_id, userId] });
    return { ok: true, clanId: membership.clan_id };
  }

  // ---- Mitglied entfernen (Anführer) ----
  async kickMember(leaderId, targetId) {
    const lClan = await this.getMemberClan(leaderId);
    if (!lClan || lClan.role !== 'leader') return { ok: false, reason: 'Nur der Anführer kann Mitglieder entfernen.' };
    const tClan = await this.getMemberClan(targetId);
    if (!tClan || tClan.clan_id !== lClan.clan_id) return { ok: false, reason: 'Spieler ist nicht in deinem Clan.' };
    if (targetId === leaderId) return { ok: false, reason: 'Du kannst dich nicht selbst entfernen.' };
    await this.db.execute({ sql: 'DELETE FROM clan_members WHERE clan_id=? AND user_id=?', args: [lClan.clan_id, targetId] });
    return { ok: true };
  }

  // ---- Führung übergeben ----
  async transferLeadership(leaderId, newLeaderId) {
    const lClan = await this.getMemberClan(leaderId);
    if (!lClan || lClan.role !== 'leader') return { ok: false, reason: 'Du bist nicht der Anführer.' };
    const tClan = await this.getMemberClan(newLeaderId);
    if (!tClan || tClan.clan_id !== lClan.clan_id) return { ok: false, reason: 'Spieler ist nicht in deinem Clan.' };
    await this.db.execute({ sql: 'UPDATE clan_members SET role=? WHERE clan_id=? AND user_id=?', args: ['member', lClan.clan_id, leaderId] });
    await this.db.execute({ sql: 'UPDATE clan_members SET role=? WHERE clan_id=? AND user_id=?', args: ['leader', lClan.clan_id, newLeaderId] });
    await this.db.execute({ sql: 'UPDATE clans SET leader_id=? WHERE clan_id=?', args: [newLeaderId, lClan.clan_id] });
    return { ok: true };
  }

  // ---- Clan-Tresor einzahlen ----
  async donateToTreasury(userId, amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return { ok: false, reason: 'Betrag muss positiv sein.' };
    const membership = await this.getMemberClan(userId);
    if (!membership) return { ok: false, reason: 'Du bist in keinem Clan.' };
    const remaining = await this.eco.deductBalance(userId, amount);
    if (remaining === null) return { ok: false, reason: 'Nicht genug Coins.' };
    await this.db.execute({ sql: 'UPDATE clans SET treasury=treasury+? WHERE clan_id=?', args: [amount, membership.clan_id] });
    // XP für Clan und Beitrag
    const xpGain = Math.floor(amount / 100);
    await this.addClanXp(membership.clan_id, userId, xpGain);
    const clan = await this.getClan(membership.clan_id);
    return { ok: true, amount, xpGain, treasury: Number(clan.treasury), balance: remaining };
  }

  // ---- XP hinzufügen ----
  async addClanXp(clanId, userId, amount) {
    await this.db.execute({ sql: 'UPDATE clans SET xp=xp+? WHERE clan_id=?', args: [amount, clanId] });
    await this.db.execute({ sql: 'UPDATE clan_members SET contribution_xp=contribution_xp+? WHERE clan_id=? AND user_id=?', args: [amount, clanId, userId] });
  }

  async contributeMemberXp(userId, amount) {
    const membership = await this.getMemberClan(userId);
    if (!membership) return;
    await this.addClanXp(membership.clan_id, userId, amount);
  }

  // ---- Clan-Beschreibung setzen ----
  async setDescription(leaderId, desc) {
    const lClan = await this.getMemberClan(leaderId);
    if (!lClan || lClan.role !== 'leader') return { ok: false, reason: 'Nur der Anführer kann die Beschreibung setzen.' };
    desc = String(desc).trim().slice(0, 200);
    await this.db.execute({ sql: 'UPDATE clans SET description=? WHERE clan_id=?', args: [desc, lClan.clan_id] });
    return { ok: true };
  }

  // ---- Clan-Info ----
  async getClanInfo(clanId) {
    const clan = await this.getClan(clanId);
    if (!clan) return null;
    const members = await this.getMembers(clanId);
    const lvlInfo = clanLevelInfo(Number(clan.xp));
    return { ...clan, members, lvlInfo };
  }

  async getMyClantInfo(userId) {
    const membership = await this.getMemberClan(userId);
    if (!membership) return null;
    return this.getClanInfo(membership.clan_id);
  }

  // ---- Rangliste ----
  async getLeaderboard() {
    const rs = await this.db.execute('SELECT * FROM clans ORDER BY xp DESC LIMIT 10');
    return Promise.all(rs.rows.map((r) => this.enrichClan(r)));
  }

  // ---- Interne Helfer ----
  async getClan(clanId) {
    const rs = await this.db.execute({ sql: 'SELECT * FROM clans WHERE clan_id=?', args: [clanId] });
    return rs.rows[0] || null;
  }

  async getMemberClan(userId) {
    const rs = await this.db.execute({ sql: 'SELECT * FROM clan_members WHERE user_id=?', args: [userId] });
    return rs.rows[0] || null;
  }

  async getMembers(clanId) {
    const rs = await this.db.execute({ sql: 'SELECT * FROM clan_members WHERE clan_id=? ORDER BY contribution_xp DESC', args: [clanId] });
    return rs.rows;
  }

  async enrichClan(row) {
    const members = await this.getMembers(row.clan_id);
    const lvlInfo = clanLevelInfo(Number(row.xp));
    return { ...row, memberCount: members.length, lvlInfo };
  }
}

// ====================================================================
// CLAN_COMMANDS – Vorlage für index.js (siehe INTEGRATION.md)
// ====================================================================
/*

  case 'clan': {
    const sub = (args[0] || '').toLowerCase();
    switch (sub) {
      case 'info': case '': {
        const info = await clan.getMyClantInfo(senderJid);
        if (!info) { await reply(`Du bist in keinem Clan. Suche mit ${COMMAND_PREFIX}clan suche`); break; }
        const lvl = info.lvlInfo;
        await reply(`🏰 *[${info.tag}] ${info.name}*\n${lvl.name} (${info.xp} XP)\nMitglieder: ${info.members.length}/${lvl.maxMembers}\nTresor: ${formatBalance(info.treasury)}\n\n${info.description || '_Keine Beschreibung._'}\n\nPerks: ${lvl.perks}`);
        break;
      }
      case 'erstellen': case 'create': {
        const name = args[1];
        const tag = args[2];
        if (!name || !tag) { await reply(`Nutzung: ${COMMAND_PREFIX}clan erstellen <Name> <TAG>`); break; }
        const r = await clan.createClan(senderJid, name, tag);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await reply(`🏰 Clan *[${r.tag}] ${r.name}* gegründet! (Kosten: ${formatBalance(r.cost)})`);
        break;
      }
      case 'suche': case 'search': {
        const query = args.slice(1).join(' ');
        const results = await clan.searchClans(query);
        if (!results.length) { await reply('Keine Clans gefunden.'); break; }
        const lines = results.map((c) => `▸ [${c.tag}] ${c.name} – ${c.lvlInfo.name} | ${c.memberCount}/${c.lvlInfo.maxMembers} Mitglieder | ${c.xp} XP\nBeitritt: ${COMMAND_PREFIX}clan beitritt ${c.clan_id}`);
        await reply(`🔍 *Clan-Suche*\n\n${lines.join('\n\n')}`);
        break;
      }
      case 'beitritt': case 'join': {
        const clanId = args[1];
        if (!clanId) { await reply(`Nutzung: ${COMMAND_PREFIX}clan beitritt <clan_id>`); break; }
        const r = await clan.joinClan(senderJid, clanId);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await reply(`✅ Du bist *[${r.clan.tag}] ${r.clan.name}* beigetreten! (${r.members} Mitglieder)`);
        break;
      }
      case 'verlassen': case 'leave': {
        const r = await clan.leaveClan(senderJid);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await reply('✅ Du hast den Clan verlassen.');
        break;
      }
      case 'spenden': case 'donate': {
        const amount = Number(args[1]) || 0;
        const r = await clan.donateToTreasury(senderJid, amount);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await reply(`💰 ${formatBalance(r.amount)} in Tresor eingezahlt (+${r.xpGain} Clan-XP)\nTresor: ${formatBalance(r.treasury)}`);
        break;
      }
      case 'kick': {
        const target = getTargetJid(msg);
        if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}clan kick @person`); break; }
        const r = await clan.kickMember(senderJid, target);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await sock.sendMessage(jid, { text: `🚫 @${target.split('@')[0]} wurde aus dem Clan entfernt.`, mentions: [target] });
        break;
      }
      case 'übertragen': case 'transfer': {
        const target = getTargetJid(msg);
        if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}clan übertragen @person`); break; }
        const r = await clan.transferLeadership(senderJid, target);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await sock.sendMessage(jid, { text: `👑 Clan-Anführerschaft an @${target.split('@')[0]} übergeben.`, mentions: [target] });
        break;
      }
      case 'beschreibung': case 'desc': {
        const desc = args.slice(1).join(' ');
        const r = await clan.setDescription(senderJid, desc);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await reply('✅ Clan-Beschreibung gesetzt.');
        break;
      }
      case 'top': case 'rangliste': {
        const board = await clan.getLeaderboard();
        const medals = ['🥇', '🥈', '🥉'];
        const lines = board.map((c, i) => `${medals[i] || `${i+1}.`} *[${c.tag}] ${c.name}* – ${c.xp} XP | ${c.memberCount} Mitglieder | ${c.lvlInfo.name}`);
        await reply(`🏰 *Clan-Rangliste*\n\n${lines.join('\n')}`);
        break;
      }
      case 'auflösen': {
        const r = await clan.dissolveClan(senderJid);
        if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
        await reply(`🏰 Clan *${r.name}* aufgelöst.${r.treasuryReturned > 0 ? ` Tresor zurückgezahlt: ${formatBalance(r.treasuryReturned)}` : ''}`);
        break;
      }
      default:
        await reply(`🏰 *Clan-Befehle*\n${COMMAND_PREFIX}clan info\n${COMMAND_PREFIX}clan erstellen <Name> <TAG>\n${COMMAND_PREFIX}clan suche [name]\n${COMMAND_PREFIX}clan beitritt <id>\n${COMMAND_PREFIX}clan verlassen\n${COMMAND_PREFIX}clan spenden <betrag>\n${COMMAND_PREFIX}clan kick @person\n${COMMAND_PREFIX}clan übertragen @person\n${COMMAND_PREFIX}clan top`);
    }
    break;
  }

*/

// ====================================================================
// Clan-Krieg-System – Clans fordern sich gegenseitig heraus
// Status: pending | active | finished
// ====================================================================
const clanWars = new Map(); // warId → { attackerId, defenderId, score, endTime, ... }

ClanManager.prototype.declareClanWar = async function (attackerLeaderId, defenderClanName, durationMinutes = 60) {
  const attMember = await this.getMembership(attackerLeaderId);
  if (!attMember || attMember.role !== 'leader') return { ok: false, reason: 'Nur der Anführer kann Kriege erklären.' };
  const attClan = await this.getClan(attMember.clan_id);
  const defClans = await this.db.execute({ sql: 'SELECT * FROM clans WHERE name LIKE ?', args: [`%${defenderClanName}%`] });
  if (!defClans.rows.length) return { ok: false, reason: 'Gegnerischer Clan nicht gefunden.' };
  const defClan = defClans.rows[0];
  if (defClan.id === attClan.id) return { ok: false, reason: 'Du kannst nicht gegen deinen eigenen Clan kämpfen.' };
  const warId = `war_${attClan.id}_${defClan.id}_${Date.now()}`;
  clanWars.set(warId, {
    attackerId: attClan.id,
    defenderClan: defClan.name,
    attackerClan: attClan.name,
    attackerScore: 0,
    defenderScore: 0,
    attackerContribs: new Map(),
    defenderContribs: new Map(),
    endTime: Date.now() + durationMinutes * 60000,
    status: 'active',
  });
  return { ok: true, warId, attacker: attClan.name, defender: defClan.name, durationMinutes };
};

ClanManager.prototype.contributeToWar = async function (warId, userId, points) {
  const war = clanWars.get(warId);
  if (!war || war.status !== 'active') return { ok: false, reason: 'Kein aktiver Krieg mit dieser ID.' };
  if (Date.now() > war.endTime) {
    war.status = 'finished';
    return { ok: false, reason: 'Der Clan-Krieg ist beendet!' };
  }
  const membership = await this.getMembership(userId);
  if (!membership) return { ok: false, reason: 'Du bist in keinem Clan.' };
  if (membership.clan_id === war.attackerId) {
    war.attackerScore += points;
    war.attackerContribs.set(userId, (war.attackerContribs.get(userId) || 0) + points);
  } else if (membership.clan_id === war.defenderClan) {
    war.defenderScore += points;
    war.defenderContribs.set(userId, (war.defenderContribs.get(userId) || 0) + points);
  } else {
    return { ok: false, reason: 'Du bist nicht in einem der kämpfenden Clans.' };
  }
  return { ok: true, war, points };
};

ClanManager.prototype.getWarStatus = function (warId) {
  return clanWars.get(warId) || null;
};

ClanManager.prototype.finishWar = async function (warId) {
  const war = clanWars.get(warId);
  if (!war) return { ok: false, reason: 'Krieg nicht gefunden.' };
  war.status = 'finished';
  const winner = war.attackerScore >= war.defenderScore ? war.attackerClan : war.defenderClan;
  const winnerContribs = war.attackerScore >= war.defenderScore ? war.attackerContribs : war.defenderContribs;
  // XP-Bonus für alle Sieger-Clan-Mitglieder
  const bonusXp = 500 + Math.abs(war.attackerScore - war.defenderScore);
  for (const [uid] of winnerContribs.entries()) {
    await this.addClanXp(uid, Math.floor(bonusXp / winnerContribs.size));
  }
  clanWars.delete(warId);
  return { ok: true, war, winner, bonusXp, attackerScore: war.attackerScore, defenderScore: war.defenderScore };
};

// ====================================================================
// Clan-Allianzen – zwei Clans helfen sich gegenseitig
// ====================================================================
ClanManager.prototype.proposeAlliance = async function (proposerLeaderId, targetClanName) {
  const membership = await this.getMembership(proposerLeaderId);
  if (!membership || membership.role !== 'leader') return { ok: false, reason: 'Nur Anführer können Allianzen vorschlagen.' };
  // Speichere Allianz-Anfrage in Clan-Description-Feld (einfache Implementierung)
  await this.db.execute({
    sql: 'UPDATE clans SET description = COALESCE(description, \'\') || ? WHERE id = ?',
    args: [`[ALLIANZ:${targetClanName}]`, membership.clan_id],
  });
  return { ok: true, message: `Allianz-Anfrage an *${targetClanName}* gesendet.` };
};

// ====================================================================
// Clan-Statistiken
// ====================================================================
ClanManager.prototype.getClanStats = async function (clanId) {
  const clanRs = await this.db.execute({ sql: 'SELECT * FROM clans WHERE id = ?', args: [clanId] });
  if (!clanRs.rows.length) return null;
  const clan = clanRs.rows[0];
  const memberRs = await this.db.execute({ sql: 'SELECT * FROM clan_members WHERE clan_id = ? ORDER BY xp_contributed DESC', args: [clanId] });
  const lvl = clanLevelInfo(Number(clan.xp));
  const topContributor = memberRs.rows[0];
  return {
    clan,
    memberCount: memberRs.rows.length,
    topContributor,
    lvlInfo: lvl,
    totalContributed: memberRs.rows.reduce((s, m) => s + Number(m.xp_contributed), 0),
  };
};

// ====================================================================
// Mitgliedschaft prüfen (interner Helper)
// ====================================================================
ClanManager.prototype.getMembership = async function (userId) {
  const rs = await this.db.execute({ sql: 'SELECT cm.*, c.name as clan_name FROM clan_members cm JOIN clans c ON cm.clan_id = c.id WHERE cm.user_id = ?', args: [userId] });
  return rs.rows[0] || null;
};

ClanManager.prototype.getClan = async function (clanId) {
  const rs = await this.db.execute({ sql: 'SELECT * FROM clans WHERE id = ?', args: [clanId] });
  return rs.rows[0] || null;
};

// ====================================================================
// ADDITIONAL CLAN COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Clan-Krieg ----
  case 'clankrieg': {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'erklären') {
      const targetName = args.slice(1).join(' ');
      const mins = 60;
      const r = await clan.declareClanWar(senderJid, targetName, mins);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`⚔️ *Clan-Krieg erklärt!*\n${r.attacker} vs. ${r.defender}\nDauer: ${r.durationMinutes} Min\nKriegs-ID: ${r.warId}\nBeitragen: ${COMMAND_PREFIX}clankrieg kämpfen <kriegs-id>`);
      break;
    }
    if (sub === 'kämpfen') {
      const warId = args[1];
      if (!warId) { await reply('Gib die Kriegs-ID an.'); break; }
      const points = 10 + Math.floor(Math.random() * 40);
      const r = await clan.contributeToWar(warId, senderJid, points);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`⚔️ Du kämpfst für deinen Clan! +${points} Punkte\n${r.war.attackerClan}: ${r.war.attackerScore} vs ${r.war.defenderClan}: ${r.war.defenderScore}`);
      break;
    }
    if (sub === 'ende') {
      const warId = args[1];
      if (!warId) { await reply('Gib die Kriegs-ID an.'); break; }
      const r = await clan.finishWar(warId);
      if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
      await reply(`⚔️ *Clan-Krieg beendet!*\n${r.war.attackerClan}: ${r.attackerScore} vs ${r.war.defenderClan}: ${r.defenderScore}\n🏆 Sieger: *${r.winner}* (+${r.bonusXp} XP)`);
      break;
    }
    await reply(`⚔️ Clan-Krieg Befehle:\n${COMMAND_PREFIX}clankrieg erklären <clan-name>\n${COMMAND_PREFIX}clankrieg kämpfen <war-id>\n${COMMAND_PREFIX}clankrieg ende <war-id>`);
    break;
  }

  // ---- Clan-Statistiken ----
  case 'clanstats': {
    const myMem = await clan.getMembership(senderJid);
    if (!myMem) { await reply('Du bist in keinem Clan.'); break; }
    const stats = await clan.getClanStats(myMem.clan_id);
    if (!stats) { await reply('Statistiken nicht verfügbar.'); break; }
    await reply(`📊 *${stats.clan.name} – Statistiken*\nLevel: ${stats.lvlInfo.current?.name || '?'}\nMitglieder: ${stats.memberCount}/${stats.lvlInfo.current?.maxMembers || '?'}\nGesamte XP: ${stats.clan.xp}\nGesamt beigetragen: ${stats.totalContributed} XP\nTop-Beitragleister: @${(stats.topContributor?.user_id || '').split('@')[0]} (${stats.topContributor?.xp_contributed || 0} XP)`);
    break;
  }

*/

// ====================================================================
// Clan-Aufgaben – gemeinsame tägliche Ziele für den Clan
// ====================================================================
const CLAN_TASKS = [
  { id: 'ct_work', event: 'work', target: 20, reward: 5000, xp: 500, desc: 'Alle Mitglieder arbeiten zusammen 20x' },
  { id: 'ct_slots', event: 'slots', target: 30, reward: 8000, xp: 800, desc: '30x Slots gemeinsam spielen' },
  { id: 'ct_earn', event: 'earn', target: 100000, reward: 10000, xp: 1000, desc: 'Gemeinsam 100.000 Coins verdienen' },
  { id: 'ct_daily', event: 'daily', target: 5, reward: 3000, xp: 300, desc: '5 Mitglieder holen den Daily-Bonus' },
  { id: 'ct_win', event: 'win', target: 15, reward: 6000, xp: 600, desc: '15 Casino-Siege gemeinsam' },
  { id: 'ct_donate', event: 'donate', target: 50000, reward: 12000, xp: 1200, desc: 'Spendet 50.000 in die Schatzkammer' },
  { id: 'ct_buy', event: 'buyhouse', target: 3, reward: 4000, xp: 400, desc: 'Kauft zusammen 3 Häuser' },
  { id: 'ct_craft', event: 'craft', target: 2, reward: 7000, xp: 700, desc: 'Stellt gemeinsam 2 Items her' },
];

function todaysClanTask() {
  const seed = Math.floor(Date.now() / 86400000);
  return CLAN_TASKS[seed % CLAN_TASKS.length];
}

ClanManager.prototype.getClanTaskProgress = async function (clanId) {
  const task = todaysClanTask();
  const seed = Math.floor(Date.now() / 86400000);
  const key = `clanTask_${clanId}_${task.id}_${seed}`;
  const rs = await this.db.execute({ sql: 'SELECT value FROM clan_task_progress WHERE clan_id=? AND task_key=?', args: [clanId, key] }).catch(() => ({ rows: [] }));
  const progress = Number(rs.rows[0]?.value || 0);
  return { task, progress, done: progress >= task.target };
};

ClanManager.prototype.contributeClanTask = async function (clanId, userId, event, amount = 1) {
  const task = todaysClanTask();
  if (task.event !== event) return;
  const seed = Math.floor(Date.now() / 86400000);
  const key = `clanTask_${clanId}_${task.id}_${seed}`;
  // Verwende player_meta für einfache Persistence
  const existing = await this.db.execute({ sql: 'SELECT value FROM player_meta WHERE user_id=? AND key=?', args: [clanId, key] }).catch(() => ({ rows: [] }));
  const current = Number(existing.rows[0]?.value || 0);
  await this.db.execute({
    sql: 'INSERT OR REPLACE INTO player_meta(user_id,key,value) VALUES(?,?,?)',
    args: [clanId, key, current + amount],
  }).catch(() => {});
};

// ====================================================================
// Gilden-Skill-Baum (3 Kategorien × 3 Skills)
// ====================================================================
const GUILD_SKILLS = [
  // Kategorie: Wirtschaft
  { id: 'gs_treasury1',  cat: 'economy',  name: '💰 Erweiterter Tresor I',  cost: 1000,  desc: '+5% auf alle Tagesboni der Mitglieder' },
  { id: 'gs_treasury2',  cat: 'economy',  name: '💰 Erweiterter Tresor II', cost: 3000,  desc: '+10% auf alle Tagesboni', requires: 'gs_treasury1' },
  { id: 'gs_treasury3',  cat: 'economy',  name: '💰 Goldene Schatzkammer',  cost: 8000,  desc: '+20% auf alle Tagesboni', requires: 'gs_treasury2' },
  // Kategorie: Kampf
  { id: 'gs_combat1',    cat: 'combat',   name: '⚔️ Kampfausbildung I',     cost: 1500,  desc: '+5% ATK für Gilden-Mitglieder im Kampf' },
  { id: 'gs_combat2',    cat: 'combat',   name: '⚔️ Kampfausbildung II',    cost: 4500,  desc: '+10% ATK + +5% DEF', requires: 'gs_combat1' },
  { id: 'gs_combat3',    cat: 'combat',   name: '⚔️ Elite-Krieger',         cost: 12000, desc: '+20% ATK + +15% DEF', requires: 'gs_combat2' },
  // Kategorie: Entdeckung
  { id: 'gs_explore1',   cat: 'explore',  name: '🗺️ Erkundungsgeist I',    cost: 1200,  desc: '+10% Rohstoff-Drops beim Sammeln' },
  { id: 'gs_explore2',   cat: 'explore',  name: '🗺️ Erkundungsgeist II',   cost: 3500,  desc: '+20% Rohstoff-Drops + -10% Reisekosten', requires: 'gs_explore1' },
  { id: 'gs_explore3',   cat: 'explore',  name: '🗺️ Weltenwanderer',       cost: 9000,  desc: '+30% Drops + -25% Reisekosten + +5% XP überall', requires: 'gs_explore2' },
];

// Gilden-Territorium – kontrollierte Weltregionen (gibt +10% Drops)
const guildTerritories = new Map(); // regionId → clanId

ClanManager.prototype.getSkills = async function (clanId) {
  const rs = await this.db.execute({ sql: 'SELECT key FROM player_meta WHERE user_id=? AND key LIKE ? AND value=1', args: [clanId, 'gskill_%'] }).catch(() => ({ rows: [] }));
  return new Set(rs.rows.map((r) => r.key.replace('gskill_', '')));
};

ClanManager.prototype.unlockSkill = async function (leaderId, skillId) {
  const myMem = await this.getMembership(leaderId).catch(() => null);
  if (!myMem || myMem.role !== 'leader') return { ok: false, reason: 'Nur der Gildenleiter kann Skills freischalten.' };
  const skill = GUILD_SKILLS.find((s) => s.id === skillId);
  if (!skill) return { ok: false, reason: 'Skill nicht gefunden.' };
  const clanInfo = await this.getClan(myMem.clan_id).catch(() => null);
  if (!clanInfo) return { ok: false, reason: 'Gilde nicht gefunden.' };
  const owned = await this.getSkills(myMem.clan_id);
  if (owned.has(skillId)) return { ok: false, reason: 'Skill bereits freigeschaltet.' };
  if (skill.requires && !owned.has(skill.requires)) return { ok: false, reason: `Benötigt zuerst: ${skill.requires}` };
  if (clanInfo.treasury < skill.cost) return { ok: false, reason: `Nicht genug im Tresor. Benötigt: ${skill.cost} XP` };
  await this.db.execute({ sql: 'UPDATE clans SET treasury=treasury-? WHERE clan_id=?', args: [skill.cost, myMem.clan_id] });
  await this.db.execute({ sql: 'INSERT OR REPLACE INTO player_meta(user_id,key,value) VALUES(?,?,1)', args: [myMem.clan_id, `gskill_${skillId}`] });
  return { ok: true, skill };
};

ClanManager.prototype.claimTerritory = async function (leaderId, regionId) {
  const myMem = await this.getMembership(leaderId).catch(() => null);
  if (!myMem || myMem.role !== 'leader') return { ok: false, reason: 'Nur der Gildenleiter kann Territorium beanspruchen.' };
  const current = guildTerritories.get(regionId);
  if (current === myMem.clan_id) return { ok: false, reason: 'Ihr kontrolliert diese Region bereits.' };
  guildTerritories.set(regionId, myMem.clan_id);
  const clan = await this.getClan(myMem.clan_id).catch(() => null);
  return { ok: true, clanName: clan?.name || '?', regionId };
};

ClanManager.prototype.getTerritories = function () {
  return [...guildTerritories.entries()].map(([region, clanId]) => ({ region, clanId }));
};

ClanManager.prototype.getGuildBonus = async function (userId) {
  const myMem = await this.getMembership(userId).catch(() => null);
  if (!myMem) return { daily: 0, atk: 0, def: 0, dropBonus: 0, travelDiscount: 0, xpBonus: 0 };
  const owned = await this.getSkills(myMem.clan_id);
  let daily = 0, atk = 0, def = 0, dropBonus = 0, travelDiscount = 0, xpBonus = 0;
  if (owned.has('gs_treasury1')) daily += 5;
  if (owned.has('gs_treasury2')) daily += 10;
  if (owned.has('gs_treasury3')) daily += 20;
  if (owned.has('gs_combat1')) atk += 5;
  if (owned.has('gs_combat2')) { atk += 10; def += 5; }
  if (owned.has('gs_combat3')) { atk += 20; def += 15; }
  if (owned.has('gs_explore1')) dropBonus += 10;
  if (owned.has('gs_explore2')) { dropBonus += 20; travelDiscount += 10; }
  if (owned.has('gs_explore3')) { dropBonus += 30; travelDiscount += 25; xpBonus += 5; }
  return { daily, atk, def, dropBonus, travelDiscount, xpBonus };
};

// Formatiert eine Clan-Kurz-Info für den Chat
function fmtClanBadge(clan, lvlInfo) {
  const lbl = lvlInfo?.current?.name || 'Neuling';
  return `[${clan.name}] ${lbl} | XP: ${clan.xp}`;
}

module.exports = { ClanManager, CLAN_LEVELS, clanLevelInfo, clanWars, CLAN_TASKS, todaysClanTask, fmtClanBadge, GUILD_SKILLS, guildTerritories };
