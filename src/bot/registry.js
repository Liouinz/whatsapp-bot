'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');

/**
 * Befehls-Registry. Lädt alle Befehls-Module aus bot/commands/ und macht sie
 * über Name oder Alias auffindbar.
 *
 * Ein Befehls-Modul exportiert ein Array von Befehls-Objekten (oder { commands: [...] }).
 * Befehls-Objekt-Konvention (Phase 3):
 *   { name, aliases, category, description, usage, keywords,
 *     access:'owner|admin|mod|all', scope:'group|dm|any',
 *     requiresBotAdmin, requiresTarget, cooldownMs, run(ctx) }
 */

const commands = new Map(); // name -> cmd
const aliases = new Map(); // alias -> name

function register(cmd) {
  if (!cmd || !cmd.name || typeof cmd.run !== 'function') {
    logger.warn({ cmd: cmd?.name }, 'Registry: Befehl ohne name/run übersprungen');
    return;
  }
  const name = cmd.name.toLowerCase();
  commands.set(name, cmd);
  for (const a of cmd.aliases || []) aliases.set(String(a).toLowerCase(), name);
}

function loadCommands() {
  commands.clear();
  aliases.clear();
  const dir = path.join(__dirname, 'commands');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch (e) {
    logger.error({ err: e }, 'Registry: commands-Verzeichnis nicht lesbar');
    return;
  }
  for (const file of files) {
    try {
      const mod = require(path.join(dir, file));
      const list = Array.isArray(mod) ? mod : mod.commands || [];
      for (const c of list) register(c);
    } catch (e) {
      logger.error({ err: e, file }, 'Registry: Modul konnte nicht geladen werden');
    }
  }
  logger.info(`Registry: ${commands.size} Befehle geladen (${aliases.size} Aliase)`);
}

function get(nameOrAlias) {
  const key = String(nameOrAlias || '').toLowerCase();
  if (commands.has(key)) return commands.get(key);
  if (aliases.has(key)) return commands.get(aliases.get(key));
  return null;
}

function all() {
  return [...commands.values()];
}

function byCategory() {
  const map = new Map();
  for (const c of commands.values()) {
    const cat = c.category || 'sonstige';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(c);
  }
  return map;
}

module.exports = { register, loadCommands, get, all, byCategory };
