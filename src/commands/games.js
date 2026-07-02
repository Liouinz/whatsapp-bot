// Mini-Spiele: !wuerfel, !quiz, !raten — Spielstände sauber pro Gruppe getrennt.
// Laufende Runden liegen im RAM, Siege in game_scores (DB).

import { config } from '../config.js';
import { dbRun, dbRows, bufferXp } from '../db.js';
import { resolveLid } from '../permissions.js';

// Laufende Spiele pro Chat: Map chatJid → { quiz?, raten? }
const active = new Map();

function chatGames(chatJid) {
  if (!active.has(chatJid)) active.set(chatJid, {});
  return active.get(chatJid);
}

const QUIZ = [
  { q: 'Wie viele Kontinente gibt es auf der Erde?', a: ['7', 'sieben'] },
  { q: 'Welches Element hat das Symbol „O"?', a: ['sauerstoff'] },
  { q: 'Wie heißt die Hauptstadt von Australien?', a: ['canberra'] },
  { q: 'Wie viele Minuten hat ein Tag?', a: ['1440'] },
  { q: 'Welcher Planet ist der Sonne am nächsten?', a: ['merkur'] },
  { q: 'In welchem Jahr fiel die Berliner Mauer?', a: ['1989'] },
  { q: 'Wie viele Saiten hat eine klassische Gitarre?', a: ['6', 'sechs'] },
  { q: 'Was ist das größte Säugetier der Welt?', a: ['blauwal'] },
  { q: 'Wie heißt der längste Fluss Deutschlands (nur in DE gemessen)?', a: ['rhein'] },
  { q: 'Wie viele Bundesländer hat Deutschland?', a: ['16', 'sechzehn'] },
  { q: 'Welches Tier ist das Wappentier Berlins?', a: ['bär', 'baer', 'bar'] },
  { q: 'Wie viele Herzen hat ein Oktopus?', a: ['3', 'drei'] },
  { q: 'Welche Farbe entsteht aus Blau und Gelb?', a: ['grün', 'gruen'] },
  { q: 'Wie heißt die kleinste Zahl im Dartboard-Zentrum (Bullseye)?', a: ['50', 'fünfzig', 'fuenfzig'] },
  { q: 'Wie viele Zeitzonen hat Russland (Stand 2026)?', a: ['11', 'elf'] },
];

async function addWin(chatJid, userJid, game, name) {
  await dbRun(
    `INSERT INTO game_scores (group_jid, user_jid, game, wins, name) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(group_jid, user_jid, game) DO UPDATE SET wins = game_scores.wins + 1, name = excluded.name`,
    [chatJid, resolveLid(userJid), game, name || '']
  ).catch(() => {});
}

/**
 * Router-Hook: prüft normale Nachrichten auf Spiel-Antworten (Quiz/Raten).
 * Gibt true zurück, wenn die Nachricht zu einem Spiel gehörte.
 */
export async function checkGameAnswer(ctx) {
  const games = active.get(ctx.chatJid);
  if (!games) return false;
  const guess = ctx.text.trim().toLowerCase();

  // Quiz: erste richtige Antwort gewinnt
  if (games.quiz && guess) {
    if (Date.now() - games.quiz.startedAt > config.games.quizTimeoutMs) {
      const solution = games.quiz.item.a[0];
      delete games.quiz;
      await ctx.reply(`⌛ Zeit um! Die richtige Antwort wäre gewesen: *${solution}*`);
      return false;
    }
    if (games.quiz.item.a.includes(guess)) {
      delete games.quiz;
      await addWin(ctx.chatJid, ctx.sender, 'quiz', ctx.senderName);
      bufferXp(ctx.chatJid, resolveLid(ctx.sender), config.games.xpRewardQuiz, ctx.senderName);
      await ctx.reply(`🎉 Richtig, *${ctx.senderName}*! (+${config.games.xpRewardQuiz} XP)\nNeue Runde: \`!quiz\``);
      return true;
    }
    return false; // falsche Antworten laufen als normale Nachricht weiter
  }

  // Zahlenraten: nur reine Zahlen zählen als Versuch
  if (games.raten && /^\d+$/.test(guess)) {
    const g = games.raten;
    const num = parseInt(guess, 10);
    g.tries++;
    if (num === g.number) {
      delete games.raten;
      await addWin(ctx.chatJid, ctx.sender, 'raten', ctx.senderName);
      bufferXp(ctx.chatJid, resolveLid(ctx.sender), config.games.xpRewardRaten, ctx.senderName);
      await ctx.reply(
        `🎉 *${ctx.senderName}* hat es erraten: Die Zahl war *${g.number}*! ` +
          `(${g.tries} Versuche, +${config.games.xpRewardRaten} XP)`
      );
    } else if (g.tries >= config.games.ratenMaxTries) {
      delete games.raten;
      await ctx.reply(`😅 Das war Versuch ${g.tries} — Runde vorbei! Die Zahl war *${g.number}*. Neue Runde: \`!raten\``);
    } else {
      await ctx.reply(num < g.number ? `📈 *Höher!* (Versuch ${g.tries}/${config.games.ratenMaxTries})` : `📉 *Tiefer!* (Versuch ${g.tries}/${config.games.ratenMaxTries})`);
    }
    return true;
  }

  return false;
}

export const gameCommands = [
  {
    name: 'wuerfel',
    aliases: ['würfel', 'dice'],
    group: 'games',
    desc: 'Würfelt (Standard: 1–6)',
    usage: '!wuerfel [seiten]',
    async run(ctx) {
      let sides = parseInt(ctx.args[0] || '6', 10);
      if (!Number.isFinite(sides) || sides < 2 || sides > 1000) sides = 6;
      const roll = 1 + Math.floor(Math.random() * sides);
      return ctx.reply(`🎲 *${ctx.senderName}* würfelt eine *${roll}* (1–${sides})`);
    },
  },
  {
    name: 'quiz',
    group: 'games',
    desc: 'Startet eine Quizfrage — wer zuerst richtig antwortet, gewinnt',
    usage: '!quiz',
    groupOnly: true,
    async run(ctx) {
      const games = chatGames(ctx.chatJid);
      if (games.quiz && Date.now() - games.quiz.startedAt < config.games.quizTimeoutMs) {
        return ctx.reply(`ℹ️ Es läuft schon eine Frage:\n❓ ${games.quiz.item.q}`);
      }
      const item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
      games.quiz = { item, startedAt: Date.now() };
      return ctx.reply(`🎮 *Quiz-Zeit!*\n❓ ${item.q}\n_Einfach die Antwort in den Chat schreiben — ${Math.round(config.games.quizTimeoutMs / 1000)} s Zeit!_`);
    },
  },
  {
    name: 'raten',
    group: 'games',
    desc: `Zahlenraten (1–${config.games.ratenMax})`,
    usage: '!raten',
    groupOnly: true,
    async run(ctx) {
      const games = chatGames(ctx.chatJid);
      if (games.raten) {
        return ctx.reply(`ℹ️ Es läuft schon eine Runde (Versuch ${games.raten.tries}/${config.games.ratenMaxTries}) — einfach eine Zahl tippen!`);
      }
      games.raten = { number: 1 + Math.floor(Math.random() * config.games.ratenMax), tries: 0 };
      return ctx.reply(
        `🎮 *Zahlenraten!* Ich denke an eine Zahl zwischen *1 und ${config.games.ratenMax}*.\n_Schreib deine Vermutung als Zahl in den Chat — ihr habt ${config.games.ratenMaxTries} Versuche._`
      );
    },
  },
  {
    name: 'spielstand',
    aliases: ['wins'],
    group: 'games',
    desc: 'Zeigt die Spiel-Bestenliste der Gruppe',
    usage: '!spielstand',
    groupOnly: true,
    async run(ctx) {
      const rows = await dbRows(
        'SELECT user_jid, name, game, wins FROM game_scores WHERE group_jid = ? ORDER BY wins DESC LIMIT 10',
        [ctx.chatJid]
      );
      if (!rows.length) return ctx.reply('ℹ️ Noch keine Siege — startet mit `!quiz` oder `!raten`!');
      const lines = rows.map((r, i) => {
        const who = r.name || `+${String(r.user_jid).split('@')[0]}`;
        return `${i + 1}. *${who}* — ${r.wins} Siege (${r.game})`;
      });
      return ctx.reply(`🏆 *Spiel-Bestenliste*\n${lines.join('\n')}`);
    },
  },
];
