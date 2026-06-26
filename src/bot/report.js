'use strict';

const logger = require('../core/logger');
const storage = require('../core/storage');
const permissions = require('./permissions');
const { state } = require('../core/connection');

/**
 * Wöchentlicher Statistik-Report (optionale Auto-Funktion).
 * Sendet jeder aktivierten Gruppe (config.weeklyReport) eine private
 * Zusammenfassung an ihre Admins per DM — NICHT in die Gruppe.
 *
 * Restart-sicher: letzter Lauf wird in settings.lastWeeklyReport gespeichert;
 * stündliche Prüfung sendet, sobald eine Woche vergangen ist.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000;

async function buildReport(sock, group) {
  const jid = group.jid;
  let name = jid;
  let admins = [];
  try {
    const m = await permissions.getGroupMetadata(sock, jid);
    name = m.subject || jid;
    admins = (m.participants || [])
      .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
      .map((p) => p.id);
  } catch (e) {
    logger.warn({ err: e, jid }, 'Wochenreport: Metadaten nicht ladbar');
    return null;
  }
  if (!admins.length) return null;

  const act = await storage.getGroupActivity(jid);
  const snapKey = `report_snap_${jid}`;
  const prev = (await storage.getSetting(snapKey, { messages: 0, commands: 0 })) || { messages: 0, commands: 0 };
  const dMsg = Math.max(0, act.messages - (prev.messages || 0));
  const dCmd = Math.max(0, act.commands - (prev.commands || 0));
  await storage.setSetting(snapKey, { messages: act.messages, commands: act.commands });

  const since = Date.now() - WEEK;
  const bans = await storage.countBansSince(jid, since);
  const reports = await storage.countReportsSince(jid, since);
  const warns = (await storage.getAllWarnings(jid)).length;
  const top = await storage.getTopMembers(jid, 5);

  let text = `📊 *Wochenreport* — ${name}\n`;
  text += `\n• Nachrichten diese Woche: ${dMsg} _(gesamt ${act.messages})_`;
  text += `\n• Befehle diese Woche: ${dCmd}`;
  text += `\n• Aktive Verwarnungen: ${warns}`;
  text += `\n• Bans (7 Tage): ${bans}`;
  text += `\n• Meldungen (7 Tage): ${reports}`;
  if (top.length) {
    text += '\n\n🏆 *Aktivste Mitglieder:*';
    top.forEach((t, i) => (text += `\n${i + 1}. +${t.num} — ${t.messages} Nachrichten`));
  }
  text += '\n\n_Diesen Report kannst du im Web-Panel pro Gruppe an-/abschalten._';
  return { admins, text };
}

async function runWeeklyReports(sock) {
  if (!sock) return 0;
  let groups = [];
  try {
    groups = await storage.getAllGroups();
  } catch (e) {
    logger.error({ err: e }, 'Wochenreport: Gruppen nicht ladbar');
    return 0;
  }
  let sent = 0;
  for (const g of groups) {
    if (g.active === false || !g.config?.weeklyReport) continue;
    try {
      const rep = await buildReport(sock, g);
      if (!rep) continue;
      for (const adm of rep.admins) state.sendQueue.sendText(adm, rep.text); // privat
      sent += 1;
      logger.info({ group: g.jid, admins: rep.admins.length }, 'Wochenreport versendet');
    } catch (e) {
      logger.warn({ err: e, group: g.jid }, 'Wochenreport fehlgeschlagen');
    }
  }
  return sent;
}

function startScheduler() {
  const tick = async () => {
    try {
      const last = await storage.getSetting('lastWeeklyReport', null);
      if (last == null) {
        // erste Inbetriebnahme: Baseline setzen, nicht sofort senden
        await storage.setSetting('lastWeeklyReport', Date.now());
        return;
      }
      if (Date.now() - Number(last) >= WEEK) {
        await runWeeklyReports(state.sock);
        await storage.setSetting('lastWeeklyReport', Date.now());
      }
    } catch (e) {
      logger.error({ err: e }, 'Report-Scheduler Fehler');
    }
  };
  const t = setInterval(tick, 60 * 60 * 1000); // stündlich prüfen
  if (t.unref) t.unref();
  const first = setTimeout(tick, 30_000); // kurz nach Start eine erste Prüfung
  if (first.unref) first.unref();
  logger.info('Wochenreport-Scheduler aktiv (stündliche Fälligkeitsprüfung)');
  return t;
}

module.exports = { buildReport, runWeeklyReports, startScheduler, WEEK };
