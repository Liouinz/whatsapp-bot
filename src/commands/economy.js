// Economy-System: Coins (global pro Nutzer), Daily mit Streak, Überweisungen,
// Glücksspiel (!wette, !slots) und ein Shop mit kosmetischen Titeln (für !profil).

import { PREFIX, config } from '../config.js';
import { dbRun, dbRows, todayKey } from '../db.js';
import { resolveLid } from '../permissions.js';
import { audit } from '../moderation.js';
import { getBoostMult } from '../boosts.js';
import { getPrestigeMult } from '../prestige.js';
import { getEventCoinMult } from '../events.js';

// ── Kern-Helfer ────────────────────────────────────────────────────

/** Konto laden (legt es mit Startguthaben an, wenn es noch nicht existiert). */
export async function getWallet(userJid, name = '') {
  const user = resolveLid(userJid);
  const rows = await dbRows('SELECT * FROM coins WHERE user_jid = ?', [user]);
  if (rows.length) {
    if (name && rows[0].name !== name) {
      dbRun('UPDATE coins SET name = ? WHERE user_jid = ?', [name, user]).catch(() => {});
    }
    return rows[0];
  }
  await dbRun(
    'INSERT OR IGNORE INTO coins (user_jid, balance, name, total_earned) VALUES (?, ?, ?, ?)',
    [user, config.economy.startBalance, name || '', config.economy.startBalance]
  );
  return {
    user_jid: user,
    balance: config.economy.startBalance,
    name: name || '',
    last_daily: '',
    streak: 0,
    total_earned: config.economy.startBalance,
    total_gambled: 0,
  };
}

/** Coins gutschreiben (earned zählt für die Statistik). */
export async function addCoins(userJid, amount, name = '') {
  const user = resolveLid(userJid);
  await getWallet(user, name);
  await dbRun(
    'UPDATE coins SET balance = balance + ?, total_earned = total_earned + ? WHERE user_jid = ?',
    [amount, Math.max(0, amount), user]
  );
}

/** Coins abbuchen — false, wenn das Guthaben nicht reicht (atomar via WHERE). */
export async function takeCoins(userJid, amount) {
  const user = resolveLid(userJid);
  await getWallet(user); // sicherstellen, dass ein Konto existiert
  const res = await dbRun(
    'UPDATE coins SET balance = balance - ? WHERE user_jid = ? AND balance >= ?',
    [amount, user, amount]
  );
  return Number(res.rowsAffected) > 0;
}

/**
 * VERDIENTE Coins gutschreiben — wendet den aktiven Coin-Boost des Nutzers an.
 * Nur für echtes Einkommen (Daily, Skill-Spiele) verwenden, NICHT für
 * Überweisungen, Geschenke oder Glücksspiel-Auszahlungen.
 * Rückgabe: tatsächlich gutgeschriebener Betrag (inkl. Boost).
 */
export async function earnCoins(userJid, amount, name = '') {
  const u = resolveLid(userJid);
  const [boost, prestige] = await Promise.all([
    getBoostMult(u, 'coins').catch(() => 1),
    getPrestigeMult(u).catch(() => 1),
  ]);
  const total = Math.round(amount * boost * prestige * getEventCoinMult());
  await addCoins(userJid, total, name);
  return total;
}

export function fmtCoins(n) {
  return `${Number(n).toLocaleString('de-DE')} 🪙`;
}

function parseAmount(arg, balance) {
  if (/^(alles|all)$/i.test(arg || '')) return Math.min(balance, config.economy.betMax);
  const n = parseInt(arg || '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Aktiver Titel (oder null). Bleibt hier, weil Router & Profil ihn nutzen. */
export async function activeTitle(userJid) {
  const rows = await dbRows('SELECT title FROM user_titles WHERE user_jid = ?', [resolveLid(userJid)]);
  return rows.length ? rows[0].title : null;
}

// ── Slot-Symbole (Erweitert für 5 Walzen) ──────────────────────────

const SLOT_SYMBOLS = [
  '🍒', '🍋', '🍇', '🍉', '🍀', '🔔', '⭐', '💰', '👑', '💎'
];

const SLOT_WEIGHTS = [
  30, 25, 20, 18, 15, 10, 8, 5, 3, 1
];

function spinReel() {
  const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    roll -= SLOT_WEIGHTS[i];
    if (roll <= 0) return i;
  }

  return 0;
}

// ── Befehle ────────────────────────────────────────────────────────

export const economyCommands = [
  {
    name: 'daily',
    aliases: ['taeglich'],
    group: 'economy',
    desc: 'Tägliche Coins abholen (Streak-Bonus!)',
    usage: '!daily',
    async run(ctx) {
      const wallet = await getWallet(ctx.sender, ctx.senderName);
      const today = todayKey();
      if (wallet.last_daily === today) {
        return ctx.reply('⏳ Du hast dein Tagesgeld heute schon abgeholt — komm morgen wieder! 🪙');
      }
      // Streak: gestern abgeholt → +1, sonst Reset
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const streak = wallet.last_daily === yesterday ? Number(wallet.streak) + 1 : 1;
      const base =
        config.economy.dailyMin +
        Math.floor(Math.random() * (config.economy.dailyMax - config.economy.dailyMin + 1));
      const bonus = Math.min((streak - 1) * config.economy.streakBonus, config.economy.streakBonusMax);
      const base_total = base + bonus;
      // Aktiven Coin-Boost (Item) + Prestige-Dauerbonus anwenden
      const [boost, prestige] = await Promise.all([
        getBoostMult(resolveLid(ctx.sender), 'coins').catch(() => 1),
        getPrestigeMult(resolveLid(ctx.sender)).catch(() => 1),
      ]);
      const mult = boost * prestige * getEventCoinMult();
      const total = Math.round(base_total * mult);
      await dbRun(
        `UPDATE coins SET balance = balance + ?, total_earned = total_earned + ?,
         last_daily = ?, streak = ?, name = ? WHERE user_jid = ?`,
        [total, total, today, streak, ctx.senderName, resolveLid(ctx.sender)]
      );
      let text = `💰 *Tagesgeld abgeholt!* +${fmtCoins(total)}`;
      if (bonus > 0) text += `\n🔥 Streak-Bonus: Tag *${streak}* in Folge (+${bonus})`;
      else text += `\n🔥 Streak gestartet — hol es morgen wieder ab für Bonus-Coins!`;
      if (mult > 1) text += `\n⚡ Coin-Boost aktiv: ×${mult.toFixed(2)}`;
      text += `\n💳 Kontostand: *${fmtCoins(Number(wallet.balance) + total)}*`;
      return ctx.reply(text);
    },
  },
  {
    name: 'coins',
    aliases: ['konto', 'geld'],
    group: 'economy',
    desc: 'Zeigt deinen Kontostand',
    usage: '!coins',
    async run(ctx) {
      const target = ctx.targetUser();
      const who = target || ctx.sender;
      const wallet = await getWallet(who, target ? '' : ctx.senderName);
      const label = target ? ctx.mentionTag(target) : `*${ctx.senderName}*`;
      return ctx.reply(
        `💳 Kontostand von ${label}: *${fmtCoins(wallet.balance)}*\n` +
          `📈 Insgesamt verdient: ${fmtCoins(wallet.total_earned)} · 🔥 Daily-Streak: ${wallet.streak || 0}`,
        target ? [target] : undefined
      );
    },
  },
  {
    name: 'geben',
    aliases: ['pay', 'zahlen'],
    group: 'economy',
    desc: 'Überweist jemandem Coins',
    usage: '!geben @person <betrag>',
    groupOnly: true,
    async run(ctx) {
      const target = ctx.targetUser();
      if (!target) return ctx.reply('⚠️ Wem denn? Erwähne die Person: `!geben @person 100`');
      if (resolveLid(target) === resolveLid(ctx.sender)) {
        return ctx.reply('😄 An dich selbst überweisen bringt leider nichts.');
      }
      const amount = parseInt(ctx.args.find((a) => /^\d{1,7}$/.test(a)) || '', 10);
      if (!amount || amount < config.economy.giveMin) {
        return ctx.reply(`ℹ️ Nutzung: \`!geben @person <betrag>\` (mindestens ${config.economy.giveMin})`);
      }
      const ok = await takeCoins(ctx.sender, amount);
      if (!ok) {
        const wallet = await getWallet(ctx.sender, ctx.senderName);
        return ctx.reply(`⚠️ Dafür reicht dein Guthaben nicht (du hast ${fmtCoins(wallet.balance)}).`);
      }
      await addCoins(target, amount);
      await audit('coins-transfer', ctx.chatJid, target, ctx.sender, `${amount}`);
      return ctx.reply(
        `✅ *${ctx.senderName}* hat ${ctx.mentionTag(target)} *${fmtCoins(amount)}* überwiesen. Großzügig! 🤝`,
        [target]
      );
    },
  },
  {
    name: 'wette',
    aliases: ['bet', 'coinflip'],
    group: 'economy',
    desc: 'Setze Coins auf Kopf oder Zahl (×2 oder weg)',
    usage: '!wette <betrag> kopf|zahl',
    async run(ctx) {
      const wallet = await getWallet(ctx.sender, ctx.senderName);
      const amount = parseAmount(ctx.args[0], Number(wallet.balance));
      // Auch Kurzformen erkennen: "k"/"z", "heads"/"tails"
      const rawPick = (ctx.args[1] || '').toLowerCase();
      const pick = /^(kopf|k|heads?)$/.test(rawPick) ? 'kopf' : /^(zahl|z|tails?)$/.test(rawPick) ? 'zahl' : null;
      if (!amount || !pick) {
        return ctx.reply('ℹ️ Nutzung: `!wette <betrag> kopf` oder `!wette <betrag> zahl` (auch: `!wette alles kopf`)');
      }
      if (amount < config.economy.betMin) return ctx.reply(`⚠️ Mindesteinsatz: ${fmtCoins(config.economy.betMin)}`);
      if (amount > config.economy.betMax) return ctx.reply(`⚠️ Maximaleinsatz: ${fmtCoins(config.economy.betMax)}`);
      if (!(await takeCoins(ctx.sender, amount))) {
        return ctx.reply(`⚠️ So viel hast du nicht (Kontostand: ${fmtCoins(wallet.balance)}).`);
      }
      await dbRun('UPDATE coins SET total_gambled = total_gambled + ? WHERE user_jid = ?', [amount, resolveLid(ctx.sender)]);
      const result = Math.random() < 0.5 ? 'kopf' : 'zahl';
      const icon = result === 'kopf' ? '🪙' : '🔢';
      if (result === pick) {
        await addCoins(ctx.sender, amount * 2, ctx.senderName);
        return ctx.reply(`${icon} Es ist … *${result.toUpperCase()}*!\n🎉 Gewonnen! Du bekommst *${fmtCoins(amount * 2)}*.`);
      }
      return ctx.reply(`${icon} Es ist … *${result.toUpperCase()}*!\n😬 Verloren — ${fmtCoins(amount)} sind weg. Vielleicht beim nächsten Mal!`);
    },
  },
  {
    name: 'slots',
    aliases: ['slot'],
    group: 'economy',
    desc: '5 Walzen Slotmaschine mit Jackpot',
    usage: '!slots <betrag>',
    async run(ctx) {
      const wallet = await getWallet(ctx.sender, ctx.senderName);
      const amount = parseAmount(ctx.args[0], Number(wallet.balance));

      if (!amount) {
        return ctx.reply(
          'ℹ️ Nutzung: `!slots <betrag>`\n' +
          '🎰 2 gleiche = ×2\n' +
          '🔥 3 gleiche = ×5\n' +
          '👑 4 gleiche = ×10\n' +
          '💎 5 gleiche = Jackpot'
        );
      }

      if (amount < config.economy.betMin)
        return ctx.reply(`⚠️ Mindesteinsatz: ${fmtCoins(config.economy.betMin)}`);

      if (amount > config.economy.betMax)
        return ctx.reply(`⚠️ Maximaleinsatz: ${fmtCoins(config.economy.betMax)}`);

      if (!(await takeCoins(ctx.sender, amount))) {
        return ctx.reply(
          `⚠️ So viel hast du nicht (Kontostand: ${fmtCoins(wallet.balance)}).`
        );
      }

      await dbRun(
        'UPDATE coins SET total_gambled = total_gambled + ? WHERE user_jid = ?',
        [amount, resolveLid(ctx.sender)]
      );

      const reels = [
        spinReel(),
        spinReel(),
        spinReel(),
        spinReel(),
        spinReel()
      ];

      const symbols = reels.map(i => SLOT_SYMBOLS[i]);
      const row = symbols.join(' │ ');

      const counts = {};
      for (const symbol of symbols) {
        counts[symbol] = (counts[symbol] || 0) + 1;
      }

      const highest = Math.max(...Object.values(counts));

      let factor = 0;
      let jackpot = false;

      if (symbols.every(s => s === '💎')) {
        factor = 100;
        jackpot = true;
      } else if (symbols.every(s => s === '👑')) {
        factor = 50;
        jackpot = true;
      } else if (symbols.every(s => s === '💰')) {
        factor = 30;
      } else if (highest === 5) {
        factor = 25;
      } else if (highest === 4) {
        factor = 10;
      } else if (highest === 3) {
        factor = 5;
      } else if (highest === 2) {
        factor = 2;
      }

      let text =
        `🎰 *SLOTS*\n` +
        `┌────────────────────┐\n` +
        `│ ${row} │\n` +
        `└────────────────────┘\n\n`;

      if (factor > 0) {
        const win = amount * factor;
        await addCoins(ctx.sender, win, ctx.senderName);

        if (jackpot) {
          text +=
            `🔥🔥🔥 *JACKPOT!* 🔥🔥🔥\n` +
            `×${factor}\n` +
            `💰 Gewinn: *${fmtCoins(win)}*`;
        } else {
          text +=
            `🎉 *Gewonnen!*\n` +
            `×${factor}\n` +
            `💰 Gewinn: *${fmtCoins(win)}*`;
        }
      } else {
        text +=
          `😬 Leider nichts getroffen.\n` +
          `Verloren: ${fmtCoins(amount)}`;
      }

      return ctx.reply(text);
    },
  },
  {
    name: 'roulette',
    group: 'economy',
    desc: 'Roulette: rot/schwarz (×2) oder Zahl 0–36 (×30)',
    usage: '!roulette <betrag> rot|schwarz|<zahl>',
    async run(ctx) {
      const wallet = await getWallet(ctx.sender, ctx.senderName);
      const amount = parseAmount(ctx.args[0], Number(wallet.balance));
      const rawPick = (ctx.args[1] || '').toLowerCase();
      const isColor = rawPick === 'rot' || rawPick === 'schwarz';
      const numPick = /^\d{1,2}$/.test(rawPick) ? parseInt(rawPick, 10) : null;
      if (!amount || (!isColor && (numPick === null || numPick > 36))) {
        return ctx.reply('ℹ️ Nutzung: `!roulette <betrag> rot`, `!roulette <betrag> schwarz` oder `!roulette <betrag> 17`');
      }
      if (amount < config.economy.betMin) return ctx.reply(`⚠️ Mindesteinsatz: ${fmtCoins(config.economy.betMin)}`);
      if (amount > config.economy.betMax) return ctx.reply(`⚠️ Maximaleinsatz: ${fmtCoins(config.economy.betMax)}`);
      if (!(await takeCoins(ctx.sender, amount))) {
        return ctx.reply(`⚠️ So viel hast du nicht (Kontostand: ${fmtCoins(wallet.balance)}).`);
      }
      await dbRun('UPDATE coins SET total_gambled = total_gambled + ? WHERE user_jid = ?', [amount, resolveLid(ctx.sender)]);

      const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
      const spin = Math.floor(Math.random() * 37); // 0–36
      const color = spin === 0 ? '🟢' : RED.has(spin) ? '🔴' : '⚫';
      let win = 0;
      if (isColor && spin !== 0 && ((rawPick === 'rot') === RED.has(spin))) win = amount * 2;
      if (numPick !== null && numPick === spin) win = amount * 30;

      let text = `🎡 Die Kugel rollt … *${color} ${spin}*!\n`;
      if (win > 0) {
        await addCoins(ctx.sender, win, ctx.senderName);
        text += `🎉 *Gewonnen!* Du bekommst *${fmtCoins(win)}*.`;
      } else {
        text += `😬 Daneben — ${fmtCoins(amount)} verloren.`;
      }
      return ctx.reply(text);
    },
  },
  {
    name: 'reichste',
    aliases: ['rich', 'coinstop'],
    group: 'economy',
    desc: 'Die 10 reichsten Nutzer',
    usage: '!reichste',
    async run(ctx) {
      const rows = await dbRows('SELECT user_jid, name, balance FROM coins ORDER BY balance DESC LIMIT 10', []);
      if (!rows.length) return ctx.reply('ℹ️ Noch niemand hat Coins — hol dir dein `!daily`!');
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, i) => {
        const who = r.name || `+${String(r.user_jid).split('@')[0]}`;
        return `${medals[i] || `${i + 1}.`} *${who}* — ${fmtCoins(r.balance)}`;
      });
      return ctx.reply(`💰 *Die Reichsten*\n${lines.join('\n')}`);
    },
  },
];
