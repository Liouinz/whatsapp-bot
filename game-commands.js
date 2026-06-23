// ====================================================================
// 🎮 SPIEL- & WIRTSCHAFTS-INTEGRATION (AKTIV)
// --------------------------------------------------------------------
// Diese Datei verbindet die Module aus economy.js + future-update/* mit
// index.js. Sie ist bewusst eigenständig gehalten:
//   - index.js ruft nur initModules() + handle() auf
//   - jeder Befehl ist gegen die ECHTE Modul-API geschrieben (geprüft)
//   - alles läuft hinter dem Inhaber-Schalter (!spielgruppe an) pro Gruppe
//   - Fehler einzelner Befehle werden gefangen, der Bot bleibt online
//
// Aktivierung: nur wenn TURSO_DATABASE_URL + TURSO_AUTH_TOKEN gesetzt sind.
// Ohne Turso bleibt der komplette Spielteil sauber deaktiviert.
// ====================================================================
'use strict';

let economyMod, gamesMod, shopMod, questsMod, eventsMod, clanMod, worldMod, profMod;
try { economyMod = require('./economy'); } catch (_) { /* optional */ }
try { gamesMod = require('./future-update/games'); } catch (_) { /* optional */ }
try { shopMod = require('./future-update/shop'); } catch (_) { /* optional */ }
try { questsMod = require('./future-update/quests'); } catch (_) { /* optional */ }
try { eventsMod = require('./future-update/events'); } catch (_) { /* optional */ }
try { clanMod = require('./future-update/clan'); } catch (_) { /* optional */ }
try { worldMod = require('./future-update/world'); } catch (_) { /* optional */ }
try { profMod = require('./future-update/professions'); } catch (_) { /* optional */ }

const fmt = (economyMod && economyMod.formatBalance) || ((n) => `${Math.round(n)} 🪙`);
const fmtWait = (gamesMod && gamesMod.fmtWait) || ((ms) => `${Math.ceil(ms / 60000)} Min`);
const isGameGroup = (gamesMod && gamesMod.isGameGroup) || ((cfg, jid) => Boolean(cfg.gameGroups && cfg.gameGroups[jid]));
const setGameGroup = (gamesMod && gamesMod.setGameGroup) || ((cfg, jid, on) => {
  if (!cfg.gameGroups) cfg.gameGroups = {};
  if (on) cfg.gameGroups[jid] = true; else delete cfg.gameGroups[jid];
});
const HOUSES = (economyMod && economyMod.HOUSES) || [];

// Modul-Instanzen (nach initModules gesetzt)
const mgrs = { economy: null, game: null, shop: null, quest: null, events: null, clan: null, world: null, professions: null };
let _logger = { info() {}, warn() {}, error() {} };

// ====================================================================
// Initialisierung – defensiv. Bei jedem Fehler bleibt der Spielteil aus,
// der Rest des Bots läuft normal weiter.
// ====================================================================
async function initModules({ logger } = {}) {
  if (logger) _logger = logger;
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    _logger.warn('Spielmodule: keine Turso-Zugangsdaten – Wirtschaft/Spiele deaktiviert');
    return { ok: false, reason: 'no-turso' };
  }
  if (!economyMod || !economyMod.EconomyManager) {
    _logger.warn('Spielmodule: economy.js nicht ladbar – deaktiviert');
    return { ok: false, reason: 'no-economy' };
  }
  try {
    const economy = new economyMod.EconomyManager(url, token);
    await economy.init();
    if (typeof economy.initExtra === 'function') {
      try { await economy.initExtra(); } catch (e) { _logger.warn({ e }, 'initExtra übersprungen'); }
    }
    mgrs.economy = economy;

    if (shopMod && shopMod.ShopManager) {
      mgrs.shop = new shopMod.ShopManager(economy);
      try { await mgrs.shop.init(); } catch (e) { _logger.warn({ e }, 'Shop-Init übersprungen'); }
    }
    if (gamesMod && gamesMod.GameManager) mgrs.game = new gamesMod.GameManager(economy);
    if (questsMod && questsMod.QuestManager) mgrs.quest = new questsMod.QuestManager(economy);
    if (eventsMod && eventsMod.EventManager) mgrs.events = new eventsMod.EventManager(economy);
    if (clanMod && clanMod.ClanManager) {
      try { mgrs.clan = new clanMod.ClanManager(economy); await mgrs.clan.init(); }
      catch (e) { _logger.warn({ e }, 'Clan-Init übersprungen'); mgrs.clan = null; }
    }
    if (worldMod && worldMod.WorldManager) {
      try { mgrs.world = new worldMod.WorldManager(economy); }
      catch (e) { _logger.warn({ e }, 'World-Init übersprungen'); mgrs.world = null; }
    }
    if (profMod && profMod.ProfessionManager) {
      try { mgrs.professions = new profMod.ProfessionManager(economy); }
      catch (e) { _logger.warn({ e }, 'Professions-Init übersprungen'); mgrs.professions = null; }
    }
    _logger.info('🎮 Wirtschaft, Shop, Quests, Events, Clan, Welt & Berufe aktiviert (Turso)');
    return { ok: true };
  } catch (e) {
    _logger.error({ e }, 'Spielmodule-Init fehlgeschlagen – Bot läuft ohne Spielteil');
    mgrs.economy = mgrs.game = mgrs.shop = mgrs.quest = mgrs.events = mgrs.clan = null;
    return { ok: false, reason: 'init-failed' };
  }
}

function isReady() { return Boolean(mgrs.economy); }

// Hält die Turso-Verbindung warm (gegen Idle-Timeouts).
async function heartbeat() {
  if (!mgrs.economy || !mgrs.economy.db) return;
  try { await mgrs.economy.db.execute('SELECT 1'); }
  catch (e) { _logger.warn({ e }, 'Turso-Heartbeat fehlgeschlagen'); }
}

// ====================================================================
// Befehls-Set. spielgruppe ist enthalten, läuft aber OHNE Freischalt-Gate.
// ====================================================================
const ECON_CMDS = [
  'balance', 'kontostand', 'geld', 'vermögen', 'networth', 'daily', 'arbeiten', 'work',
  'miete', 'markt', 'kaufen', 'verkaufen', 'inventar', 'häuser', 'pay', 'überweisen',
  'level', 'rang', 'levelcard', 'profil', 'achievements', 'erfolge', 'prestige', 'einzahlen', 'deposit',
  'auszahlen', 'withdraw', 'zinsen', 'reich', 'rangliste', 'lotto', 'lotterie',
  'jackpot', 'saisonbonus', 'stats', 'statistik',
  // Neue Wirtschaftsbefehle
  'bankinfo', 'tagesherausforderung', 'challenge', 'aktien', 'stocks', 'aktienkaufen', 'aktienverkaufen',
  'anbieten', 'handelsangebot', 'handel', 'handelsmarkt', 'trade', 'handelabbrechen',
  'angebot', 'levelrangliste', 'prestigerangliste', 'weltrangliste', 'reichrangliste',
  'freund', 'freundeinkommen', 'vermoegenssteuer', 'sparplan', 'kredit',
];
const CASINO_CMDS = [
  'slots', 'coinflip', 'cf', 'würfelwette', 'roulette', 'blackjack', 'bj', 'poker',
  'crash', 'keno', 'hl', 'higherlower', 'rauben', 'rob', 'glücksrad', 'wheel',
  'rubbellos', 'scratch', 'box', 'tagesbox', 'event', 'ereignis',
  // Neue Casino-Befehle
  'videopoker', 'videopokerhalten', 'kriegsspiel', 'superslots', 'dreherrad', 'zahlenduel',
  'baccarat', 'pferderennen', 'minen', 'wuerfelturm', 'jackpotslots',
  'turnier', 'turnierstand', 'turnieranmelden',
  'boss', 'bossangriff', 'bossstatus',
  'gruplotto', 'gruplottojoin', 'gruplottoziehung',
  'megaevent', 'eventstatus',
];
const SHOP_CMDS = [
  'shop', 'kaufenitem', 'buyitem', 'items', 'meineitems', 'einkommen', 'tagesdeal', 'crafting', 'craften',
  // Neue Shop-Befehle
  'waffen', 'weapons', 'ruestungen', 'armor', 'reiseausruestung', 'werkzeuge', 'traenke', 'potions',
  'trank', 'trinken', 'usepotion', 'marktplatz', 'marketplace', 'angebote',
  'verkaufenitem', 'verschenken', 'wishlist', 'wunschliste', 'verzaubern', 'enchant',
  'paket', 'bundle', 'upgradeitem', 'upgrade', 'legendaer',
];
const QUEST_CMDS = [
  'quests', 'aufgaben', 'claim',
  // Neue Quest-Befehle
  'wochenquest', 'saisonquest', 'questkalender', 'weltquest', 'berufsquest',
  'erfolgsquest', 'questinfo', 'questreset',
];
const CLAN_CMDS = [
  'clan', 'gilde',
  // Neue Gilden-Befehle
  'gildeskills', 'gildequest', 'gildeterritorium',
];
const WORLD_CMDS = [
  'reisen', 'travel', 'karte', 'weltkarte', 'worldmap', 'region', 'regioninfo',
  'standort', 'ort', 'location', 'whereami',
  'kämpfen', 'kampf', 'fight', 'attack', 'angreifen', 'monster', 'monsterangriff',
  'jagd', 'hunt', 'jagen', 'jagdladungen',
  'flucht', 'flee', 'escape',
  'sammeln', 'ernten', 'harvest', 'collect', 'ressourcen', 'rohstoffe', 'resources',
  'verkaufenrohstoffe', 'rohstoffverkauf',
  'bestiarium', 'monsterinfo', 'monsterkills',
  'erkunden', 'explore', 'erkundung', 'entdecken',
  'weltranking', 'topjaeger',
];
const PROF_CMDS = [
  'beruf', 'profession', 'job', 'berufe', 'berufsinfo', 'profinfo',
  'beruflevel', 'proftrain', 'berufsarbeit', 'jobwork',
  'berufseinnahmen', 'berufseinkommen',
  'spezialakt', 'specialaction',
  // Berufs-Spezialfähigkeiten
  'anpflanzen', 'pflanzen', 'feldernten', 'feldernten',
  'graben', 'sprengen', 'schürfen',
  'handeln', 'feilschen', 'investieren',
  'patrouillieren', 'trainieren', 'wachen',
  'zaubern', 'studieren', 'beschwören',
  'schleichen', 'klauen', 'spionieren',
  'kochen', 'backen', 'braten',
  'schmieden', 'schärfen', 'härten',
  'angeln', 'netzwerfen', 'tauchen',
  'brauen', 'destillieren', 'experimentieren',
  'kartografieren', 'entdecken',
  'spekulieren',
  'berufsrangliste', 'profleaderboard',
];

const GAME_CMDS = new Set([
  ...ECON_CMDS, ...CASINO_CMDS, ...SHOP_CMDS, ...QUEST_CMDS,
  ...CLAN_CMDS, ...WORLD_CMDS, ...PROF_CMDS,
]);
const ALL_CMDS = new Set([...GAME_CMDS, 'spielgruppe', 'hilfewelt', 'hilfeberuf', 'hilfegilden']);

function owns(cmd) { return ALL_CMDS.has(cmd); }

// Quest-Fortschritt + Achievements melden (best effort)
async function reportWin(senderJid) {
  try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'win'); } catch (_) {}
  try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'gamble'); } catch (_) {}
}
async function reportGamble(senderJid) {
  try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'gamble'); } catch (_) {}
}
async function reportAch(ctx, senderJid) {
  try {
    if (!mgrs.economy) return;
    const newly = await mgrs.economy.checkAchievements(senderJid);
    if (newly && newly.length) {
      await ctx.reply(`🏆 *Neuer Erfolg!*\n${newly.map((n) => `${n.def.name} (+${fmt(n.reward)})`).join('\n')}`);
    }
  } catch (_) {}
}

// ====================================================================
// Haupt-Dispatcher. Gibt true zurück, wenn der Befehl uns gehört.
// ====================================================================
async function handle(ctx) {
  const { cmd } = ctx;
  if (!owns(cmd)) return false;

  // Inhaber-Schalter: immer verfügbar (auch in nicht freigeschalteten Gruppen)
  if (cmd === 'spielgruppe') {
    try { await handleSpielgruppe(ctx); } catch (e) { _logger.warn({ e }, 'spielgruppe Fehler'); }
    return true;
  }

  if (!mgrs.economy) {
    await ctx.reply('🎮 Spielmodus ist nicht verfügbar (keine Datenbank konfiguriert).');
    return true;
  }
  if (!isGameGroup(ctx.config, ctx.jid)) {
    await ctx.reply(`🚫 Spiele & Wirtschaft sind hier nicht freigeschaltet.\nDer Inhaber kann sie mit *${ctx.COMMAND_PREFIX}spielgruppe an* aktivieren.`);
    return true;
  }

  try {
    await dispatch(ctx);
  } catch (e) {
    _logger.warn({ e, cmd }, 'Spiel-Befehl Fehler');
    await ctx.reply('⚠️ Bei diesem Befehl ist etwas schiefgelaufen. Versuch es später erneut.');
  }
  return true;
}

// ---- Inhaber: Spiele in dieser Gruppe an/aus ----
async function handleSpielgruppe(ctx) {
  const { args, jid, senderJid, reply, config, persist, isCommunityOwner, COMMAND_PREFIX } = ctx;
  if (!(await isCommunityOwner(senderJid, jid))) { await reply('⛔ Nur der Community-Inhaber kann das.'); return; }
  const onoff = (args[0] || '').toLowerCase();
  if (onoff !== 'an' && onoff !== 'aus') { await reply(`Nutzung: ${COMMAND_PREFIX}spielgruppe an|aus`); return; }
  if (onoff === 'an' && !mgrs.economy) { await reply('⚠️ Es ist keine Datenbank (Turso) konfiguriert – Spiele können nicht aktiviert werden.'); return; }
  setGameGroup(config, jid, onoff === 'an');
  await persist();
  await reply(onoff === 'an'
    ? '🎮 *Spiele & Wirtschaft sind in dieser Gruppe jetzt AKTIV!*\nTippe !hilfespiel für alle Befehle.'
    : '🚫 Spiele & Wirtschaft hier deaktiviert.');
}

async function dispatch(ctx) {
  const { cmd } = ctx;
  if (WORLD_CMDS.includes(cmd)) return worldCmd(ctx);
  else if (PROF_CMDS.includes(cmd)) return profCmd(ctx);
  else if (ECON_CMDS.includes(cmd)) return econ(ctx);
  else if (CASINO_CMDS.includes(cmd)) return casino(ctx);
  else if (SHOP_CMDS.includes(cmd)) return shopCmd(ctx);
  else if (QUEST_CMDS.includes(cmd)) return questCmd(ctx);
  else if (CLAN_CMDS.includes(cmd)) return clanCmd(ctx);
  else if (cmd === 'hilfewelt') {
    await ctx.reply('🌍 *Weltbefehle*\n\n!karte – Weltkarte\n!reisen <region> – Bereise eine Region\n!region – Info zur aktuellen Region\n!standort – Wo bin ich?\n!kämpfen – Monster bekämpfen\n!jagd – Jagd starten (5/Tag)\n!sammeln – Rohstoffe sammeln\n!ressourcen – Meine Rohstoffe\n!erkunden – Gebiet erkunden\n!bestiarium – Alle Monster\n!topjaeger – Weltrangliste');
  } else if (cmd === 'hilfeberuf') {
    await ctx.reply('💼 *Berufsbefehle*\n\n!berufe – Alle Berufe anzeigen\n!beruf – Mein Beruf\n!beruf <id> wählen – Beruf wählen\n!berufsarbeit – Berufsarbeit ausführen\n!berufseinnahmen – Passive Einnahmen abholen\n!berufsrangliste – Top-Spieler nach Beruf');
  }
}

// ====================================================================
// Wirtschaft
// ====================================================================
async function econ(ctx) {
  const { cmd, args, jid, msg, senderJid, reply, sock, getTargetJid, COMMAND_PREFIX } = ctx;
  const eco = mgrs.economy;

  switch (cmd) {
    case 'balance': case 'kontostand': case 'geld': {
      const [cash, bank, lvl] = await Promise.all([
        eco.getBalance(senderJid), eco.getBank(senderJid), eco.getLevelInfo(senderJid),
      ]);
      await reply(`💰 *Dein Konto*\n\nBrieftasche: ${fmt(cash)}\nBank: ${fmt(bank)}\n⭐ Level ${lvl.level} (${lvl.intoLevel}/${lvl.levelSpan} XP)`);
      return;
    }
    case 'vermögen': case 'networth': {
      const nw = await eco.getNetWorth(senderJid);
      const inv = await eco.getInventory(senderJid);
      await reply(`💎 *Gesamtvermögen*\n\n💵 Bargeld: ${fmt(nw.cash)}\n🏦 Bank: ${fmt(nw.bank)}\n🏠 Häuser (${inv.length}): ${fmt(nw.houses)}\n─────────────\n🌟 Gesamt: ${fmt(nw.total)}`);
      return;
    }
    case 'daily': {
      const r = await eco.claimDaily(senderJid);
      if (!r.ok) { await reply(`⏳ Schon abgeholt. Komm in ${fmtWait(r.waitMs)} wieder.`); return; }
      await reply(`🎁 Tagesbonus: *${fmt(r.reward)}* (Streak: ${r.streak} 🔥)\nKontostand: ${fmt(r.balance)}`);
      await reportAch(ctx, senderJid);
      return;
    }
    case 'arbeiten': case 'work': {
      const r = await eco.work(senderJid);
      if (!r.ok) { await reply(`😴 Du bist müde. Arbeite wieder in ${fmtWait(r.waitMs)}.`); return; }
      try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'work'); } catch (_) {}
      await reply(`💼 ${r.text} und +${fmt(r.earned)} verdient!\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'miete': {
      const r = await eco.collectRent(senderJid);
      if (!r.ok) { await reply(r.reason || `⏳ Miete gibt's wieder in ${fmtWait(r.waitMs)}.`); return; }
      await reply(`🏠 Mieteinnahmen aus ${r.houses} Häusern: *${fmt(r.rent)}*\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'markt': {
      const tier = Number(args[0]) || null;
      let list = HOUSES;
      if (tier) list = HOUSES.filter((h) => h.tier === tier);
      const cheapest = [...list].sort((a, b) => a.price - b.price).slice(0, 12);
      const lines = cheapest.map((h) => `[${h.id}] ${h.name} – ${fmt(h.price)} (T${h.tier})`).join('\n');
      await reply(`🏠 *Immobilienmarkt*${tier ? ` (Tier ${tier})` : ''}\n\n${lines}\n\nFilter: ${COMMAND_PREFIX}markt <1-5>\nKaufen: ${COMMAND_PREFIX}kaufen <id>`);
      return;
    }
    case 'kaufen': {
      const houseId = (args[0] || '').toLowerCase();
      if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}kaufen <haus-id> · Markt: ${COMMAND_PREFIX}markt`); return; }
      const r = await eco.buyHouse(senderJid, houseId);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'buyhouse'); } catch (_) {}
      await reply(`🏠 *${r.house.name}* gekauft für ${fmt(r.price)}!\nKontostand: ${fmt(r.remaining)}`);
      await reportAch(ctx, senderJid);
      return;
    }
    case 'verkaufen': {
      const houseId = (args[0] || '').toLowerCase();
      if (!houseId) { await reply(`Nutzung: ${COMMAND_PREFIX}verkaufen <haus-id>`); return; }
      const r = await eco.sellHouse(senderJid, houseId);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`✅ *${r.house.name}* verkauft für ${fmt(r.sellPrice)}.\nKontostand: ${fmt(r.newBalance)}`);
      return;
    }
    case 'inventar': case 'häuser': {
      const inv = await eco.getInventory(senderJid);
      if (!inv.length) { await reply(`Du besitzt noch keine Häuser. Schau in den ${COMMAND_PREFIX}markt!`); return; }
      const lines = inv.map((e) => `[${e.house.id}] ${e.house.name} (T${e.house.tier}) – ${fmt(e.house.price)}`).join('\n');
      const worth = inv.reduce((s, e) => s + e.house.price, 0);
      await reply(`🏡 *Deine Häuser* (${inv.length})\n\n${lines}\n\nGesamtwert: ${fmt(worth)}`);
      return;
    }
    case 'pay': case 'überweisen': {
      const target = getTargetJid(msg);
      const amount = Number(args.find((a) => /^\d+$/.test(a)));
      if (!target || !amount) { await reply(`Nutzung: ${COMMAND_PREFIX}pay @person <Betrag>`); return; }
      if (target === senderJid) { await reply('Du kannst dir nicht selbst Geld überweisen. 😄'); return; }
      const tax = economyMod.calcTax ? economyMod.calcTax(amount) : 0;
      const r = await eco.pay(senderJid, target, amount, tax);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      if (tax > 0) { try { await eco.addBalance('jackpot_system', tax); } catch (_) {} }
      try { await eco.setMeta(senderJid, 'total_given', (await eco.getMeta(senderJid, 'total_given')) + amount); } catch (_) {}
      const taxNote = tax > 0 ? `\n💼 Steuer: ${fmt(tax)} (zum Jackpot)` : '';
      await sock.sendMessage(jid, { text: `💸 Du hast @${target.split('@')[0]} ${fmt(r.amount)} überwiesen.${taxNote}`, mentions: [target] }, { quoted: msg });
      return;
    }
    case 'level': case 'rang': case 'levelcard': case 'profil': {
      if (typeof eco.getRankCard === 'function') {
        const card = await eco.getRankCard(senderJid);
        await reply(`╔══════════════╗\n*SPIELERPROFIL*\n╚══════════════╝\n\n${card}`);
      } else {
        const lvl = await eco.getLevelInfo(senderJid);
        const pr = await eco.getPrestige(senderJid);
        const filled = lvl.levelSpan > 0 ? Math.floor((lvl.intoLevel / lvl.levelSpan) * 10) : 0;
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
        await reply(`⭐ *Level ${lvl.level}*${pr > 0 ? ` · Prestige ${pr}✨` : ''}\n[${bar}] ${lvl.intoLevel}/${lvl.levelSpan} XP`);
      }
      return;
    }
    case 'achievements': case 'erfolge': {
      const list = await eco.getAchievements(senderJid);
      if (!list.length) { await reply('Noch keine Erfolge. Kauf ein Haus oder werde reich! 🏆'); return; }
      await reply(`🏆 *Deine Erfolge* (${list.length})\n\n${list.map((a) => `${a.def.name} – ${a.def.desc}`).join('\n')}`);
      return;
    }
    case 'prestige': {
      if ((args[0] || '').toLowerCase() === 'info') {
        const p = await eco.getPrestige(senderJid);
        const lvl = await eco.getLevelInfo(senderJid);
        await reply(`✨ *Prestige-Info*\nDein Prestige: ${p} ⭐\nLevel: ${lvl.level} (brauchst Level 50)\nBelohnung: ${fmt(100000 * (p + 1))} + Doppel-XP`);
        return;
      }
      const r = await eco.prestige(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`✨ *PRESTIGE ${r.prestige}!*\nBelohnung: ${fmt(r.reward)}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'einzahlen': case 'deposit': {
      const amount = Number(args[0]);
      if (!amount) { await reply(`Nutzung: ${COMMAND_PREFIX}einzahlen <Betrag>`); return; }
      const r = await eco.deposit(senderJid, amount);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`🏦 ${fmt(amount)} eingezahlt.\nBrieftasche: ${fmt(r.cash)} | Bank: ${fmt(r.bank)}`);
      await reportAch(ctx, senderJid);
      return;
    }
    case 'auszahlen': case 'withdraw': {
      const amount = Number(args[0]);
      if (!amount) { await reply(`Nutzung: ${COMMAND_PREFIX}auszahlen <Betrag>`); return; }
      const r = await eco.withdraw(senderJid, amount);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`💵 ${fmt(amount)} abgehoben.\nBrieftasche: ${fmt(r.cash)} | Bank: ${fmt(r.bank)}`);
      return;
    }
    case 'zinsen': {
      const r = await eco.collectInterest(senderJid);
      if (!r.ok) { await reply(r.reason ? `❌ ${r.reason}` : `⏳ Zinsen gibt's wieder in ${fmtWait(r.waitMs)}.`); return; }
      await reply(`💹 Tageszins: *+${fmt(r.interest)}* (1%)\nBank: ${fmt(r.bank)}`);
      return;
    }
    case 'reich': case 'rangliste': case 'reichrangliste': case 'weltrangliste': {
      const top = await eco.getLeaderboard('wealth');
      if (!top.length) { await reply('Noch keine Spieler in der Rangliste. Kauf das erste Haus! 🏠'); return; }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((p, i) => `${medals[i] || `${i + 1}.`} @${p.userId.split('@')[0]} – ${fmt(p.totalValue + p.balance + p.bank)}`);
      await sock.sendMessage(jid, { text: `💰 *Reichste Spieler*\n\n${lines.join('\n')}`, mentions: top.map((p) => p.userId) });
      return;
    }
    case 'levelrangliste': {
      const top = await eco.getLeaderboard('level');
      if (!top.length) { await reply('Noch keine Level-Daten.'); return; }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((p, i) => `${medals[i] || `${i + 1}.`} @${p.userId.split('@')[0]} – Level ${p.level} (${p.xp} XP)`);
      await sock.sendMessage(jid, { text: `⭐ *Level-Rangliste*\n\n${lines.join('\n')}`, mentions: top.map((p) => p.userId) });
      return;
    }
    case 'prestigerangliste': {
      const top = await eco.getLeaderboard('prestige');
      if (!top.length) { await reply('Noch keine Prestige-Daten.'); return; }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((p, i) => `${medals[i] || `${i + 1}.`} @${p.userId.split('@')[0]} – Prestige ${p.prestige} ✨`);
      await sock.sendMessage(jid, { text: `✨ *Prestige-Rangliste*\n\n${lines.join('\n')}`, mentions: top.map((p) => p.userId) });
      return;
    }
    case 'lotto': case 'lotterie': {
      const n = Math.max(1, Number(args[0]) || 1);
      const r = await eco.buyTicket(senderJid, n);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      const pot = await eco.getLotteryPot();
      await reply(`🎟️ ${n} Los(e) gekauft (${fmt(r.cost)}).\nDu hast ${r.tickets} Lose.\nJackpot heute: ${fmt(pot.pot)} (${pot.players} Spieler)`);
      return;
    }
    case 'jackpot': {
      const pot = await eco.getLotteryPot();
      await reply(`💰 *Lotto-Jackpot*\nHeute: ${fmt(pot.pot)}\nSpieler: ${pot.players}\nLose gesamt: ${pot.tickets}`);
      return;
    }
    case 'saisonbonus': {
      const r = await eco.claimSeasonalBonus(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`${r.season.name} Bonus! +${fmt(r.reward)}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'stats': case 'statistik': {
      const s = await eco.getStats(senderJid);
      const lvl = await eco.getLevelInfo(senderJid);
      const pr = await eco.getPrestige(senderJid);
      const row = (k) => fmt(Number(s[k] || 0));
      await reply(`📊 *Deine Statistik*\n\n⭐ Level ${lvl.level} · Prestige ${pr}\n💸 Verdient: ${row('total_earned')}\n🎰 Gespielt: ${Number(s.total_work || 0)}× gearbeitet`);
      return;
    }
  }
}

// ====================================================================
// Casino
// ====================================================================
async function casino(ctx) {
  const { cmd, args, jid, msg, senderJid, reply, sock, getTargetJid, COMMAND_PREFIX } = ctx;
  const game = mgrs.game;
  const events = mgrs.events;
  const betArg = () => Number(args.find((a) => /^\d+$/.test(a))) || 0;

  switch (cmd) {
    case 'slots': {
      const r = await game.slots(senderJid, betArg());
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.win > 0) { await reportWin(senderJid); try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'slots'); } catch (_) {} }
      await reply(`🎰 ${r.reel.join(' | ')}\n${r.win > 0 ? `✨ x${r.mult} → +${fmt(r.win)}` : '💸 Leider nichts.'}\nKontostand: ${fmt(r.balance)}`);
      if (r.win > 0) await reportAch(ctx, senderJid);
      return;
    }
    case 'coinflip': case 'cf': {
      const side = (args.find((a) => /^(kopf|zahl|k|z)$/i.test(a)) || '').toLowerCase();
      const choice = side.startsWith('k') ? 'kopf' : side.startsWith('z') ? 'zahl' : '';
      if (!choice) { await reply(`Nutzung: ${COMMAND_PREFIX}coinflip <kopf|zahl> <Einsatz>`); return; }
      const r = await game.coinflip(senderJid, betArg(), choice);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.won) await reportWin(senderJid);
      await reply(`🪙 ${r.result === 'kopf' ? '🙂 Kopf' : '🔢 Zahl'}\n${r.won ? `✅ Gewonnen! +${fmt(r.bet * 2)}` : '❌ Verloren.'}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'würfelwette': {
      const r = await game.diceBet(senderJid, betArg());
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.outcome === 'gewonnen') await reportWin(senderJid);
      await reply(`🎲 Du: ${r.you} | Bot: ${r.bot} → *${r.outcome}*\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'roulette': {
      const choice = args.find((a) => !/^\d+$/.test(a) || Number(a) <= 36) || args[0];
      const r = await game.roulette(senderJid, betArg(), choice);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.win > 0) await reportWin(senderJid);
      await reply(`🎡 Kugel: *${r.result}* (${r.color})\n${r.win > 0 ? `🎉 +${fmt(r.win)}` : '💸 Verloren.'}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'blackjack': case 'bj': {
      const r = await game.blackjack(senderJid, betArg());
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.win > 0) await reportWin(senderJid);
      await reply(`🃏 *Blackjack*\nDu: ${r.playerHand} (${r.pv})\nDealer: ${r.dealerHand} (${r.dv})\n${r.outcome}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'poker': {
      const r = await game.poker(senderJid, betArg());
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.win > 0) { await reportWin(senderJid); try { if (mgrs.quest) await mgrs.quest.track(senderJid, 'poker'); } catch (_) {} }
      await reply(`🂡 *Poker*\nDu: ${r.playerHand}\n   → ${r.playerRank}\nBot: ${r.botHand}\n   → ${r.botRank}\n\n${r.outcome}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'crash': {
      const cashout = Number(args.find((a) => /^\d+([.,]\d+)?x?$/.test(a) && /[.,x]/.test(a))?.replace(',', '.').replace('x', '')) || 2.0;
      const r = await game.crash(senderJid, betArg(), cashout);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.won) await reportWin(senderJid);
      await reply(`🚀 *Crash* bei ${r.crashAt}x (Ziel: ${r.cashoutAt}x)\n${r.won ? `✅ Ausgezahlt → +${fmt(r.win)}` : '💥 Zu spät – verloren.'}\nKontostand: ${fmt(r.balance)}\n_Tipp: ${COMMAND_PREFIX}crash <Einsatz> <Ziel z.B. 1.8x>_`);
      return;
    }
    case 'keno': {
      const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
      const bet = nums.length > 5 ? nums[0] : betArg();
      const picks = (nums.length > 5 ? nums.slice(1) : nums.filter((n) => n <= 20)).slice(0, 5);
      if (picks.length !== 5) { await reply(`Nutzung: ${COMMAND_PREFIX}keno <Einsatz> <5 Zahlen 1-20>\nz.B. ${COMMAND_PREFIX}keno 100 3 7 11 15 19`); return; }
      const r = await game.keno(senderJid, bet, picks);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.win > 0) await reportWin(senderJid);
      await reply(`🔢 *Keno*\nDeine Zahlen: ${picks.join(' ')}\nGezogen: ${(r.drawn || []).join(' ')}\nTreffer: ${r.hits ?? '?'} → ${r.win > 0 ? `+${fmt(r.win)}` : 'kein Gewinn'}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'hl': case 'higherlower': {
      const guess = (args.find((a) => /^(höher|hoeher|tiefer|h|t)$/i.test(a)) || '').toLowerCase();
      const g = guess.startsWith('h') ? 'höher' : guess.startsWith('t') ? 'tiefer' : '';
      if (!g) { await reply(`Nutzung: ${COMMAND_PREFIX}hl <höher|tiefer> <Einsatz>`); return; }
      const r = await game.higherLower(senderJid, betArg(), g);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.won) await reportWin(senderJid);
      await reply(`🔼🔽 Erste: ${r.first} → Zweite: ${r.second}\n${r.won ? `✅ Richtig! +${fmt(Math.floor(r.bet * 1.9))}` : '❌ Falsch.'}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'rauben': case 'rob': {
      const target = getTargetJid(msg);
      if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}rauben @person`); return; }
      if (target === senderJid) { await reply('Dich selbst ausrauben? 🤔'); return; }
      const r = await game.rob(senderJid, target);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      if (r.success) {
        await sock.sendMessage(jid, { text: `🦹 @${senderJid.split('@')[0]} hat @${target.split('@')[0]} *${fmt(r.stolen)}* geklaut!`, mentions: [senderJid, target] });
      } else {
        await reply(`👮 Erwischt! Strafe: ${fmt(r.fine)}\nKontostand: ${fmt(r.balance)}`);
      }
      return;
    }
    case 'glücksrad': case 'wheel': {
      const r = await events.wheel(senderJid, betArg());
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.win > 0) await reportWin(senderJid);
      await reply(`🎡 *Glücksrad*: ${r.segment} (x${r.mult})\n${r.win > 0 ? `+${fmt(r.win)}` : '💸 Niete.'}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'rubbellos': case 'scratch': {
      const r = await events.scratch(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reportGamble(senderJid);
      if (r.prize > 0) await reportWin(senderJid);
      await reply(`🎫 *Rubbellos* (${fmt(r.cost)})\n${r.symbol} ${r.label}\n${r.prize > 0 ? `🎉 +${fmt(r.prize)}` : ''}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'box': {
      const tier = (args[0] || '').toLowerCase();
      if (!tier) { await reply(`Nutzung: ${COMMAND_PREFIX}box <stufe>\nVersuch z.B. ${COMMAND_PREFIX}box basic`); return; }
      const r = await events.openBox(senderJid, tier);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`📦 *${tier}-Box* geöffnet!\n🎁 Inhalt: ${fmt(r.content)} (${r.profit >= 0 ? '+' : ''}${fmt(r.profit)})\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'tagesbox': {
      const r = await events.dailyBox(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`🎁 *Tagesbox*${r.free ? ' (kostenlos!)' : ' (500 🪙)'}\nInhalt: *+${fmt(r.prize)}*\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'event': case 'ereignis': {
      const r = await events.randomEvent(senderJid);
      if (!r.ok) { await reply(`⏳ Nächstes Ereignis in ${fmtWait(r.waitMs)}.`); return; }
      await reply(`🎲 *Zufallsereignis*\n${r.text}\n${r.delta >= 0 ? `🎉 +${fmt(r.delta)}` : `💸 ${fmt(r.delta)}`}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
  }
}

// ====================================================================
// Shop
// ====================================================================
async function shopCmd(ctx) {
  const { cmd, args, senderJid, reply, COMMAND_PREFIX } = ctx;
  const shop = mgrs.shop;
  if (!shop) { await reply('🛒 Der Shop ist gerade nicht verfügbar.'); return; }

  switch (cmd) {
    case 'shop': {
      const list = (shopMod && shopMod.shopList) ? shopMod.shopList() : 'Shop-Katalog nicht verfügbar.';
      await reply(list);
      return;
    }
    case 'kaufenitem': case 'buyitem': {
      const itemId = (args[0] || '').toLowerCase();
      if (!itemId) { await reply(`Nutzung: ${COMMAND_PREFIX}kaufenitem <item-id> · Katalog: ${COMMAND_PREFIX}shop`); return; }
      const r = await shop.buyItem(senderJid, itemId);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`✅ *${r.item.name}* gekauft für ${fmt(r.price)}!\nKontostand: ${fmt(r.balance)}`);
      await reportAch(ctx, senderJid);
      return;
    }
    case 'items': case 'meineitems': {
      const items = await shop.getItems(senderJid);
      if (!items.length) { await reply(`Du besitzt keine Items. Schau in den ${COMMAND_PREFIX}shop!`); return; }
      const eff = await shop.getEffects(senderJid);
      await reply(`🎒 *Deine Items* (${items.length})\n\n${items.map((i) => `${i.def.name} [${i.itemId}]`).join('\n')}\n\n⚡ XP x${eff.xpMult} | 🍀 +${eff.luckBonus}% | 💼 ${fmt(eff.dailyIncome)}/Tag`);
      return;
    }
    case 'einkommen': {
      const r = await shop.collectIncome(senderJid);
      if (!r.ok) { await reply(r.reason || '⏳ Einkommen gibt es einmal pro Tag.'); return; }
      await reply(`💼 Tageseinkommen: ${fmt(r.income)}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'tagesdeal': {
      const d = shop.dailyDeal();
      await reply(`✨ *Tagesdeal*: ${d.name}\n~~${fmt(d.price)}~~ → *${fmt(d.salePrice)}*\nKaufen: ${COMMAND_PREFIX}kaufenitem ${d.id}`);
      return;
    }
    case 'crafting': case 'craften': {
      if (!args[0]) {
        const list = (shopMod && shopMod.craftingList) ? shopMod.craftingList() : 'Crafting-Liste nicht verfügbar.';
        await reply(list);
        return;
      }
      const r = await shop.craft(senderJid, args.slice(0, 3).map((s) => s.toLowerCase()));
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`🧪 *Crafting erfolgreich!* → *${r.result.name}*`);
      return;
    }
  }
}

// ====================================================================
// Quests
// ====================================================================
async function questCmd(ctx) {
  const { cmd, args, senderJid, reply, COMMAND_PREFIX } = ctx;
  const quest = mgrs.quest;
  if (!quest) { await reply('🎯 Quests sind gerade nicht verfügbar.'); return; }

  switch (cmd) {
    case 'quests': case 'aufgaben': {
      const daily = await quest.getProgress(senderJid);
      let weekly = [];
      try { weekly = await quest.getWeeklyProgress(senderJid); } catch (_) {}
      const fmtQ = (q) => `${q.claimed ? '✅' : q.done ? '🎁' : '🔄'} ${q.text}\n   ${Math.min(q.progress, q.goal)}/${q.goal} → ${fmt(q.reward)} (id: ${q.id})`;
      let txt = `🎯 *Tagesquests*\n\n${daily.map(fmtQ).join('\n')}`;
      if (weekly.length) txt += `\n\n📅 *Wochenquests*\n\n${weekly.map(fmtQ).join('\n')}`;
      txt += `\n\nBelohnung holen: ${COMMAND_PREFIX}claim <id>`;
      await reply(txt);
      return;
    }
    case 'claim': {
      const qId = (args[0] || '').toLowerCase();
      if (!qId) { await reply(`Nutzung: ${COMMAND_PREFIX}claim <quest-id> (siehe ${COMMAND_PREFIX}quests)`); return; }
      let r = await quest.claim(senderJid, qId);
      if (!r.ok && /nicht aktiv/i.test(r.reason || '')) {
        try { r = await quest.claimWeekly(senderJid, qId); } catch (_) {}
      }
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      let txt = `🎉 Quest abgeschlossen! +${fmt(r.reward)} und +${r.xp} XP.`;
      if (r.leveledUp) txt += `\n⭐ Level aufgestiegen auf ${r.level}!`;
      await reply(txt);
      return;
    }
  }
}

// ====================================================================
// Clan
// ====================================================================
async function clanCmd(ctx) {
  const { args, jid, msg, senderJid, reply, sock, getTargetJid, COMMAND_PREFIX } = ctx;
  const clan = mgrs.clan;
  if (!clan) { await reply('⚔️ Das Clan-System ist gerade nicht verfügbar.'); return; }
  const sub = (args[0] || 'info').toLowerCase();

  switch (sub) {
    case 'info': {
      const info = await clan.getMyClantInfo(senderJid);
      if (!info) { await reply(`Du bist in keinem Clan.\nGründen: ${COMMAND_PREFIX}clan erstellen <Name> <TAG>\nSuchen: ${COMMAND_PREFIX}clan suche`); return; }
      const lines = info.members.map((m) => `${m.role === 'leader' ? '👑' : '⚔️'} @${m.user_id.split('@')[0]} (${m.contribution_xp} XP)`);
      await sock.sendMessage(jid, {
        text: `⚔️ *[${info.tag}] ${info.name}*\n${info.lvlInfo.name} · ${info.xp} XP\n💰 Tresor: ${fmt(Number(info.treasury))}\n👥 ${info.members.length}/${info.lvlInfo.maxMembers}\n${info.description ? `\n_${info.description}_\n` : ''}\n${lines.join('\n')}`,
        mentions: info.members.map((m) => m.user_id),
      });
      return;
    }
    case 'erstellen': case 'create': {
      const name = args.slice(1, -1).join(' ') || args[1];
      const tag = args.length > 2 ? args[args.length - 1] : '';
      if (!name || !tag) { await reply(`Nutzung: ${COMMAND_PREFIX}clan erstellen <Name> <TAG>\nz.B. ${COMMAND_PREFIX}clan erstellen Die Wölfe WOLF`); return; }
      const r = await clan.createClan(senderJid, name, tag);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`⚔️ Clan *[${r.tag}] ${r.name}* gegründet! (-${fmt(r.cost)})`);
      return;
    }
    case 'suche': case 'suchen': case 'search': {
      const list = await clan.searchClans(args.slice(1).join(' '));
      if (!list.length) { await reply('Keine Clans gefunden.'); return; }
      const lines = list.map((c) => `[${c.tag}] ${c.name} – ${c.xp} XP, ${c.memberCount} Mitglieder (id: ${c.clan_id})`);
      await reply(`🔎 *Clans*\n\n${lines.join('\n')}\n\nBeitreten: ${COMMAND_PREFIX}clan beitritt <id>`);
      return;
    }
    case 'beitritt': case 'beitreten': case 'join': {
      const clanId = args[1];
      if (!clanId) { await reply(`Nutzung: ${COMMAND_PREFIX}clan beitritt <clan-id> (siehe ${COMMAND_PREFIX}clan suche)`); return; }
      const r = await clan.joinClan(senderJid, clanId);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`⚔️ Du bist dem Clan *${r.clan.name}* beigetreten! (${r.members} Mitglieder)`);
      return;
    }
    case 'verlassen': case 'leave': {
      const r = await clan.leaveClan(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply('👋 Du hast den Clan verlassen.');
      return;
    }
    case 'spenden': case 'donate': {
      const amount = Number(args[1]);
      if (!amount) { await reply(`Nutzung: ${COMMAND_PREFIX}clan spenden <Betrag>`); return; }
      const r = await clan.donateToTreasury(senderJid, amount);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`💰 ${fmt(r.amount)} gespendet (+${r.xpGain} Clan-XP).\nTresor: ${fmt(r.treasury)}`);
      return;
    }
    case 'kick': {
      const target = getTargetJid(msg);
      if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}clan kick @person`); return; }
      const r = await clan.kickMember(senderJid, target);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await sock.sendMessage(jid, { text: `⚔️ @${target.split('@')[0]} wurde aus dem Clan entfernt.`, mentions: [target] });
      return;
    }
    case 'übertragen': case 'transfer': {
      const target = getTargetJid(msg);
      if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}clan übertragen @person`); return; }
      const r = await clan.transferLeadership(senderJid, target);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await sock.sendMessage(jid, { text: `👑 Führung an @${target.split('@')[0]} übergeben.`, mentions: [target] });
      return;
    }
    case 'beschreibung': case 'desc': {
      const desc = args.slice(1).join(' ');
      const r = await clan.setDescription(senderJid, desc);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply('✅ Beschreibung gesetzt.');
      return;
    }
    case 'top': case 'rangliste': {
      const board = await clan.getLeaderboard();
      if (!board.length) { await reply('Noch keine Clans. Gründe den ersten!'); return; }
      const medals = ['🥇', '🥈', '🥉'];
      await reply(`🏰 *Clan-Rangliste*\n\n${board.map((c, i) => `${medals[i] || `${i + 1}.`} [${c.tag}] ${c.name} – ${c.xp} XP`).join('\n')}`);
      return;
    }
    case 'auflösen': case 'dissolve': {
      const r = await clan.dissolveClan(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`🏰 Clan *${r.name}* aufgelöst.${r.treasuryReturned > 0 ? ` Tresor zurück: ${fmt(r.treasuryReturned)}` : ''}`);
      return;
    }
    case 'skills': case 'gildeskills': {
      if (typeof clan.getSkills === 'function') {
        const myMem = await clan.getMembership(senderJid).catch(() => null);
        if (!myMem) { await reply('Du bist in keiner Gilde.'); return; }
        const owned = await clan.getSkills(myMem.clan_id);
        const clanMod2 = require('./future-update/clan');
        const allSkills = clanMod2.GUILD_SKILLS || [];
        const lines = allSkills.map((s) => `${owned.has(s.id) ? '✅' : '🔒'} *${s.name}* [${s.id}] – ${s.cost} XP\n_${s.desc}_${s.requires ? ` (Benötigt: ${s.requires})` : ''}`);
        await reply(`⚔️ *Gilde-Skills*\n\n${lines.join('\n\n')}\nFreischalten: ${COMMAND_PREFIX}clan skills freischalten <skill-id>`);
      }
      if ((args[1] || '') === 'freischalten' || (args[1] || '') === 'unlock') {
        const skillId = args[2];
        if (!skillId) { await reply(`Nutzung: ${COMMAND_PREFIX}clan skills freischalten <skill-id>`); return; }
        const r = await clan.unlockSkill(senderJid, skillId);
        if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
        await reply(`✅ *${r.skill.name}* freigeschaltet!\n_${r.skill.desc}_`);
      }
      return;
    }
    case 'territorium': case 'gildeterritorium': {
      if (typeof clan.claimTerritory === 'function') {
        const regionId = (args[1] || '').toLowerCase();
        if (!regionId) {
          const territories = clan.getTerritories ? clan.getTerritories() : [];
          await reply(`🗺️ *Kontrollierte Gebiete*\n\n${territories.length ? territories.map((t) => `${t.region} → Clan ${t.clanId.split('@')[0]}`).join('\n') : 'Keine Gebiete unter Kontrolle.'}\n\nGebiet beanspruchen: ${COMMAND_PREFIX}clan territorium <region-id>`);
          return;
        }
        const r = await clan.claimTerritory(senderJid, regionId);
        if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
        await reply(`🏴 *${r.clanName}* kontrolliert jetzt *${r.regionId}*!\n+10% Drops für alle Gildenmitglieder in dieser Region.`);
      }
      return;
    }
    default:
      await reply(`⚔️ *Clan/Gilde-Befehle*\n${COMMAND_PREFIX}clan info · ${COMMAND_PREFIX}clan erstellen <Name> <TAG>\n${COMMAND_PREFIX}clan suche [name] · ${COMMAND_PREFIX}clan beitritt <id>\n${COMMAND_PREFIX}clan verlassen · ${COMMAND_PREFIX}clan spenden <betrag>\n${COMMAND_PREFIX}clan top · ${COMMAND_PREFIX}clan skills · ${COMMAND_PREFIX}clan territorium\n${COMMAND_PREFIX}clan auflösen`);
  }
}

// ====================================================================
// Weltbefehle
// ====================================================================
async function worldCmd(ctx) {
  const { cmd, args, senderJid, reply, COMMAND_PREFIX } = ctx;
  const world = mgrs.world;
  if (!world) { await reply('🌍 Weltmodul nicht verfügbar.'); return; }

  switch (cmd) {
    case 'karte': case 'weltkarte': case 'worldmap': {
      const map = await world.getWorldMap();
      await reply(map);
      return;
    }
    case 'standort': case 'ort': case 'location': case 'whereami': {
      const loc = await world.getLocation(senderJid);
      await reply(`📍 Du bist in: ${loc.emoji} *${loc.name}*\n_${loc.description}_\nMonster: ${loc.monsters.join(', ')}`);
      return;
    }
    case 'reisen': case 'travel': {
      const regionId = (args[0] || '').toLowerCase();
      if (!regionId) { await reply(`Nutzung: ${COMMAND_PREFIX}reisen <region-id>\nZeige die Karte mit ${COMMAND_PREFIX}karte`); return; }
      const r = await world.travel(senderJid, regionId);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`✈️ Du reist nach ${r.region.emoji} *${r.region.name}*!\nReisekosten: ${fmt(r.cost)}\nKontostand: ${fmt(r.balance)}\n\n_${r.region.description}_`);
      return;
    }
    case 'region': case 'regioninfo': {
      const regionId = (args[0] || '').toLowerCase();
      if (!regionId) { await reply(`Nutzung: ${COMMAND_PREFIX}region <id>`); return; }
      const r = await world.getRegionInfo(regionId);
      if (!r) { await reply('Region nicht gefunden.'); return; }
      await reply(`${r.emoji} *${r.name}*\n_${r.description}_\n\n⚔️ Monster: ${r.monsters.join(' · ')}\n🌿 Ressourcen: ${r.resources.join(' · ')}\n💰 Reisekosten: ${fmt(r.travelCost)}\n⭐ Min-Level: ${r.minLevel}`);
      return;
    }
    case 'kämpfen': case 'kampf': case 'fight': case 'attack': case 'angreifen': case 'monster': case 'monsterangriff': {
      const r = await world.fight(senderJid);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      const winTxt = r.win
        ? `✅ *Sieg!* +${fmt(r.coinsGained)}${r.drop ? ` + 1× ${r.drop}` : ''}\n+${r.xpGained} XP${r.leveledUp ? ` → 🎉 Level ${r.newLevel}!` : ''}\nHP: ${r.userHpLeft} übrig`
        : `💀 *Niederlage* – du hast ${r.monster.name} verloren.\n+${r.xpGained} XP (Tröstungspreis)`;
      await reply(`⚔️ *Kampf gegen ${r.monster.emoji} ${r.monster.name}*\n(${r.rounds} Runden)\n\n${winTxt}`);
      return;
    }
    case 'jagd': case 'hunt': case 'jagen': {
      const charges = await world.getHuntCharges(senderJid);
      if (charges.remaining <= 0) { await reply(`🏹 Keine Jagdladungen mehr (0/${charges.total}).\nKomm morgen wieder!`); return; }
      const results = await world.hunt(senderJid);
      if (!results.ok) { await reply(`❌ ${results.reason}`); return; }
      const lines = results.battles.map((r, i) =>
        `${i + 1}. ${r.monster.emoji} ${r.monster.name}: ${r.win ? `✅ +${fmt(r.coinsGained)} +${r.xpGained}XP` : '💀 verloren'}`
      );
      await reply(`🏹 *Jagd* (${charges.remaining - 1} Ladungen übrig)\n\n${lines.join('\n')}\n\n💰 Gesamt: ${fmt(results.totalCoins)}\n⭐ Gesamt-XP: ${results.totalXp}`);
      return;
    }
    case 'jagdladungen': {
      const c = await world.getHuntCharges(senderJid);
      await reply(`🏹 Jagdladungen: ${c.remaining}/${c.total}`);
      return;
    }
    case 'flucht': case 'flee': case 'escape': {
      const r = await world.flee(senderJid);
      await reply(r.message);
      return;
    }
    case 'sammeln': case 'ernten': case 'harvest': case 'collect': {
      const r = await world.gather(senderJid);
      if (!r.ok) { await reply(`⏳ Sammeln wieder in ${fmtWait(r.waitMs)}.`); return; }
      const lines = r.gathered.map((g) => `${g.resource.emoji} ${g.resource.name}: ×${g.amount}`);
      await reply(`🌿 *Gesammelt in ${r.region.emoji} ${r.region.name}*\n\n${lines.join('\n')}`);
      return;
    }
    case 'ressourcen': case 'rohstoffe': case 'resources': {
      const res = await world.getResources(senderJid);
      if (!res.length) { await reply('Du hast keine Rohstoffe. Nutze !sammeln in einer Region.'); return; }
      await reply(`🌿 *Deine Rohstoffe*\n\n${res.map((r) => `${r.resource.emoji} ${r.resource.name}: ×${r.amount} (${fmt(r.resource.sellPrice * r.amount)})`).join('\n')}`);
      return;
    }
    case 'verkaufenrohstoffe': case 'rohstoffverkauf': {
      const resId = (args[0] || '').toLowerCase();
      const amount = Number(args[1]) || 0;
      if (!resId || !amount) { await reply(`Nutzung: ${COMMAND_PREFIX}rohstoffverkauf <id> <menge>`); return; }
      const r = await world.sellResources(senderJid, resId, amount);
      if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
      await reply(`✅ ${r.amount}× ${r.resource.emoji} ${r.resource.name} verkauft → +${fmt(r.earned)}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'bestiarium': case 'monsterinfo': {
      const monId = (args[0] || '').toLowerCase();
      if (monId && worldMod && worldMod.findMonster) {
        const m = worldMod.findMonster(monId);
        if (!m) { await reply('Monster nicht gefunden.'); return; }
        await reply(`${m.emoji} *${m.name}*\nHP: ${m.hp} | ATK: ${m.atk} | DEF: ${m.def}\n💰 Drop: ${m.coinMin}–${m.coinMax}\n⭐ XP: ${m.xpReward}\n🎁 Drop-Chance: ${Math.round(m.dropChance * 100)}%`);
      } else {
        const loc = await world.getLocation(senderJid);
        await reply(`📖 *Bestiarium – ${loc.emoji} ${loc.name}*\n\nNutze ${COMMAND_PREFIX}bestiarium <monster-id> für Details.\nMonster hier: ${loc.monsters.join(', ')}`);
      }
      return;
    }
    case 'monsterkills': {
      const kills = await world.getMonsterKills(senderJid);
      await reply(`☠️ *Monster-Abschüsse*\n\nGesamt: ${kills.total}\n\n${kills.byMonster.slice(0, 10).map((k) => `${k.name}: ×${k.kills}`).join('\n')}`);
      return;
    }
    case 'erkunden': case 'explore': case 'erkundung': case 'entdecken': {
      const r = await world.explore(senderJid);
      if (!r.ok) { await reply(`⏳ Erkunden wieder in ${fmtWait(r.waitMs)}.`); return; }
      await reply(`🔭 *Erkundung*\n\n${r.message}${r.reward ? `\n\n${r.rewardText}` : ''}`);
      return;
    }
    case 'weltranking': case 'topjaeger': {
      const board = await world.getWorldLeaderboard();
      if (!board.length) { await reply('Noch keine Spieler in der Welt.'); return; }
      const medals = ['🥇', '🥈', '🥉'];
      await reply(`🌍 *Welt-Rangliste (Monster-Kills)*\n\n${board.map((p, i) => `${medals[i] || `${i + 1}.`} @${p.userId.split('@')[0]}: ${p.kills} Kills`).join('\n')}`);
      return;
    }
    default:
      await reply(`🌍 *Weltbefehle*\n${COMMAND_PREFIX}karte · ${COMMAND_PREFIX}standort · ${COMMAND_PREFIX}reisen <region>\n${COMMAND_PREFIX}kämpfen · ${COMMAND_PREFIX}jagd · ${COMMAND_PREFIX}sammeln · ${COMMAND_PREFIX}ressourcen\n${COMMAND_PREFIX}erkunden · ${COMMAND_PREFIX}bestiarium · ${COMMAND_PREFIX}topjaeger`);
  }
}

// ====================================================================
// Berufsbefehle
// ====================================================================
async function profCmd(ctx) {
  const { cmd, args, senderJid, reply, COMMAND_PREFIX } = ctx;
  const prof = mgrs.professions;
  if (!prof) { await reply('💼 Berufsmodul nicht verfügbar.'); return; }

  const SPECIAL_CMDS = new Set([
    'anpflanzen','pflanzen','feldernten','graben','sprengen','schürfen',
    'handeln','feilschen','investieren','patrouillieren','trainieren','wachen',
    'zaubern','studieren','beschwören','schleichen','klauen','spionieren',
    'kochen','backen','braten','schmieden','schärfen','härten',
    'angeln','netzwerfen','tauchen','brauen','destillieren','experimentieren',
    'kartografieren','spekulieren',
  ]);

  if (SPECIAL_CMDS.has(cmd)) {
    const r = await prof.getSpecialActionResult(senderJid, cmd);
    if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
    await reply(`💼 *${r.action}*\n\n${r.flavor}\n\n+${fmt(r.earned)} | +${r.profXp} Beruf-XP${r.leveledUp ? `\n🎉 Beruf-Level ${r.profLevel}!` : ''}\nKontostand: ${fmt(r.balance)}`);
    return;
  }

  switch (cmd) {
    case 'berufe': {
      const list = prof.getProfessionList();
      await reply(`💼 *Alle Berufe*\n\n${list.map((p) => `${p.emoji} *${p.name}* [${p.id}]\n_${p.description}_\n📈 Einkommen/h: ${fmt(p.passiveIncomePerHour)} | XP-Bonus: +${Math.round((p.xpBonus - 1) * 100)}%`).join('\n\n')}\n\nWählen: ${COMMAND_PREFIX}beruf <id> wählen`);
      return;
    }
    case 'beruf': case 'profession': case 'job': {
      if ((args[1] || '').toLowerCase() === 'wählen' || (args[0] === 'wählen')) {
        const profId = args[0] === 'wählen' ? '' : args[0];
        if (!profId) { await reply(`Nutzung: ${COMMAND_PREFIX}beruf <id> wählen`); return; }
        const r = await prof.chooseProfession(senderJid, profId);
        if (!r.ok) { await reply(`❌ ${r.reason}`); return; }
        await reply(`${r.profession.emoji} Du bist jetzt *${r.profession.name}*!${r.switched ? `\nWechselkosten: ${fmt(r.cost)}` : ''}\n\nSpezial: ${r.profession.specialActions.join(', ')}`);
        return;
      }
      const p = await prof.getProfession(senderJid);
      if (!p) { await reply(`Du hast noch keinen Beruf. Wähle mit ${COMMAND_PREFIX}berufe einen aus.`); return; }
      const bar = '█'.repeat(Math.floor((p.intoLevel / p.levelSpan) * 10)) + '░'.repeat(10 - Math.floor((p.intoLevel / p.levelSpan) * 10));
      await reply(`${p.profession.emoji} *${p.profession.name}* Level ${p.level}\n[${bar}] ${p.intoLevel}/${p.levelSpan} XP\n\n💰 Einkommen/h: ${fmt(p.passiveIncome)}\n⚡ XP-Bonus: +${Math.round((p.xpBonus - 1) * 100)}%\n🎯 Spezial: ${p.profession.specialActions.join(', ')}`);
      return;
    }
    case 'berufsinfo': case 'profinfo': {
      const profId = (args[0] || '').toLowerCase();
      if (!profId) { await reply(`Nutzung: ${COMMAND_PREFIX}berufsinfo <id>`); return; }
      const p = prof.getProfessionInfo(profId);
      if (!p) { await reply('Beruf nicht gefunden.'); return; }
      await reply(`${p.emoji} *${p.name}*\n_${p.description}_\n\nEinkommen/h: ${fmt(p.passiveIncomePerHour)}\nXP-Bonus: +${Math.round((p.xpBonus - 1) * 100)}%\nArbeits-Cooldown: ${Math.round(p.workCooldownMs / 60000)} Min\nVerdienst: ${fmt(p.workRewardMin)}–${fmt(p.workRewardMax)}\n\nSpezial: ${p.specialActions.join(', ')}`);
      return;
    }
    case 'berufsarbeit': case 'jobwork': case 'proftrain': {
      const r = await prof.professionWork(senderJid);
      if (!r.ok) { await reply(`⏳ Berufsarbeit wieder in ${fmtWait(r.waitMs)}.`); return; }
      await reply(`💼 Berufsarbeit: +${fmt(r.earned)}!\n+${r.profXp} Beruf-XP${r.leveledUp ? `\n🎉 Beruf-Level ${r.profLevel}!` : ''}\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'berufseinnahmen': case 'berufseinkommen': {
      const r = await prof.collectPassiveIncome(senderJid);
      if (!r.ok) { await reply(r.reason || `⏳ Passive Einnahmen wieder in ${fmtWait(r.waitMs)}.`); return; }
      await reply(`💰 *Passive Einnahmen*\n\n${fmt(r.earned)} (${r.hours}h × Einkommen/h)\nKontostand: ${fmt(r.balance)}`);
      return;
    }
    case 'berufsrangliste': case 'profleaderboard': {
      const board = await prof.getProfessionLeaderboard();
      if (!board.length) { await reply('Noch keine Beruf-Daten.'); return; }
      const medals = ['🥇', '🥈', '🥉'];
      await reply(`💼 *Berufs-Rangliste*\n\n${board.map((p, i) => `${medals[i] || `${i + 1}.`} @${p.userId.split('@')[0]} – ${p.professionName} Lv.${p.level}`).join('\n')}`);
      return;
    }
    default:
      await reply(`💼 *Berufsbefehle*\n${COMMAND_PREFIX}berufe · ${COMMAND_PREFIX}beruf · ${COMMAND_PREFIX}beruf <id> wählen\n${COMMAND_PREFIX}berufsarbeit · ${COMMAND_PREFIX}berufseinnahmen · ${COMMAND_PREFIX}berufsrangliste`);
  }
}

// ====================================================================
// Kurzhilfe für Spielbefehle
// ====================================================================
function gameHelp(prefix) {
  return `🎮 *Spiel- & Wirtschaftsbefehle*\n\n` +
    `💰 *Wirtschaft*\n${prefix}balance · ${prefix}daily · ${prefix}arbeiten · ${prefix}miete · ${prefix}vermögen · ${prefix}pay @p <betrag> · ${prefix}level · ${prefix}rich\n` +
    `🏠 *Häuser*\n${prefix}markt · ${prefix}kaufen <id> · ${prefix}verkaufen <id> · ${prefix}inventar\n` +
    `🏦 *Bank*\n${prefix}einzahlen <n> · ${prefix}auszahlen <n> · ${prefix}zinsen\n` +
    `🎲 *Casino*\n${prefix}slots <n> · ${prefix}coinflip kopf <n> · ${prefix}blackjack <n> · ${prefix}poker <n> · ${prefix}crash <n> 1.8x · ${prefix}keno <n> 3 7 11 15 19\n` +
    `🎁 *Glück*\n${prefix}glücksrad <n> · ${prefix}rubbellos · ${prefix}box · ${prefix}lotto <n>\n` +
    `🛒 *Shop*\n${prefix}shop · ${prefix}kaufenitem <id> · ${prefix}items · ${prefix}einkommen · ${prefix}crafting\n` +
    `🌍 *Welt*\n${prefix}karte · ${prefix}reisen <region> · ${prefix}kämpfen · ${prefix}jagd · ${prefix}sammeln · ${prefix}erkunden\n` +
    `💼 *Berufe*\n${prefix}berufe · ${prefix}beruf · ${prefix}berufsarbeit · ${prefix}berufseinnahmen\n` +
    `🎯 *Quests*\n${prefix}quests · ${prefix}claim <id>\n` +
    `⚔️ *Gilde*\n${prefix}clan info · ${prefix}clan erstellen <Name> <TAG> · ${prefix}clan top\n` +
    `✨ ${prefix}prestige · ${prefix}achievements · ${prefix}profil · ${prefix}hilfewelt · ${prefix}hilfeberuf`;
}

// Befehle, die mit bestehenden index.js-Spaßbefehlen kollidieren und daher NUR
// in freigeschalteten Spielgruppen vom Spielmodul übernommen werden sollen.
const COLLIDING = new Set(['roulette']);
function collides(cmd) { return COLLIDING.has(cmd); }

module.exports = {
  initModules,
  isReady,
  heartbeat,
  handle,
  owns,
  collides,
  isGameGroup,
  GAME_CMDS,
  gameHelp,
  mgrs,
};
