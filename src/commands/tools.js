// Nützliche Tools: !qr, !timer, !rechne.
// !rechne nutzt einen eigenen sicheren Parser (Shunting-Yard) — NIEMALS eval.

import QRCode from 'qrcode';
import { dbRun } from '../db.js';
import { enqueue } from '../queue.js';
import { parseTime, fmtTime } from './schedule.js';

// ── Sicherer Mathe-Parser (nur Zahlen + - * / % ^ und Klammern) ────

function tokenize(expr) {
  const tokens = [];
  const re = /\s*(\d+(?:[.,]\d+)?|[()+\-*/%^])/y;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m) return null; // unbekanntes Zeichen → ablehnen
    tokens.push(m[1].replace(',', '.'));
    pos = re.lastIndex;
  }
  return tokens;
}

const OPS = {
  '+': { prec: 1, fn: (a, b) => a + b },
  '-': { prec: 1, fn: (a, b) => a - b },
  '*': { prec: 2, fn: (a, b) => a * b },
  '/': { prec: 2, fn: (a, b) => (b === 0 ? NaN : a / b) },
  '%': { prec: 2, fn: (a, b) => (b === 0 ? NaN : a % b) },
  '^': { prec: 3, fn: (a, b) => Math.pow(a, b), right: true },
};

/** Wertet einen arithmetischen Ausdruck sicher aus. Gibt null bei Fehler. */
export function safeCalc(expr) {
  const tokens = tokenize(expr);
  if (!tokens || !tokens.length || tokens.length > 100) return null;

  // Shunting-Yard → RPN (mit unärem Minus)
  const out = [];
  const stack = [];
  let prevWasValue = false;
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      out.push(parseFloat(t));
      prevWasValue = true;
    } else if (t === '(') {
      stack.push(t);
      prevWasValue = false;
    } else if (t === ')') {
      while (stack.length && stack[stack.length - 1] !== '(') out.push(stack.pop());
      if (!stack.length) return null;
      stack.pop();
      prevWasValue = true;
    } else if (t in OPS) {
      if (!prevWasValue && (t === '-' || t === '+')) {
        out.push(0); // unäres Vorzeichen: "-5" → "0 - 5"
      } else if (!prevWasValue) {
        return null;
      }
      const op = OPS[t];
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top in OPS && (OPS[top].prec > op.prec || (OPS[top].prec === op.prec && !op.right))) {
          out.push(stack.pop());
        } else break;
      }
      stack.push(t);
      prevWasValue = false;
    } else {
      return null;
    }
  }
  while (stack.length) {
    const t = stack.pop();
    if (t === '(') return null;
    out.push(t);
  }

  // RPN auswerten
  const vals = [];
  for (const t of out) {
    if (typeof t === 'number') vals.push(t);
    else {
      const b = vals.pop(), a = vals.pop();
      if (a === undefined || b === undefined) return null;
      vals.push(OPS[t].fn(a, b));
    }
  }
  if (vals.length !== 1 || !Number.isFinite(vals[0])) return null;
  return vals[0];
}

export const toolCommands = [
  {
    name: 'qr',
    group: 'tools',
    desc: 'Erzeugt einen QR-Code aus Text/Link',
    usage: '!qr <text>',
    async run(ctx) {
      const text = ctx.argText.trim();
      if (!text) return ctx.reply('ℹ️ Nutzung: `!qr <text oder link>`');
      if (text.length > 500) return ctx.reply('⚠️ Bitte maximal 500 Zeichen.');
      try {
        const png = await QRCode.toBuffer(text, { width: 512, margin: 2 });
        return enqueue(ctx.chatJid, { image: png, caption: `ℹ️ QR-Code für:\n${text.slice(0, 120)}` });
      } catch {
        return ctx.reply('⚠️ Daraus konnte ich keinen QR-Code erzeugen — bitte anderen Text versuchen.');
      }
    },
  },
  {
    name: 'timer',
    group: 'tools',
    desc: 'Erinnert dich nach einer Zeit (übersteht Neustarts)',
    usage: '!timer 10m [text]',
    async run(ctx) {
      const parsed = parseTime(ctx.args);
      if (!parsed) return ctx.reply('ℹ️ Nutzung: `!timer <dauer> [text]` — z. B. `!timer 10m Pizza rausholen`');
      if (parsed.at - Date.now() > 7 * 86_400_000) return ctx.reply('⚠️ Maximal 7 Tage im Voraus.');
      const note = ctx.args.slice(parsed.used).join(' ').trim() || 'Zeit ist um!';
      const text = `⏰ *Timer für ${ctx.senderName}:* ${note.slice(0, 300)}`;
      await dbRun(
        'INSERT INTO scheduled_messages (chat_jid, text, send_at, created_by) VALUES (?, ?, ?, ?)',
        [ctx.chatJid, text, parsed.at, ctx.sender]
      );
      return ctx.reply(`✅ Timer gestellt — ich melde mich am *${fmtTime(parsed.at)}*.`);
    },
  },
  {
    name: 'rechne',
    aliases: ['calc'],
    group: 'tools',
    desc: 'Rechnet einen Ausdruck aus (sicher, ohne Code)',
    usage: '!rechne (3+4)*2',
    async run(ctx) {
      const expr = ctx.argText.trim();
      if (!expr) return ctx.reply('ℹ️ Nutzung: `!rechne <ausdruck>` — erlaubt: `+ - * / % ^ ( )`');
      const result = safeCalc(expr);
      if (result === null) {
        return ctx.reply('⚠️ Das konnte ich nicht rechnen. Erlaubt sind nur Zahlen und `+ - * / % ^ ( )`.');
      }
      const pretty = Number.isInteger(result) ? String(result) : String(Math.round(result * 1e8) / 1e8);
      return ctx.reply(`🧮 ${expr} = *${pretty}*`);
    },
  },
];
