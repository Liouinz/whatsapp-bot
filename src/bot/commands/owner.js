'use strict';

const { state } = require('../../core/connection');
const { mentionTag, fmtDate } = require('../util');

/**
 * Owner-/Community-Befehle (Phase 4).
 * Community-Bann gilt für alle Gruppen einer Community (Parent-JID). Die
 * Rejoin-Sperre in events.js entfernt gebannte Nummern beim Wiederbeitritt.
 */

function parentOf(meta, groupJid) {
  return meta?.linkedParent || meta?.parentJid || groupJid;
}

const communitykick = {
  name: 'communitykick',
  aliases: ['ckick', 'comban', 'communityban', 'nuke'],
  category: 'owner',
  description: '⚠️ Sperrt eine Person dauerhaft aus ALLEN Gruppen der Community. Diese Maßnahme ist nicht umkehrbar ohne !communityunban. Nur für den Community-Inhaber verfügbar — mit Bedacht einsetzen.',
  usage: '!communitykick @user [Grund]',
  keywords: ['communityban', 'nuke', 'dauerhaft', 'sperren', 'community', 'überall bannen'],
  access: 'owner', scope: 'group', requiresBotAdmin: true, requiresTarget: true, cooldownMs: 5000,
  async run(ctx) {
    const reason = ctx.argText.replace(/@\d+/g, '').trim() || null;
    const meta = await ctx.permissions.getGroupMetadata(ctx.sock, ctx.groupJid);
    const parent = parentOf(meta, ctx.groupJid);

    await ctx.storage.addCommunityBan(parent, ctx.targetNum, ctx.senderNum, reason);

    // Best-effort: aus allen bekannten Gruppen derselben Community entfernen
    let removed = 0;
    let groups = [];
    try {
      groups = await ctx.storage.getAllGroups();
    } catch (_) {
      /* ignore */
    }
    for (const g of groups) {
      try {
        const m = await ctx.permissions.getGroupMetadata(ctx.sock, g.jid);
        if (parentOf(m, g.jid) !== parent) continue;
        if (!m.participants.some((p) => ctx.permissions.numFromJid(p.id) === ctx.targetNum)) continue;
        await ctx.sock.groupParticipantsUpdate(g.jid, [ctx.target], 'remove').catch(() => {});
        await ctx.storage.addBanLog(g.jid, ctx.targetNum, ctx.senderNum, `community-kick${reason ? ': ' + reason : ''}`);
        removed += 1;
      } catch (_) {
        /* ignore einzelne Gruppe */
      }
    }
    await ctx.replyWithMentions(
      `☢️ ${mentionTag(ctx.target)} ist jetzt community-weit gesperrt (${removed} Gruppe(n) bereinigt)${reason ? ` — ${reason}` : ''}.`,
      [ctx.target]
    );
  },
};

const communityunban = {
  name: 'communityunban',
  aliases: ['cunban'],
  category: 'owner',
  description: 'Hebt einen Community-weiten Bann auf, sodass die Person wieder Gruppen beitreten kann. Der Eintrag wird aus dem Community-Ban-Log entfernt. Nur für den Inhaber verfügbar.',
  usage: '!communityunban @user',
  keywords: ['cunban', 'entsperren', 'community', 'aufheben', 'bann aufheben'],
  access: 'owner', scope: 'group', requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    const meta = await ctx.permissions.getGroupMetadata(ctx.sock, ctx.groupJid);
    const parent = parentOf(meta, ctx.groupJid);
    await ctx.storage.removeCommunityBan(parent, ctx.targetNum);
    await ctx.replyWithMentions(`✅ Community-Bann für ${mentionTag(ctx.target)} aufgehoben.`, [ctx.target]);
  },
};

const communitybanlist = {
  name: 'communitybanlist',
  aliases: ['cbanlist'],
  category: 'owner',
  description: 'Listet alle aktuell dauerhaft gebannten Personen der Community mit Grund und Datum. Nur für den Community-Inhaber einsehbar.',
  usage: '!communitybanlist',
  keywords: ['cbanlist', 'community', 'gebannte', 'liste', 'banliste'],
  access: 'owner', scope: 'group', cooldownMs: 5000,
  async run(ctx) {
    const meta = await ctx.permissions.getGroupMetadata(ctx.sock, ctx.groupJid);
    const parent = parentOf(meta, ctx.groupJid);
    const bans = await ctx.storage.getCommunityBans(parent);
    if (!bans.length) return ctx.reply('✅ Aktuell ist niemand community-weit gebannt.');
    let out = '☢️ *Community-Bannliste*\n';
    for (const b of bans) {
      out += `\n• +${b.num} — ${b.reason || 'kein Grund'} _(${fmtDate(b.at)})_`;
    }
    await ctx.reply(out);
  },
};

const broadcast = {
  name: 'broadcast',
  aliases: ['bc'],
  category: 'owner',
  description: 'Sendet eine Nachricht an alle Gruppen, die der Bot verwaltet. Läuft gedrosselt über die Sende-Queue, um Sperren zu vermeiden. Nur für den Inhaber.',
  usage: '!broadcast [Nachricht]',
  keywords: ['broadcast', 'rundnachricht', 'alle gruppen', 'verteilen', 'bc'],
  access: 'owner', scope: 'any', cooldownMs: 30000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Was soll ich broadcasten?\n_${ctx.command.usage}_`);
    const groups = (await ctx.storage.getAllGroups()).filter((g) => g.active !== false);
    if (!groups.length) return ctx.reply('Keine aktiven Gruppen gefunden.');
    const text = `📣 *Broadcast*\n\n${ctx.argText}`;
    for (const g of groups) {
      state.sendQueue.sendText(g.jid, text); // Queue drosselt automatisch (Anti-Ban)
    }
    await ctx.reply(`✅ Broadcast an ${groups.length} Gruppe(n) eingereiht.`);
  },
};

module.exports = [communitykick, communityunban, communitybanlist, broadcast];
