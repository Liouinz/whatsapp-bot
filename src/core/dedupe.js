'use strict';

/**
 * dedupe.js — Nachrichten-Dedupe (Recherche-Block 6).
 *
 * Stolperstein-Bezug (Plan): WhatsApp liefert Nachrichten teils mehrfach.
 * Ohne Dedupe → doppelte Verwarnungen/XP. Lösung: LRU-Set der letzten
 * ~1000 Nachrichten-IDs.
 *
 * Implementierung als Map (erhält Einfügereihenfolge): ältester Eintrag
 * fliegt raus, sobald die Kapazität überschritten ist.
 */

const MAX = 1000;
const seen = new Map();

/** Wurde diese Nachrichten-ID kürzlich schon verarbeitet? */
function recentlyProcessed(id) {
  if (!id) return false;
  return seen.has(id);
}

/** Markiert eine Nachrichten-ID als verarbeitet (mit LRU-Begrenzung). */
function markProcessed(id) {
  if (!id) return;
  if (seen.has(id)) return;
  seen.set(id, Date.now());
  if (seen.size > MAX) {
    const oldest = seen.keys().next().value;
    seen.delete(oldest);
  }
}

module.exports = { recentlyProcessed, markProcessed, MAX };
