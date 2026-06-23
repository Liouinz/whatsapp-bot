// 📋 MENÜ- & ROLLEN-MODUL – NICHT AKTIV
// Wird von index.js NICHT geladen. Teilt alle Befehle in Menüs nach Rolle auf
// und gibt dem Inhaber die Kontrolle darüber, was Moderatoren dürfen.
// Einbau später gemäß INTEGRATION.md.

'use strict';

// ====================================================================
// Befehls-Kategorien. Beim Einbau einfach um neue Befehle erweitern.
// ====================================================================
const CATEGORIES = {
  user: {
    label: '👤 Benutzer',
    desc: 'Für alle nutzbar',
    commands: [
      ['hilfe', 'alle Befehle'], ['ping', 'reagiert der Bot?'], ['info', 'Status & Laufzeit'],
      ['regeln', 'Gruppenregeln'], ['stats', 'deine Statistik'], ['profil', 'Profilkarte'],
    ],
  },
  fun: {
    label: '🎮 Spaß',
    desc: 'Spiele & Unterhaltung',
    commands: [
      ['marry', 'heiraten 💍'], ['ship', 'Kompatibilität'], ['8ball', 'Magic 8-Ball'],
      ['joke', 'Witz'], ['quote', 'Zitat'], ['rps', 'Schere-Stein-Papier'], ['horoskop', 'Horoskop'],
    ],
  },
  economy: {
    label: '🏠 Wirtschaft',
    desc: 'Coins & Häuser (nur Spiel-Gruppe)',
    commands: [
      ['balance', 'Kontostand'], ['daily', 'Tagesbonus'], ['arbeiten', 'Coins verdienen'],
      ['markt', 'Häuser-Markt'], ['kaufen', 'Haus kaufen'], ['verkaufen', 'Haus verkaufen'],
      ['inventar', 'deine Häuser'], ['miete', 'Mieteinnahmen'], ['angebot', 'Tagesangebote'],
      ['reich', 'Rangliste'], ['pay', 'Coins überweisen'],
    ],
  },
  games: {
    label: '🎲 Casino',
    desc: 'Wettspiele (nur Spiel-Gruppe)',
    commands: [
      ['slots', 'Einarmiger Bandit 🎰'], ['coinflip', 'Kopf oder Zahl'],
      ['würfelwette', 'Würfeln gegen den Bot'], ['rauben', 'jemanden ausrauben 🦹'],
    ],
  },
  moderation: {
    label: '🛡️ Moderation',
    desc: 'Für Admins & freigegebene Moderatoren',
    commands: [
      ['kick', 'entfernen'], ['ban', 'bannen'], ['mute', 'stummschalten'], ['unmute', 'freischalten'],
      ['warn', 'verwarnen'], ['unwarn', 'Verwarnung zurück'], ['lock', 'Chat sperren'], ['unlock', 'Chat öffnen'],
    ],
  },
  admin: {
    label: '⚙️ Admin',
    desc: 'Gruppenverwaltung',
    commands: [
      ['setname', 'Name ändern'], ['setdesc', 'Beschreibung'], ['setregeln', 'Regeln setzen'],
      ['setwelcome', 'Willkommen'], ['link', 'Einladungslink'], ['revoke', 'Link neu'], ['slowmode', 'Slowmode'],
    ],
  },
  owner: {
    label: '👑 Inhaber',
    desc: 'Nur für den Community-Inhaber',
    commands: [
      ['communitykick', 'aus ALLEN Gruppen bannen'], ['communityunban', 'Bann aufheben'],
      ['communitybanlist', 'Bannliste'], ['modallow', 'Moderator-Rechte vergeben'],
      ['moddeny', 'Moderator-Rechte entziehen'], ['modlist', 'Moderatoren anzeigen'],
    ],
  },
};

// ====================================================================
// Rollen-Erkennung & Moderator-Rechte
// config.mods = { [num]: ['moderation', 'economy', ...] }  (vom Inhaber gesetzt)
// ====================================================================
function getModCategories(config, num) {
  return (config.mods && config.mods[num]) || [];
}
function isModeratorFor(config, num, category) {
  return getModCategories(config, num).includes(category);
}
function setModCategory(config, num, category, enable) {
  if (!config.mods) config.mods = {};
  if (!config.mods[num]) config.mods[num] = [];
  const set = new Set(config.mods[num]);
  if (enable) set.add(category); else set.delete(category);
  config.mods[num] = [...set];
  if (!config.mods[num].length) delete config.mods[num];
}

// ====================================================================
// Menü-Rendering
// ====================================================================
function renderCategory(prefix, cat) {
  const lines = cat.commands.map(([k, d]) => `  ${prefix}${k} – ${d}`).join('\n');
  return `*${cat.label}* _(${cat.desc})_\n${lines}`;
}

// Hauptmenü: zeigt je nach Rolle nur die erlaubten Kategorien.
function buildMenu(prefix, { isOwner = false, isAdmin = false, modCats = [] } = {}) {
  const blocks = [renderCategory(prefix, CATEGORIES.user), renderCategory(prefix, CATEGORIES.fun)];
  blocks.push(renderCategory(prefix, CATEGORIES.economy));
  blocks.push(renderCategory(prefix, CATEGORIES.games));
  if (isAdmin || modCats.includes('moderation')) blocks.push(renderCategory(prefix, CATEGORIES.moderation));
  if (isAdmin) blocks.push(renderCategory(prefix, CATEGORIES.admin));
  if (isOwner) blocks.push(renderCategory(prefix, CATEGORIES.owner));
  return `🤖 *Bot-Menü*\n\n${blocks.join('\n\n')}\n\n_Tippe einen Befehl, um ihn zu nutzen._`;
}

function buildAdminMenu(prefix) {
  return `⚙️ *Admin-Menü*\n\n${renderCategory(prefix, CATEGORIES.moderation)}\n\n${renderCategory(prefix, CATEGORIES.admin)}`;
}
function buildModMenu(prefix, modCats) {
  if (!modCats.length) return 'Du hast aktuell keine Moderator-Rechte. Der Inhaber kann sie mit !modallow vergeben.';
  const blocks = modCats.filter((c) => CATEGORIES[c]).map((c) => renderCategory(prefix, CATEGORIES[c]));
  return `🛡️ *Moderator-Menü*\n\n${blocks.join('\n\n')}`;
}
function buildOwnerMenu(prefix) {
  return `👑 *Inhaber-Menü*\n\n${renderCategory(prefix, CATEGORIES.owner)}`;
}

// ====================================================================
// MENU_COMMANDS – Vorlage für index.js (siehe INTEGRATION.md)
// ====================================================================
/*

  case 'menu': case 'menü': {
    const owner = await isCommunityOwner(senderJid, jid);
    const meta = await getGroupMeta(jid);
    const admin = isAdmin(meta, senderJid);
    const modCats = getModCategories(config, senderNum);
    await reply(buildMenu(COMMAND_PREFIX, { isOwner: owner, isAdmin: admin, modCats }));
    break;
  }
  case 'adminmenu': case 'adminmenü': {
    const meta = await getGroupMeta(jid);
    if (!isAdmin(meta, senderJid) && !(await isCommunityOwner(senderJid, jid))) { await reply('Nur für Admins.'); break; }
    await reply(buildAdminMenu(COMMAND_PREFIX));
    break;
  }
  case 'modmenu': case 'modmenü': {
    await reply(buildModMenu(COMMAND_PREFIX, getModCategories(config, senderNum)));
    break;
  }

  // ---- Inhaber steuert Moderator-Rechte ----
  case 'modallow': {
    if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Inhaber.'); break; }
    const target = getTargetJid(msg);
    const cat = (args.find((a) => CATEGORIES[a]) || '').toLowerCase();
    if (!target || !cat) { await reply(`Nutzung: ${COMMAND_PREFIX}modallow @person <kategorie>\nKategorien: ${Object.keys(CATEGORIES).join(', ')}`); break; }
    setModCategory(config, target.split('@')[0], cat, true);
    await persist();
    await sock.sendMessage(jid, { text: `✅ @${target.split('@')[0]} darf jetzt: ${cat}`, mentions: [target] });
    break;
  }
  case 'moddeny': {
    if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Inhaber.'); break; }
    const target = getTargetJid(msg);
    const cat = (args.find((a) => CATEGORIES[a]) || '').toLowerCase();
    if (!target || !cat) { await reply(`Nutzung: ${COMMAND_PREFIX}moddeny @person <kategorie>`); break; }
    setModCategory(config, target.split('@')[0], cat, false);
    await persist();
    await sock.sendMessage(jid, { text: `✅ @${target.split('@')[0]} darf nicht mehr: ${cat}`, mentions: [target] });
    break;
  }
  case 'modlist': {
    if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Inhaber.'); break; }
    const mods = config.mods || {};
    const entries = Object.entries(mods);
    if (!entries.length) { await reply('Keine Moderatoren festgelegt.'); break; }
    await reply('🛡️ *Moderatoren*\n\n' + entries.map(([n, cats]) => `+${n}: ${cats.join(', ')}`).join('\n'));
    break;
  }

*/

module.exports = {
  CATEGORIES,
  getModCategories,
  isModeratorFor,
  setModCategory,
  buildMenu,
  buildAdminMenu,
  buildModMenu,
  buildOwnerMenu,
};
