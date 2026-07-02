// Permissions-Engine — LID-aware (WhatsApp-Umstellung 2025/2026).
// Kernproblem des alten Bots: In groupMetadata stehen heute @lid-IDs, der Bot
// verglich nur seine Telefonnummer-JID → "Bot ist Admin" wurde nie erkannt.
// Fix: IMMER Telefonnummer-JID UND LID normalisieren und BEIDE vergleichen.

import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { OWNER_NUMBERS } from './config.js';
import { state } from './state.js';
import { logError } from './logger.js';
import { dbRun } from './db.js';

const META_CACHE_MS = 60_000;
const metaCache = new Map(); // groupJid → { meta, at }

// LID ↔ Telefonnummer-Zuordnung, gelernt aus groupMetadata (für Owner-Check per LID)
const lidToPn = new Map();

/** JID/LID normalisieren: Geräte-Suffix (":12") weg, konsistente Form. */
export function normalizeId(id) {
  if (!id) return null;
  try {
    return jidNormalizedUser(id);
  } catch {
    return String(id).split(':')[0];
  }
}

/** Alle bekannten ID-Formen eines Gruppen-Teilnehmers (LID + PN), normalisiert. */
function participantIds(p) {
  return [p.id, p.lid, p.jid, p.phoneNumber].map(normalizeId).filter(Boolean);
}

/** groupMetadata mit kurzem Cache (schont Rate-Limits, reicht für Admin-Checks). */
export async function getGroupMeta(groupJid, force = false) {
  const cached = metaCache.get(groupJid);
  if (!force && cached && Date.now() - cached.at < META_CACHE_MS) return cached.meta;
  if (!state.sock) return cached?.meta || null;
  try {
    const meta = await state.sock.groupMetadata(groupJid);
    metaCache.set(groupJid, { meta, at: Date.now() });
    learnLidMappings(meta);
    return meta;
  } catch (err) {
    logError(err, 'groupMetadata');
    return cached?.meta || null;
  }
}

export function invalidateGroupMeta(groupJid) {
  metaCache.delete(groupJid);
}

/** LID→PN-Paare aus Metadaten lernen (und für Moderation in members ablegen). */
function learnLidMappings(meta) {
  if (!meta?.participants) return;
  for (const p of meta.participants) {
    const lid = normalizeId(p.lid || (String(p.id).endsWith('@lid') ? p.id : null));
    const pn = normalizeId(p.phoneNumber || p.jid || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : null));
    if (lid && pn) {
      lidToPn.set(lid, pn);
      dbRun(
        `INSERT INTO members (group_jid, user_jid, user_lid, last_seen) VALUES (?, ?, ?, ?)
         ON CONFLICT(group_jid, user_jid) DO UPDATE SET user_lid = excluded.user_lid, last_seen = excluded.last_seen`,
        [meta.id, pn, lid, Date.now()]
      ).catch(() => {});
    }
  }
}

/** LID in Telefonnummer-JID auflösen, wenn bekannt. */
export function resolveLid(id) {
  const n = normalizeId(id);
  if (n && n.endsWith('@lid')) return lidToPn.get(n) || n;
  return n;
}

/** Alle ID-Kandidaten des Absenders einer Nachricht (Gruppe: participant, DM: remoteJid). */
export function senderCandidates(msg) {
  const key = msg.key || {};
  const raw = [
    key.participant,
    key.participantPn,
    key.participantLid,
    key.senderPn,
    key.senderLid,
    key.remoteJid?.endsWith('@g.us') ? null : key.remoteJid,
  ];
  const out = new Set();
  for (const id of raw) {
    const n = normalizeId(id);
    if (!n) continue;
    out.add(n);
    const resolved = resolveLid(n);
    if (resolved) out.add(resolved);
  }
  return [...out];
}

/** Beste anzeigbare/adressierbare JID des Absenders (bevorzugt Telefonnummer-Form). */
export function senderJid(msg) {
  const candidates = senderCandidates(msg);
  return candidates.find((c) => c.endsWith('@s.whatsapp.net')) || candidates[0] || null;
}

/** Ist eine der Kandidaten-IDs ein Owner (OWNER_NUMBERS)? */
export function isOwner(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  return list.some((id) => {
    const resolved = resolveLid(id);
    if (!resolved) return false;
    const digits = String(resolved).split('@')[0].replace(/\D/g, '');
    return digits && OWNER_NUMBERS.includes(digits);
  });
}

/** Admin-Einträge (admin/superadmin) einer Gruppe als normalisierte ID-Liste. */
async function adminIdSet(groupJid) {
  const meta = await getGroupMeta(groupJid);
  const ids = new Set();
  if (!meta?.participants) return ids;
  for (const p of meta.participants) {
    if (p.admin === 'admin' || p.admin === 'superadmin') {
      for (const id of participantIds(p)) ids.add(id);
    }
  }
  return ids;
}

/** Ist der BOT Admin in der Gruppe? Prüft PN-JID UND LID (der eigentliche Fix). */
export async function botIsAdmin(groupJid) {
  const admins = await adminIdSet(groupJid);
  const own = [state.botJidPn, state.botJidLid].filter(Boolean);
  return own.some((id) => admins.has(id));
}

/** Ist der Nutzer (beliebige ID-Form) Admin in der Gruppe? Owner zählen immer als Admin. */
export async function isUserAdmin(groupJid, userIds) {
  const list = (Array.isArray(userIds) ? userIds : [userIds]).map(normalizeId).filter(Boolean);
  if (isOwner(list)) return true;
  const admins = await adminIdSet(groupJid);
  return list.some((id) => admins.has(id) || admins.has(resolveLid(id)));
}

/** Debug-Übersicht für !debugadmin. */
export async function adminDebugInfo(groupJid, senderIds) {
  const meta = await getGroupMeta(groupJid, true);
  const admins = await adminIdSet(groupJid);
  return {
    groupName: meta?.subject || '?',
    participantCount: meta?.participants?.length || 0,
    adminCount: meta?.participants?.filter((p) => p.admin).length || 0,
    botJidPn: state.botJidPn,
    botJidLid: state.botJidLid,
    botIsAdmin: [state.botJidPn, state.botJidLid].filter(Boolean).some((id) => admins.has(id)),
    senderIsAdmin: await isUserAdmin(groupJid, senderIds),
    senderIsOwner: isOwner(senderIds),
  };
}
