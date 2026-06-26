'use strict';

const { state } = require('../../core/connection');
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

module.exports = [ping, info, id, hilfe];
