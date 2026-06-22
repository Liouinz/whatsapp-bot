/**
 * Moderation – automatische Erkennung von Beleidigungen, Links & Spam.
 * --------------------------------------------------------------------
 * - Beleidigungs-Filter: löscht die Nachricht, verwarnt die Person und schaltet
 *   sie nach mehreren Verstößen für eine Weile stumm ("Soft-Mute").
 * - Link-Filter: löscht Nachrichten mit Links und meldet das freundlich.
 * - Spam-/Flood-Schutz: zu viele oder identisch wiederholte Nachrichten.
 *
 * Pro Gruppe konfigurierbar über das übergebene `group.moderation`-Objekt:
 *   { badwords:boolean, links:boolean, warnLimit:number, extraBadwords:string[] }
 *
 * Wichtig: Zum Löschen von Nachrichten muss der Bot in der Gruppe ADMIN sein.
 * Ist er das nicht, schlägt das Löschen fehl und wird nur geloggt.
 * Soft-Mute bedeutet: Während der Mute-Zeit wird jede weitere Nachricht der
 * Person sofort wieder gelöscht (WhatsApp kennt kein echtes Stummschalten).
 *
 * Zustände (Verwarnungen, Mutes, Zähler) liegen im Arbeitsspeicher.
 */

// Starter-Liste an Beleidigungen. Pro Gruppe über das Textfeld auf der Webseite
// erweiterbar (group.moderation.extraBadwords).
const DEFAULT_BADWORDS = [
  'arschloch', 'hurensohn', 'hurensöhne', 'hure', 'fotze', 'wichser',
  'schlampe', 'nutte', 'missgeburt', 'spast', 'spasti', 'mongo', 'bastard',
  'schwuchtel', 'neger', 'nigger', 'fickdich', 'fick dich', 'verpiss dich',
  'fuck', 'fucker', 'motherfucker', 'bitch', 'asshole', 'cunt', 'faggot',
  'retard', 'nigga',
];

// Erkennt Links/URLs: http(s)://, www., WhatsApp-Einladungen und gängige TLDs.
const LINK_REGEX =
  /(https?:\/\/|www\.)\S+|\bchat\.whatsapp\.com\/\S+|\b[a-z0-9-]+\.(com|net|org|de|io|me|gg|xyz|info|link|to|app|co|ru|tv|shop|store)\b/i;

function findBadword(text, extraWords = []) {
  const lower = text.toLowerCase();
  const all = new Set([...DEFAULT_BADWORDS, ...extraWords.map((w) => w.toLowerCase())]);
  const singleWords = new Set();
  const phrases = [];
  for (const w of all) {
    if (w.includes(' ')) phrases.push(w);
    else singleWords.add(w);
  }
  for (const p of phrases) if (lower.includes(p)) return p;
  // In Wörter zerlegen (umlaut-bewusst), exakt vergleichen → keine Fehlalarme
  // wie "Klasse" → "ass".
  const tokens = lower.split(/[^a-zäöüß0-9]+/).filter(Boolean);
  for (const t of tokens) if (singleWords.has(t)) return t;
  return null;
}

function hasLink(text) {
  return LINK_REGEX.test(text);
}

function createModeration({ logger, botState }) {
  const warnings = new Map(); // senderJid -> { count, lastAt }
  const mutedUntil = new Map(); // senderJid -> timestamp
  const msgTimes = new Map(); // senderJid -> [timestamps]
  const lastMsg = new Map(); // senderJid -> { text, count }

  const MUTE_MS = 10 * 60 * 1000;
  const SPAM_LIMIT = 6;
  const SPAM_WINDOW_MS = 10 * 1000;
  const REPEAT_LIMIT = 4;

  function isMuted(jid) {
    const until = mutedUntil.get(jid);
    if (!until) return false;
    if (Date.now() >= until) {
      mutedUntil.delete(jid);
      return false;
    }
    return true;
  }
  function mute(jid, ms = MUTE_MS) {
    mutedUntil.set(jid, Date.now() + ms);
  }

  function findSpam(jid, text) {
    const now = Date.now();
    const times = (msgTimes.get(jid) || []).filter((t) => now - t < SPAM_WINDOW_MS);
    times.push(now);
    msgTimes.set(jid, times);
    if (times.length > SPAM_LIMIT) return 'flood';
    const trimmed = text.trim();
    if (trimmed) {
      const prev = lastMsg.get(jid);
      if (prev && prev.text === trimmed) {
        prev.count += 1;
        if (prev.count >= REPEAT_LIMIT) return 'repeat';
      } else {
        lastMsg.set(jid, { text: trimmed, count: 1 });
      }
    }
    return null;
  }

  async function deleteMessage(sock, remoteJid, msg) {
    try {
      await sock.sendMessage(remoteJid, { delete: msg.key });
      return true;
    } catch (err) {
      logger.warn({ err }, 'Konnte Nachricht nicht löschen – ist der Bot Admin?');
      return false;
    }
  }

  async function notify(sock, remoteJid, senderJid, text) {
    try {
      const number = senderJid.split('@')[0];
      await sock.sendMessage(remoteJid, { text: `@${number} ${text}`, mentions: [senderJid] });
    } catch (err) {
      logger.warn({ err }, 'Konnte Moderations-Hinweis nicht senden.');
    }
  }

  function recordAction(label) {
    botState.moderation.actionsTotal += 1;
    botState.moderation.lastAction = label;
    botState.moderation.lastActionAt = Date.now();
  }

  /**
   * Prüft EINE Nachricht. Gibt true zurück, wenn moderiert wurde (dann sollte
   * die Nachricht NICHT mehr als Befehl verarbeitet werden).
   */
  async function checkMessage({ sock, group, remoteJid, senderJid, text, msg, isAdmin }) {
    const mod = group.moderation || {};
    if (isAdmin) return false; // Admins werden nicht moderiert

    // Bereits stummgeschaltet -> jede weitere Nachricht entfernen
    if (isMuted(senderJid)) {
      await deleteMessage(sock, remoteJid, msg);
      return true;
    }

    // 1) Links
    if (mod.links && hasLink(text)) {
      await deleteMessage(sock, remoteJid, msg);
      recordAction(`Link von ${senderJid.split('@')[0]}`);
      await notify(sock, remoteJid, senderJid,
        'Tut mir leid, in dieser Gruppe sind keine Links erlaubt – deine Nachricht wurde entfernt. 🚫');
      return true;
    }

    // 2) Beleidigungen
    if (mod.badwords) {
      const badword = findBadword(text, mod.extraBadwords || []);
      if (badword) {
        await deleteMessage(sock, remoteJid, msg);
        const warnLimit = Number(mod.warnLimit) || 3;
        const w = warnings.get(senderJid) || { count: 0, lastAt: 0 };
        w.count += 1;
        w.lastAt = Date.now();
        warnings.set(senderJid, w);
        recordAction(`Beleidigung von ${senderJid.split('@')[0]}`);
        if (w.count >= warnLimit) {
          mute(senderJid);
          await notify(sock, remoteJid, senderJid,
            `du wurdest nach ${warnLimit} Verwarnungen für ${Math.round(MUTE_MS / 60000)} Minuten stummgeschaltet.`);
          warnings.delete(senderJid);
        } else {
          await notify(sock, remoteJid, senderJid,
            `bitte bleib freundlich. Verwarnung ${w.count}/${warnLimit}.`);
        }
        return true;
      }
    }

    // 3) Spam/Flood (greift, sobald Moderation für die Gruppe aktiv ist)
    if (mod.badwords || mod.links) {
      const spam = findSpam(senderJid, text);
      if (spam) {
        await deleteMessage(sock, remoteJid, msg);
        mute(senderJid);
        recordAction(`Spam (${spam}) von ${senderJid.split('@')[0]}`);
        await notify(sock, remoteJid, senderJid,
          `bitte nicht spammen. Du bist für ${Math.round(MUTE_MS / 60000)} Minuten stummgeschaltet.`);
        lastMsg.delete(senderJid);
        msgTimes.delete(senderJid);
        return true;
      }
    }

    return false;
  }

  // Aufräumen, damit die Maps nicht unbegrenzt wachsen
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [jid, until] of mutedUntil) if (until <= now) mutedUntil.delete(jid);
    for (const [jid, times] of msgTimes) {
      const recent = times.filter((t) => now - t < SPAM_WINDOW_MS);
      if (recent.length === 0) msgTimes.delete(jid);
      else msgTimes.set(jid, recent);
    }
    for (const [jid, w] of warnings) if (now - w.lastAt > 24 * 60 * 60 * 1000) warnings.delete(jid);
  }, 10 * 60 * 1000);
  cleanup.unref?.();

  return { checkMessage };
}

module.exports = { createModeration, findBadword, hasLink, DEFAULT_BADWORDS };
