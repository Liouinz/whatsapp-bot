// 🎯 QUEST-MODUL – NICHT AKTIV
// Tägliche Quests mit Fortschritt & Belohnung. Wird von index.js NICHT geladen.
// Baut auf ../economy.js auf (Coins/XP über EconomyManager). Einbau gemäß INTEGRATION.md.

'use strict';

const { EconomyManager, formatBalance } = require('../economy');

// ====================================================================
// Quest-Pool. Jede Quest: Ziel-Aktion (event), Zielmenge (goal), Belohnung.
// events werden vom Bot beim jeweiligen Befehl gemeldet (trackQuest).
// ====================================================================
const QUEST_POOL = [
  { id: 'play_slots',   text: 'Spiele 3× Slots',            event: 'slots',  goal: 3,  reward: 500,  xp: 30 },
  { id: 'win_game',     text: 'Gewinne 2 Casino-Spiele',    event: 'win',    goal: 2,  reward: 800,  xp: 40 },
  { id: 'earn_coins',   text: 'Verdiene 1000 Coins',        event: 'earn',   goal: 1000, reward: 600, xp: 35 },
  { id: 'do_work',      text: 'Arbeite 2×',                 event: 'work',   goal: 2,  reward: 400,  xp: 25 },
  { id: 'buy_house',    text: 'Kaufe ein Haus',             event: 'buyhouse', goal: 1, reward: 1500, xp: 60 },
  { id: 'gamble_any',   text: 'Setze 5× im Casino',         event: 'gamble', goal: 5,  reward: 700,  xp: 35 },
  { id: 'daily_claim',  text: 'Hole deinen Tagesbonus',     event: 'daily',  goal: 1,  reward: 300,  xp: 20 },
  { id: 'play_roulette', text: 'Spiele 2× Roulette',        event: 'roulette', goal: 2, reward: 600, xp: 30 },
  { id: 'win_big',      text: 'Gewinne 3 Casino-Spiele',    event: 'win',    goal: 3,  reward: 1200, xp: 55 },
  { id: 'buy_item',     text: 'Kaufe ein Shop-Item',        event: 'buyitem', goal: 1, reward: 500,  xp: 30 },
  { id: 'pay_someone',  text: 'Überweise jemandem Coins',   event: 'pay',    goal: 1,  reward: 400,  xp: 25 },
  { id: 'collect_rent', text: 'Kassiere Mieteinnahmen',     event: 'rent',   goal: 1,  reward: 500,  xp: 30 },
  { id: 'rob_someone',  text: 'Versuche einen Raub',        event: 'rob',    goal: 1,  reward: 450,  xp: 28 },
  { id: 'earn_5k',      text: 'Verdiene 5000 Coins',        event: 'earn',   goal: 5000, reward: 1500, xp: 70 },
];

function todaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Wählt deterministisch 3 Tagesquests (für alle Spieler gleich, wechselt täglich).
function dailyQuests() {
  const seed = todaySeed();
  const chosen = [];
  const seen = new Set();
  for (let i = 0; chosen.length < 3 && i < 50; i++) {
    const q = QUEST_POOL[(seed * (i + 1) * 6151) % QUEST_POOL.length];
    if (!seen.has(q.id)) { seen.add(q.id); chosen.push(q); }
  }
  return chosen;
}

// ====================================================================
// QuestManager – Fortschritt pro Spieler & Tag in player_meta
// Schlüssel: q_<seed>_<questId>  (Fortschritt),  qc_<seed>_<questId> (claimed=1)
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
      out.push({ ...q, progress: Math.min(progress, q.goal), done: progress >= q.goal, claimed: claimed === 1 });
    }
    return out;
  }

  // Meldet ein Ereignis (event). amount z. B. verdiente Coins.
  async track(userId, event, amount = 1) {
    const seed = todaySeed();
    const quests = dailyQuests().filter((q) => q.event === event);
    const updated = [];
    for (const q of quests) {
      const key = `q_${seed}_${q.id}`;
      const cur = await this.eco.getMeta(userId, key);
      if (cur >= q.goal) continue;
      const next = cur + amount;
      await this.eco.setMeta(userId, key, next);
      if (next >= q.goal) updated.push(q); // gerade fertig geworden
    }
    return updated; // Liste neu abgeschlossener Quests (für „Quest erfüllt!"-Hinweis)
  }

  async claim(userId, questId) {
    const seed = todaySeed();
    const q = dailyQuests().find((x) => x.id === questId);
    if (!q) return { ok: false, reason: 'Diese Quest ist heute nicht aktiv.' };
    const progress = await this.eco.getMeta(userId, `q_${seed}_${q.id}`);
    if (progress < q.goal) return { ok: false, reason: 'Quest noch nicht abgeschlossen.' };
    const claimed = await this.eco.getMeta(userId, `qc_${seed}_${q.id}`);
    if (claimed === 1) return { ok: false, reason: 'Belohnung bereits abgeholt.' };
    await this.eco.setMeta(userId, `qc_${seed}_${q.id}`, 1);
    const balance = await this.eco.addBalance(userId, q.reward);
    const xp = await this.eco.addXp(userId, q.xp);
    return { ok: true, reward: q.reward, xp: q.xp, balance, level: xp.level, leveledUp: xp.leveledUp };
  }
}

// ====================================================================
// QUEST_COMMANDS – Vorlage für index.js (siehe INTEGRATION.md)
// ====================================================================
/*

  case 'quests': case 'aufgaben': {
    const list = await quest.getProgress(senderJid);
    const lines = list.map((q) => {
      const status = q.claimed ? '✅ abgeholt' : q.done ? `🎁 fertig – ${COMMAND_PREFIX}claim ${q.id}` : `${q.progress}/${q.goal}`;
      return `▸ ${q.text} (${status})\n   Belohnung: ${formatBalance(q.reward)} + ${q.xp} XP`;
    });
    await reply(`🎯 *Tagesquests*\n\n${lines.join('\n')}`);
    break;
  }
  case 'claim': {
    const r = await quest.claim(senderJid, (args[0] || '').toLowerCase());
    if (!r.ok) { await reply(`❌ ${r.reason}`); break; }
    let txt = `🎉 Quest abgeschlossen! +${formatBalance(r.reward)} und +${r.xp} XP.`;
    if (r.leveledUp) txt += `\n⭐ Level aufgestiegen auf ${r.level}!`;
    await reply(txt);
    break;
  }

  // An passenden Stellen Fortschritt melden, z. B.:
  //   await quest.track(senderJid, 'slots');           // bei !slots
  //   await quest.track(senderJid, 'work');            // bei !arbeiten
  //   await quest.track(senderJid, 'earn', verdienst); // wenn Coins verdient
  //   await quest.track(senderJid, 'buyhouse');        // bei !kaufen
  //   await quest.track(senderJid, 'daily');           // bei !daily

*/

module.exports = { QuestManager, QUEST_POOL, dailyQuests };
