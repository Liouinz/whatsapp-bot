// Befehls-Router — verarbeitet messages.upsert.
// Auflösung: 1) fester Befehl → 2) Custom/FAQ → 3) KI-Fallback.
// Normale Nachrichten lösen NIE die KI aus (nur Moderation/XP/AFK/Spiele still).

import { PREFIX, config } from './config.js';
import { state, rolloverDay, bumpActivity } from './state.js';
import { dbRows, dbRun, bufferXp, bufferStat, xpToLevel } from './db.js';
import { replyTo, sendText } from './queue.js';
import { logError } from './logger.js';
import {
  senderCandidates, senderJid, isOwner, isUserAdmin, getGroupMeta, resolveLid,
} from './permissions.js';
import { checkAutoMod, getGroupSettings } from './moderation.js';
import { getAfk, clearAfk, fmtSince } from './commands/afk.js';
import { resolveCustom } from './commands/custom.js';
import { checkGameAnswer } from './commands/games.js';
import { unknownCommandReply } from './ai.js';

import { adminCommands } from './commands/admin.js';
import { communityCommands } from './commands/community.js';
import { levelCommands } from './commands/levels.js';
import { afkCommands } from './commands/afk.js';
import { customCommands } from './commands/custom.js';
import { scheduleCommands } from './commands/schedule.js';
import { toolCommands } from './commands/tools.js';
import { gameCommands } from './commands/games.js';

// ── Registry + Live-Toggles ────────────────────────────────────────

export const registry = [
  ...communityCommands,
  ...levelCommands,
  ...afkCommands,
  ...customCommands,
  ...scheduleCommands,
  ...toolCommands,
  ...gameCommands,
  ...adminCommands,
];

const byName = new Map();
for (const cmd of registry) {
  byName.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) byName.set(alias, cmd);
}

const toggles = new Map(); // name → enabled (live schaltbar übers Panel)

export async function loadToggles() {
  toggles.clear();
  for (const r of await dbRows('SELECT name, enabled FROM command_toggles', [])) {
    toggles.set(r.name, Number(r.enabled) === 1);
  }
}

export function isCommandEnabled(name) {
  return toggles.has(name) ? toggles.get(name) : true;
}

export async function setCommandEnabled(name, enabled) {
  toggles.set(name, !!enabled);
  await dbRun(
    `INSERT INTO command_toggles (name, enabled) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled`,
    [name, enabled ? 1 : 0]
  ).catch(() => {});
}

// ── Dedupe (LRU) + Sender-Rate-Limit ───────────────────────────────

const seenIds = new Set();
function isDuplicate(id) {
  if (!id) return false;
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  if (seenIds.size > config.messages.dedupeCacheSize) {
    seenIds.delete(seenIds.values().next().value);
  }
  return false;
}

const senderRate = new Map(); // sender → [Zeitstempel der Befehle]
function commandRateOk(sender) {
  const now = Date.now();
  const arr = (senderRate.get(sender) || []).filter((t) => now - t < config.messages.senderRateWindowMs);
  arr.push(now);
  senderRate.set(sender, arr);
  if (senderRate.size > 1000) senderRate.delete(senderRate.keys().next().value);
  return arr.length <= config.messages.senderRateLimit;
}

// ── Text-Extraktion ────────────────────────────────────────────────

function unwrap(message) {
  if (!message) return null;
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

export function extractText(msg) {
  const m = unwrap(msg.message);
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

function contextInfo(msg) {
  const m = unwrap(msg.message);
  if (!m) return null;
  for (const key of Object.keys(m)) {
    if (m[key] && typeof m[key] === 'object' && m[key].contextInfo) return m[key].contextInfo;
  }
  return null;
}

// ── XP (mit Cooldown, Level-Up-Erkennung) ──────────────────────────

const xpCooldown = new Map(); // group|user → letzter XP-Zeitpunkt
const xpTotals = new Map(); // group|user → bekannter XP-Stand (RAM)

async function grantXp(chatJid, userJid, name, settings) {
  const user = resolveLid(userJid);
  const key = `${chatJid}|${user}`;
  const now = Date.now();
  if (now - (xpCooldown.get(key) || 0) < config.xp.cooldownMs) return;
  xpCooldown.set(key, now);
  if (xpCooldown.size > 3000) xpCooldown.delete(xpCooldown.keys().next().value);

  if (!xpTotals.has(key)) {
    const rows = await dbRows('SELECT xp FROM xp WHERE group_jid = ? AND user_jid = ?', [chatJid, user]);
    xpTotals.set(key, rows.length ? Number(rows[0].xp) : 0);
  }
  const amount =
    config.xp.perMessageMin +
    Math.floor(Math.random() * (config.xp.perMessageMax - config.xp.perMessageMin + 1));
  const before = xpTotals.get(key);
  const after = before + amount;
  xpTotals.set(key, after);
  bufferXp(chatJid, user, amount, name);

  const oldLevel = xpToLevel(before);
  const newLevel = xpToLevel(after);
  if (newLevel > oldLevel && config.xp.levelUpAnnounce && Number(settings.levelup_announce)) {
    await dbRun(
      `INSERT INTO levels (group_jid, user_jid, level) VALUES (?, ?, ?)
       ON CONFLICT(group_jid, user_jid) DO UPDATE SET level = excluded.level`,
      [chatJid, user, newLevel]
    ).catch(() => {});
    await sendText(chatJid, `🎉 *Level-Up!* ${name || 'Jemand'} ist jetzt *Level ${newLevel}* ⭐`);
  }
}

// ── AFK-Erwähnungen (mit Anti-Spam-Cooldown) ───────────────────────

const afkNoticeCooldown = new Map(); // chat|afkUser → Zeitpunkt

async function notifyAfkMentions(msg, chatJid) {
  const ci = contextInfo(msg);
  const mentioned = [...(ci?.mentionedJid || [])];
  if (ci?.participant) mentioned.push(ci.participant); // zitierte Person
  if (!mentioned.length) return;

  const notified = new Set();
  for (const jid of mentioned.slice(0, 5)) {
    const afk = getAfk([jid]);
    if (!afk || notified.has(afk.user)) continue;
    notified.add(afk.user);
    const key = `${chatJid}|${afk.user}`;
    if (Date.now() - (afkNoticeCooldown.get(key) || 0) < 2 * 60_000) continue;
    afkNoticeCooldown.set(key, Date.now());
    await replyTo(msg, `💤 Diese Person ist gerade *AFK* (seit ${fmtSince(afk.since)}): _${afk.reason}_`);
  }
}

// ── Ziel-Nutzer-Ermittlung für Admin-Befehle ───────────────────────

function findTarget(msg, args) {
  const ci = contextInfo(msg);
  const mentioned = ci?.mentionedJid?.[0];
  if (mentioned) return resolveLid(mentioned);
  if (ci?.participant) return resolveLid(ci.participant); // Antwort auf Nachricht
  const num = (args || []).find((a) => /^\+?\d{6,17}$/.test(a.replace(/[@\s-]/g, '')));
  if (num) return `${num.replace(/\D/g, '')}@s.whatsapp.net`;
  return null;
}

// ── Haupteinstieg ──────────────────────────────────────────────────

/** Für messages.upsert registrieren. Ein Fehler hier darf NIE den Bot crashen. */
export async function handleUpsert({ messages, type }) {
  if (type !== 'notify') return; // 'append' & Co. ignorieren (Dedupe-Regel)
  for (const msg of messages || []) {
    try {
      await handleMessage(msg);
    } catch (err) {
      logError(err, 'router');
    }
  }
}

async function handleMessage(msg) {
  if (!msg?.message || msg.key?.fromMe) return;
  if (isDuplicate(msg.key?.id)) return;

  const chatJid = msg.key.remoteJid;
  if (!chatJid || chatJid === 'status@broadcast') return;
  const isGroup = chatJid.endsWith('@g.us');

  const senderIds = senderCandidates(msg);
  const sender = senderJid(msg);
  if (!sender) return;
  const senderName = msg.pushName || `+${String(resolveLid(sender)).split('@')[0]}`;
  const text = extractText(msg);

  rolloverDay();
  bumpActivity();
  bufferStat('messages');

  // DMs: nur Owner (Panel/Owner-Steuerung) — alles andere still ignorieren
  if (!isGroup && !isOwner(senderIds)) return;

  const settings = isGroup ? await getGroupSettings(chatJid) : { enabled: 1, levelup_announce: 0 };
  if (isGroup && !Number(settings.enabled)) return; // Gruppe im Panel deaktiviert

  // 1) AFK: eigener Beitrag hebt AFK auf
  const wasAfk = await clearAfk(senderIds);
  if (wasAfk && isGroup) {
    await replyTo(msg, `👋 Willkommen zurück, *${senderName}*! Dein AFK-Status (seit ${fmtSince(wasAfk.since)}) ist aufgehoben.`);
  }

  // 2) Auto-Moderation (nur Gruppen)
  if (isGroup) {
    const mod = await checkAutoMod(msg, chatJid, senderIds, text);
    if (mod) {
      if (mod.kind === 'muted') return; // Nachricht gelöscht, still bleiben
      let info = `⚠️ *${senderName}*, das war nicht ok: ${modReason(mod.kind)}.`;
      if (mod.warned) {
        info += ` (Verwarnung ${mod.warned.count}/${config.moderation.warnLimitKick})`;
        if (mod.warned.action === 'mute') info += `\n🔇 Limit erreicht → *${config.moderation.muteMinutesDefault} Min stumm*.`;
        if (mod.warned.action === 'kick') info += '\n👢 Limit erreicht → *aus der Gruppe entfernt*.';
      }
      await sendText(chatJid, info);
      return;
    }
  }

  // 3) AFK-Erwähnungen melden
  if (isGroup && !text.startsWith(PREFIX)) {
    await notifyAfkMentions(msg, chatJid);
  }

  // 4) Kein Befehl → Spiele-Antworten prüfen, XP vergeben, fertig (keine KI!)
  if (!text.startsWith(PREFIX)) {
    if (isGroup) {
      const ctxLite = makeCtx(msg, chatJid, isGroup, senderIds, sender, senderName, text, []);
      const consumed = await checkGameAnswer(ctxLite);
      if (!consumed && text.length >= config.xp.minMessageLength) {
        await grantXp(chatJid, sender, senderName, settings);
      }
    }
    return;
  }

  // 5) Befehl parsen
  const parts = text.slice(PREFIX.length).trim().split(/\s+/);
  const name = (parts[0] || '').toLowerCase();
  if (!name) return;
  const args = parts.slice(1);

  if (!commandRateOk(resolveLid(sender))) return; // Flut still drosseln

  const ctx = makeCtx(msg, chatJid, isGroup, senderIds, sender, senderName, text, args);
  const command = byName.get(name);

  // 5a) Fester Befehl
  if (command) {
    if (!isCommandEnabled(command.name)) {
      return ctx.reply('ℹ️ Dieser Befehl ist gerade deaktiviert.');
    }
    if (command.groupOnly && !isGroup) {
      return ctx.reply('⚠️ Dieser Befehl funktioniert nur in Gruppen.');
    }
    if (command.ownerOnly && !ctx.isOwner) {
      return ctx.reply('⛔ Diesen Befehl darf nur der Bot-Owner nutzen.');
    }
    if (command.adminOnly && !(await ctx.isAdmin())) {
      return ctx.reply('⛔ Dafür brauchst du Admin-Rechte in dieser Gruppe.');
    }
    rolloverDay();
    state.commandsToday++;
    bufferStat('commands');
    try {
      await command.run(ctx);
    } catch (err) {
      logError(err, `cmd:${command.name}`);
      await ctx.reply('⚠️ Uups, da ist etwas schiefgelaufen — bitte versuch es gleich nochmal.');
    }
    return;
  }

  // 5b) Custom-Command / FAQ (VOR der KI)
  const custom = resolveCustom(name);
  if (custom) {
    state.commandsToday++;
    bufferStat('commands');
    return ctx.reply(custom);
  }

  // 5c) KI-Fallback — NUR hier
  const known = registry.filter((c) => !c.hidden).map((c) => c.name);
  const ai = await unknownCommandReply(resolveLid(sender), text, known);
  if (ai?.text) {
    return ctx.reply(`🤖 ${ai.text}\n\n_Alle echten Befehle: ${PREFIX}hilfe_`);
  }
  if (ai?.blocked === 'cooldown') {
    return ctx.reply('ℹ️ Langsam! Bitte warte einen Moment, bevor du mich wieder etwas Unbekanntes fragst.');
  }
  return ctx.reply(`ℹ️ Den Befehl \`${PREFIX}${name}\` kenne ich nicht. Alle Befehle: \`${PREFIX}hilfe\``);
}

function modReason(kind) {
  return {
    link: 'Links sind hier nicht erlaubt',
    word: 'dieses Wort ist hier nicht erlaubt',
    spam: 'bitte keine Nachrichten-Flut',
  }[kind] || 'Regelverstoß';
}

// ── Kontext-Objekt für Befehls-Handler ─────────────────────────────

function makeCtx(msg, chatJid, isGroup, senderIds, sender, senderName, text, args) {
  const owner = isOwner(senderIds);
  return {
    msg, chatJid, isGroup, senderIds, sender, senderName, text, args,
    argText: args.join(' '),
    registry,
    isOwner: owner,
    reply: (t, mentions) => replyTo(msg, t, mentions),
    mentionTag: (jid) => `@${String(resolveLid(jid)).split('@')[0]}`,
    targetUser: () => findTarget(msg, args),
    // Nur echte Mention-Tokens (@12345…) entfernen — "!warn @x Grund 2" behält die "2"
    argTextWithoutMentions: () =>
      args.filter((a) => !/^@\d{5,}$/.test(a)).join(' ').trim(),
    isAdmin: async () => (owner ? true : isGroup ? isUserAdmin(chatJid, senderIds) : false),
    groupMeta: () => (isGroup ? getGroupMeta(chatJid) : null),
  };
}
