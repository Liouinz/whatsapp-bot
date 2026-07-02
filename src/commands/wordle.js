// WORTLE — das Wordle für die Gruppe: 5-Buchstaben-Wort in 6 Versuchen,
// Feedback mit 🟩 (richtig), 🟨 (falscher Platz), ⬛ (nicht enthalten).
// Eine Runde pro Gruppe, alle raten gemeinsam.

import { PREFIX } from '../config.js';
import { bufferXp, dbRun } from '../db.js';
import { resolveLid } from '../permissions.js';
import { addCoins } from './economy.js';

const XP_REWARD = 35;
const COIN_REWARD = 60;
const MAX_TRIES = 6;

// 5-Buchstaben-Wörter (Deutsch, ohne Umlaute — ß→SS ausgeschlossen)
const WOERTER = [
  'APFEL', 'BLICK', 'BRIEF', 'BROT-', 'DACHS', 'DAMPF', 'DRAHT', 'DURST',
  'EIMER', 'ERNTE', 'FEIER', 'FERSE', 'FEUER', 'FISCH', 'FLUSS', 'FROST',
  'GABEL', 'GEIGE', 'GLANZ', 'GLUT-', 'GRUBE', 'HAFEN', 'HANDY', 'HONIG',
  'HOTEL', 'HUMOR', 'INSEL', 'KABEL', 'KEKSE', 'KERZE', 'KLIMA', 'KNOPF',
  'KRAFT', 'KRONE', 'KUGEL', 'LACHS', 'LAGER', 'LAMPE', 'LEBEN', 'LICHT',
  'LINIE', 'LUPE-', 'MAGEN', 'MANGO', 'MAUER', 'MEDIA', 'MOTOR', 'MUSIK',
  'NACHT', 'NADEL', 'NEBEL', 'ORGEL', 'PALME', 'PAPST', 'PASTA', 'PAUSE',
  'PIZZA', 'PLATZ', 'PROBE', 'PUNKT', 'QUARK', 'QUELL', 'RADAR', 'RATTE',
  'RAUCH', 'REGAL', 'REGEN', 'REISE', 'RIESE', 'ROBBE', 'SALAT', 'SALTO',
  'SCHAF', 'SEIFE', 'SESAM', 'SOFAS', 'SPIEL', 'SPORT', 'STADT', 'STERN',
  'STIER', 'STOFF', 'STURM', 'TAFEL', 'TANGO', 'TASSE', 'TEICH', 'TIGER',
  'TITEL', 'TORTE', 'TRAUM', 'TRUHE', 'TURBO', 'UHREN', 'VOGEL', 'WAAGE',
  'WELLE', 'WIESE', 'WOLKE', 'WURST', 'ZANGE', 'ZEBRA', 'ZIEGE', 'ZWERG',
].filter((w) => !w.includes('-')); // Platzhalter mit '-' aussortieren

const active = new Map(); // groupJid → { word, tries: [{guess, fb}], startedAt }

function feedback(guess, word) {
  const result = new Array(5).fill('⬛');
  const remaining = word.split('');
  // Erst exakte Treffer …
  for (let i = 0; i < 5; i++) {
    if (guess[i] === word[i]) {
      result[i] = '🟩';
      remaining[i] = null;
    }
  }
  // … dann falsche Plätze (jede Buchstaben-Instanz nur einmal zählen)
  for (let i = 0; i < 5; i++) {
    if (result[i] === '🟩') continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) {
      result[i] = '🟨';
      remaining[idx] = null;
    }
  }
  return result.join('');
}

function board(game) {
  const rows = game.tries.map((t) => `${t.fb}  \`${t.guess}\``);
  const left = MAX_TRIES - game.tries.length;
  return `${rows.join('\n') || '_Noch keine Versuche._'}\n\n${left} Versuch${left === 1 ? '' : 'e'} übrig · \`${PREFIX}wort <WORT>\``;
}

export const wordleCommands = [
  {
    name: 'wortle',
    aliases: ['wordle'],
    group: 'games',
    desc: 'Wortle: 5-Buchstaben-Wort in 6 Versuchen knacken',
    usage: '!wortle',
    groupOnly: true,
    async run(ctx) {
      const existing = active.get(ctx.chatJid);
      if (existing && Date.now() - existing.startedAt < 30 * 60_000 && existing.tries.length < MAX_TRIES) {
        return ctx.reply(`ℹ️ Hier läuft schon ein Wortle!\n${board(existing)}`);
      }
      const word = WOERTER[Math.floor(Math.random() * WOERTER.length)];
      active.set(ctx.chatJid, { word, tries: [], startedAt: Date.now() });
      return ctx.reply(
        `🟩🟨⬛ *WORTLE!*\nIch denke an ein deutsches Wort mit *5 Buchstaben*.\n` +
          `Ihr habt gemeinsam *${MAX_TRIES} Versuche* — ratet mit \`${PREFIX}wort <WORT>\`\n\n` +
          `🟩 = richtiger Buchstabe, richtiger Platz\n🟨 = richtiger Buchstabe, falscher Platz\n⬛ = nicht im Wort`
      );
    },
  },
  {
    name: 'wort',
    group: 'games',
    desc: 'Rät ein Wort beim laufenden Wortle',
    usage: '!wort BLITZ',
    groupOnly: true,
    async run(ctx) {
      const game = active.get(ctx.chatJid);
      if (!game || game.tries.length >= MAX_TRIES) {
        return ctx.reply(`ℹ️ Gerade läuft kein Wortle. Starten: \`${PREFIX}wortle\``);
      }
      const guess = (ctx.args[0] || '')
        .toUpperCase()
        .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS');
      if (!/^[A-Z]{5}$/.test(guess)) {
        return ctx.reply('ℹ️ Bitte genau *5 Buchstaben* raten, z. B. `!wort BLITZ` (Umlaute: AE/OE/UE).');
      }
      if (game.tries.some((t) => t.guess === guess)) {
        return ctx.reply(`ℹ️ \`${guess}\` wurde schon probiert!\n${board(game)}`);
      }
      const fb = feedback(guess, game.word);
      game.tries.push({ guess, fb });

      if (guess === game.word) {
        active.delete(ctx.chatJid);
        const user = resolveLid(ctx.sender);
        bufferXp(ctx.chatJid, user, XP_REWARD, ctx.senderName);
        await addCoins(user, COIN_REWARD, ctx.senderName).catch(() => {});
        await dbRun(
          `INSERT INTO game_scores (group_jid, user_jid, game, wins, name) VALUES (?, ?, 'wortle', 1, ?)
           ON CONFLICT(group_jid, user_jid, game) DO UPDATE SET wins = game_scores.wins + 1, name = excluded.name`,
          [ctx.chatJid, user, ctx.senderName]
        ).catch(() => {});
        const rows = game.tries.map((t) => t.fb).join('\n');
        return ctx.reply(
          `${rows}\n\n🎉 *${ctx.senderName}* knackt es in ${game.tries.length}/${MAX_TRIES}: *${game.word}*!\n` +
            `+${XP_REWARD} XP, +${COIN_REWARD} 🪙 — neue Runde: \`${PREFIX}wortle\``
        );
      }
      if (game.tries.length >= MAX_TRIES) {
        active.delete(ctx.chatJid);
        return ctx.reply(`${board(game)}\n\n💀 Alle Versuche verbraucht! Das Wort war: *${game.word}*\nRevanche: \`${PREFIX}wortle\``);
      }
      return ctx.reply(board(game));
    },
  },
];
