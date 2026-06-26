'use strict';

/** Gemeinsame Helfer für Befehle, Moderation und Events. */

const DOMAIN = '@s.whatsapp.net';

function jidFromNum(num) {
  return `${String(num).replace(/\D/g, '')}${DOMAIN}`;
}

function numFromJid(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

/** "@49150" Mention-Token für eine JID/Nummer. */
function mentionTag(jidOrNum) {
  return `@${numFromJid(jidOrNum)}`;
}

/**
 * Parst eine Dauer-Angabe wie "30m", "2h", "90s", "1d".
 * Gibt Millisekunden zurück oder null bei ungültiger Eingabe.
 */
function parseDuration(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+)\s*(s|sek|sec|m|min|h|std|hour|d|tag|day)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] || 'm').toLowerCase();
  const factor =
    unit.startsWith('s') ? 1000 :
    unit.startsWith('h') || unit === 'std' ? 3600_000 :
    unit.startsWith('d') || unit === 'tag' || unit === 'day' ? 86400_000 :
    60_000; // m / min / default
  return n * factor;
}

/** Formatiert eine Dauer in ms grob lesbar ("2h 5m", "45s", "3d"). */
function fmtDuration(ms) {
  if (ms <= 0) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ' ' + (h % 24) + 'h' : ''}`;
}

function fmtDate(ts) {
  if (!ts) return '–';
  try {
    return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return new Date(ts).toISOString();
  }
}

/** Ziel-JID eines Befehls bestimmen (Erwähnung > zitiert > erstes Nummern-Argument). */
function resolveTarget(ctx) {
  if (ctx.target) return ctx.target;
  const first = (ctx.args || [])[0];
  if (first && /\d{6,}/.test(first)) return jidFromNum(first);
  return null;
}

module.exports = {
  jidFromNum,
  numFromJid,
  mentionTag,
  parseDuration,
  fmtDuration,
  fmtDate,
  resolveTarget,
};
