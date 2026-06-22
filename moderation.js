/**
 * Moderation – automatische Erkennung von Beleidigungen & Spam
 * ------------------------------------------------------------
 * - Schimpfwort-/Beleidigungs-Filter: löscht die Nachricht, verwarnt die Person
 *   und schaltet sie nach mehreren Verstößen stumm.
 * - Spam-/Flood-Schutz: erkennt zu viele Nachrichten in kurzer Zeit sowie
 *   mehrfach hintereinander wiederholte (identische) Nachrichten.
 *
 * Wichtig zum "Stummschalten" (Mute):
 *   WhatsApp kennt KEIN echtes Stummschalten einzelner Personen. Dieser Bot
 *   setzt es um, indem er während der Mute-Zeit jede weitere Nachricht der
 *   Person sofort wieder löscht ("Soft-Mute").
 *
 * Wichtig zu den Rechten:
 *   Zum Löschen von Nachrichten und Entfernen von Mitgliedern muss der Bot in
 *   der jeweiligen Gruppe ADMIN sein. Ist er das nicht, werden die Aktionen
 *   übersprungen und nur im Log vermerkt.
 *
 * Admins werden standardmäßig NICHT automatisch moderiert (umschaltbar über
 * die Option moderateAdmins).
 *
 * Alle Zustände (Verwarnungen, Mutes, Zähler) liegen im Arbeitsspeicher und
 * gelten pro Prozess. Nach einem Neustart sind sie zurückgesetzt.
 */

function parseList(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Starter-Liste an Beleidigungen/Schimpfwörtern. Bewusst überschaubar gehalten –
// erweitere sie über die Env-Variable EXTRA_BADWORDS (kommagetrennt), z. B.:
//   EXTRA_BADWORDS=idiot,depp,vollpfosten
const DEFAULT_BADWORDS = [
  // Deutsch
  'arschloch', 'hurensohn', 'hurensöhne', 'hurentochter', 'hure', 'fotze',
  'wichser', 'schlampe', 'nutte', 'missgeburt', 'spast', 'spasti', 'mongo',
  'bastard', 'schwuchtel', 'neger', 'nigger', 'fickdich', 'fick dich',
  'verpiss dich',
  // Englisch (wird von Jugendlichen oft mit eingestreut)
  'fuck', 'fucker', 'motherfucker', 'bitch', 'asshole', 'cunt', 'faggot',
  'retard', 'nigga',
];

/**
 * Erstellt die Moderations-Instanz.
 *
 * @param {object}   deps
 * @param {object}   deps.logger   - pino-Logger
 * @param {object}   deps.botState - geteiltes Status-Objekt (für das Dashboard)
 * @param {object}   [deps.config] - Einstellungen (meist aus Env-Variablen)
 */
function createModeration({ logger, botState, config = {} }) {
  const state = { enabled: config.enabled !== false }; // standardmäßig AN

  const warnLimit = Number(config.warnLimit) || 3; // Verwarnungen bis zum Mute
  const muteDurationMs = Number(config.muteDurationMs) || 10 * 60 * 1000; // 10 Min
  const spamLimit = Number(config.spamLimit) || 6; // max. Nachrichten ...
  const spamWindowMs = Number(config.spamWindowMs) || 10 * 1000; // ... in diesem Fenster
  const repeatLimit = Number(config.repeatLimit) || 4; // gleiche Nachricht hintereinander
  const moderateAdmins = config.moderateAdmins === true; // Admins moderieren? Standard: nein

  // Wortlisten aufbereiten: einzelne Wörter vs. Mehr-Wort-Phrasen.
  const allWords = new Set([...DEFAULT_BADWORDS, ...parseList(config.extraBadwords)]);
  const singleWords = new Set();
  const phrases = [];
  for (const w of allWords) {
    if (w.includes(' ')) phrases.push(w);
    else singleWords.add(w);
  }

  // ---------- Zustand (im RAM) ----------
  const warnings = new Map(); // jid -> { count, lastAt }
  const mutedUntil = new Map(); // jid -> timestamp (ms)
  const msgTimes = new Map(); // jid -> [timestamps]  (für Flood-Erkennung)
  const lastMsg = new Map(); // jid -> { text, count } (für Wiederholungs-Erkennung)

  // ---------- Mute-Verwaltung ----------
  function isMuted(jid) {
    const until = mutedUntil.get(jid);
    if (!until) return false;
    if (Date.now() >= until) {
      mutedUntil.delete(jid);
      return false;
    }
    return true;
  }

  function mute(jid, ms = muteDurationMs) {
    mutedUntil.set(jid, Date.now() + ms);
  }

  function unmute(jid) {
    mutedUntil.delete(jid);
    warnings.delete(jid);
  }

  function getMutedCount() {
    let n = 0;
    const now = Date.now();
    for (const until of mutedUntil.values()) if (until > now) n += 1;
    return n;
  }

  function getWarnings(jid) {
    return warnings.get(jid)?.count || 0;
  }

  // ---------- Erkennung ----------
  function findBadword(text) {
    const lower = text.toLowerCase();
    for (const p of phrases) {
      if (lower.includes(p)) return p;
    }
    // In "Wörter" zerlegen (umlaut-bewusst), dann exakt vergleichen –
    // verhindert Fehlalarme wie "Klasse" → "ass".
    const tokens = lower.split(/[^a-zäöüß0-9]+/).filter(Boolean);
    for (const t of tokens) {
      if (singleWords.has(t)) return t;
    }
    return null;
  }

  function findSpam(jid, text) {
    const now = Date.now();

    // 1) Flood: zu viele Nachrichten im Zeitfenster
    const times = (msgTimes.get(jid) || []).filter((t) => now - t < spamWindowMs);
    times.push(now);
    msgTimes.set(jid, times);
    if (times.length > spamLimit) return 'flood';

    // 2) Wiederholung: dieselbe Nachricht mehrfach hintereinander
    const trimmed = text.trim();
    if (trimmed) {
      const prev = lastMsg.get(jid);
      if (prev && prev.text === trimmed) {
        prev.count += 1;
        if (prev.count >= repeatLimit) return 'repeat';
      } else {
        lastMsg.set(jid, { text: trimmed, count: 1 });
      }
    }
    return null;
  }

  // ---------- Aktionen ----------
  async function deleteMessage(sock, remoteJid, msg) {
    try {
      await sock.sendMessage(remoteJid, { delete: msg.key });
      return true;
    } catch (err) {
      logger.warn({ err }, 'Konnte Nachricht nicht löschen – ist der Bot in dieser Gruppe Admin?');
      return false;
    }
  }

  async function notify(sock, remoteJid, senderJid, text) {
    try {
      const number = senderJid.split('@')[0];
      await sock.sendMessage(remoteJid, {
        text: `@${number} ${text}`,
        mentions: [senderJid],
      });
    } catch (err) {
      logger.warn({ err }, 'Konnte Moderations-Hinweis nicht senden.');
    }
  }

  function recordAction(label) {
    botState.moderation.actionsTotal += 1;
    botState.moderation.lastAction = label;
    botState.moderation.lastActionAt = new Date().toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
    });
  }

  /**
   * Prüft EINE eingehende Nachricht und moderiert sie bei Bedarf.
   * @returns {Promise<boolean>} true, wenn die Nachricht moderiert wurde
   *          (gelöscht / gemutet). Dann sollte sie NICHT mehr als Befehl
   *          weiterverarbeitet werden.
   */
  async function checkMessage({ sock, remoteJid, senderJid, text, msg, isAdmin }) {
    if (!state.enabled) return false;
    if (isAdmin && !moderateAdmins) return false;

    // 1) Schon stummgeschaltet -> jede weitere Nachricht entfernen
    if (isMuted(senderJid)) {
      await deleteMessage(sock, remoteJid, msg);
      return true;
    }

    // 2) Schimpfwörter / Beleidigungen
    const badword = findBadword(text);
    if (badword) {
      await deleteMessage(sock, remoteJid, msg);

      const w = warnings.get(senderJid) || { count: 0, lastAt: 0 };
      w.count += 1;
      w.lastAt = Date.now();
      warnings.set(senderJid, w);

      recordAction(`Beleidigung von ${senderJid.split('@')[0]}`);
      logger.info(`Beleidigung erkannt von ${senderJid} ("${badword}"). Verwarnung ${w.count}/${warnLimit}.`);

      if (w.count >= warnLimit) {
        mute(senderJid);
        const min = Math.round(muteDurationMs / 60000);
        await notify(sock, remoteJid, senderJid,
          `du wurdest nach ${warnLimit} Verwarnungen für ${min} Minuten stummgeschaltet.`);
        warnings.delete(senderJid);
      } else {
        await notify(sock, remoteJid, senderJid,
          `bitte bleib freundlich. Verwarnung ${w.count}/${warnLimit}.`);
      }
      return true;
    }

    // 3) Spam / Flood
    const spam = findSpam(senderJid, text);
    if (spam) {
      await deleteMessage(sock, remoteJid, msg);
      mute(senderJid);
      const min = Math.round(muteDurationMs / 60000);

      recordAction(`Spam (${spam}) von ${senderJid.split('@')[0]}`);
      logger.info(`Spam erkannt (${spam}) von ${senderJid}. Stummgeschaltet für ${min} Min.`);
      await notify(sock, remoteJid, senderJid,
        `bitte nicht spammen. Du bist für ${min} Minuten stummgeschaltet.`);

      // Zähler zurücksetzen, damit die Erkennung sauber neu startet
      lastMsg.delete(senderJid);
      msgTimes.delete(senderJid);
      return true;
    }

    return false;
  }

  // ---------- Aufräumen (verhindert unbegrenztes Wachsen der Maps) ----------
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [jid, until] of mutedUntil) if (until <= now) mutedUntil.delete(jid);
    for (const [jid, times] of msgTimes) {
      const recent = times.filter((t) => now - t < spamWindowMs);
      if (recent.length === 0) msgTimes.delete(jid);
      else msgTimes.set(jid, recent);
    }
    // Alte Verwarnungen nach 24h vergessen
    for (const [jid, w] of warnings) if (now - w.lastAt > 24 * 60 * 60 * 1000) warnings.delete(jid);
  }, 10 * 60 * 1000);
  cleanupInterval.unref?.();

  // Anfangszustand fürs Dashboard spiegeln
  botState.moderation.enabled = state.enabled;

  return {
    checkMessage,
    isMuted,
    mute,
    unmute,
    getMutedCount,
    getWarnings,
    isEnabled: () => state.enabled,
    setEnabled: (v) => {
      state.enabled = Boolean(v);
      botState.moderation.enabled = state.enabled;
      logger.info(`Moderation ${state.enabled ? 'aktiviert' : 'deaktiviert'}.`);
    },
  };
}

module.exports = { createModeration, DEFAULT_BADWORDS };