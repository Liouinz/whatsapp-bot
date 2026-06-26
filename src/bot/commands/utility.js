'use strict';

const { state } = require('../../core/connection');
const { mentionTag, fmtDate } = require('../util');
const pkg = require('../../../package.json');

/** Formatiert eine Dauer in ms als "Xd Yh Zm". */
function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

const ping = {
  name: 'ping',
  aliases: [],
  category: 'utility',
  description:
    'Testet, ob der Bot erreichbar ist und antwortet mit einer kurzen Latenz-Meldung. Nützlich um zu prüfen, ob der Bot gerade online ist oder reagiert.',
  usage: '!ping',
  keywords: ['test', 'online', 'erreichbar', 'latenz', 'pong', 'lebt'],
  access: 'all',
  scope: 'any',
  cooldownMs: 3000,
  async run(ctx) {
    const start = Date.now();
    const msgTs = Number(ctx.msg.messageTimestamp || 0) * 1000;
    const recv = msgTs ? `${Math.max(0, start - msgTs)} ms` : 'n/a';
    await ctx.reply(`🏓 *Pong!* Bot ist online.\n• Empfangs-Latenz: ${recv}\n• Verarbeitung: ${Date.now() - start} ms`);
  },
};

const info = {
  name: 'info',
  aliases: ['status'],
  category: 'utility',
  description:
    'Zeigt aktuelle Bot-Informationen: Laufzeit seit Start, Version, verbundene Gruppen, verarbeitete Befehle und ob der Spielmodus aktiv ist. Gibt einen schnellen Überblick über den Gesundheitszustand des Bots.',
  usage: '!info',
  keywords: ['status', 'laufzeit', 'uptime', 'version', 'gesundheit', 'übersicht'],
  access: 'all',
  scope: 'any',
  cooldownMs: 5000,
  async run(ctx) {
    let groups = '?';
    try {
      groups = (await ctx.storage.getAllGroups()).length;
    } catch (_) {
      /* ignore */
    }
    const lines = [
      '🤖 *CommunityBot*',
      `• Version: ${pkg.version}`,
      `• Status: ${state.connection === 'open' ? 'verbunden ✅' : state.connection}`,
      `• Laufzeit: ${fmtUptime(Date.now() - state.startedAt)}`,
      `• Gruppen: ${groups}`,
      `• Befehle verarbeitet: ${state.commandsProcessed}`,
      `• Präfix: ${ctx.prefix}`,
    ];
    await ctx.reply(lines.join('\n'));
  },
};

const id = {
  name: 'id',
  aliases: [],
  category: 'utility',
  description:
    'Gibt die interne WhatsApp-Gruppen-ID (JID) der aktuellen Gruppe aus. Diese ID wird für manche Admin-Aktionen und Konfigurationen benötigt.',
  usage: '!id',
  keywords: ['jid', 'gruppenid', 'chatid', 'identität'],
  access: 'all',
  scope: 'any',
  cooldownMs: 3000,
  async run(ctx) {
    if (ctx.isGroup) {
      await ctx.reply(`🆔 Gruppen-ID:\n\`\`\`${ctx.chatJid}\`\`\``);
    } else {
      await ctx.reply(`🆔 Chat-ID:\n\`\`\`${ctx.chatJid}\`\`\``);
    }
  },
};

const CATEGORY_LABELS = {
  utility: '🧰 Allgemein',
  moderation: '🛡️ Moderation',
  owner: '👑 Owner / Community',
  sonstige: '📦 Sonstige',
};

const hilfe = {
  name: 'hilfe',
  aliases: ['help', 'menu', 'befehle'],
  category: 'utility',
  description:
    'Zeigt alle verfügbaren Befehle des Bots in einer übersichtlichen Liste. Du kannst auch eine Frage stellen (z. B. "!hilfe wie banne ich jemanden"), dann sucht der Bot den passenden Befehl heraus.',
  usage: '!hilfe [Frage]',
  keywords: ['hilfe', 'help', 'menu', 'befehle', 'commands', 'kannst', 'übersicht'],
  access: 'all',
  scope: 'any',
  cooldownMs: 3000,
  async run(ctx) {
    // Mit Frage → intelligente Hilfe
    if (ctx.argText) {
      const matches = ctx.help.findCommands(ctx.argText, ctx.registry, 3);
      if (!matches.length) {
        return ctx.reply(`🤔 Dazu habe ich keinen passenden Befehl gefunden. Tippe *${ctx.prefix}hilfe* für die volle Liste.`);
      }
      let out = '💡 *Das passt vermutlich:*\n';
      for (const c of matches) {
        out += `\n• *${ctx.prefix}${c.name}* — ${c.description}\n  _${c.usage || ctx.prefix + c.name}_`;
      }
      return ctx.reply(out);
    }

    // Ohne Frage → Kategorie-Übersicht
    const cats = ctx.registry.byCategory();
    const order = ['utility', 'moderation', 'owner', 'sonstige'];
    let out = '📖 *Befehlsübersicht*\n';
    for (const cat of order) {
      const list = cats.get(cat);
      if (!list || !list.length) continue;
      out += `\n${CATEGORY_LABELS[cat] || cat}\n`;
      for (const c of list.sort((a, b) => a.name.localeCompare(b.name))) {
        out += `• *${ctx.prefix}${c.name}*\n`;
      }
    }
    out += `\n_Tipp: ${ctx.prefix}hilfe <Frage> findet den passenden Befehl._`;
    await ctx.reply(out.trim());
  },
};

const regeln = {
  name: 'regeln',
  aliases: ['rules'],
  category: 'utility',
  description:
    'Zeigt die vom Admin festgelegten Gruppenregeln an. Wurden noch keine Regeln gesetzt, erscheint ein entsprechender Hinweis. Admins können Regeln mit !setregeln festlegen.',
  usage: '!regeln',
  keywords: ['regeln', 'rules', 'gruppenregeln', 'verhalten'],
  access: 'all',
  scope: 'group',
  cooldownMs: 5000,
  async run(ctx) {
    const rules = ctx.groupConfig?.rules;
    if (!rules) return ctx.reply(`📜 Für diese Gruppe wurden noch keine Regeln festgelegt.\n_Admins: ${ctx.prefix}setregeln <Text>_`);
    await ctx.reply(`📜 *Gruppenregeln*\n\n${rules}`);
  },
};

const gruppe = {
  name: 'gruppe',
  aliases: ['group'],
  category: 'utility',
  description:
    'Zeigt Informationen zur aktuellen Gruppe: Name, Beschreibung, Mitgliederzahl, Admins und weitere Metadaten. Praktisch für einen schnellen Überblick über die Gruppe.',
  usage: '!gruppe',
  keywords: ['gruppe', 'group', 'info', 'mitglieder', 'beschreibung'],
  access: 'all',
  scope: 'group',
  cooldownMs: 5000,
  async run(ctx) {
    const meta = await ctx.permissions.getGroupMetadata(ctx.sock, ctx.groupJid);
    const admins = meta.participants.filter((p) => p.admin === 'admin' || p.admin === 'superadmin');
    const lines = [
      `👥 *${meta.subject || 'Gruppe'}*`,
      meta.desc ? `\n_${String(meta.desc).slice(0, 200)}_` : '',
      `\n• Mitglieder: ${meta.participants.length}`,
      `• Admins: ${admins.length}`,
      meta.creation ? `• Erstellt: ${fmtDate(meta.creation * 1000)}` : '',
    ].filter(Boolean);
    await ctx.reply(lines.join('\n'));
  },
};

const top = {
  name: 'top',
  aliases: [],
  category: 'utility',
  description:
    'Zeigt die aktivsten Mitglieder der Gruppe anhand ihrer Nachrichtenanzahl. Die Top 10 werden in einer Rangliste dargestellt. Aktivität wird über die Zeit seit dem letzten Reset gemessen.',
  usage: '!top',
  keywords: ['top', 'rangliste', 'aktivste', 'leaderboard', 'beste'],
  access: 'all',
  scope: 'group',
  cooldownMs: 10000,
  async run(ctx) {
    const list = await ctx.storage.getTopMembers(ctx.groupJid, 10);
    if (!list.length) return ctx.reply('Noch keine Aktivität erfasst. 📊');
    const medals = ['🥇', '🥈', '🥉'];
    const mentions = list.map((m) => `${m.num}@s.whatsapp.net`);
    let out = '🏆 *Aktivste Mitglieder*\n';
    list.forEach((m, i) => {
      out += `\n${medals[i] || `${i + 1}.`} ${mentionTag(m.num)} — ${m.messages} Nachrichten`;
    });
    await ctx.replyWithMentions(out, mentions);
  },
};

const stats = {
  name: 'stats',
  aliases: ['profil'],
  category: 'utility',
  description:
    'Zeigt Aktivitäts-Statistiken eines Mitglieds — Nachrichten, Warnungen, Mutes. Ohne Angabe werden deine eigenen Stats angezeigt. Durch Taggen eines anderen Nutzers siehst du dessen Profil.',
  usage: '!stats [@user]',
  keywords: ['stats', 'statistik', 'profil', 'aktivität', 'nachrichten'],
  access: 'all',
  scope: 'group',
  cooldownMs: 5000,
  async run(ctx) {
    const targetJid = ctx.target || ctx.sender;
    const num = ctx.permissions.numFromJid(targetJid);
    const st = await ctx.storage.getMemberStat(ctx.groupJid, num);
    const w = await ctx.storage.getWarnings(ctx.groupJid, targetJid);
    const muted = await ctx.storage.isMuted(ctx.groupJid, targetJid);
    const out = [
      `📊 *Statistik* für ${mentionTag(num)}`,
      `• Nachrichten: ${st.messages}`,
      `• Befehle: ${st.commands}`,
      `• Verwarnungen: ${w.count}`,
      `• Stumm: ${muted ? 'ja 🔇' : 'nein'}`,
      `• Zuletzt aktiv: ${fmtDate(st.lastSeen)}`,
    ].join('\n');
    await ctx.replyWithMentions(out, [targetJid]);
  },
};

const melden = {
  name: 'melden',
  aliases: ['report'],
  category: 'utility',
  description:
    'Sendet eine anonyme Meldung an die Admins der Gruppe. Nützlich für Regelbrüche oder Probleme, die diskret gemeldet werden sollen. Die Admins erhalten die Nachricht mit einem Zeitstempel.',
  usage: '!melden [Text]',
  keywords: ['melden', 'report', 'beschweren', 'anzeigen', 'problem'],
  access: 'all',
  scope: 'group',
  cooldownMs: 30000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Bitte beschreibe dein Anliegen.\n_${ctx.command.usage}_`);
    let groupName = ctx.groupJid;
    try {
      const meta = await ctx.permissions.getGroupMetadata(ctx.sock, ctx.groupJid);
      groupName = meta.subject || ctx.groupJid;
    } catch (_) {
      /* ignore */
    }
    await ctx.storage.addReport(ctx.groupJid, groupName, ctx.senderNum, ctx.argText);
    await ctx.reply('✅ Deine Meldung wurde anonym an die Admins weitergeleitet. Danke!');
  },
};

module.exports = [ping, info, id, hilfe, regeln, gruppe, top, stats, melden];
