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
      ['hilfe', 'alle Befehle'],
      ['ping', 'reagiert der Bot?'],
      ['info', 'Status & Laufzeit'],
      ['regeln', 'Gruppenregeln'],
      ['stats', 'deine Statistik'],
      ['profil', 'Profilkarte'],
      ['statistik', 'deine vollständige Statistik'],
    ],
  },

  fun: {
    label: '🎮 Spaß',
    desc: 'Spiele & Unterhaltung',
    commands: [
      ['marry', 'heiraten 💍'],
      ['ship', 'Kompatibilität'],
      ['8ball', 'Magic 8-Ball'],
      ['joke', 'Witz'],
      ['quote', 'Zitat'],
      ['rps', 'Schere-Stein-Papier'],
      ['horoskop', 'Horoskop'],
    ],
  },

  economy: {
    label: '🏠 Wirtschaft',
    desc: 'Coins & Häuser (nur freigegebene Gruppen)',
    commands: [
      ['balance', 'Kontostand'],
      ['vermögen', 'Gesamtvermögen'],
      ['daily', 'Tagesbonus'],
      ['saisonbonus', 'saisonaler Bonus'],
      ['arbeiten', 'Coins verdienen'],
      ['markt', 'Häuser-Markt'],
      ['kaufen', 'Haus kaufen'],
      ['verkaufen', 'Haus verkaufen'],
      ['inventar', 'deine Häuser'],
      ['miete', 'Mieteinnahmen'],
      ['angebot', 'Tagesangebote'],
      ['reich', 'Rangliste'],
      ['pay', 'Coins überweisen'],
      ['level', 'dein Level/XP'],
      ['prestige', 'Prestige durchführen (ab Lv 50)'],
      ['achievements', 'Erfolge'],
    ],
  },

  bank: {
    label: '🏦 Bank',
    desc: 'Sicheres Konto mit Zinsen',
    commands: [
      ['einzahlen', 'Geld einzahlen'],
      ['auszahlen', 'Geld abheben'],
      ['zinsen', 'Tageszins abholen'],
    ],
  },

  shop: {
    label: '🛒 Shop',
    desc: 'Autos, Haustiere & Boosts',
    commands: [
      ['shop', 'Shop ansehen'],
      ['kaufenitem', 'Item kaufen'],
      ['items', 'deine Items'],
      ['einkommen', 'Tageseinkommen'],
      ['tagesdeal', 'Tages-Sonderangebot'],
      ['crafting', 'Crafting-Rezepte'],
      ['craften', 'Items craften'],
      ['itemposter', 'Item auf Marktplatz stellen'],
      ['itemkaufen', 'Item vom Marktplatz kaufen'],
      ['itemmarkt', 'Marktplatz anzeigen'],
      ['itemabbruch', 'eigenes Angebot zurückziehen'],
      ['schenken', 'Item verschenken'],
    ],
  },

  quests: {
    label: '🎯 Quests',
    desc: 'Tägliche & wöchentliche Aufgaben',
    commands: [
      ['quests', 'Tages- & Wochenquests'],
      ['claim', 'Belohnung abholen'],
      ['community', 'Community-Challenge'],
    ],
  },

  games: {
    label: '🎲 Casino',
    desc: 'Wettspiele (nur freigegebene Gruppen)',
    commands: [
      ['slots', 'Einarmiger Bandit 🎰'],
      ['coinflip', 'Kopf oder Zahl'],
      ['würfelwette', 'Würfeln gegen den Bot'],
      ['roulette', 'Roulette 🎡'],
      ['blackjack', 'Blackjack 🃏'],
      ['poker', 'Poker (5 Cards gegen Bot) 🂡'],
      ['hl', 'Higher-Lower'],
      ['crash', 'Crash-Spiel 🚀'],
      ['keno', 'Keno (5 aus 20 Zahlen) 🔢'],
      ['baccarat', 'Baccarat 🎴'],
      ['rennen', 'Pferderennen 🏇'],
      ['mines', 'Minenfeld 💣'],
      ['turm', 'Würfelturm 🎲'],
      ['duell', 'Würfelduell gegen Spieler'],
      ['lotto', 'Lotterie-Los'],
      ['glücksrad', 'Glücksrad drehen 🎡'],
      ['rubbellos', 'Rubbellos kaufen 🎫'],
      ['box', 'Mystery-Box öffnen 📦'],
      ['tagesbox', 'Kostenlose Tagesbox 🎁'],
      ['event', 'Zufallsereignis 🎲'],
      ['rauben', 'jemanden ausrauben 🦹'],
    ],
  },

  tournament: {
    label: '🏆 Turnier',
    desc: 'Gruppen-Turniere (nur Admins können starten)',
    commands: [
      ['turnier start <spiel>', 'Turnier starten'],
      ['turnier status', 'aktueller Stand'],
      ['turnier ende', 'Turnier beenden & Sieger küren'],
    ],
  },

  clan: {
    label: '⚔️ Clan',
    desc: 'Clans gründen, beitreten & aufsteigen',
    commands: [
      ['clan info', 'dein Clan-Profil'],
      ['clan erstellen <name>', 'neuen Clan gründen (5.000 Coins)'],
      ['clan suche <name>', 'Clan suchen'],
      ['clan beitritt <name>', 'Clan beitreten'],
      ['clan verlassen', 'Clan verlassen'],
      ['clan spenden <betrag>', 'Coins in Schatzkammer einzahlen'],
      ['clan kick @person', 'Mitglied kicken (nur Leader)'],
      ['clan übertragen @person', 'Leadership übergeben'],
      ['clan beschreibung <text>', 'Clan-Beschreibung setzen'],
      ['clan top', 'Clan-Rangliste'],
      ['clan auflösen', 'Clan auflösen (nur Leader)'],
    ],
  },

  handel: {
    label: '🤝 Handel',
    desc: 'Häuser zwischen Spielern tauschen',
    commands: [
      ['handel angebot @person <häuser> <preis>', 'Tauschangebot senden'],
      ['handel annehmen <id>', 'Angebot annehmen'],
      ['handel liste', 'offene Angebote anzeigen'],
      ['handel abbrechen <id>', 'eigenes Angebot zurückziehen'],
    ],
  },

  moderation: {
    label: '🛡️ Moderation',
    desc: 'Für Admins & freigegebene Moderatoren',
    commands: [
      ['kick', 'entfernen'],
      ['ban', 'bannen'],
      ['mute', 'stummschalten'],
      ['unmute', 'freischalten'],
      ['warn', 'verwarnen'],
      ['unwarn', 'Verwarnung zurück'],
      ['lock', 'Chat sperren'],
      ['unlock', 'Chat öffnen'],
    ],
  },

  admin: {
    label: '⚙️ Admin',
    desc: 'Gruppenverwaltung',
    commands: [
      ['setname', 'Name ändern'],
      ['setdesc', 'Beschreibung'],
      ['setregeln', 'Regeln setzen'],
      ['setwelcome', 'Willkommen'],
      ['link', 'Einladungslink'],
      ['revoke', 'Link neu'],
      ['slowmode', 'Slowmode'],
    ],
  },

  owner: {
    label: '👑 Inhaber',
    desc: 'Nur für den Community-Inhaber',
    commands: [
      ['communitykick', 'aus ALLEN Gruppen bannen'],
      ['communityunban', 'Bann aufheben'],
      ['communitybanlist', 'Bannliste'],
      ['spielgruppe', 'Spiele hier an/aus'],
      ['modallow', 'Moderator-Rechte vergeben'],
      ['moddeny', 'Moderator-Rechte entziehen'],
      ['modlist', 'Moderatoren anzeigen'],
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

// Gibt Kurzübersicht einer Kategorie zurück (nur Befehlsnamen)
function renderCategoryCompact(prefix, cat) {
  const cmds = cat.commands.map(([k]) => `${prefix}${k}`).join('  ');
  return `*${cat.label}*\n${cmds}`;
}

// Hauptmenü: zeigt je nach Rolle nur die erlaubten Kategorien.
function buildMenu(prefix, { isOwner = false, isAdmin = false, modCats = [] } = {}) {
  const blocks = [
    renderCategory(prefix, CATEGORIES.user),
    renderCategory(prefix, CATEGORIES.fun),
    renderCategory(prefix, CATEGORIES.economy),
    renderCategory(prefix, CATEGORIES.bank),
    renderCategory(prefix, CATEGORIES.shop),
    renderCategory(prefix, CATEGORIES.quests),
    renderCategory(prefix, CATEGORIES.games),
    renderCategory(prefix, CATEGORIES.tournament),
    renderCategory(prefix, CATEGORIES.clan),
    renderCategory(prefix, CATEGORIES.handel),
  ];
  if (isAdmin || modCats.includes('moderation')) blocks.push(renderCategory(prefix, CATEGORIES.moderation));
  if (isAdmin) blocks.push(renderCategory(prefix, CATEGORIES.admin));
  if (isOwner) blocks.push(renderCategory(prefix, CATEGORIES.owner));
  return `🤖 *Bot-Menü*\n\n${blocks.join('\n\n')}\n\n_Tippe einen Befehl, um ihn zu nutzen._`;
}

// Kompaktes Menü (kürzere Ausgabe für Gruppen mit vielen Befehlen)
function buildCompactMenu(prefix, { isOwner = false, isAdmin = false, modCats = [] } = {}) {
  const cats = ['user', 'fun', 'economy', 'bank', 'shop', 'quests', 'games', 'tournament', 'clan', 'handel'];
  const blocks = cats.map((c) => renderCategoryCompact(prefix, CATEGORIES[c]));
  if (isAdmin || modCats.includes('moderation')) blocks.push(renderCategoryCompact(prefix, CATEGORIES.moderation));
  if (isAdmin) blocks.push(renderCategoryCompact(prefix, CATEGORIES.admin));
  if (isOwner) blocks.push(renderCategoryCompact(prefix, CATEGORIES.owner));
  return `🤖 *Bot-Menü (kompakt)*\n\n${blocks.join('\n\n')}\n\n_${prefix}menü voll – für ausführliche Beschreibungen_`;
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

// Gibt Kategorie-spezifisches Hilfe-Menü zurück
function buildCategoryHelp(prefix, categoryKey) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return `Unbekannte Kategorie. Verfügbar: ${Object.keys(CATEGORIES).join(', ')}`;
  return `${cat.label} *Hilfe*\n\n${renderCategory(prefix, cat)}`;
}

// Suche in allen Befehlen
function searchCommands(prefix, query) {
  const q = query.toLowerCase();
  const results = [];
  for (const [, cat] of Object.entries(CATEGORIES)) {
    for (const [cmd, desc] of cat.commands) {
      if (cmd.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
        results.push(`${prefix}${cmd} – ${desc} _(${cat.label})_`);
      }
    }
  }
  if (!results.length) return `Keine Befehle für "*${query}*" gefunden.`;
  return `🔍 *Suchergebnisse für "${query}"*\n\n${results.join('\n')}`;
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
    const compact = args[0] === 'kompakt' || args[0] === 'kurz';
    if (compact) {
      await reply(buildCompactMenu(COMMAND_PREFIX, { isOwner: owner, isAdmin: admin, modCats }));
    } else {
      await reply(buildMenu(COMMAND_PREFIX, { isOwner: owner, isAdmin: admin, modCats }));
    }
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
  case 'hilfesuche': {
    if (!args[0]) { await reply(`Nutzung: ${COMMAND_PREFIX}hilfesuche <Suchbegriff>`); break; }
    await reply(searchCommands(COMMAND_PREFIX, args.join(' ')));
    break;
  }
  case 'kategorie': {
    await reply(buildCategoryHelp(COMMAND_PREFIX, (args[0] || '').toLowerCase()));
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
  buildCompactMenu,
  buildAdminMenu,
  buildModMenu,
  buildOwnerMenu,
  buildCategoryHelp,
  searchCommands,
  renderCategory,
};
