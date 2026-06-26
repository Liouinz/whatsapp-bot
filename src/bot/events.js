'use strict';

const config = require('../core/config');
const logger = require('../core/logger');
const storage = require('../core/storage');
const permissions = require('./permissions');
const moderation = require('./moderation');
const router = require('./router');
const { state } = require('../core/connection');
const { numFromJid } = require('./util');

/**
 * Event-Verarbeitung (Phase 4) — "liest mit":
 *  - messages.upsert: Soft-Mute durchsetzen → Stats zählen → Befehl (Router)
 *    ODER Auto-Moderation (bei Nicht-Befehlen).
 *  - group-participants.update: Rejoin-Sperre (community-gebannt) → Welcome
 *    (+ optionale Captcha-Verifizierung mit Auto-Kick).
 */

const PREFIX = config.commandPrefix;

// Offene Verifizierungen: key `${group} ${user}` -> { code, timer }
const pendingVerify = new Map();
const vKey = (g, u) => `${g} ${u}`;

function getText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

function parentOf(meta, groupJid) {
  return meta?.linkedParent || meta?.parentJid || groupJid;
}

// ---------------------------------------------------------------------------
// Eingehende Nachrichten
// ---------------------------------------------------------------------------

async function handleUpsert(sock, { messages, type }) {
  if (type !== 'notify') return;
  for (const msg of messages) {
    handleMessage(sock, msg).catch((err) => logger.error({ err }, 'events.handleMessage Fehler'));
  }
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;
  const chatJid = msg.key.remoteJid;
  if (!chatJid || chatJid === 'status@broadcast') return;

  const isGroup = chatJid.endsWith('@g.us');
  const text = getText(msg);

  // --- DMs: nur Befehle (Router); DM-Assistent optional später ---
  if (!isGroup) {
    return router.handleMessage(sock, msg);
  }

  const sender = msg.key.participant || msg.participant;
  if (!sender) return;
  const senderNum = numFromJid(sender);

  // Gruppe sicherstellen + aktiv prüfen
  let group;
  try {
    await storage.ensureGroup(chatJid);
    group = await storage.getGroup(chatJid);
  } catch (e) {
    logger.error({ err: e }, 'events: getGroup fehlgeschlagen');
  }
  if (group && group.active === false) return; // Bot in dieser Gruppe aus

  // Verifizierungs-Antwort? (neuer Nutzer schickt den Code)
  if (pendingVerify.has(vKey(chatJid, sender))) {
    const v = pendingVerify.get(vKey(chatJid, sender));
    if (text && text.trim() === v.code) {
      clearTimeout(v.timer);
      pendingVerify.delete(vKey(chatJid, sender));
      state.sendQueue.enqueue(chatJid, { text: `✅ Danke @${senderNum}, du bist verifiziert!`, mentions: [sender] });
      return;
    }
  }

  // "Liest mit": Aktivität zählen
  storage.bumpStat(chatJid, senderNum, { messages: 1 });

  const groupConfig = group ? group.config : undefined;

  // Soft-Mute zuerst durchsetzen (gilt auch für Befehle)
  if (await moderation.enforceMute({ sock, msg, groupJid: chatJid, sender })) return;

  // Befehl? → Router. Sonst → Slowmode + Auto-Moderation.
  if (text.trim().startsWith(PREFIX)) {
    return router.handleMessage(sock, msg);
  }

  const slowSec = groupConfig?.moderation?.slowmode || 0;
  if (slowSec > 0) {
    try {
      if (await moderation.enforceSlowmode({ sock, msg, groupJid: chatJid, sender, slowSec })) return;
    } catch (e) {
      logger.error({ err: e }, 'events: slowmode Fehler');
    }
  }

  if (groupConfig?.moderation) {
    try {
      await moderation.moderate({ sock, msg, groupJid: chatJid, sender, senderNum, text, groupConfig });
    } catch (e) {
      logger.error({ err: e }, 'events: moderate Fehler');
    }
  }
}

// ---------------------------------------------------------------------------
// Teilnehmer-Änderungen (Beitritt/Austritt)
// ---------------------------------------------------------------------------

async function handleParticipants(sock, update) {
  const { id: groupJid, participants, action } = update;
  // Metadaten-Cache invalidieren (Teilnehmer haben sich geändert)
  permissions.invalidateGroupMetadata(groupJid);

  if (action !== 'add' || !participants?.length) return;

  let group, meta;
  try {
    group = await storage.getGroup(groupJid);
    if (group && group.active === false) return;
    meta = await permissions.getGroupMetadata(sock, groupJid, true);
  } catch (e) {
    logger.warn({ err: e }, 'events: Beitritt — Metadaten/Gruppe nicht ladbar');
  }
  const cfg = group?.config || (await storage.getGroupConfig(groupJid));
  const parent = parentOf(meta, groupJid);

  for (const userJid of participants) {
    const num = numFromJid(userJid);

    // --- Rejoin-Sperre: community-gebannte Nummer sofort entfernen ---
    try {
      if (await storage.isCommunityBanned(parent, num)) {
        await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove').catch(() => {});
        logger.info({ groupJid, num }, 'Rejoin-Sperre: community-gebannten Nutzer entfernt');
        continue;
      }
    } catch (e) {
      logger.warn({ err: e }, 'events: Rejoin-Check fehlgeschlagen');
    }

    // --- Welcome ---
    const welcome = cfg?.welcome || {};
    if (welcome.enabled) {
      const tmpl = welcome.message || 'Willkommen @{user}! Schön, dass du da bist. 👋';
      const textOut = tmpl.replace(/@?\{user\}/g, `@${num}`).replace(/\{name\}/g, `@${num}`);
      state.sendQueue.enqueue(groupJid, { text: textOut, mentions: [userJid] });

      // --- Optionale Captcha-Verifizierung ---
      if (welcome.verify) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const minutes = Number(welcome.verifyTimeoutMin) > 0 ? Number(welcome.verifyTimeoutMin) : 5;
        state.sendQueue.enqueue(groupJid, {
          text: `🔐 @${num}, bitte schreibe innerhalb von ${minutes} Min den Code *${code}*, sonst wirst du automatisch entfernt.`,
          mentions: [userJid],
        });
        const timer = setTimeout(async () => {
          if (pendingVerify.has(vKey(groupJid, userJid))) {
            pendingVerify.delete(vKey(groupJid, userJid));
            try {
              if (await permissions.isBotGroupAdmin(sock, groupJid)) {
                await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove').catch(() => {});
                state.sendQueue.enqueue(groupJid, { text: `⏱️ @${num} wurde nicht rechtzeitig verifiziert und entfernt.`, mentions: [userJid] });
              }
            } catch (e) {
              logger.warn({ err: e }, 'Verify-Timeout-Kick fehlgeschlagen');
            }
          }
        }, minutes * 60 * 1000);
        if (timer.unref) timer.unref();
        pendingVerify.set(vKey(groupJid, userJid), { code, timer });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Registrierung an den Socket
// ---------------------------------------------------------------------------

function attach(sock) {
  sock.ev.on('messages.upsert', (u) => handleUpsert(sock, u));
  sock.ev.on('group-participants.update', (u) =>
    handleParticipants(sock, u).catch((err) => logger.error({ err }, 'handleParticipants Fehler'))
  );
}

module.exports = { attach, handleUpsert, handleParticipants };
