'use strict';

/**
 * Intelligente Hilfe — Stufe 1 (kostenlos, ohne KI-API).
 * Matcht eine natürliche Frage gegen name + aliases + keywords + description
 * der registrierten Befehle und liefert die besten Treffer mit usage.
 *
 * Beispiel: "wie banne ich jemanden?" → !ban @user [Grund]
 * (Stufe 2 — echte KI-API — kann später ergänzt werden.)
 */

// häufige Füllwörter, die nichts zur Suche beitragen
const STOPWORDS = new Set([
  'wie', 'ich', 'man', 'kann', 'einen', 'eine', 'einem', 'der', 'die', 'das', 'den',
  'ein', 'und', 'oder', 'mit', 'für', 'fuer', 'von', 'wer', 'was', 'wo', 'bitte',
  'jemanden', 'jemand', 'mir', 'mich', 'du', 'er', 'es', 'zu', 'im', 'in', 'am',
  'macht', 'machen', 'tun', 'soll', 'will', 'gibt', 'mal', 'denn', 'the', 'a', 'to', 'how',
]);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function queryTokens(s) {
  return tokenize(s).filter((t) => !STOPWORDS.has(t));
}

/** Bewertet einen Befehl gegen die Such-Tokens. Höher = besserer Treffer. */
function scoreCommand(cmd, tokens) {
  if (!tokens.length) return 0;
  const name = cmd.name.toLowerCase();
  const aliasSet = (cmd.aliases || []).map((a) => a.toLowerCase());
  const keywords = (cmd.keywords || []).map((k) => k.toLowerCase());
  const descTokens = new Set(tokenize(cmd.description));

  let score = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    // Name
    if (name === t) score += 12;
    else if (name.includes(t) || (t.length >= 3 && t.includes(name) && name.length >= 3)) score += 5;
    // Aliase
    if (aliasSet.includes(t)) score += 9;
    else if (aliasSet.some((a) => a.includes(t) || t.includes(a))) score += 4;
    // Keywords
    if (keywords.includes(t)) score += 7;
    else if (keywords.some((k) => k.includes(t) || t.includes(k))) score += 4;
    // Beschreibung
    if (descTokens.has(t)) score += 2;
  }
  return score;
}

/** Liefert die besten passenden Befehle (max. `limit`). */
function findCommands(query, registry, limit = 3) {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  return registry
    .all()
    .map((cmd) => ({ cmd, score: scoreCommand(cmd, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.cmd);
}

module.exports = { findCommands, scoreCommand, queryTokens, tokenize };
