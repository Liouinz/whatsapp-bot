// 🎯 QUEST-MODUL – NICHT AKTIV
// Tägliche & wöchentliche Quests mit Fortschritt & Belohnung. Wird von index.js NICHT geladen.
// Baut auf ../economy.js auf (Coins/XP über EconomyManager). Einbau gemäß INTEGRATION.md.

'use strict';

const { EconomyManager, formatBalance } = require('../economy');

// ====================================================================
// Tages-Quest-Pool (3 zufällige pro Tag)
// ====================================================================
const QUEST_POOL = [
  { id: 'play_slots',    text: 'Spiele 3× Slots',                event: 'slots',    goal: 3,    reward: 500,   xp: 30 },
  { id: 'win_game',      text: 'Gewinne 2 Casino-Spiele',        event: 'win',      goal: 2,    reward: 800,   xp: 40 },
  { id: 'earn_coins',    text: 'Verdiene 1.000 Coins',           event: 'earn',     goal: 1000, reward: 600,   xp: 35 },
  { id: 'do_work',       text: 'Arbeite 2×',                     event: 'work',     goal: 2,    reward: 400,   xp: 25 },
  { id: 'buy_house',     text: 'Kaufe ein Haus',                 event: 'buyhouse', goal: 1,    reward: 1500,  xp: 60 },
  { id: 'gamble_any',    text: 'Setze 5× im Casino',             event: 'gamble',   goal: 5,    reward: 700,   xp: 35 },
  { id: 'daily_claim',   text: 'Hole deinen Tagesbonus',         event: 'daily',    goal: 1,    reward: 300,   xp: 20 },
  { id: 'play_roulette', text: 'Spiele 2× Roulette',             event: 'roulette', goal: 2,    reward: 600,   xp: 30 },
  { id: 'win_big',       text: 'Gewinne 3 Casino-Spiele',        event: 'win',      goal: 3,    reward: 1200,  xp: 55 },
  { id: 'buy_item',      text: 'Kaufe ein Shop-Item',            event: 'buyitem',  goal: 1,    reward: 500,   xp: 30 },
  { id: 'pay_someone',   text: 'Überweise jemandem Coins',       event: 'pay',      goal: 1,    reward: 400,   xp: 25 },
  { id: 'collect_rent',  text: 'Kassiere Mieteinnahmen',         event: 'rent',     goal: 1,    reward: 500,   xp: 30 },
  { id: 'rob_someone',   text: 'Versuche einen Raub',            event: 'rob',      goal: 1,    reward: 450,   xp: 28 },
  { id: 'earn_5k',       text: 'Verdiene 5.000 Coins',           event: 'earn',     goal: 5000, reward: 1500,  xp: 70 },
  { id: 'play_poker',    text: 'Spiele 2× Poker',                event: 'poker',    goal: 2,    reward: 700,   xp: 38 },
  { id: 'play_bj',       text: 'Spiele 3× Blackjack',            event: 'blackjack', goal: 3,  reward: 600,   xp: 32 },
  { id: 'play_keno',     text: 'Spiele 2× Keno',                 event: 'keno',     goal: 2,    reward: 550,   xp: 30 },
  { id: 'use_crash',     text: 'Spiele 3× Crash',                event: 'crash',    goal: 3,    reward: 650,   xp: 35 },
  { id: 'horse_bet',     text: 'Setze bei 3 Pferderennen',       event: 'horserace', goal: 3,   reward: 600,   xp: 33 },
  { id: 'craft_item',    text: 'Crafte ein Item',                 event: 'craft',    goal: 1,    reward: 2000,  xp: 80 },
  { id: 'deposit_bank',  text: 'Zahle etwas auf die Bank ein',   event: 'deposit',  goal: 1,    reward: 350,   xp: 22 },
  { id: 'earn_10k',      text: 'Verdiene 10.000 Coins',          event: 'earn',     goal: 10000, reward: 3000, xp: 100 },
  { id: 'win_streak_3',  text: 'Gewinne 3× in Folge (Slots)',    event: 'slotswin', goal: 3,    reward: 1800,  xp: 70 },
  { id: 'gift_item',     text: 'Verschenke ein Item',            event: 'gift',     goal: 1,    reward: 400,   xp: 25 },
  { id: 'market_buy',    text: 'Kaufe auf dem Handelsmarkt',     event: 'market',   goal: 1,    reward: 600,   xp: 30 },
];

// ====================================================================
// Wochen-Quest-Pool (2 zufällige pro Woche, höhere Belohnungen)
// ====================================================================
const WEEKLY_QUEST_POOL = [
  { id: 'w_earn_50k',    text: 'Verdiene 50.000 Coins diese Woche',   event: 'earn',     goal: 50000,  reward: 10000,  xp: 300 },
  { id: 'w_win_10',      text: 'Gewinne 10 Casino-Spiele',            event: 'win',      goal: 10,     reward: 8000,   xp: 250 },
  { id: 'w_buy_3houses', text: 'Kaufe 3 Häuser diese Woche',          event: 'buyhouse', goal: 3,      reward: 15000,  xp: 350 },
  { id: 'w_work_10',     text: 'Arbeite 10× diese Woche',             event: 'work',     goal: 10,     reward: 7000,   xp: 220 },
  { id: 'w_gamble_20',   text: 'Setze 20× im Casino',                 event: 'gamble',   goal: 20,     reward: 12000,  xp: 300 },
  { id: 'w_earn_100k',   text: 'Verdiene 100.000 Coins',              event: 'earn',     goal: 100000, reward: 25000,  xp: 500 },
  { id: 'w_craft_2',     text: 'Crafte 2 Items',                      event: 'craft',    goal: 2,      reward: 20000,  xp: 400 },
  { id: 'w_poker_5',     text: 'Spiele 5× Poker',                     event: 'poker',    goal: 5,      reward: 9000,   xp: 280 },
  { id: 'w_play_all',    text: 'Spiele 5 verschiedene Casino-Spiele', event: 'uniquegame', goal: 5,    reward: 18000,  xp: 380 },
  { id: 'w_gift_3',      text: 'Verschenke 3 Items',                  event: 'gift',     goal: 3,      reward: 8000,   xp: 240 },
];

// ====================================================================
// Welt-Quests (für das neue Weltsystem)
// ====================================================================
const WORLD_QUEST_POOL = [
  { id: 'wq_fight_3',    text: 'Besiege 3 Monster',              event: 'fight_win',   goal: 3,   reward: 800,   xp: 50 },
  { id: 'wq_fight_10',   text: 'Besiege 10 Monster',             event: 'fight_win',   goal: 10,  reward: 2500,  xp: 120 },
  { id: 'wq_travel',     text: 'Reise in eine neue Region',      event: 'travel',      goal: 1,   reward: 500,   xp: 30 },
  { id: 'wq_gather',     text: 'Sammle 3× Rohstoffe',            event: 'gather',      goal: 3,   reward: 600,   xp: 35 },
  { id: 'wq_explore',    text: 'Erkunde eine Region',            event: 'explore',     goal: 1,   reward: 700,   xp: 40 },
  { id: 'wq_hunt',       text: 'Starte eine Jagd',               event: 'hunt',        goal: 1,   reward: 1200,  xp: 60 },
  { id: 'wq_sell_res',   text: 'Verkaufe Rohstoffe',             event: 'sell_res',    goal: 1,   reward: 400,   xp: 25 },
  { id: 'wq_fight_boss', text: 'Besiege 1 Monster in höherer Region', event: 'fight_win', goal: 1, reward: 1500, xp: 75 },
  { id: 'wq_kill_5',     text: 'Sammle 5 Monster-Abschüsse',     event: 'fight_win',   goal: 5,   reward: 1800,  xp: 90 },
  { id: 'wq_flee',       text: 'Fliehe erfolgreich vor einem Monster', event: 'flee_ok', goal: 1, reward: 300,   xp: 20 },
];

// ====================================================================
// Berufs-Quests
// ====================================================================
const PROF_QUEST_POOL = [
  { id: 'pq_work_3',     text: 'Arbeite 3× als Beruf',           event: 'prof_work',   goal: 3,   reward: 600,   xp: 35 },
  { id: 'pq_work_5',     text: 'Arbeite 5× als Beruf',           event: 'prof_work',   goal: 5,   reward: 1200,  xp: 60 },
  { id: 'pq_income',     text: 'Kassiere passive Einnahmen',      event: 'prof_income', goal: 1,   reward: 400,   xp: 25 },
  { id: 'pq_special_2',  text: 'Führe 2 Berufsspezialaktionen aus', event: 'prof_special', goal: 2, reward: 800,  xp: 45 },
  { id: 'pq_levelup',    text: 'Steige im Beruf auf',             event: 'prof_levelup', goal: 1,  reward: 2000,  xp: 100 },
  { id: 'pq_earn_3k',    text: 'Verdiene 3.000 Coins durch Beruf', event: 'prof_earn',  goal: 3000, reward: 1500, xp: 70 },
];

function todaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function weekSeed() {
  const d = new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return d.getFullYear() * 100 + week;
}

// Wählt deterministisch 3 Tagesquests (für alle Spieler gleich, wechselt täglich)
function dailyQuests() {
  const seed = todaySeed();
  const chosen = [];
  const seen = new Set();
  for (let i = 0; chosen.length < 3 && i < 100; i++) {
    const q = QUEST_POOL[(seed * (i + 1) * 6151 + i * 31337) % QUEST_POOL.length];
    if (!seen.has(q.id)) { seen.add(q.id); chosen.push(q); }
  }
  return chosen;
}

// Wählt 2 wöchentliche Quests (wechselt montags)
function weeklyQuests() {
  const seed = weekSeed();
  const chosen = [];
  const seen = new Set();
  for (let i = 0; chosen.length < 2 && i < 100; i++) {
    const q = WEEKLY_QUEST_POOL[(seed * (i + 1) * 8191 + i * 12421) % WEEKLY_QUEST_POOL.length];
    if (!seen.has(q.id)) { seen.add(q.id); chosen.push(q); }
  }
  return chosen;
}

// ====================================================================
// QuestManager – Fortschritt pro Spieler & Tag/Woche in player_meta
// Tages-Keys: q_<seed>_<questId>  (Fortschritt), qc_<seed>_<questId> (claimed=1)
// Wochen-Keys: wq_<wseed>_<questId>, wqc_<wseed>_<questId>
// ====================================================================
class QuestManager {
  constructor(economy) {
    if (!(economy instanceof EconomyManager)) throw new Error('QuestManager braucht eine EconomyManager-Instanz');
    this.eco = economy;
  }

  async getProgress(userId) {
    const seed = todaySeed();
    const quests = dailyQuests();
    const out = [];
    for (const q of quests) {
      const progress = await this.eco.getMeta(userId, `q_${seed}_${q.id}`);
      const claimed = await this.eco.getMeta(userId, `qc_${seed}_${q.id}`);
      out.push({ ...q, progress: Math.min(progress, q.goal), done: progress >= q.goal, claimed: claimed === 1, type: 'daily' });
    }
    return out;
  }

  async getWeeklyProgress(userId) {
    const wseed = weekSeed();
    const quests = weeklyQuests();
    const out = [];
    for (const q of quests) {
      const progress = await this.eco.getMeta(userId, `wq_${wseed}_${q.id}`);
      const claimed = await this.eco.getMeta(userId, `wqc_${wseed}_${q.id}`);
      out.push({ ...q, progress: Math.min(progress, q.goal), done: progress >= q.goal, claimed: claimed === 1, type: 'weekly' });
    }
    return out;
  }

  // Meldet ein Ereignis. Tracked sowohl Tages- als auch Wochenquests.
  async track(userId, event, amount = 1) {
    const seed = todaySeed();
    const wseed = weekSeed();
    const daily = dailyQuests().filter((q) => q.event === event);
    const weekly = weeklyQuests().filter((q) => q.event === event);
    const updated = [];
    for (const q of daily) {
      const key = `q_${seed}_${q.id}`;
      const cur = await this.eco.getMeta(userId, key);
      if (cur >= q.goal) continue;
      const next = cur + amount;
      await this.eco.setMeta(userId, key, next);
      if (next >= q.goal) updated.push({ ...q, type: 'daily' });
    }
    for (const q of weekly) {
      const key = `wq_${wseed}_${q.id}`;
      const cur = await this.eco.getMeta(userId, key);
      if (cur >= q.goal) continue;
      const next = cur + amount;
      await this.eco.setMeta(userId, key, next);
      if (next >= q.goal) updated.push({ ...q, type: 'weekly' });
    }
    return updated;
  }

  async claim(userId, questId) {
    const seed = todaySeed();
    const q = dailyQuests().find((x) => x.id === questId);
    if (!q) return { ok: false, reason: 'Diese Quest ist heute nicht aktiv.' };
    const progress = await this.eco.getMeta(userId, `q_${seed}_${q.id}`);
    if (progress < q.goal) return { ok: false, reason: `Quest noch nicht abgeschlossen. (${Math.min(progress, q.goal)}/${q.goal})` };
    const claimed = await this.eco.getMeta(userId, `qc_${seed}_${q.id}`);
    if (claimed === 1) return { ok: false, reason: 'Belohnung bereits abgeholt.' };
    await this.eco.setMeta(userId, `qc_${seed}_${q.id}`, 1);
    const balance = await this.eco.addBalance(userId, q.reward);
    const xp = await this.eco.addXp(userId, q.xp);
    return { ok: true, quest: q, reward: q.reward, xp: q.xp, balance, level: xp.level, leveledUp: xp.leveledUp };
  }

  async claimWeekly(userId, questId) {
    const wseed = weekSeed();
    const q = weeklyQuests().find((x) => x.id === questId);
    if (!q) return { ok: false, reason: 'Diese Wochenquest ist nicht aktiv.' };
    const progress = await this.eco.getMeta(userId, `wq_${wseed}_${q.id}`);
    if (progress < q.goal) return { ok: false, reason: `Wochenquest noch nicht abgeschlossen. (${Math.min(progress, q.goal)}/${q.goal})` };
    const claimed = await this.eco.getMeta(userId, `wqc_${wseed}_${q.id}`);
    if (claimed === 1) return { ok: false, reason: 'Wochenbelohnung bereits abgeholt.' };
    await this.eco.setMeta(userId, `wqc_${wseed}_${q.id}`, 1);
    const balance = await this.eco.addBalance(userId, q.reward);
    const xp = await this.eco.addXp(userId, q.xp);
    return { ok: true, quest: q, reward: q.reward, xp: q.xp, balance, level: xp.level, leveledUp: xp.leveledUp };
  }

  // Community-Ziel: globaler Fortschritt aller Spieler (gespeichert in player_meta mit user='global')
  async trackGlobal(event, amount = 1) {
    const key = `global_${event}_${todaySeed()}`;
    const cur = await this.eco.getMeta('global', key);
    await this.eco.setMeta('global', key, cur + amount);
    return cur + amount;
  }

  async getGlobalChallenge() {
    const seed = todaySeed();
    // Tages-Community-Challenge: gemeinsam 10.000 Spiele absolvieren
    const events = ['gamble', 'work', 'earn'];
    const challengeEvent = events[seed % events.length];
    const goals = { gamble: 5000, work: 2000, earn: 1000000 };
    const goal = goals[challengeEvent];
    const progress = await this.eco.getMeta('global', `global_${challengeEvent}_${seed}`);
    const pct = Math.min(100, Math.round((progress / goal) * 100));
    return { event: challengeEvent, goal, progress, pct, completed: progress >= goal };
  }
}

// ====================================================================
// QUEST_COMMANDS – Vorlage für index.js (siehe INTEGRATION.md)
// ====================================================================
/*

  case 'quests': case 'aufgaben': {
    const [daily, weekly] = await Promise.all([quest.getProgress(senderJid), quest.getWeeklyProgress(senderJid)]);
    const fmtQ = (q) => {
      const status = q.claimed ? '✅ abgeholt' : q.done ? `🎁 fertig – !claim ${q.id}` : `${q.progress}/${q.goal}`;
      return `▸ ${q.text} (${status})\n   +${formatBalance(q.reward)} & ${q.xp} XP`;
    };
    const dailyTxt = `*📅 Tagesquests*\n${daily.map(fmtQ).join('\n')}`;
    const weeklyTxt = `*📆 Wochenquests*\n${weekly.map(fmtQ).join('\n')}`;
    await reply(`🎯 *Quests*\n\n${dailyTxt}\n\n${weeklyTxt}`);
    break;
  }
  case 'claim': {
    const qId = (args[0] || '').toLowerCase();
    if (!qId) { await reply(`Nutzung: !claim <quest-id>`); break; }
    // Erst Tagesquest versuchen, dann Wochenquest
    let r = await quest.claim(senderJid, qId);
    if (!r.ok && r.reason?.includes('nicht aktiv')) r = await quest.claimWeekly(senderJid, qId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    let txt = `🎉 Quest abgeschlossen! +${formatBalance(r.reward)} und +${r.xp} XP.`;
    if (r.leveledUp) txt += `\n⭐ Level aufgestiegen auf ${r.level}!`;
    await reply(txt);
    break;
  }
  case 'community': case 'globaltask': {
    const ch = await quest.getGlobalChallenge();
    const bar = '█'.repeat(Math.floor(ch.pct / 10)) + '░'.repeat(10 - Math.floor(ch.pct / 10));
    await reply(`🌍 *Community-Challenge*\nZiel: ${ch.event === 'earn' ? formatBalance(ch.goal) + ' Coins verdienen' : ch.goal + '× ' + ch.event}\nFortschritt: [${bar}] ${ch.pct}%\n${ch.completed ? '✅ Heute abgeschlossen!' : 'Macht weiter!'}`);
    break;
  }

  // An passenden Stellen Fortschritt melden, z. B.:
  //   await quest.track(senderJid, 'slots');             // bei !slots
  //   await quest.track(senderJid, 'work');              // bei !arbeiten
  //   await quest.track(senderJid, 'earn', verdienst);   // wenn Coins verdient
  //   await quest.track(senderJid, 'buyhouse');          // bei !kaufen
  //   await quest.track(senderJid, 'daily');             // bei !daily
  //   await quest.track(senderJid, 'gamble');            // bei jedem Casino-Befehl
  //   await quest.track(senderJid, 'win');               // wenn Casino-Spiel gewonnen
  //   await quest.trackGlobal('gamble');                 // globales Community-Ziel

*/

// ====================================================================
// Saisonale Quests – erscheinen nur beim entsprechenden Event
// ====================================================================
const SEASONAL_QUEST_POOL = [
  // Weihnachten
  { id: 'sq_xmas_give', event: 'give', target: 5, reward: 3000, xp: 500, desc: 'Verschenke 5 Items', season: 'xmas' },
  { id: 'sq_xmas_daily', event: 'daily', target: 3, reward: 2500, xp: 400, desc: 'Claime 3x den Tagesbonus', season: 'xmas' },
  { id: 'sq_xmas_slots', event: 'slots', target: 10, reward: 4000, xp: 800, desc: 'Spiele 10x Slots', season: 'xmas' },
  // Halloween
  { id: 'sq_hal_rob', event: 'rob', target: 3, reward: 3500, xp: 600, desc: 'Raube 3 Spieler aus', season: 'halloween' },
  { id: 'sq_hal_keno', event: 'keno', target: 7, reward: 3000, xp: 500, desc: 'Spiele 7x Keno', season: 'halloween' },
  { id: 'sq_hal_event', event: 'event', target: 5, reward: 4500, xp: 900, desc: 'Nutze 5x !event', season: 'halloween' },
  // Silvester
  { id: 'sq_ny_earn', event: 'earn', target: 50000, reward: 5000, xp: 1000, desc: 'Verdiene 50.000 Coins', season: 'newyear' },
  { id: 'sq_ny_win', event: 'win', target: 7, reward: 4000, xp: 700, desc: 'Gewinne 7 Casinospiele', season: 'newyear' },
  // Valentinstag
  { id: 'sq_val_give', event: 'give', target: 3, reward: 2000, xp: 400, desc: 'Verschenke 3 Items', season: 'valentine' },
  { id: 'sq_val_pay', event: 'pay', target: 10000, reward: 2500, xp: 500, desc: 'Überweise 10.000 Coins', season: 'valentine' },
];

function seasonalQuests(seasonId) {
  if (!seasonId) return [];
  return SEASONAL_QUEST_POOL.filter((q) => q.season === seasonId);
}

// ====================================================================
// Achievement-Quests – einmalige Aufgaben für besondere Meilensteine
// ====================================================================
const ACHIEVEMENT_QUESTS = [
  { id: 'aq_first_house', event: 'buyhouse', target: 1, reward: 1000, xp: 200, desc: 'Kaufe dein erstes Haus', once: true },
  { id: 'aq_first_win', event: 'win', target: 1, reward: 500, xp: 100, desc: 'Gewinne dein erstes Casinospiel', once: true },
  { id: 'aq_first_craft', event: 'craft', target: 1, reward: 2000, xp: 400, desc: 'Stelle erstmals ein Item her', once: true },
  { id: 'aq_first_poker', event: 'poker', target: 1, reward: 800, xp: 150, desc: 'Spiele erstmals Poker', once: true },
  { id: 'aq_first_turnier', event: 'tournament_win', target: 1, reward: 5000, xp: 1000, desc: 'Gewinne dein erstes Turnier', once: true },
  { id: 'aq_first_prestige', event: 'prestige', target: 1, reward: 10000, xp: 2000, desc: 'Führe deinen ersten Prestige durch', once: true },
  { id: 'aq_first_clan', event: 'clan_join', target: 1, reward: 1500, xp: 300, desc: 'Trete einem Clan bei', once: true },
  { id: 'aq_collector', event: 'buyitem', target: 10, reward: 5000, xp: 1000, desc: 'Kaufe insgesamt 10 Items', once: true },
  { id: 'aq_high_roller', event: 'gamble', target: 100, reward: 10000, xp: 2000, desc: 'Spiele 100 Casinospiele', once: true },
  { id: 'aq_worker', event: 'work', target: 50, reward: 8000, xp: 1500, desc: 'Arbeite 50 Mal', once: true },
];

QuestManager.prototype.getAchievementQuestProgress = async function (userId, questId) {
  const q = ACHIEVEMENT_QUESTS.find((aq) => aq.id === questId);
  if (!q) return null;
  const claimedKey = `aq_claimed_${questId}`;
  const claimed = await this.eco.getMeta(userId, claimedKey);
  const progressKey = `aq_progress_${questId}`;
  const progress = await this.eco.getMeta(userId, progressKey);
  return { quest: q, progress, claimed: Boolean(claimed), done: progress >= q.target };
};

QuestManager.prototype.trackAchievementQuest = async function (userId, event, amount = 1) {
  for (const q of ACHIEVEMENT_QUESTS) {
    if (q.event !== event) continue;
    const claimedKey = `aq_claimed_${q.id}`;
    const claimed = await this.eco.getMeta(userId, claimedKey);
    if (claimed) continue;
    const progressKey = `aq_progress_${q.id}`;
    const current = await this.eco.getMeta(userId, progressKey);
    await this.eco.setMeta(userId, progressKey, current + amount);
  }
};

QuestManager.prototype.claimAchievementQuest = async function (userId, questId) {
  const q = ACHIEVEMENT_QUESTS.find((aq) => aq.id === questId);
  if (!q) return { ok: false, reason: 'Unbekannte Achievement-Quest.' };
  const claimedKey = `aq_claimed_${q.id}`;
  const claimed = await this.eco.getMeta(userId, claimedKey);
  if (claimed) return { ok: false, reason: 'Bereits abgeholt.' };
  const progressKey = `aq_progress_${q.id}`;
  const progress = await this.eco.getMeta(userId, progressKey);
  if (progress < q.target) return { ok: false, reason: `Noch nicht geschafft. (${progress}/${q.target})` };
  await this.eco.setMeta(userId, claimedKey, 1);
  const newBalance = await this.eco.addBalance(userId, q.reward);
  const levelResult = await this.eco.addXp(userId, q.xp);
  return { ok: true, quest: q, reward: q.reward, xp: q.xp, balance: newBalance, ...levelResult };
};

QuestManager.prototype.getAllAchievementQuests = async function (userId) {
  const result = [];
  for (const q of ACHIEVEMENT_QUESTS) {
    const claimedKey = `aq_claimed_${q.id}`;
    const claimed = await this.eco.getMeta(userId, claimedKey);
    const progressKey = `aq_progress_${q.id}`;
    const progress = await this.eco.getMeta(userId, progressKey);
    result.push({ quest: q, progress, claimed: Boolean(claimed), done: progress >= q.target });
  }
  return result;
};

// ====================================================================
// ADDITIONAL QUEST COMMANDS (Vorlage für index.js)
// ====================================================================
/*

  // ---- Achievement-Quests ----
  case 'meilensteine': case 'achquests': {
    const list = await quest.getAllAchievementQuests(senderJid);
    const open = list.filter((e) => !e.claimed);
    if (!open.length) { await reply('🏅 Alle Meilenstein-Quests abgeschlossen!'); break; }
    const lines = open.slice(0, 8).map((e) => {
      const bar = e.done ? '✅' : `${e.progress}/${e.quest.target}`;
      return `[${e.quest.id}] ${e.quest.desc} – ${bar} → ${formatBalance(e.quest.reward)}`;
    });
    await reply(`🏅 *Meilenstein-Quests*\n\n${lines.join('\n')}\nEinlösen: ${COMMAND_PREFIX}meilenstein-claim <id>`);
    break;
  }
  case 'meilenstein-claim': {
    const qId = (args[0] || '').toLowerCase();
    if (!qId) { await reply(`Nutzung: ${COMMAND_PREFIX}meilenstein-claim <quest-id>`); break; }
    const r = await quest.claimAchievementQuest(senderJid, qId);
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    await reply(`🏅 *Meilenstein abgeschlossen!*\n${r.quest.desc}\n+${formatBalance(r.reward)} | +${r.xp} XP\nKontostand: ${formatBalance(r.balance)}`);
    break;
  }

  // ---- Saisonale Quests ----
  case 'saisonquests': {
    const season = EconomyManager.currentSeason();
    if (!season) { await reply('Aktuell kein saisonales Event aktiv.'); break; }
    const qs = seasonalQuests(season.id);
    if (!qs.length) { await reply('Keine saisonalen Quests verfügbar.'); break; }
    const lines = qs.map((q) => `[${q.id}] ${q.desc} → ${formatBalance(q.reward)}`).join('\n');
    await reply(`${season.name} *Saison-Quests*\n\n${lines}\nFortschritt: ${COMMAND_PREFIX}quests`);
    break;
  }

*/

// ====================================================================
// Fortschritts-Hilfsfunktionen – für alle Quest-Arten
// ====================================================================

// Gibt formatierten Fortschrittsbalken zurück
function questProgressBar(current, target, width = 10) {
  const filled = Math.min(width, Math.floor((current / target) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// Gibt eine kompakte Quest-Zusammenfassung zurück
function formatQuestSummary(quest, progress, claimed) {
  const done = progress >= quest.target;
  const bar = questProgressBar(progress, quest.target);
  const status = claimed ? '✅' : done ? '🎁' : '🔄';
  return `${status} [${quest.id}] ${quest.desc}\n   [${bar}] ${Math.min(progress, quest.target)}/${quest.target} → ${(quest.reward || 0).toLocaleString()} Coins`;
}

// Berechnet Abschluss-Prognose (bei welchem Tempo fertig?)
function estimateCompletion(current, target, eventsPerHour) {
  if (current >= target) return 'Abgeschlossen!';
  if (!eventsPerHour) return 'Unbekannt';
  const remaining = target - current;
  const hours = remaining / eventsPerHour;
  if (hours < 1) return `~${Math.ceil(hours * 60)} Min`;
  return `~${hours.toFixed(1)} Std`;
}

// ====================================================================
// Quest-Kalender – zeigt Quests für die nächsten 7 Tage
// ====================================================================
function questCalendar() {
  const calendar = [];
  for (let i = 0; i < 7; i++) {
    const futureDate = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const seed = futureDate.getFullYear() * 10000 + (futureDate.getMonth() + 1) * 100 + futureDate.getDate();
    const rng = () => { let s = seed + i * 31; return () => { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; };
    const r = rng();
    const picks = [];
    const pool = [...QUEST_POOL];
    while (picks.length < 3 && pool.length) {
      const idx = Math.floor(r() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    const dayName = ['Heute', 'Morgen', 'Übermorgen', 'In 3 Tagen', 'In 4 Tagen', 'In 5 Tagen', 'In 6 Tagen'][i];
    calendar.push({ day: dayName, date: futureDate.toLocaleDateString('de-DE'), quests: picks });
  }
  return calendar;
}

// ====================================================================
// Quest-Reset-Benachrichtigungen – gibt an wann Quests zurückgesetzt werden
// ====================================================================
function questResetInfo() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilDailyReset = tomorrow - now;
  const dayOfWeek = now.getDay(); // 0=Sonntag
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  const msUntilWeeklyReset = nextMonday - now;
  return {
    dailyResetMs: msUntilDailyReset,
    weeklyResetMs: msUntilWeeklyReset,
    dailyResetStr: `${Math.floor(msUntilDailyReset / 3600000)}h ${Math.floor((msUntilDailyReset % 3600000) / 60000)}m`,
    weeklyResetStr: `${Math.floor(msUntilWeeklyReset / 86400000)}d ${Math.floor((msUntilWeeklyReset % 86400000) / 3600000)}h`,
  };
}

// ====================================================================
// Komplette QUEST_COMMANDS Vorlage
// ====================================================================
/*

  // ---- Quests anzeigen ----
  case 'quests': case 'aufgaben': {
    const daily = dailyQuests();
    const weekly = weeklyQuests();
    const resetInfo = questResetInfo();
    const dProgress = await Promise.all(daily.map(async (q) => {
      const p = await quest.getProgress(senderJid, q.id);
      const c = await quest.isClaimed(senderJid, q.id);
      return formatQuestSummary(q, p, c);
    }));
    const wProgress = await Promise.all(weekly.map(async (q) => {
      const p = await quest.getWeeklyProgress(senderJid, q.id);
      const c = await quest.isWeeklyClaimed(senderJid, q.id);
      return formatQuestSummary(q, p, c);
    }));
    const season = EconomyManager.currentSeason();
    let txt = `🎯 *Tagesquests* (Reset in ${resetInfo.dailyResetStr})\n\n${dProgress.join('\n\n')}`;
    txt += `\n\n📅 *Wochenquests* (Reset in ${resetInfo.weeklyResetStr})\n\n${wProgress.join('\n\n')}`;
    if (season) txt += `\n\n🌟 Saisonaler Bonus aktiv: ${season.name}! Nutze ${COMMAND_PREFIX}saisonquests`;
    await reply(txt);
    break;
  }

  // ---- Quest-Kalender ----
  case 'questkalender': case 'questplan': {
    const cal = questCalendar();
    const lines = cal.map((d) => `*${d.day}* (${d.date}):\n${d.quests.map((q) => `  • ${q.desc}`).join('\n')}`);
    await reply(`📅 *Quest-Kalender*\n\n${lines.join('\n\n')}`);
    break;
  }

*/

module.exports = {
  QuestManager, QUEST_POOL, WEEKLY_QUEST_POOL,
  WORLD_QUEST_POOL, PROF_QUEST_POOL,
  SEASONAL_QUEST_POOL, ACHIEVEMENT_QUESTS,
  dailyQuests, weeklyQuests, seasonalQuests,
  questProgressBar, formatQuestSummary, estimateCompletion, questCalendar, questResetInfo,
};
