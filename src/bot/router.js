'use strict';

const config = require('../core/config');
const logger = require('../core/logger');
const storage = require('../core/storage');
const { state } = require('../core/connection');
const registry = require('./registry');
const permissions = require('./permissions');
const help = require('./help');

const PREFIX = config.commandPrefix;
const cooldowns = new Map(); // `${cmd}:${sender}` -> timestamp

// ---------------------------------------------------------------------------
// Nachrichten-Helfer
// ---------------------------------------------------------------------------

function getText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

/** Erkennt das Ziel eines Befehls aus Erwähnung oder zitierter Nachricht. */
function extractTarget(msg) {
  const ci =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo;
  const mentioned = ci?.mentionedJid?.[0];
  const quoted = ci?.participant;
  return mentioned || quoted || null;
}

// ---------------------------------------------------------------------------
// Intelligente Hilfe
// ---------------------------------------------------------------------------

function formatSuggestions(matches, intro) {
  let out = intro + '\n';
  for (const c of matches) {
    out += `\n• *${PREFIX}${c.name}* — ${c.description}\n  _${c.usage || PREFIX + c.name}_`;
  }
  return out;
}

function suggest(ctx, query) {
  const matches = help.findCommands(query, registry, 3);
  if (!matches.length) {
    return ctx.reply(`❓ Den Befehl kenne ich nicht. Tippe *${PREFIX}hilfe* für eine Übersicht.`);
  }
  return ctx.reply(formatSuggestions(matches, '❓ Meintest du vielleicht:'));
}

// ---------------------------------------------------------------------------
// Haupt-Pipeline
// ---------------------------------------------------------------------------

async function handleMessage(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe) return;
    const chatJid = msg.key.remoteJid;
    if (!chatJid || chatJid === 'status@broadcast') return;

    const text = getText(msg).trim();
    if (!text.startsWith(PREFIX)) return; // Router behandelt nur Befehle (Moderation = events.js, Phase 4)

    const body = text.slice(PREFIX.length).trim();
    if (!body) return;

    const parts = body.split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);
    const argText = body.slice(parts[0].length).trim();

    const isGroup = chatJid.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant || msg.participant : chatJid;
    const target = extractTarget(msg);

    const ctx = {
      sock,
      msg,
      prefix: PREFIX,
      chatJid,
      isGroup,
      groupJid: isGroup ? chatJid : null,
      sender,
      senderNum: permissions.numFromJid(sender),
      args,
      argText,
      body,
      target,
      targetNum: target ? permissions.numFromJid(target) : null,
      me: state.me,
      botJid: permissions.getBotJid(sock),
      registry,
      help,
      permissions,
      storage,
      logger,
      reply: (t, opts = {}) =>
        state.sendQueue.sendText(chatJid, t, {
          messageOptions: { quoted: msg, ...(opts.messageOptions || {}) },
          ...opts,
        }),
      replyWithMentions: (t, mentions) =>
        state.sendQueue.enqueue(chatJid, { text: t, mentions }, { messageOptions: { quoted: msg } }),
    };

    const cmd = registry.get(cmdName);
    if (!cmd) {
      // Unbekannter erster Token → intelligente Hilfe
      return suggest(ctx, body);
    }
    ctx.command = cmd;

    // --- Gruppen-Config laden (für aktiv/erlaubt + Rollen) ---
    let groupConfig = null;
    let group = null;
    if (isGroup) {
      group = await storage.getGroup(chatJid);
      groupConfig = group ? group.config : await storage.getGroupConfig(chatJid);
      ctx.groupConfig = groupConfig;
    }

    // --- scope ---
    if (cmd.scope === 'group' && !isGroup) {
      return ctx.reply('⚠️ Dieser Befehl funktioniert nur in Gruppen.');
    }
    if (cmd.scope === 'dm' && isGroup) {
      return ctx.reply('⚠️ Dieser Befehl funktioniert nur im privaten Chat mit dem Bot.');
    }

    // --- Rolle bestimmen ---
    const role = await permissions.resolveRole(ctx);
    ctx.role = role;

    // --- Gruppe aktiv? (inaktive Gruppe: nur owner darf, um wieder zu aktivieren) ---
    if (isGroup && group && group.active === false && role !== 'owner') {
      return; // still ignorieren
    }

    // --- Befehl in dieser Gruppe erlaubt + ggf. Rechte-Override ---
    let required = cmd.access || 'all';
    if (isGroup && groupConfig && groupConfig.commands && cmdName in groupConfig.commands) {
      const override = groupConfig.commands[cmdName];
      if (override === false) {
        return ctx.reply('🚫 Dieser Befehl ist in dieser Gruppe deaktiviert.');
      }
      if (override === 'all') required = 'all';
      else if (override === 'admin') required = 'admin';
    }
    // 'all' im Befehl entspricht Rang 'user'
    const requiredRole = required === 'all' ? 'user' : required;

    // --- Rechte-Check ---
    if (!permissions.meetsAccess(role, requiredRole)) {
      return ctx.reply(`🚫 Dafür fehlt dir die Berechtigung (nötig: *${requiredRole}*).`);
    }

    // --- requiresBotAdmin / requiresTarget ---
    if (cmd.requiresBotAdmin && isGroup) {
      const botAdmin = await permissions.isBotGroupAdmin(sock, chatJid);
      if (!botAdmin) return ctx.reply('⚠️ Dafür muss *der Bot* Gruppen-Admin sein.');
    }
    if (cmd.requiresTarget && !target) {
      return ctx.reply(`⚠️ Bitte markiere die Zielperson.\nBeispiel: _${cmd.usage || PREFIX + cmd.name}_`);
    }

    // --- Cooldown / Rate-Limit ---
    const cd = cmd.cooldownMs || 0;
    if (cd > 0 && role !== 'owner') {
      const key = `${cmd.name}:${sender}`;
      const last = cooldowns.get(key) || 0;
      const left = cd - (Date.now() - last);
      if (left > 0) {
        return ctx.reply(`⏳ Bitte warte noch ${Math.ceil(left / 1000)}s, bevor du *${PREFIX}${cmd.name}* erneut nutzt.`);
      }
      cooldowns.set(key, Date.now());
    }

    // --- Ausführen ---
    state.commandsProcessed += 1;
    if (isGroup) storage.bumpStat(chatJid, ctx.senderNum, { commands: 1 });

    await cmd.run(ctx);
  } catch (err) {
    logger.error({ err }, 'Router: Fehler bei der Befehlsverarbeitung');
    try {
      const chatJid = msg?.key?.remoteJid;
      if (chatJid) {
        state.sendQueue.sendText(chatJid, '❌ Ups, dabei ist ein Fehler aufgetreten. Bitte später erneut versuchen.', {
          messageOptions: { quoted: msg },
        });
      }
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = { handleMessage, getText, extractTarget, formatSuggestions };
