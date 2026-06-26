'use strict';

const { state } = require('../../core/connection');
const { parseDuration, fmtDuration, fmtDate, mentionTag } = require('../util');

/**
 * Moderations-Befehle (Admin), Phase 4 — echte Logik.
 * Alle ausgehenden Nachrichten laufen über ctx.reply / die Sende-Queue (Anti-Ban).
 */

// Rate-Limit für Massen-Tagging (Anti-Ban): 1×/10 Min pro Gruppe.
const TAG_COOLDOWN = 10 * 60 * 1000;
const lastTagAll = new Map(); // groupJid -> ts

function tagAllAllowed(groupJid) {
  const last = lastTagAll.get(groupJid) || 0;
  const left = TAG_COOLDOWN - (Date.now() - last);
  return left <= 0 ? 0 : left;
}

async function getMeta(ctx) {
  return ctx.permissions.getGroupMetadata(ctx.sock, ctx.groupJid);
}

// ---------------------------------------------------------------------------

const sag = {
  name: 'sag', aliases: ['echo'], category: 'moderation',
  description: 'Lässt den Bot den angegebenen Text in der Gruppe wiederholen. Nützlich für Ankündigungen oder Durchsagen, die vom Bot-Account kommen sollen.',
  usage: '!sag [Text]', keywords: ['echo', 'wiederholen', 'sagen', 'durchsage'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Was soll ich sagen?\n_${ctx.command.usage}_`);
    await state.sendQueue.sendText(ctx.chatJid, ctx.argText);
  },
};

const kick = {
  name: 'kick', aliases: [], category: 'moderation',
  description: 'Entfernt das getaggte Mitglied sofort aus der Gruppe. Der Nutzer kann über den Gruppenlink wieder beitreten. Für permanente Ausschlüsse nutze !ban.',
  usage: '!kick @user', keywords: ['kicken', 'rauswerfen', 'entfernen', 'werfen', 'rausschmeißen'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    await ctx.sock.groupParticipantsUpdate(ctx.groupJid, [ctx.target], 'remove');
    await ctx.replyWithMentions(`👋 ${mentionTag(ctx.target)} wurde entfernt.`, [ctx.target]);
  },
};

const ban = {
  name: 'ban', aliases: [], category: 'moderation',
  description: 'Kickt das Mitglied und trägt es ins Ban-Log der Gruppe ein. Der Grund wird gespeichert und ist für Admins einsehbar. Das Ban-Log hilft bei der Nachverfolgung von Moderationsmaßnahmen.',
  usage: '!ban @user [Grund]', keywords: ['bannen', 'sperren', 'verbannen', 'rauswerfen', 'permanent', 'ausschließen'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    const reason = ctx.argText.replace(/@\d+/g, '').trim() || null;
    await ctx.sock.groupParticipantsUpdate(ctx.groupJid, [ctx.target], 'remove');
    await ctx.storage.addBanLog(ctx.groupJid, ctx.targetNum, ctx.senderNum, reason);
    await ctx.replyWithMentions(`🚫 ${mentionTag(ctx.target)} wurde gebannt${reason ? ` (${reason})` : ''}.`, [ctx.target]);
  },
};

const mute = {
  name: 'mute', aliases: [], category: 'moderation',
  description: 'Schaltet ein Mitglied für den angegebenen Zeitraum stumm — der Nutzer kann keine Nachrichten mehr senden. Nach Ablauf der Dauer wird der Mute automatisch aufgehoben. Ohne Zeitangabe gilt der Mute unbegrenzt.',
  usage: '!mute @user [Dauer]', keywords: ['stummschalten', 'stumm', 'muten', 'schweigen', 'ruhig'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    const durArg = ctx.args.find((a) => /^\d+\s*[a-z]*$/i.test(a) && !/@/.test(a));
    const ms = durArg ? parseDuration(durArg) : null;
    const until = ms ? Date.now() + ms : Date.now() + 365 * 24 * 3600 * 1000; // "unbegrenzt"
    await ctx.storage.setMute(ctx.groupJid, ctx.target, until);
    await ctx.replyWithMentions(
      `🔇 ${mentionTag(ctx.target)} ist jetzt stumm${ms ? ` für ${fmtDuration(ms)}` : ''}.`,
      [ctx.target]
    );
  },
};

const unmute = {
  name: 'unmute', aliases: [], category: 'moderation',
  description: 'Hebt die Stummschaltung eines Mitglieds sofort auf. Der Nutzer kann danach wieder normal in der Gruppe schreiben.',
  usage: '!unmute @user', keywords: ['entstummen', 'stumm', 'aufheben', 'unmute', 'reden'],
  access: 'admin', scope: 'group', requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    await ctx.storage.removeMute(ctx.groupJid, ctx.target);
    await ctx.replyWithMentions(`🔊 ${mentionTag(ctx.target)} kann wieder schreiben.`, [ctx.target]);
  },
};

const warn = {
  name: 'warn', aliases: [], category: 'moderation',
  description: 'Verwarnt ein Mitglied manuell und trägt die Warnung ins Log ein. Nach einer konfigurierbaren Anzahl von Warnungen kann automatisch ein Kick erfolgen. Der Grund wird gespeichert.',
  usage: '!warn @user [Grund]', keywords: ['verwarnen', 'warnen', 'warnung', 'ermahnen', 'verwarnung'],
  access: 'admin', scope: 'group', requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    const reason = ctx.argText.replace(/@\d+/g, '').trim() || 'kein Grund angegeben';
    const count = await ctx.storage.addWarning(ctx.groupJid, ctx.target, reason);
    ctx.storage.bumpStat(ctx.groupJid, ctx.targetNum, { warnings: 1 });
    const limit = ctx.groupConfig?.moderation?.warnLimit || 3;
    await ctx.replyWithMentions(`⚠️ ${mentionTag(ctx.target)} verwarnt (*${count}/${limit}*) — ${reason}.`, [ctx.target]);
  },
};

const unwarn = {
  name: 'unwarn', aliases: [], category: 'moderation',
  description: 'Nimmt die letzte Verwarnung eines Mitglieds zurück. Nützlich, wenn eine Verwarnung versehentlich oder zu Unrecht ausgesprochen wurde.',
  usage: '!unwarn @user', keywords: ['entwarnen', 'verwarnung', 'zurücknehmen', 'aufheben', 'warnung'],
  access: 'admin', scope: 'group', requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    const count = await ctx.storage.removeWarning(ctx.groupJid, ctx.target);
    await ctx.replyWithMentions(`✅ Letzte Verwarnung von ${mentionTag(ctx.target)} entfernt (jetzt ${count}).`, [ctx.target]);
  },
};

const clearwarn = {
  name: 'clearwarn', aliases: [], category: 'moderation',
  description: 'Löscht alle Verwarnungen eines Mitglieds auf einmal. Sinnvoll nach einer längeren Zeit guten Verhaltens oder nach einem Gespräch mit dem betreffenden Nutzer.',
  usage: '!clearwarn @user', keywords: ['warnungen', 'löschen', 'zurücksetzen', 'clear'],
  access: 'admin', scope: 'group', requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    await ctx.storage.clearWarnings(ctx.groupJid, ctx.target);
    await ctx.replyWithMentions(`🧹 Alle Verwarnungen von ${mentionTag(ctx.target)} gelöscht.`, [ctx.target]);
  },
};

const warninfo = {
  name: 'warninfo', aliases: [], category: 'moderation',
  description: 'Zeigt den aktuellen Verwarnungsstand eines Mitglieds: Anzahl der Warnungen, Gründe und Zeitstempel. Hilft Admins bei der Entscheidung über weitere Maßnahmen.',
  usage: '!warninfo @user', keywords: ['warnungen', 'verwarnungen', 'info', 'stand'],
  access: 'admin', scope: 'group', requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    const w = await ctx.storage.getWarnings(ctx.groupJid, ctx.target);
    if (!w.count) return ctx.replyWithMentions(`✅ ${mentionTag(ctx.target)} hat keine Verwarnungen.`, [ctx.target]);
    let out = `📋 Verwarnungen für ${mentionTag(ctx.target)}: *${w.count}*\n`;
    w.reasons.slice(-5).forEach((r, i) => (out += `\n${i + 1}. ${r.reason} _(${fmtDate(r.at)})_`));
    await ctx.replyWithMentions(out, [ctx.target]);
  },
};

const warnlist = {
  name: 'warnlist', aliases: [], category: 'moderation',
  description: 'Listet alle aktuell verwarnten Mitglieder der Gruppe mit Anzahl und letztem Grund. Gibt einen schnellen Überblick über den Moderationsstand.',
  usage: '!warnlist', keywords: ['warnungen', 'liste', 'verwarnte', 'übersicht'],
  access: 'admin', scope: 'group', cooldownMs: 5000,
  async run(ctx) {
    const list = await ctx.storage.getAllWarnings(ctx.groupJid);
    if (!list.length) return ctx.reply('✅ Aktuell ist niemand verwarnt.');
    const mentions = list.map((w) => w.userJid);
    let out = '📋 *Verwarnte Mitglieder*\n';
    for (const w of list) {
      const last = w.reasons[w.reasons.length - 1]?.reason || '–';
      out += `\n• ${mentionTag(w.userJid)} — *${w.count}* (${last})`;
    }
    await ctx.replyWithMentions(out, mentions);
  },
};

const promote = {
  name: 'promote', aliases: [], category: 'moderation',
  description: 'Befördert ein Mitglied zum Gruppen-Admin. Der Nutzer erhält damit alle Admin-Rechte in der Gruppe. Erfordert, dass der Bot selbst Admin-Rechte hat.',
  usage: '!promote @user', keywords: ['befördern', 'admin', 'ernennen', 'promote'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    await ctx.sock.groupParticipantsUpdate(ctx.groupJid, [ctx.target], 'promote');
    await ctx.replyWithMentions(`⬆️ ${mentionTag(ctx.target)} ist jetzt Admin.`, [ctx.target]);
  },
};

const demote = {
  name: 'demote', aliases: [], category: 'moderation',
  description: 'Entzieht einem Admin die Admin-Rechte und stuft ihn auf normales Mitglied zurück. Der Nutzer verliert danach alle Moderationsrechte.',
  usage: '!demote @admin', keywords: ['degradieren', 'admin', 'entziehen', 'demote', 'zurückstufen'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, requiresTarget: true, cooldownMs: 3000,
  async run(ctx) {
    await ctx.sock.groupParticipantsUpdate(ctx.groupJid, [ctx.target], 'demote');
    await ctx.replyWithMentions(`⬇️ ${mentionTag(ctx.target)} ist kein Admin mehr.`, [ctx.target]);
  },
};

const link = {
  name: 'link', aliases: [], category: 'moderation',
  description: 'Ruft den aktuellen Einladungslink der Gruppe ab und sendet ihn in den Chat. Nützlich, um neue Mitglieder einzuladen, ohne Kontaktdaten teilen zu müssen.',
  usage: '!link', keywords: ['einladungslink', 'invite', 'gruppenlink', 'beitreten'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 5000,
  async run(ctx) {
    const code = await ctx.sock.groupInviteCode(ctx.groupJid);
    await ctx.reply(`🔗 Einladungslink:\nhttps://chat.whatsapp.com/${code}`);
  },
};

const revoke = {
  name: 'revoke', aliases: [], category: 'moderation',
  description: 'Widerruft den aktuellen Einladungslink und erstellt sofort einen neuen. Alte Links funktionieren danach nicht mehr — sinnvoll wenn ein Link unerwünscht geteilt wurde.',
  usage: '!revoke', keywords: ['link', 'widerrufen', 'zurücksetzen', 'neuer link'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 10000,
  async run(ctx) {
    const code = await ctx.sock.groupRevokeInvite(ctx.groupJid);
    await ctx.reply(`♻️ Neuer Einladungslink:\nhttps://chat.whatsapp.com/${code}`);
  },
};

const announce = {
  name: 'announce', aliases: [], category: 'moderation',
  description: 'Markiert alle Mitglieder und sendet eine formatierte Ankündigung. Ideal für wichtige Informationen, die garantiert jeder sehen soll.',
  usage: '!announce [Nachricht]', keywords: ['ankündigung', 'durchsage', 'wichtig', 'announcement'],
  access: 'admin', scope: 'group', cooldownMs: 5000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Was soll ich ankündigen?\n_${ctx.command.usage}_`);
    const left = tagAllAllowed(ctx.groupJid);
    if (left > 0) return ctx.reply(`⏳ Massen-Tagging ist gedrosselt. Bitte noch ${fmtDuration(left)} warten.`);
    const meta = await getMeta(ctx);
    const mentions = meta.participants.map((p) => p.id);
    lastTagAll.set(ctx.groupJid, Date.now());
    await ctx.replyWithMentions(`📢 *Ankündigung*\n\n${ctx.argText}`, mentions);
  },
};

const alle = {
  name: 'alle', aliases: ['tagall'], category: 'moderation',
  description: 'Markiert alle Mitglieder der Gruppe und sendet optional eine Nachricht. Sehr nützlich für wichtige Ankündigungen. Bitte sparsam einsetzen, um Mitglieder nicht zu stören.',
  usage: '!alle [Nachricht]', keywords: ['tagall', 'alle markieren', 'jeder', 'erwähnen'],
  access: 'owner', scope: 'group', cooldownMs: 5000,
  async run(ctx) {
    const left = tagAllAllowed(ctx.groupJid);
    if (left > 0) return ctx.reply(`⏳ *!alle* ist gedrosselt (Anti-Ban). Bitte noch ${fmtDuration(left)} warten.`);
    const meta = await getMeta(ctx);
    const mentions = meta.participants.map((p) => p.id);
    lastTagAll.set(ctx.groupJid, Date.now());
    const head = ctx.argText ? `${ctx.argText}\n\n` : '📣 ';
    await ctx.replyWithMentions(head + meta.participants.map((p) => mentionTag(p.id)).join(' '), mentions);
  },
};

const admins = {
  name: 'admins', aliases: [], category: 'moderation',
  description: 'Markiert alle Admins der Gruppe in einer Nachricht. Nützlich, wenn du die Aufmerksamkeit aller Moderatoren benötigst.',
  usage: '!admins', keywords: ['admins', 'moderatoren', 'mods', 'rufen'],
  access: 'all', scope: 'group', cooldownMs: 10000,
  async run(ctx) {
    const meta = await getMeta(ctx);
    const adm = meta.participants.filter((p) => p.admin === 'admin' || p.admin === 'superadmin');
    if (!adm.length) return ctx.reply('Diese Gruppe hat keine Admins. 🤔');
    const mentions = adm.map((p) => p.id);
    await ctx.replyWithMentions('🛡️ *Admins:*\n' + adm.map((p) => mentionTag(p.id)).join(' '), mentions);
  },
};

const pin = {
  name: 'pin', aliases: [], category: 'moderation',
  description: 'Pinnt die zitierte Nachricht in der Gruppe an. Gepinnte Nachrichten sind für alle Mitglieder jederzeit einsehbar. Maximal eine Nachricht kann gleichzeitig angepinnt sein.',
  usage: '!pin (als Antwort auf eine Nachricht)', keywords: ['pinnen', 'anpinnen', 'fixieren', 'pin'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    if (!ctx.quotedKey) return ctx.reply('⚠️ Bitte antworte auf die Nachricht, die ich anpinnen soll.');
    try {
      await ctx.sock.sendMessage(ctx.groupJid, { pin: ctx.quotedKey, type: 1, time: 7 * 24 * 3600 });
      await ctx.reply('📌 Nachricht angepinnt.');
    } catch (e) {
      ctx.logger.warn({ err: e }, 'pin nicht unterstützt');
      await ctx.reply('⚠️ Anpinnen wird von dieser WhatsApp-Version leider nicht unterstützt.');
    }
  },
};

const unpin = {
  name: 'unpin', aliases: [], category: 'moderation',
  description: 'Löst die aktuell angepinnte Nachricht in der Gruppe. Danach ist keine Nachricht mehr angepinnt.',
  usage: '!unpin (als Antwort auf die angepinnte Nachricht)', keywords: ['lösen', 'entpinnen', 'unpin', 'abpinnen'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    if (!ctx.quotedKey) return ctx.reply('⚠️ Bitte antworte auf die angepinnte Nachricht.');
    try {
      await ctx.sock.sendMessage(ctx.groupJid, { pin: ctx.quotedKey, type: 2 });
      await ctx.reply('📌 Nachricht gelöst.');
    } catch (e) {
      await ctx.reply('⚠️ Lösen wird von dieser WhatsApp-Version leider nicht unterstützt.');
    }
  },
};

const setregeln = {
  name: 'setregeln', aliases: ['setrules'], category: 'moderation',
  description: 'Legt den Regeltext der Gruppe fest, der mit !regeln abgerufen werden kann. Der Text wird dauerhaft gespeichert und überschreibt bestehende Regeln.',
  usage: '!setregeln [Regeltext]', keywords: ['regeln', 'setzen', 'gruppenregeln', 'festlegen'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Bitte gib den Regeltext an.\n_${ctx.command.usage}_`);
    await ctx.storage.updateGroupConfig(ctx.groupJid, { rules: ctx.argText });
    await ctx.reply('✅ Gruppenregeln gespeichert.');
  },
};

const setwelcome = {
  name: 'setwelcome', aliases: [], category: 'moderation',
  description: 'Legt den Text der Willkommensnachricht fest, die neuen Mitgliedern gesendet wird. {user} wird automatisch durch den Namen des neuen Mitglieds ersetzt.',
  usage: '!setwelcome [Text mit @{user}]', keywords: ['willkommen', 'begrüßung', 'welcome', 'setzen'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Bitte gib den Willkommenstext an.\n_${ctx.command.usage}_`);
    await ctx.storage.updateGroupConfig(ctx.groupJid, { welcome: { message: ctx.argText, enabled: true } });
    await ctx.reply('✅ Willkommensnachricht gesetzt (und aktiviert).');
  },
};

const welcome = {
  name: 'welcome', aliases: [], category: 'moderation',
  description: 'Schaltet automatische Willkommensnachrichten für neue Mitglieder an oder aus. Wenn aktiv, begrüßt der Bot jeden neuen Nutzer mit der festgelegten Nachricht.',
  usage: '!welcome an|aus', keywords: ['willkommen', 'begrüßung', 'welcome', 'an', 'aus'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    const v = (ctx.args[0] || '').toLowerCase();
    if (!['an', 'aus', 'on', 'off'].includes(v)) return ctx.reply('⚠️ Nutze: *!welcome an* oder *!welcome aus*');
    const enabled = v === 'an' || v === 'on';
    await ctx.storage.updateGroupConfig(ctx.groupJid, { welcome: { enabled } });
    await ctx.reply(`✅ Willkommensnachrichten sind jetzt *${enabled ? 'an' : 'aus'}*.`);
  },
};

function makeSetting(name, aliases, desc, usage, keywords, setting, value, okMsg) {
  return {
    name, aliases, category: 'moderation', description: desc, usage, keywords,
    access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 3000,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.groupJid, value);
      await ctx.reply(okMsg);
    },
  };
}

const lock = makeSetting('lock', ['sperren'],
  '🔒 Sperrt den Chat, sodass nur noch Admins Nachrichten senden können. Nützlich bei Diskussionen, die außer Kontrolle geraten, oder für Ankündigungen ohne Kommentare.',
  '!lock', ['sperren', 'schließen', 'lock', 'nur admins'], 'announcement', 'announcement', '🔒 Chat gesperrt — nur Admins können schreiben.');

const unlock = makeSetting('unlock', ['entsperren'],
  '🔓 Öffnet den Chat wieder für alle Mitglieder. Hebt eine vorherige !lock-Sperre auf.',
  '!unlock', ['entsperren', 'öffnen', 'unlock', 'freigeben'], 'announcement', 'not_announcement', '🔓 Chat geöffnet — alle können wieder schreiben.');

const infolock = makeSetting('infolock', [],
  'Beschränkt das Ändern von Gruppeninfo (Name, Beschreibung, Bild) auf Admins. Verhindert, dass normale Mitglieder Gruppendetails verändern.',
  '!infolock', ['gruppeninfo', 'sperren', 'locked'], 'locked', 'locked', '🔒 Gruppeninfo: nur Admins dürfen ändern.');

const infounlock = makeSetting('infounlock', [],
  'Erlaubt wieder allen Mitgliedern das Ändern der Gruppeninfo. Hebt eine vorherige !infolock-Sperre auf.',
  '!infounlock', ['gruppeninfo', 'entsperren', 'unlocked'], 'unlocked', 'unlocked', '🔓 Gruppeninfo: alle dürfen ändern.');

const setname = {
  name: 'setname', aliases: [], category: 'moderation',
  description: 'Ändert den Namen der Gruppe auf den angegebenen Text. Der neue Name ist sofort für alle Mitglieder sichtbar. Maximal 25 Zeichen.',
  usage: '!setname [Neuer Name]', keywords: ['gruppenname', 'umbenennen', 'name', 'titel'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 5000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Bitte gib den neuen Namen an.\n_${ctx.command.usage}_`);
    await ctx.sock.groupUpdateSubject(ctx.groupJid, ctx.argText.slice(0, 25));
    await ctx.reply('✅ Gruppenname geändert.');
  },
};

const setdesc = {
  name: 'setdesc', aliases: [], category: 'moderation',
  description: 'Ändert die Gruppenbeschreibung auf den angegebenen Text. Eine gute Beschreibung hilft neuen Mitgliedern, die Gruppe und ihre Regeln zu verstehen.',
  usage: '!setdesc [Beschreibung]', keywords: ['beschreibung', 'description', 'gruppeninfo', 'setzen'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 5000,
  async run(ctx) {
    if (!ctx.argText) return ctx.reply(`⚠️ Bitte gib die Beschreibung an.\n_${ctx.command.usage}_`);
    await ctx.sock.groupUpdateDescription(ctx.groupJid, ctx.argText);
    await ctx.reply('✅ Gruppenbeschreibung geändert.');
  },
};

const del = {
  name: 'del', aliases: ['loeschen', 'löschen', 'delete'], category: 'moderation',
  description: 'Löscht die zitierte Nachricht aus der Gruppe. Funktioniert nur, wenn der Bot die entsprechende Nachricht löschen kann (eigene Nachrichten oder mit Admin-Rechten).',
  usage: '!del (als Antwort auf eine Nachricht)', keywords: ['löschen', 'entfernen', 'delete', 'nachricht'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 2000,
  async run(ctx) {
    if (!ctx.quotedKey) return ctx.reply('⚠️ Bitte antworte auf die Nachricht, die ich löschen soll.');
    await ctx.sock.sendMessage(ctx.groupJid, { delete: ctx.quotedKey });
  },
};

const ephemeral = {
  name: 'ephemeral', aliases: [], category: 'moderation',
  description: 'Setzt verschwindende Nachrichten für die Gruppe. Nachrichten werden nach dem angegebenen Zeitraum automatisch gelöscht. Mit "off" wird die Funktion deaktiviert.',
  usage: '!ephemeral [7d|24h|90d|off]', keywords: ['verschwindend', 'ephemeral', 'temporär', 'selbstlöschend'],
  access: 'admin', scope: 'group', requiresBotAdmin: true, cooldownMs: 3000,
  async run(ctx) {
    const a = (ctx.args[0] || '').toLowerCase();
    let secs;
    if (a === 'off' || a === 'aus') secs = 0;
    else if (a === '24h') secs = 86400;
    else if (a === '7d') secs = 7 * 86400;
    else if (a === '90d') secs = 90 * 86400;
    else return ctx.reply('⚠️ Nutze: *!ephemeral 24h|7d|90d|off*');
    await ctx.sock.groupToggleEphemeral(ctx.groupJid, secs);
    await ctx.reply(secs ? `⏳ Verschwindende Nachrichten aktiviert.` : '⏳ Verschwindende Nachrichten aus.');
  },
};

const slowmode = {
  name: 'slowmode', aliases: [], category: 'moderation',
  description: 'Aktiviert den Slowmode: Mitglieder müssen nach jeder Nachricht die angegebene Anzahl Sekunden warten. Mit "off" wird der Slowmode deaktiviert. Ideal gegen Spam und Flut.',
  usage: '!slowmode [Sekunden|off]', keywords: ['slowmode', 'verzögerung', 'langsam', 'spam'],
  access: 'admin', scope: 'group', cooldownMs: 3000,
  async run(ctx) {
    const a = (ctx.args[0] || '').toLowerCase();
    if (a === 'off' || a === 'aus') {
      await ctx.storage.updateGroupConfig(ctx.groupJid, { moderation: { slowmode: 0 } });
      return ctx.reply('🐢 Slowmode aus.');
    }
    const secs = parseInt(a, 10);
    if (!Number.isFinite(secs) || secs <= 0) return ctx.reply('⚠️ Nutze: *!slowmode <Sekunden>* oder *!slowmode off*');
    await ctx.storage.updateGroupConfig(ctx.groupJid, { moderation: { slowmode: secs } });
    await ctx.reply(`🐢 Slowmode: ${secs}s zwischen Nachrichten.`);
  },
};

const remind = {
  name: 'remind', aliases: ['erinnerung', 'erinnere'], category: 'moderation',
  description: 'Erstellt eine geplante Erinnerung, die nach der angegebenen Zeit (z. B. 30m, 2h) in der Gruppe gesendet wird. Maximal 60 Minuten. Praktisch für zeitkritische Ankündigungen.',
  usage: '!remind [Dauer] [Text]', keywords: ['erinnerung', 'reminder', 'erinnere', 'timer', 'geplant'],
  access: 'admin', scope: 'any', cooldownMs: 3000,
  async run(ctx) {
    const durArg = ctx.args[0];
    const ms = parseDuration(durArg);
    const text = ctx.args.slice(1).join(' ').trim();
    if (!ms || !text) return ctx.reply(`⚠️ Nutze: _${ctx.command.usage}_  (z. B. !remind 30m Pause!)`);
    const reminders = require('../reminders');
    const used = reminders.schedule(ctx.chatJid, ms, `⏰ Erinnerung: ${text}`);
    await ctx.reply(`✅ Erinnerung in ${fmtDuration(used)} gesetzt.`);
  },
};

module.exports = [
  sag, kick, ban, mute, unmute, warn, unwarn, clearwarn, warninfo, warnlist,
  promote, demote, link, revoke, announce, alle, admins, pin, unpin,
  setregeln, setwelcome, welcome, lock, unlock, infolock, infounlock,
  setname, setdesc, del, ephemeral, slowmode, remind,
];
