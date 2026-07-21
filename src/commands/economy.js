// Economy-System: Coins (global pro Nutzer), Daily mit Streak, Überweisungen,
// Glücksspiel (!wette, !slots) und ein Shop mit kosmetischen Titeln (für !profil).

import { PREFIX, config } from '../config.js';
import { dbRun, dbRows, todayKey } from '../db.js';
import { resolveLid } from '../permissions.js';
import { audit } from '../moderation.js';

// ── Shop-Katalog (kosmetische Titel — bewusst im Code, kein Admin-Pflegeaufwand) ──

export const SHOP_ITEMS = [
  { id: 'title_legende', title: '🏆 Legende', price: 5000 },
  { id: 'title_vip', title: '💎 VIP', price: 3000 },
  { id: 'title_nachtschwaermer', title: '🌙 Nachtschwärmer', price: 1500 },
  { id: 'title_plaudertasche', title: '💬 Plaudertasche', price: 1200 },
  { id: 'title_glueckspilz', title: '🍀 Glückspilz', price: 2000 },
  { id: 'title_quizmaster', title: '🧠 Quizmaster', price: 2500 },
  { id: 'title_highroller', title: '🎰 High Roller', price: 4000 },
  { id: 'title_fruehaufsteher', title: '🌅 Frühaufsteher', price: 1000 },
  { id: 'title_kaffeejunkie', title: '☕ Kaffee-Junkie', price: 800 },
  { id: 'title_meme_lord', title: '😂 Meme-Lord', price: 1800 },
];

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
    user_jid: user, balance: config.economy.startBalance, name: name || '',
    last_daily: '', streak: 0, total_earned: config.economy.startBalance, total_gambled: 0,
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
async function takeCoins(userJid, amount) {
  const user = resolveLid(userJid);
  const res = await dbRun(
    'UPDATE coins SET balance = balance - ? WHERE user_jid = ? AND balance >= ?',
    [amount, user, amount]
  );
  return Number(res.rowsAffected) > 0;
}

function fmtCoins(n) {
  return `${Number(n).toLocaleString('de-DE')} 🪙`;
}

function parseAmount(arg, balance) {
  if (/^(alles|all)$/i.test(arg || '')) return Math.min(balance, config.economy.betMax);
  const n = parseInt(arg || '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Gekaufte Titel eines Nutzers (fürs Profil und !titel). */
export async function ownedTitles(userJid) {
  const rows = await dbRows('SELECT item_id FROM purchases WHERE user_jid = ?', [resolveLid(userJid)]);
  const owned = new Set(rows.map((r) => r.item_id));
  return SHOP_ITEMS.filter((i) => owned.has(i.id));
}

/** Aktiver Titel (oder null). */
export async function activeTitle(userJid) {
  const rows = await dbRows('SELECT title FROM user_titles WHERE user_jid = ?', [resolveLid(userJid)]);
  return rows.length ? rows[0].title : null;
}

// ── Slot-Symbole ───────────────────────────────────────────────────

const SLOT_SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎'];
// Gewichte: häufige Früchte, seltene Diamanten
const SLOT_WEIGHTS = [30, 25, 20, 12, 8, 5];

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
      const total = base + bonus;
      await dbRun(
        `UPDATE coins SET balance = balance + ?, total_earned = total_earned + ?,
         last_daily = ?, streak = ?, name = ? WHERE user_jid = ?`,
        [total, total, today, streak, ctx.senderName, resolveLid(ctx.sender)]
      );
      let text = `💰 *Tagesgeld abgeholt!* +${fmtCoins(total)}`;
      if (bonus > 0) text += `\n🔥 Streak-Bonus: Tag *${streak}* in Folge (+${bonus})`;
      else text += `\n🔥 Streak gestartet — hol es morgen wieder ab für Bonus-Coins!`;
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
    desc: 'Einarmiger Bandit — 3 gleiche = Jackpot',
    usage: '!slots <betrag>',
    async run(ctx) {
      const wallet = await getWallet(ctx.sender, ctx.senderName);
      const amount = parseAmount(ctx.args[0], Number(wallet.balance));
      if (!amount) return ctx.reply('ℹ️ Nutzung: `!slots <betrag>` — 2 gleiche = ×2, 3 gleiche = ×5, 💎💎💎 = ×10');
      if (amount < config.economy.betMin) return ctx.reply(`⚠️ Mindesteinsatz: ${fmtCoins(config.economy.betMin)}`);
      if (amount > config.economy.betMax) return ctx.reply(`⚠️ Maximaleinsatz: ${fmtCoins(config.economy.betMax)}`);
      if (!(await takeCoins(ctx.sender, amount))) {
        return ctx.reply(`⚠️ So viel hast du nicht (Kontostand: ${fmtCoins(wallet.balance)}).`);
      }
      await dbRun('UPDATE coins SET total_gambled = total_gambled + ? WHERE user_jid = ?', [amount, resolveLid(ctx.sender)]);

      const reels = [spinReel(), spinReel(), spinReel()];
      const [a, b, c] = reels;
      const row = reels.map((i) => SLOT_SYMBOLS[i]).join(' │ ');
      let factor = 0;
      if (a === b && b === c) factor = SLOT_SYMBOLS[a] === '💎' ? 10 : 5;
      else if (a === b || b === c || a === c) factor = 2;

      let text = `🎰 *SLOTS*\n┌─────────────┐\n│ ${row} │\n└─────────────┘\n`;
      if (factor > 0) {
        const win = amount * factor;
        await addCoins(ctx.sender, win, ctx.senderName);
        text += factor >= 10 ? `💎 *JACKPOT!* ×${factor} → *${fmtCoins(win)}*` : `🎉 *Gewonnen!* ×${factor} → *${fmtCoins(win)}*`;
      } else {
        text += `😬 Nichts dabei — ${fmtCoins(amount)} futsch.`;
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
    name: 'shop',
    group: 'economy',
    desc: 'Titel-Shop — Coins gegen Style',
    usage: '!shop',
    async run(ctx) {
      const owned = new Set((await ownedTitles(ctx.sender)).map((i) => i.id));
      const lines = SHOP_ITEMS.map((item, i) => {
        const tag = owned.has(item.id) ? ' ✅' : '';
        return `${i + 1}. ${item.title} — ${fmtCoins(item.price)}${tag}`;
      });
      return ctx.reply(
        `🛍️ *Titel-Shop*\n${lines.join('\n')}\n\n` +
          `Kaufen: \`${PREFIX}kaufen <nr>\` · Anlegen: \`${PREFIX}titel <nr>\`\n` +
          `Dein Titel erscheint in \`${PREFIX}profil\` und bei Level-Ups.`
      );
    },
  },
  {
    name: 'kaufen',
    aliases: ['buy'],
    group: 'economy',
    desc: 'Kauft einen Titel aus dem Shop',
    usage: '!kaufen <nr>',
    async run(ctx) {
      const idx = parseInt(ctx.args[0] || '', 10) - 1;
      const item = SHOP_ITEMS[idx];
      if (!item) return ctx.reply(`ℹ️ Nutzung: \`${PREFIX}kaufen <nr>\` — Nummern zeigt \`${PREFIX}shop\``);
      const user = resolveLid(ctx.sender);
      const already = await dbRows('SELECT 1 FROM purchases WHERE user_jid = ? AND item_id = ?', [user, item.id]);
      if (already.length) return ctx.reply(`ℹ️ ${item.title} gehört dir schon! Anlegen: \`${PREFIX}titel ${idx + 1}\``);
      if (!(await takeCoins(ctx.sender, item.price))) {
        const wallet = await getWallet(ctx.sender, ctx.senderName);
        return ctx.reply(`⚠️ ${item.title} kostet ${fmtCoins(item.price)} — du hast nur ${fmtCoins(wallet.balance)}.`);
      }
      await dbRun('INSERT OR IGNORE INTO purchases (user_jid, item_id, created_at) VALUES (?, ?, ?)', [user, item.id, Date.now()]);
      await dbRun(
        `INSERT INTO user_titles (user_jid, title) VALUES (?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET title = excluded.title`,
        [user, item.title]
      );
      return ctx.reply(`🎉 Gekauft und direkt angelegt: *${item.title}*\nZeig ihn her mit \`${PREFIX}profil\`!`);
    },
  },
  {
    name: 'titel',
    group: 'economy',
    desc: 'Wechselt deinen aktiven Titel',
    usage: '!titel <nr> | aus',
    async run(ctx) {
      const user = resolveLid(ctx.sender);
      if (/^(aus|off|keiner)$/i.test(ctx.args[0] || '')) {
        await dbRun('DELETE FROM user_titles WHERE user_jid = ?', [user]);
        return ctx.reply('✅ Titel abgelegt — schlicht steht dir auch.');
      }
      const owned = await ownedTitles(ctx.sender);
      if (!owned.length) return ctx.reply(`ℹ️ Du besitzt noch keinen Titel — schau in den \`${PREFIX}shop\`!`);
      const idx = parseInt(ctx.args[0] || '', 10) - 1;
      const item = SHOP_ITEMS[idx];
      if (!item || !owned.some((o) => o.id === item.id)) {
        const list = owned.map((o) => `${SHOP_ITEMS.indexOf(o) + 1}. ${o.title}`).join('\n');
        return ctx.reply(`ℹ️ *Deine Titel:*\n${list}\n\nAnlegen: \`${PREFIX}titel <nr>\` · Ablegen: \`${PREFIX}titel aus\``);
      }
      await dbRun(
        `INSERT INTO user_titles (user_jid, title) VALUES (?, ?)
         ON CONFLICT(user_jid) DO UPDATE SET title = excluded.title`,
        [user, item.title]
      );
      return ctx.reply(`✅ Titel angelegt: *${item.title}*`);
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
