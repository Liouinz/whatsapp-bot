'use strict';

/**
 * Moderations-Befehle.
 *
 * Phase 3: vollständige Metadaten (für Router-Pipeline + intelligente Hilfe),
 * aber die run()-Logik ist hier noch ein Platzhalter. Die eigentliche
 * Moderations-Logik (kicken, bannen, Warnungen, Eskalation …) wird in Phase 4
 * eingesetzt — die Metadaten bleiben dann unverändert.
 */

function soon(ctx) {
  return ctx.reply(`⏳ *${ctx.prefix}${ctx.command?.name || ''}* ist vorbereitet, wird aber erst in Phase 4 aktiviert.`);
}

const kick = {
  name: 'kick',
  aliases: [],
  category: 'moderation',
  description:
    'Entfernt das getaggte Mitglied sofort aus der Gruppe. Der Nutzer kann über den Gruppenlink wieder beitreten. Für permanente Ausschlüsse nutze !ban.',
  usage: '!kick @user',
  keywords: ['kicken', 'rauswerfen', 'entfernen', 'werfen', 'rausschmeißen'],
  access: 'admin',
  scope: 'group',
  requiresBotAdmin: true,
  requiresTarget: true,
  cooldownMs: 3000,
  run: soon,
};

const ban = {
  name: 'ban',
  aliases: [],
  category: 'moderation',
  description:
    'Kickt das Mitglied und trägt es ins Ban-Log der Gruppe ein. Der Grund wird gespeichert und ist für Admins einsehbar. Das Ban-Log hilft bei der Nachverfolgung von Moderationsmaßnahmen.',
  usage: '!ban @user [Grund]',
  keywords: ['bannen', 'sperren', 'verbannen', 'rauswerfen', 'permanent', 'ausschließen'],
  access: 'admin',
  scope: 'group',
  requiresBotAdmin: true,
  requiresTarget: true,
  cooldownMs: 3000,
  run: soon,
};

const mute = {
  name: 'mute',
  aliases: [],
  category: 'moderation',
  description:
    'Schaltet ein Mitglied für den angegebenen Zeitraum stumm — der Nutzer kann keine Nachrichten mehr senden. Nach Ablauf der Dauer wird der Mute automatisch aufgehoben. Ohne Zeitangabe gilt der Mute unbegrenzt.',
  usage: '!mute @user [Dauer]',
  keywords: ['stummschalten', 'stumm', 'muten', 'schweigen', 'ruhig'],
  access: 'admin',
  scope: 'group',
  requiresTarget: true,
  cooldownMs: 3000,
  run: soon,
};

const unmute = {
  name: 'unmute',
  aliases: [],
  category: 'moderation',
  description:
    'Hebt die Stummschaltung eines Mitglieds sofort auf. Der Nutzer kann danach wieder normal in der Gruppe schreiben.',
  usage: '!unmute @user',
  keywords: ['entstummen', 'stumm', 'aufheben', 'unmute', 'reden'],
  access: 'admin',
  scope: 'group',
  requiresTarget: true,
  cooldownMs: 3000,
  run: soon,
};

const warn = {
  name: 'warn',
  aliases: [],
  category: 'moderation',
  description:
    'Verwarnt ein Mitglied manuell und trägt die Warnung ins Log ein. Nach einer konfigurierbaren Anzahl von Warnungen kann automatisch ein Kick erfolgen. Der Grund wird gespeichert.',
  usage: '!warn @user [Grund]',
  keywords: ['verwarnen', 'warnen', 'warnung', 'ermahnen', 'verwarnung'],
  access: 'admin',
  scope: 'group',
  requiresTarget: true,
  cooldownMs: 3000,
  run: soon,
};

const unwarn = {
  name: 'unwarn',
  aliases: [],
  category: 'moderation',
  description:
    'Nimmt die letzte Verwarnung eines Mitglieds zurück. Nützlich, wenn eine Verwarnung versehentlich oder zu Unrecht ausgesprochen wurde.',
  usage: '!unwarn @user',
  keywords: ['entwarnen', 'verwarnung', 'zurücknehmen', 'aufheben', 'warnung'],
  access: 'admin',
  scope: 'group',
  requiresTarget: true,
  cooldownMs: 3000,
  run: soon,
};

module.exports = [kick, ban, mute, unmute, warn, unwarn];
