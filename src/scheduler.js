// Scheduler: geplante Nachrichten, Nachtmodus (auto schließen/öffnen),
// Anti-Raid-Freigabe und stündliches Auto-Cleanup. Alles neustart-fest (DB).

import { config } from './config.js';
import { state } from './state.js';
import { dbRun, dbRows } from './db.js';
import { sendText } from './queue.js';
import { logError, logInfo } from './logger.js';
import { botIsAdmin } from './permissions.js';
import { releaseExpiredRaidLocks } from './moderation.js';

let tickTimer = null;
let cleanupTimer = null;

// ── Geplante Nachrichten ───────────────────────────────────────────

async function processDueMessages() {
  const rows = await dbRows(
    'SELECT id, chat_jid, text FROM scheduled_messages WHERE done = 0 AND send_at <= ? LIMIT 10',
    [Date.now()]
  );
  for (const r of rows) {
    // erst als erledigt markieren, dann senden — verhindert Doppel-Sends bei Fehlern
    await dbRun('UPDATE scheduled_messages SET done = 1, done_at = ? WHERE id = ?', [Date.now(), r.id]);
    await sendText(r.chat_jid, String(r.text));
  }
}

// ── Nachtmodus ─────────────────────────────────────────────────────

function nowHHMM() {
  return new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: process.env.TZ || 'Europe/Berlin',
  });
}

/** Liegt `now` im Fenster [start, end)? Fenster darf über Mitternacht gehen. */
export function inNightWindow(now, start, end) {
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // z. B. 22:00 → 07:00
}

async function processNightmode() {
  const rows = await dbRows(
    'SELECT group_jid, start_hhmm, end_hhmm, is_closed FROM nightmode WHERE enabled = 1',
    []
  );
  if (!rows.length) return;
  const now = nowHHMM();
  for (const r of rows) {
    try {
      const shouldBeClosed = inNightWindow(now, r.start_hhmm, r.end_hhmm);
      const isClosed = Number(r.is_closed) === 1;
      if (shouldBeClosed === isClosed) continue;
      if (!(await botIsAdmin(r.group_jid))) continue; // ohne Admin-Rechte kein Umschalten

      await state.sock.groupSettingUpdate(r.group_jid, shouldBeClosed ? 'announcement' : 'not_announcement');
      await dbRun('UPDATE nightmode SET is_closed = ? WHERE group_jid = ?', [shouldBeClosed ? 1 : 0, r.group_jid]);
      await sendText(
        r.group_jid,
        shouldBeClosed
          ? `🌙 *Nachtmodus:* Die Gruppe ist bis *${r.end_hhmm} Uhr* geschlossen. Gute Nacht!`
          : '☀️ *Guten Morgen!* Die Gruppe ist wieder geöffnet.'
      );
    } catch (err) {
      logError(err, 'scheduler.nightmode');
    }
  }
}

// ── Auto-Cleanup (Phase 21) ────────────────────────────────────────

export async function runCleanup() {
  const now = Date.now();
  const day = 86_400_000;
  const jobs = [
    ['DELETE FROM warnings WHERE expires_at <= ?', [now]],
    ['DELETE FROM mutes WHERE until <= ?', [now]],
    ['DELETE FROM error_log WHERE created_at < ?', [now - config.log.keepErrorDays * day]],
    ['DELETE FROM scheduled_messages WHERE done = 1 AND done_at < ?', [now - config.scheduler.keepDoneSchedulesDays * day]],
    ['DELETE FROM ai_usage WHERE day < ?', [new Date(now - 30 * day).toISOString().slice(0, 10)]],
    ['DELETE FROM daily_stats WHERE day < ?', [new Date(now - 90 * day).toISOString().slice(0, 10)]],
    ['DELETE FROM audit_log WHERE created_at < ?', [now - 30 * day]],
    ['DELETE FROM owner_alerts WHERE created_at < ?', [now - 30 * day]],
    ['DELETE FROM rate_limits WHERE window_start < ?', [now - day]],
    ['DELETE FROM error_counts WHERE last_at < ?', [now - 30 * day]],
  ];
  for (const [sql, args] of jobs) {
    try {
      await dbRun(sql, args);
    } catch (err) {
      logError(err, 'scheduler.cleanup');
    }
  }
  logInfo('🧹 Auto-Cleanup gelaufen — DB bleibt schlank.');
}

// ── Start/Stop ─────────────────────────────────────────────────────

export function startScheduler() {
  if (tickTimer) return;
  tickTimer = setInterval(async () => {
    try {
      if (state.connection !== 'open') return; // ohne Verbindung nichts senden
      await processDueMessages();
      await processNightmode();
      await releaseExpiredRaidLocks();
    } catch (err) {
      logError(err, 'scheduler.tick');
    }
  }, config.scheduler.tickMs);

  cleanupTimer = setInterval(() => runCleanup().catch((e) => logError(e, 'scheduler.cleanup')), config.scheduler.cleanupIntervalMs);
}

export function stopScheduler() {
  if (tickTimer) clearInterval(tickTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  tickTimer = null;
  cleanupTimer = null;
}
