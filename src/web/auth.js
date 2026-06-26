'use strict';

const crypto = require('crypto');
const config = require('../core/config');
const logger = require('../core/logger');

/**
 * Auth für die Web-UI: geheimer Login-Link (/<ACCESS_SECRET>) statt Passwort.
 * - timing-safe Vergleich des Secrets
 * - server-seitige Sessions (Cookie sid), CSRF-Token pro Session
 * - IP-Lockout + einfaches Rate-Limit gegen Brute-Force
 */

const SESSION_TTL = 8 * 60 * 60 * 1000; // 8h
const MAX_FAIL = 8;
const LOCK_MS = 15 * 60 * 1000;
const RL_WINDOW = 60 * 1000;
const RL_MAX = 240; // Requests/Minute/IP

const sessions = new Map(); // sid -> { csrf, exp }
const fails = new Map(); // ip -> { count, until }
const rl = new Map(); // ip -> { count, reset }

function secretConfigured() {
  return typeof config.accessSecret === 'string' && config.accessSecret.length >= 8;
}

function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // konstante Zeit auch bei Längenunterschied
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function checkSecret(input) {
  return secretConfigured() && timingEqual(input, config.accessSecret);
}

function ipOf(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

function isLocked(ip) {
  const f = fails.get(ip);
  return !!f && f.until > Date.now();
}

function recordFail(ip) {
  const f = fails.get(ip) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAIL) {
    f.until = Date.now() + LOCK_MS;
    f.count = 0;
    logger.warn({ ip }, 'Web-Auth: IP wegen zu vieler Fehlversuche gesperrt');
  }
  fails.set(ip, f);
}

function clearFail(ip) {
  fails.delete(ip);
}

function rateLimited(ip) {
  const now = Date.now();
  const r = rl.get(ip) || { count: 0, reset: now + RL_WINDOW };
  if (now > r.reset) {
    r.count = 0;
    r.reset = now + RL_WINDOW;
  }
  r.count += 1;
  rl.set(ip, r);
  return r.count > RL_MAX;
}

function createSession() {
  const sid = crypto.randomBytes(24).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { csrf, exp: Date.now() + SESSION_TTL });
  return { sid, csrf };
}

function getSession(sid) {
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.exp < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return s;
}

function destroySession(sid) {
  if (sid) sessions.delete(sid);
}

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(name, value, req, maxAgeMs) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  const age = maxAgeMs != null ? `; Max-Age=${Math.floor(maxAgeMs / 1000)}` : '';
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Strict${age}${secure}`;
}

/** Express-Middleware: verlangt eine gültige Session. */
function requireAuth(req, res, next) {
  const sid = parseCookies(req).sid;
  const session = sid ? getSession(sid) : null;
  if (!session) {
    res.status(401);
    return res.type('html').send(
      '<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0b1020;color:#e6e9f5;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>🔒 Zugriff verweigert</h2><p style="opacity:.6">Bitte über den geheimen Link einloggen.</p></div>'
    );
  }
  req.session = session;
  req.sid = sid;
  next();
}

/** CSRF-Prüfung für POST-Routen. */
function checkCsrf(req, res, next) {
  const token = req.body?._csrf;
  if (!req.session || !token || token !== req.session.csrf) {
    res.status(403);
    return res.type('html').send('❌ Ungültiges CSRF-Token. Bitte Seite neu laden.');
  }
  next();
}

// periodische Bereinigung
setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) if (s.exp < now) sessions.delete(sid);
  for (const [ip, f] of fails) if (f.until && f.until < now) fails.delete(ip);
}, 5 * 60 * 1000).unref?.();

module.exports = {
  secretConfigured,
  checkSecret,
  ipOf,
  isLocked,
  recordFail,
  clearFail,
  rateLimited,
  createSession,
  getSession,
  destroySession,
  parseCookies,
  cookieHeader,
  requireAuth,
  checkCsrf,
};
