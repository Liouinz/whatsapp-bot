'use strict';

/**
 * identity.js — LID/PN-sichere Identität (Recherche-Block 3).
 *
 * Stolperstein-Bezug (Plan): Admin-Erkennung war kaputt, weil nur die PN
 * verglichen wurde, WhatsApp aber teils LIDs liefert. Fix: intern mit der
 * gelieferten ID arbeiten und sowohl PN als auch LID berücksichtigen.
 *
 * getGroupMetaCached liegt bewusst hier (statt erst in der Send-Queue),
 * weil botIsAdmin/userIsAdmin es brauchen. Cache ~5 Min (Plan, DB-Robustheit).
 */

const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const { logger } = require('./logger');

// Gruppen-Metadaten ~5 Min cachen (RAM/0.1-CPU schonen).
const metaCache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

/** Bare-Nummer/Localpart einer JID (ohne Server, ohne Device-Suffix). */
const bare = (jid) => {
  try {
    return jidNormalizedUser(jid || '').split('@')[0];
  } catch {
    return String(jid || '').split('@')[0].split(':')[0];
  }
};

/** Holt Gruppen-Metadaten aus dem Cache oder frisch vom Socket. */
async function getGroupMetaCached(sock, g) {
  try {
    const hit = metaCache.get(g);
    if (hit) return hit;
    const meta = await sock.groupMetadata(g);
    if (meta) metaCache.set(g, meta);
    return meta || { participants: [] };
  } catch (e) {
    logger.warn(`getGroupMetaCached fehlgeschlagen: ${e.message}`);
    // Letzter bekannter Stand, sonst leeres Gerüst → nie crashen.
    return metaCache.get(g) || { participants: [] };
  }
}

/** Cache für eine Gruppe verwerfen (z. B. nach promote/demote/join/leave). */
function invalidateGroupMeta(g) {
  try {
    metaCache.del(g);
  } catch {
    /* ignore */
  }
}

/** Ist diese JID der Bot selbst? Prüft PN UND LID. */
function isSelf(sock, jid) {
  const b = bare(jid);
  return b === bare(sock.user?.id) || (!!sock.user?.lid && b === bare(sock.user.lid));
}

/** Ist der Bot in dieser Gruppe Admin? (LID/PN-sicher) */
async function botIsAdmin(sock, g) {
  const m = await getGroupMetaCached(sock, g);
  const me = m.participants.find((p) => isSelf(sock, p.id));
  return !!me && (me.admin === 'admin' || me.admin === 'superadmin');
}

/** Ist Nutzer u in Gruppe g Admin? (LID/PN-sicher) */
async function userIsAdmin(sock, g, u) {
  const m = await getGroupMetaCached(sock, g);
  const x = m.participants.find((p) => bare(p.id) === bare(u));
  return !!x && (x.admin === 'admin' || x.admin === 'superadmin');
}

/** Zielnutzer eines Befehls bestimmen: Mention zuerst, sonst Reply-Autor. */
function getTarget(ctx) {
  const ci = ctx?.msg?.message?.extendedTextMessage?.contextInfo;
  if (ci?.mentionedJid?.length) return ci.mentionedJid[0];
  if (ci?.participant) return ci.participant;
  return null;
}

module.exports = {
  bare,
  isSelf,
  botIsAdmin,
  userIsAdmin,
  getTarget,
  getGroupMetaCached,
  invalidateGroupMeta,
};
