'use strict';

/**
 * Zentrale Konfiguration.
 * Liest beide Env-Namensschemata: v2-Spec (primär) + altes Blueprint (Fallback),
 * damit der restliche Code nur kanonische Namen sieht.
 */

function firstEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return undefined;
}

function digitsList(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean);
}

const config = {
  // Datenbank: v2 DATABASE_URL/KEY  ||  Blueprint TURSO_DATABASE_URL/AUTH_TOKEN
  databaseUrl: firstEnv('DATABASE_URL', 'TURSO_DATABASE_URL'),
  databaseKey: firstEnv('DATABASE_KEY', 'TURSO_AUTH_TOKEN'),

  // Owner-Nummern: v2 OWNER_NUMBERS || Blueprint OWNER_JIDS (nur Ziffern)
  ownerNumbers: digitsList(firstEnv('OWNER_NUMBERS', 'OWNER_JIDS')),

  // Web-Zugang: v2 geheimer Link ACCESS_SECRET || Blueprint QR_PASSWORD (Notfall)
  accessSecret: firstEnv('ACCESS_SECRET', 'QR_PASSWORD'),

  // Keep-Alive: v2 SELF_URL || Render RENDER_EXTERNAL_URL
  selfUrl: firstEnv('SELF_URL', 'RENDER_EXTERNAL_URL'),

  commandPrefix: firstEnv('COMMAND_PREFIX') || '!',

  // Optionaler Mongo-Fallback (Phase 2)
  mongoUri: firstEnv('MONGODB_URI'),
  mongoDb: firstEnv('MONGODB_DB') || 'whatsappbot',

  // PORT NICHT selbst setzen — Render vergibt; lokal Default 3000
  port: parseInt(firstEnv('PORT') || '3000', 10),
  logLevel: firstEnv('LOG_LEVEL') || 'info',
};

config.hasRemoteDb = Boolean(config.databaseUrl);

module.exports = config;
