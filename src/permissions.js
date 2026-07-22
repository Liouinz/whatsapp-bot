// Permissions-Engine — LID-aware (WhatsApp-Umstellung 2025/2026).
// Kernproblem des alten Bots: In groupMetadata stehen heute @lid-IDs, der Bot
// verglich nur seine Telefonnummer-JID → "Bot ist Admin" wurde nie erkannt.
// Fix: IMMER Telefonnummer-JID UND LID normalisieren und BEIDE vergleichen.

import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { OWNER_NUMBERS, BOT_OWNER_NUMBERS } from './config.js';
import { state } from './state.js';
import { logError } from './logger.js';
import { dbRun } from './db.js';

// Bot-Owner-Nummern: BOT_OWNER_NUMBERS, sonst Rückfall auf OWNER_NUMBERS.
const EFFECTIVE_BOT_OWNERS = BOT_OWNER_NUMBERS.length ? BOT_OWNER_NUMBERS : OWNER_NUMBERS;

// Rollen-Stufen (aufsteigend). Höhere Rolle schließt niedrigere Rechte ein.
// Leicht erweiterbar: neue Stufe hier + Prüf-Funktion ergänzen.
export const ROLE = { USER: 1, GROUP_ADMIN: 2, COMMUNITY_OWNER: 3, BOT_OWNER: 4 };
export const ROLE_LABEL = {
  1: '👤 Nutzer', 2: '👮 Gruppen-Admin', 3: '🌐 Community-Owner', 4: '👑 Bot-Owner',
};

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
// Bereits persistierte Zuordnungen — verhindert die frühere Schreib-Lawine:
// pro Metadata-Refresh ging sonst EIN Turso-Write PRO Mitglied raus (bei großen
// Gruppen hunderte Writes pro Minute), obwohl sich fast nie etwas ändert.
const persistedMappings = new Set(); // "groupJid|lid|pn"

function learnLidMappings(meta) {
  if (!meta?.participants) return;
  for (const p of meta.participants) {
    const lid = normalizeId(p.lid || (String(p.id).endsWith('@lid') ? p.id : null));
    const pn = normalizeId(p.phoneNumber || p.jid || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : null));
    if (lid && pn) {
      lidToPn.set(lid, pn);
      const key = `${meta.id}|${lid}|${pn}`;
      if (persistedMappings.has(key)) continue;
      persistedMappings.add(key);
      if (persistedMappings.size > 20_000) persistedMappings.clear();
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

function digitsOf(id) {
  const resolved = resolveLid(id);
  return resolved ? String(resolved).split('@')[0].replace(/\D/g, '') : '';
}

/** Ist eine der Kandidaten-IDs der BOT-OWNER (höchste Rolle)? */
export function isBotOwner(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  return list.some((id) => {
    const d = digitsOf(id);
    return d && EFFECTIVE_BOT_OWNERS.includes(d);
  });
}

/** Ist eine der Kandidaten-IDs ein Community-Owner? Bot-Owner zählt immer mit. */
export function isOwner(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  if (isBotOwner(list)) return true; // höhere Rolle schließt Community-Owner ein
  return list.some((id) => {
    const d = digitsOf(id);
    return d && OWNER_NUMBERS.includes(d);
  });
}

/** Höchste Rolle eines Absenders (BOT_OWNER > COMMUNITY_OWNER > GROUP_ADMIN > USER). */
export async function getRoleLevel(groupJid, senderIds, isGroup) {
  if (isBotOwner(senderIds)) return ROLE.BOT_OWNER;
  if (isOwner(senderIds)) return ROLE.COMMUNITY_OWNER;
  if (isGroup && (await isUserAdmin(groupJid, senderIds))) return ROLE.GROUP_ADMIN;
  return ROLE.USER;
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

/**
 * Wie botIsAdmin, aber aus bereits vorhandener Metadata (z. B. groupFetchAllParticipating) —
 * spart pro Gruppe einen zusätzlichen groupMetadata-Aufruf. Lernt nebenbei LID-Mappings.
 */
export function botIsAdminInMeta(meta) {
  if (!meta?.participants) return false;
  learnLidMappings(meta);
  const own = [state.botJidPn, state.botJidLid].filter(Boolean);
  for (const p of meta.participants) {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;
    if (participantIds(p).some((id) => own.includes(id))) return true;
  }
  return false;
}

/** Ist das Ziel geschützt (Owner, Gruppen-Admin oder der Bot selbst)? Für kick/ban/mute/warn. */
export async function isProtectedTarget(groupJid, userJid) {
  const ids = [normalizeId(userJid), resolveLid(userJid)].filter(Boolean);
  if (!ids.length) return false;
  const own = [state.botJidPn, state.botJidLid].filter(Boolean);
  if (ids.some((id) => own.includes(id))) return true; // der Bot selbst
  return isUserAdmin(groupJid, ids); // deckt Owner + Admins ab
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
