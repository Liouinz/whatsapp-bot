// Geplante Nachrichten — liegen in Turso und überstehen Neustarts.
// Der Scheduler (scheduler.js) prüft periodisch und sendet über die Queue.

import { dbRun, dbRows } from '../db.js';

/**
 * Zeitangabe parsen → Unix-Millis in der Zukunft (oder null).
 * Unterstützt: "18:30" (heute, sonst morgen), "10m", "2h", "1d", "morgen 09:00".
 */
export function parseTime(args) {
  if (!args.length) return null;
  let first = args[0].toLowerCase();
  let used = 1;

  if (first === 'morgen' && args[1]) {
    const t = parseClock(args[1], 1);
    return t ? { at: t, used: 2 } : null;
  }
  const rel = /^(\d+)(m|min|h|std|d|t)$/.exec(first);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2][0]; // m/h/d (std→s? nein: 'std'[0]='s' — daher Map unten)
    const ms = { m: 60_000, h: 3_600_000, s: 3_600_000, d: 86_400_000, t: 86_400_000 }[unit];
    if (!n || !ms) return null;
    return { at: Date.now() + n * ms, used };
  }
  const clock = parseClock(first, 0);
  return clock ? { at: clock, used } : null;
}

function parseClock(text, dayOffset) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!m) return null;
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // vorbei → morgen
  return d.getTime();
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: process.env.TZ || 'Europe/Berlin',
  });
}

export const scheduleCommands = [
  {
    name: 'schedule',
    aliases: ['planen'],
    group: 'tools',
    desc: 'Plant eine Nachricht (übersteht Neustarts)',
    usage: '!schedule 18:30 <text> · !schedule 10m <text>',
    adminOnly: true,
    async run(ctx) {
      const parsed = parseTime(ctx.args);
      const text = parsed ? ctx.args.slice(parsed.used).join(' ').trim() : '';
      if (!parsed || !text) {
        return ctx.reply(
          'ℹ️ Nutzung: `!schedule <zeit> <text>`\nZeit z. B.: `18:30`, `morgen 09:00`, `10m`, `2h`, `1d`'
        );
      }
      await dbRun(
        'INSERT INTO scheduled_messages (chat_jid, text, send_at, created_by) VALUES (?, ?, ?, ?)',
        [ctx.chatJid, text.slice(0, 1500), parsed.at, ctx.sender]
      );
      return ctx.reply(`⏰ Geplant! Ich sende die Nachricht am *${fmtTime(parsed.at)}* in diesen Chat.`);
    },
  },
  {
    name: 'schedules',
    aliases: ['geplant'],
    group: 'tools',
    desc: 'Zeigt offene geplante Nachrichten dieses Chats',
    usage: '!schedules',
    adminOnly: true,
    async run(ctx) {
      const rows = await dbRows(
        'SELECT id, text, send_at FROM scheduled_messages WHERE chat_jid = ? AND done = 0 ORDER BY send_at LIMIT 10',
        [ctx.chatJid]
      );
      if (!rows.length) return ctx.reply('ℹ️ Für diesen Chat ist nichts geplant. (`!schedule <zeit> <text>`)');
      const lines = rows.map(
        (r) => `• *#${r.id}* — ${fmtTime(Number(r.send_at))}: ${String(r.text).slice(0, 60)}`
      );
      return ctx.reply(`⏰ *Geplante Nachrichten*\n${lines.join('\n')}\n\nLöschen: \`!delschedule <nr>\``);
    },
  },
  {
    name: 'delschedule',
    group: 'tools',
    desc: 'Löscht eine geplante Nachricht',
    usage: '!delschedule <nr>',
    adminOnly: true,
    async run(ctx) {
      const id = parseInt(ctx.args[0] || '', 10);
      if (!id) return ctx.reply('ℹ️ Nutzung: `!delschedule <nr>` — Nummern zeigt `!schedules`');
      const rows = await dbRows(
        'SELECT id FROM scheduled_messages WHERE id = ? AND chat_jid = ? AND done = 0',
        [id, ctx.chatJid]
      );
      if (!rows.length) return ctx.reply(`⚠️ Eine offene geplante Nachricht *#${id}* gibt es in diesem Chat nicht.`);
      await dbRun('DELETE FROM scheduled_messages WHERE id = ?', [id]);
      return ctx.reply(`✅ Geplante Nachricht *#${id}* wurde gelöscht.`);
    },
  },
];
