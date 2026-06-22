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
 * Persistente Warnungen: createModeration erhält optionale Callbacks
 *   loadWarn(groupJid) → { warnings:{jid:{count,lastAt}}, mutedUntil:{jid:timestamp} }
 *   saveWarn(groupJid, data) → void
 * damit Verwarnungen und Mutes Neustarts überleben.
 */

const DEFAULT_BADWORDS = [
  'arschloch', 'hurensohn', 'hurensöhne', 'hure', 'fotze', 'wichser',
  'schlampe', 'nutte', 'missgeburt', 'spast', 'spasti', 'mongo', 'bastard',
  'schwuchtel', 'neger', 'nigger', 'fickdich', 'fick dich', 'verpiss dich',
  'fuck', 'fucker', 'motherfucker', 'bitch', 'asshole', 'cunt', 'faggot',
  'retard', 'nigga',
];

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
  const tokens = lower.split(/[^a-zäöüß0-9]+/).filter(Boolean);
  for (const t of tokens) if (singleWords.has(t)) return t;
  return null;
}

function hasLink(text) {
  return LINK_REGEX.test(text);
}

function createModeration({ logger, botState, loadWarn, saveWarn }) {
  const MUTE_MS = 10 * 60 * 1000;
  const SPAM_LIMIT = 6;
  const SPAM_WINDOW_MS = 10 * 1000;
  const REPEAT_LIMIT = 4;

  // Per-Gruppe Cache: groupJid -> { warnings, mutedUntil, msgTimes, lastMsg }
  const groupCache = new Map();

  function getState(groupJid) {
    if (!groupCache.has(groupJid)) {
      const saved = (loadWarn && loadWarn(groupJid)) || {};
      groupCache.set(groupJid, {
        warnings: new Map(Object.entries(saved.warnings || {})),
        mutedUntil: new Map(
          Object.entries(saved.mutedUntil || {}).map(([k, v]) => [k, Number(v)])
        ),
        msgTimes: new Map(),
        lastMsg: new Map(),
      });
    }
    return groupCache.get(groupJid);
  }

  function flush(groupJid) {
    if (!saveWarn) return;
    const s = groupCache.get(groupJid);
    if (!s) return;
    saveWarn(groupJid, {
      warnings: Object.fromEntries(s.warnings),
      mutedUntil: Object.fromEntries(
        [...s.mutedUntil.entries()].filter(([, t]) => t > Date.now())
      ),
    });
  }

  function isMuted(groupJid, jid) {
    const { mutedUntil } = getState(groupJid);
    const until = mutedUntil.get(jid);
    if (!until) return false;
    if (Date.now() >= until) {
      mutedUntil.delete(jid);
      return false;
    }
    return true;
  }

  function mute(groupJid, jid, ms = MUTE_MS) {
    const { mutedUntil } = getState(groupJid);
    mutedUntil.set(jid, Date.now() + ms);
    flush(groupJid);
  }

  function findSpam(groupJid, jid, text) {
    const state = getState(groupJid);
    const now = Date.now();
    const times = (state.msgTimes.get(jid) || []).filter((t) => now - t < SPAM_WINDOW_MS);
    times.push(now);
    state.msgTimes.set(jid, times);
    if (times.length > SPAM_LIMIT) return 'flood';
    const trimmed = text.trim();
    if (trimmed) {
      const prev = state.lastMsg.get(jid);
      if (prev && prev.text === trimmed) {
        prev.count += 1;
        if (prev.count >= REPEAT_LIMIT) return 'repeat';
      } else {
        state.lastMsg.set(jid, { text: trimmed, count: 1 });
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

  async function checkMessage({ sock, group, remoteJid, senderJid, text, msg, isAdmin }) {
    const mod = group.moderation || {};
    if (isAdmin) return false;

    if (isMuted(remoteJid, senderJid)) {
      await deleteMessage(sock, remoteJid, msg);
      return true;
    }

    if (mod.links && hasLink(text)) {
      await deleteMessage(sock, remoteJid, msg);
      recordAction(`Link von ${senderJid.split('@')[0]}`);
      await notify(sock, remoteJid, senderJid,
        'Tut mir leid, in dieser Gruppe sind keine Links erlaubt – deine Nachricht wurde entfernt. 🚫');
      return true;
    }

    if (mod.badwords) {
      const badword = findBadword(text, mod.extraBadwords || []);
      if (badword) {
        await deleteMessage(sock, remoteJid, msg);
        const warnLimit = Number(mod.warnLimit) || 3;
        const state = getState(remoteJid);
        const w = state.warnings.get(senderJid) || { count: 0, lastAt: 0 };
        w.count += 1;
        w.lastAt = Date.now();
        state.warnings.set(senderJid, w);
        recordAction(`Beleidigung von ${senderJid.split('@')[0]}`);
        if (w.count >= warnLimit) {
          mute(remoteJid, senderJid);
          state.warnings.delete(senderJid);
          flush(remoteJid);
          await notify(sock, remoteJid, senderJid,
            `du wurdest nach ${warnLimit} Verwarnungen für ${Math.round(MUTE_MS / 60000)} Minuten stummgeschaltet.`);
        } else {
          flush(remoteJid);
          await notify(sock, remoteJid, senderJid,
            `bitte bleib freundlich. Verwarnung ${w.count}/${warnLimit}.`);
        }
        return true;
      }
    }

    if (mod.badwords || mod.links) {
      const spam = findSpam(remoteJid, senderJid, text);
      if (spam) {
        await deleteMessage(sock, remoteJid, msg);
        mute(remoteJid, senderJid);
        recordAction(`Spam (${spam}) von ${senderJid.split('@')[0]}`);
        await notify(sock, remoteJid, senderJid,
          `bitte nicht spammen. Du bist für ${Math.round(MUTE_MS / 60000)} Minuten stummgeschaltet.`);
        const state = getState(remoteJid);
        state.lastMsg.delete(senderJid);
        state.msgTimes.delete(senderJid);
        return true;
      }
    }

    return false;
  }

  // Aufräumen, damit die Maps nicht unbegrenzt wachsen
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [groupJid, state] of groupCache) {
      let changed = false;
      for (const [jid, until] of state.mutedUntil) {
        if (until <= now) { state.mutedUntil.delete(jid); changed = true; }
      }
      for (const [jid, times] of state.msgTimes) {
        const recent = times.filter((t) => now - t < SPAM_WINDOW_MS);
        if (recent.length === 0) state.msgTimes.delete(jid);
        else state.msgTimes.set(jid, recent);
      }
      for (const [jid, w] of state.warnings) {
        if (now - w.lastAt > 24 * 60 * 60 * 1000) { state.warnings.delete(jid); changed = true; }
      }
      if (changed) flush(groupJid);
    }
  }, 10 * 60 * 1000);
  cleanup.unref?.();

  return { checkMessage };
}

module.exports = { createModeration, findBadword, hasLink, DEFAULT_BADWORDS };
