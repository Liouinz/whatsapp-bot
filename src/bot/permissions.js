'use strict';

const config = require('../core/config');
const logger = require('../core/logger');

/**
 * Rollen-Engine + Gruppen-Metadaten-Cache.
 *
 * Rollen-Hierarchie: owner > admin > mod > user.
 *  - owner: Nummer in OWNER_NUMBERS  ODER  Ersteller der Gruppe/Community.
 *  - admin: WhatsApp-Gruppen-Admin (aus gecachten Metadaten).
 *  - mod:   in groupConfig.mods eingetragene Nummer (optional).
 *  - user:  alle anderen.
 *
 * Metadaten werden ~5 Min gecacht (Anti-Ban: nicht bei jedem Befehl neu abfragen).
 */

const ROLE_RANK = { user: 0, mod: 1, admin: 2, owner: 3 };
const META_TTL = 5 * 60 * 1000;

const metaCache = new Map(); // jid -> { data, at }

/** Extrahiert die reine Nummer aus einer JID (entfernt Geräte-Suffix :NN und @domain). */
function numFromJid(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function getBotJid(sock) {
  return sock?.user?.id || null;
}

async function getGroupMetadata(sock, jid, force = false) {
  const cached = metaCache.get(jid);
  if (!force && cached && Date.now() - cached.at < META_TTL) return cached.data;
  const data = await sock.groupMetadata(jid);
  metaCache.set(jid, { data, at: Date.now() });
  return data;
}

function invalidateGroupMetadata(jid) {
  metaCache.delete(jid);
}

function isOwnerNumber(jid) {
  return config.ownerNumbers.includes(numFromJid(jid));
}

/** Findet einen Teilnehmer in den Metadaten anhand der Nummer. */
function findParticipant(meta, jid) {
  const num = numFromJid(jid);
  return (meta?.participants || []).find((p) => numFromJid(p.id) === num);
}

function isAdminFlag(p) {
  return !!p && (p.admin === 'admin' || p.admin === 'superadmin');
}

/**
 * Bestimmt die Rolle des Absenders.
 * ctx braucht: sock, sender, groupJid, isGroup, groupConfig (optional).
 */
async function resolveRole(ctx) {
  const { sock, sender, groupJid, isGroup } = ctx;

  if (isOwnerNumber(sender)) return 'owner';
  if (!isGroup || !groupJid) return 'user';

  try {
    const meta = await getGroupMetadata(sock, groupJid);
    // Community-/Gruppen-Ersteller gilt als owner
    if (meta?.owner && numFromJid(meta.owner) === numFromJid(sender)) return 'owner';
    const p = findParticipant(meta, sender);
    if (isAdminFlag(p)) return 'admin';
  } catch (e) {
    logger.warn({ err: e, groupJid }, 'resolveRole: Metadaten konnten nicht geladen werden');
  }

  const mods = ctx.groupConfig?.mods || [];
  if (mods.includes(numFromJid(sender))) return 'mod';

  return 'user';
}

function meetsAccess(role, required) {
  return ROLE_RANK[role] >= ROLE_RANK[required || 'user'];
}

/** Ist der Bot selbst Admin in der Gruppe? (für requiresBotAdmin) */
async function isBotGroupAdmin(sock, groupJid) {
  try {
    const meta = await getGroupMetadata(sock, groupJid);
    const p = findParticipant(meta, getBotJid(sock));
    return isAdminFlag(p);
  } catch (e) {
    logger.warn({ err: e, groupJid }, 'isBotGroupAdmin: Metadaten-Fehler');
    return false;
  }
}

module.exports = {
  ROLE_RANK,
  numFromJid,
  getBotJid,
  getGroupMetadata,
  invalidateGroupMetadata,
  isOwnerNumber,
  resolveRole,
  meetsAccess,
  isBotGroupAdmin,
};
