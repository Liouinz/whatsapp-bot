'use strict';

// ====================================================================
// WORLD MODULE – Reise, Kampf, Sammeln, Erkundung
// Baut auf EconomyManager auf (Coins, XP, Level, Stats, Meta).
// Tabellen werden in economy.js init() erstellt:
//   player_location, monster_kills, world_resources
// ====================================================================

// ====================================================================
// 1. REGIONEN (16 Gebiete, aufsteigend nach Schwierigkeit)
// ====================================================================
const REGIONS = [
  {
    id: 'dorf',
    name: 'Startdorf',
    emoji: '🏘️',
    travelCost: 0,
    minLevel: 1,
    description: 'Ein ruhiges Dorf am Rande der Wildnis. Ideal für Anfänger.',
    monsters: ['rat', 'wolf', 'bandit', 'goblin'],
    resources: ['holz', 'stein', 'leder', 'knochen'],
  },
  {
    id: 'wald',
    name: 'Finsterer Wald',
    emoji: '🌲',
    travelCost: 500,
    minLevel: 3,
    description: 'Ein dichter, dunkler Wald voller lauernder Gefahren.',
    monsters: ['goblin', 'bear', 'troll', 'darkelf'],
    resources: ['holz', 'leder', 'knochen', 'giftpilz'],
  },
  {
    id: 'hoehle',
    name: 'Dunkle Höhle',
    emoji: '🕳️',
    travelCost: 1000,
    minLevel: 5,
    description: 'Finstere Grotten, in denen seltsame Kreaturen hausen.',
    monsters: ['bat', 'troll', 'cave_spider', 'worm'],
    resources: ['erz', 'stein', 'giftpilz', 'magisches_erz'],
  },
  {
    id: 'berge',
    name: 'Eisige Berge',
    emoji: '⛰️',
    travelCost: 2500,
    minLevel: 8,
    description: 'Schroffe Gipfel, von Eis und Sturm gepeinigt.',
    monsters: ['yeti', 'stone_giant', 'ice_hawk', 'mountain_lion'],
    resources: ['stein', 'erz', 'gold_erz', 'froststoff'],
  },
  {
    id: 'wueste',
    name: 'Glühende Wüste',
    emoji: '🏜️',
    travelCost: 3000,
    minLevel: 10,
    description: 'Ein endloses Meer aus Sand und glühender Hitze.',
    monsters: ['scorpion', 'sandworm', 'desert_fox', 'mirage_demon'],
    resources: ['stein', 'gold_erz', 'knochen', 'leder'],
  },
  {
    id: 'sumpf',
    name: 'Giftiger Sumpf',
    emoji: '🌿',
    travelCost: 4000,
    minLevel: 12,
    description: 'Morastige Sümpfe, in denen giftiger Nebel wabert.',
    monsters: ['witch', 'mudslime', 'poison_frog', 'swamp_spirit'],
    resources: ['sumpfkraut', 'giftpilz', 'knochen', 'leder'],
  },
  {
    id: 'dschungel',
    name: 'Verlorener Dschungel',
    emoji: '🌴',
    travelCost: 6000,
    minLevel: 15,
    description: 'Ein undurchdringliches Dickicht voller uralter Geheimnisse.',
    monsters: ['giant_snake', 'primal_beast', 'jungle_witch', 'ancient_guardian'],
    resources: ['holz', 'dschungelfrucht', 'leder', 'knochen'],
  },
  {
    id: 'tundra',
    name: 'Arktische Tundra',
    emoji: '🧊',
    travelCost: 8000,
    minLevel: 18,
    description: 'Eine eisige Ebene, von Schneestürmen heimgesucht.',
    monsters: ['frost_drake', 'mammoth', 'ice_witch', 'polar_golem'],
    resources: ['froststoff', 'stein', 'knochen', 'leder'],
  },
  {
    id: 'vulkan',
    name: 'Vulkangebiet',
    emoji: '🌋',
    travelCost: 12000,
    minLevel: 22,
    description: 'Brodelnde Lavafelder und glühende Asche wohin das Auge reicht.',
    monsters: ['fire_demon', 'lava_giant', 'magma_spider', 'flame_wraith'],
    resources: ['vulkankern', 'gold_erz', 'erz', 'knochen'],
  },
  {
    id: 'meer',
    name: 'Tiefe See',
    emoji: '🌊',
    travelCost: 15000,
    minLevel: 25,
    description: 'Die unergründlichen Tiefen des Ozeans, wo Kreaturen lauern.',
    monsters: ['kraken', 'sea_serpent', 'deep_terror', 'abyssal_shark'],
    resources: ['perle', 'knochen', 'leder', 'froststoff'],
  },
  {
    id: 'wolken',
    name: 'Wolkenreich',
    emoji: '☁️',
    travelCost: 20000,
    minLevel: 30,
    description: 'Schwebende Inseln hoch über den Wolken, bewohnt von mächtigen Wesen.',
    monsters: ['gryphon', 'storm_bird', 'cloud_titan', 'sky_serpent'],
    resources: ['wolkenfaser', 'knochen', 'gold_erz', 'froststoff'],
  },
  {
    id: 'unterwelt',
    name: 'Unterwelt',
    emoji: '💀',
    travelCost: 30000,
    minLevel: 35,
    description: 'Das Reich der Verdammten. Nur die Stärksten überleben hier.',
    monsters: ['demon_lord', 'death_knight', 'soul_reaper', 'shadow_wraith'],
    resources: ['seelenstein', 'knochen', 'chaos_essenz', 'magisches_erz'],
  },
  {
    id: 'elfenwald',
    name: 'Elfenwald',
    emoji: '🧝',
    travelCost: 50000,
    minLevel: 40,
    description: 'Ein verzauberter Wald, der von mächtigen Elfen bewacht wird.',
    monsters: ['dark_elf_archer', 'dragon_guardian', 'corrupted_treant', 'elf_assassin'],
    resources: ['elfenholz', 'magisches_erz', 'holz', 'knochen'],
  },
  {
    id: 'drachenberg',
    name: 'Drachenberg',
    emoji: '🐉',
    travelCost: 80000,
    minLevel: 45,
    description: 'Der heilige Berg der Drachen. Ein Ort aus Feuer und Ehre.',
    monsters: ['young_dragon', 'elder_dragon', 'drake_rider', 'ancient_wyrm'],
    resources: ['drachenschuppe', 'vulkankern', 'gold_erz', 'knochen'],
  },
  {
    id: 'himmelsturm',
    name: 'Himmelsturm',
    emoji: '🗼',
    travelCost: 120000,
    minLevel: 50,
    description: 'Ein Turm, der bis in die Götterwelt reicht. Kaum ein Sterblicher wagt sich hierher.',
    monsters: ['archangel', 'celestial_titan', 'divine_guardian', 'seraphim'],
    resources: ['himmelsstein', 'wolkenfaser', 'gold_erz', 'knochen'],
  },
  {
    id: 'leereraum',
    name: 'Der Leere Raum',
    emoji: '⚫',
    travelCost: 200000,
    minLevel: 60,
    description: 'Ein Ort jenseits der Realität. Selbst Zeit und Raum existieren hier kaum.',
    monsters: ['void_walker', 'primal_horror', 'the_empty', 'chaos_god'],
    resources: ['leere_kristall', 'chaos_essenz', 'seelenstein', 'knochen'],
  },
];

// ====================================================================
// 2. MONSTER (64 Einträge, 4 pro Region)
// ====================================================================
const MONSTERS = [
  // --- dorf ---
  { id: 'rat',              name: 'Ratte',              emoji: '🐀', hp: 20,   atk: 5,   def: 2,   xpReward: 10,   coinMin: 50,    coinMax: 120,   dropChance: 0.20, drops: ['knochen'] },
  { id: 'wolf',             name: 'Wolf',               emoji: '🐺', hp: 40,   atk: 10,  def: 4,   xpReward: 20,   coinMin: 80,    coinMax: 180,   dropChance: 0.30, drops: ['leder', 'knochen'] },
  { id: 'bandit',           name: 'Bandit',             emoji: '🗡️', hp: 55,   atk: 14,  def: 5,   xpReward: 28,   coinMin: 120,   coinMax: 250,   dropChance: 0.25, drops: ['knochen'] },
  { id: 'goblin',           name: 'Goblin',             emoji: '👺', hp: 65,   atk: 16,  def: 6,   xpReward: 35,   coinMin: 150,   coinMax: 300,   dropChance: 0.25, drops: ['knochen', 'leder'] },

  // --- wald ---
  { id: 'bear',             name: 'Bär',                emoji: '🐻', hp: 100,  atk: 22,  def: 8,   xpReward: 55,   coinMin: 200,   coinMax: 420,   dropChance: 0.35, drops: ['leder', 'knochen'] },
  { id: 'troll',            name: 'Troll',              emoji: '👹', hp: 130,  atk: 26,  def: 10,  xpReward: 70,   coinMin: 280,   coinMax: 520,   dropChance: 0.30, drops: ['knochen'] },
  { id: 'darkelf',          name: 'Dunkelelfe',         emoji: '🧝', hp: 90,   atk: 30,  def: 7,   xpReward: 65,   coinMin: 250,   coinMax: 480,   dropChance: 0.30, drops: ['knochen', 'leder'] },

  // --- hoehle ---
  { id: 'bat',              name: 'Fledermaus',         emoji: '🦇', hp: 70,   atk: 18,  def: 5,   xpReward: 42,   coinMin: 180,   coinMax: 350,   dropChance: 0.20, drops: ['knochen'] },
  { id: 'cave_spider',      name: 'Höhlenspinne',       emoji: '🕷️', hp: 110,  atk: 28,  def: 9,   xpReward: 72,   coinMin: 300,   coinMax: 580,   dropChance: 0.35, drops: ['giftpilz', 'knochen'] },
  { id: 'worm',             name: 'Riesenwurm',         emoji: '🪱', hp: 150,  atk: 24,  def: 12,  xpReward: 80,   coinMin: 320,   coinMax: 600,   dropChance: 0.25, drops: ['knochen'] },

  // --- berge ---
  { id: 'yeti',             name: 'Yeti',               emoji: '🏔️', hp: 180,  atk: 38,  def: 15,  xpReward: 95,   coinMin: 500,   coinMax: 900,   dropChance: 0.30, drops: ['froststoff', 'knochen'] },
  { id: 'stone_giant',      name: 'Steinriese',         emoji: '🗿', hp: 250,  atk: 45,  def: 20,  xpReward: 130,  coinMin: 650,   coinMax: 1200,  dropChance: 0.25, drops: ['stein', 'knochen'] },
  { id: 'ice_hawk',         name: 'Eisfalke',           emoji: '🦅', hp: 140,  atk: 42,  def: 12,  xpReward: 110,  coinMin: 580,   coinMax: 1000,  dropChance: 0.30, drops: ['froststoff', 'leder'] },
  { id: 'mountain_lion',    name: 'Berglöwe',           emoji: '🦁', hp: 200,  atk: 50,  def: 16,  xpReward: 120,  coinMin: 600,   coinMax: 1100,  dropChance: 0.35, drops: ['leder', 'knochen'] },

  // --- wueste ---
  { id: 'scorpion',         name: 'Riesenskorpion',     emoji: '🦂', hp: 160,  atk: 45,  def: 18,  xpReward: 100,  coinMin: 550,   coinMax: 950,   dropChance: 0.30, drops: ['knochen'] },
  { id: 'sandworm',         name: 'Sandwurm',           emoji: '🌪️', hp: 280,  atk: 52,  def: 20,  xpReward: 140,  coinMin: 700,   coinMax: 1300,  dropChance: 0.25, drops: ['knochen', 'gold_erz'] },
  { id: 'desert_fox',       name: 'Wüstenfuchs',        emoji: '🦊', hp: 130,  atk: 48,  def: 14,  xpReward: 105,  coinMin: 560,   coinMax: 980,   dropChance: 0.35, drops: ['leder', 'knochen'] },
  { id: 'mirage_demon',     name: 'Trugbilddämon',      emoji: '👻', hp: 200,  atk: 58,  def: 16,  xpReward: 135,  coinMin: 680,   coinMax: 1250,  dropChance: 0.30, drops: ['knochen'] },

  // --- sumpf ---
  { id: 'witch',            name: 'Sumpfhexe',          emoji: '🧙', hp: 190,  atk: 60,  def: 18,  xpReward: 145,  coinMin: 750,   coinMax: 1400,  dropChance: 0.35, drops: ['sumpfkraut', 'giftpilz'] },
  { id: 'mudslime',         name: 'Schlammschleim',     emoji: '🫧', hp: 240,  atk: 50,  def: 22,  xpReward: 125,  coinMin: 650,   coinMax: 1200,  dropChance: 0.20, drops: ['sumpfkraut', 'knochen'] },
  { id: 'poison_frog',      name: '🐸 Giftfrosch',      emoji: '🐸', hp: 150,  atk: 55,  def: 15,  xpReward: 110,  coinMin: 600,   coinMax: 1100,  dropChance: 0.30, drops: ['giftpilz', 'sumpfkraut'] },
  { id: 'swamp_spirit',     name: 'Sumpfgeist',         emoji: '💨', hp: 170,  atk: 62,  def: 14,  xpReward: 130,  coinMin: 700,   coinMax: 1300,  dropChance: 0.25, drops: ['sumpfkraut', 'knochen'] },

  // --- dschungel ---
  { id: 'giant_snake',      name: 'Riesenschlange',     emoji: '🐍', hp: 300,  atk: 70,  def: 22,  xpReward: 170,  coinMin: 900,   coinMax: 1800,  dropChance: 0.35, drops: ['leder', 'dschungelfrucht'] },
  { id: 'primal_beast',     name: 'Urwesen',            emoji: '🦍', hp: 380,  atk: 80,  def: 28,  xpReward: 200,  coinMin: 1100,  coinMax: 2100,  dropChance: 0.30, drops: ['leder', 'knochen'] },
  { id: 'jungle_witch',     name: 'Dschungelhexe',      emoji: '🧙', hp: 260,  atk: 75,  def: 20,  xpReward: 185,  coinMin: 1000,  coinMax: 1900,  dropChance: 0.35, drops: ['dschungelfrucht', 'giftpilz'] },
  { id: 'ancient_guardian', name: 'Uralter Wächter',    emoji: '🗿', hp: 420,  atk: 85,  def: 32,  xpReward: 220,  coinMin: 1200,  coinMax: 2300,  dropChance: 0.25, drops: ['knochen', 'dschungelfrucht'] },

  // --- tundra ---
  { id: 'frost_drake',      name: 'Frostdrache',        emoji: '🐲', hp: 500,  atk: 90,  def: 35,  xpReward: 260,  coinMin: 2000,  coinMax: 3500,  dropChance: 0.35, drops: ['froststoff', 'knochen'] },
  { id: 'mammoth',          name: 'Mammut',             emoji: '🦣', hp: 600,  atk: 85,  def: 40,  xpReward: 280,  coinMin: 2200,  coinMax: 3800,  dropChance: 0.25, drops: ['leder', 'knochen'] },
  { id: 'ice_witch',        name: 'Eishexe',            emoji: '🧊', hp: 420,  atk: 100, def: 30,  xpReward: 270,  coinMin: 2100,  coinMax: 3600,  dropChance: 0.35, drops: ['froststoff', 'sumpfkraut'] },
  { id: 'polar_golem',      name: 'Polargolem',         emoji: '🤖', hp: 700,  atk: 95,  def: 45,  xpReward: 300,  coinMin: 2400,  coinMax: 4200,  dropChance: 0.25, drops: ['froststoff', 'stein'] },

  // --- vulkan ---
  { id: 'fire_demon',       name: 'Feuerdämon',         emoji: '😈', hp: 600,  atk: 110, def: 40,  xpReward: 330,  coinMin: 3000,  coinMax: 5000,  dropChance: 0.35, drops: ['vulkankern', 'knochen'] },
  { id: 'lava_giant',       name: 'Lavariese',          emoji: '🌋', hp: 800,  atk: 120, def: 50,  xpReward: 370,  coinMin: 3500,  coinMax: 5500,  dropChance: 0.25, drops: ['vulkankern', 'gold_erz'] },
  { id: 'magma_spider',     name: 'Magmaspinne',        emoji: '🕷️', hp: 480,  atk: 105, def: 35,  xpReward: 310,  coinMin: 2800,  coinMax: 4800,  dropChance: 0.35, drops: ['vulkankern', 'knochen'] },
  { id: 'flame_wraith',     name: 'Flammengeist',       emoji: '🔥', hp: 520,  atk: 115, def: 38,  xpReward: 340,  coinMin: 3200,  coinMax: 5200,  dropChance: 0.30, drops: ['vulkankern', 'knochen'] },

  // --- meer ---
  { id: 'kraken',           name: 'Kraken',             emoji: '🦑', hp: 900,  atk: 130, def: 45,  xpReward: 420,  coinMin: 4000,  coinMax: 6500,  dropChance: 0.35, drops: ['perle', 'knochen'] },
  { id: 'sea_serpent',      name: 'Meeresschlange',     emoji: '🐍', hp: 750,  atk: 125, def: 42,  xpReward: 390,  coinMin: 3800,  coinMax: 6000,  dropChance: 0.30, drops: ['perle', 'leder'] },
  { id: 'deep_terror',      name: 'Tiefenschrecken',    emoji: '👁️', hp: 850,  atk: 135, def: 48,  xpReward: 410,  coinMin: 4200,  coinMax: 6800,  dropChance: 0.25, drops: ['perle', 'knochen'] },
  { id: 'abyssal_shark',    name: 'Abyssalhai',         emoji: '🦈', hp: 700,  atk: 120, def: 40,  xpReward: 370,  coinMin: 3500,  coinMax: 5800,  dropChance: 0.30, drops: ['leder', 'knochen'] },

  // --- wolken ---
  { id: 'gryphon',          name: 'Greif',              emoji: '🦅', hp: 950,  atk: 145, def: 52,  xpReward: 460,  coinMin: 5000,  coinMax: 7500,  dropChance: 0.35, drops: ['wolkenfaser', 'leder'] },
  { id: 'storm_bird',       name: 'Sturmvogel',         emoji: '⚡', hp: 800,  atk: 140, def: 48,  xpReward: 440,  coinMin: 4800,  coinMax: 7200,  dropChance: 0.30, drops: ['wolkenfaser', 'knochen'] },
  { id: 'cloud_titan',      name: 'Wolkentitan',        emoji: '☁️', hp: 1100, atk: 155, def: 58,  xpReward: 490,  coinMin: 5500,  coinMax: 8000,  dropChance: 0.25, drops: ['wolkenfaser', 'knochen'] },
  { id: 'sky_serpent',      name: 'Himmelsschlange',    emoji: '🐉', hp: 900,  atk: 148, def: 50,  xpReward: 470,  coinMin: 5200,  coinMax: 7800,  dropChance: 0.30, drops: ['wolkenfaser', 'gold_erz'] },

  // --- unterwelt ---
  { id: 'demon_lord',       name: 'Dämonenfürst',       emoji: '👿', hp: 1500, atk: 200, def: 75,  xpReward: 700,  coinMin: 10000, coinMax: 16000, dropChance: 0.40, drops: ['seelenstein', 'chaos_essenz'] },
  { id: 'death_knight',     name: 'Todesritter',        emoji: '💀', hp: 1800, atk: 190, def: 85,  xpReward: 750,  coinMin: 11000, coinMax: 17000, dropChance: 0.35, drops: ['seelenstein', 'knochen'] },
  { id: 'soul_reaper',      name: 'Seelenernter',       emoji: '☠️', hp: 1600, atk: 210, def: 72,  xpReward: 720,  coinMin: 10500, coinMax: 16500, dropChance: 0.35, drops: ['seelenstein', 'chaos_essenz'] },
  { id: 'shadow_wraith',    name: 'Schattengeist',      emoji: '🌑', hp: 1400, atk: 195, def: 68,  xpReward: 680,  coinMin: 9500,  coinMax: 15000, dropChance: 0.30, drops: ['seelenstein', 'knochen'] },

  // --- elfenwald ---
  { id: 'dark_elf_archer',  name: 'Dunkelelfen-Bogner', emoji: '🏹', hp: 1800, atk: 230, def: 80,  xpReward: 900,  coinMin: 14000, coinMax: 20000, dropChance: 0.35, drops: ['elfenholz', 'magisches_erz'] },
  { id: 'dragon_guardian',  name: 'Drachenwächter',     emoji: '🐲', hp: 2200, atk: 250, def: 95,  xpReward: 1000, coinMin: 16000, coinMax: 22000, dropChance: 0.30, drops: ['elfenholz', 'knochen'] },
  { id: 'corrupted_treant', name: 'Verdorbener Baumhüter', emoji: '🌳', hp: 2500, atk: 240, def: 100, xpReward: 1050, coinMin: 17000, coinMax: 23000, dropChance: 0.25, drops: ['elfenholz', 'magisches_erz'] },
  { id: 'elf_assassin',     name: 'Elfen-Assassine',    emoji: '🧝', hp: 1600, atk: 260, def: 75,  xpReward: 950,  coinMin: 15000, coinMax: 21000, dropChance: 0.35, drops: ['elfenholz', 'knochen'] },

  // --- drachenberg ---
  { id: 'young_dragon',     name: 'Junger Drache',      emoji: '🐉', hp: 2800, atk: 300, def: 110, xpReward: 1300, coinMin: 20000, coinMax: 28000, dropChance: 0.35, drops: ['drachenschuppe', 'vulkankern'] },
  { id: 'elder_dragon',     name: 'Älterer Drache',     emoji: '🔥', hp: 3500, atk: 350, def: 130, xpReward: 1600, coinMin: 24000, coinMax: 32000, dropChance: 0.30, drops: ['drachenschuppe', 'gold_erz'] },
  { id: 'drake_rider',      name: 'Drachenreiter',      emoji: '🪄', hp: 2500, atk: 320, def: 105, xpReward: 1400, coinMin: 22000, coinMax: 30000, dropChance: 0.30, drops: ['drachenschuppe', 'knochen'] },
  { id: 'ancient_wyrm',     name: 'Urwyrm',             emoji: '🐲', hp: 4000, atk: 370, def: 140, xpReward: 1800, coinMin: 26000, coinMax: 34000, dropChance: 0.25, drops: ['drachenschuppe', 'seelenstein'] },

  // --- himmelsturm ---
  { id: 'archangel',        name: 'Erzengel',           emoji: '👼', hp: 3500, atk: 400, def: 140, xpReward: 1900, coinMin: 28000, coinMax: 36000, dropChance: 0.35, drops: ['himmelsstein', 'wolkenfaser'] },
  { id: 'celestial_titan',  name: 'Himmelstitan',       emoji: '🌟', hp: 4500, atk: 430, def: 155, xpReward: 2100, coinMin: 32000, coinMax: 42000, dropChance: 0.25, drops: ['himmelsstein', 'knochen'] },
  { id: 'divine_guardian',  name: 'Göttlicher Wächter', emoji: '⚔️', hp: 4000, atk: 410, def: 148, xpReward: 2000, coinMin: 30000, coinMax: 38000, dropChance: 0.30, drops: ['himmelsstein', 'wolkenfaser'] },
  { id: 'seraphim',         name: 'Seraphim',           emoji: '✨', hp: 3800, atk: 420, def: 145, xpReward: 2050, coinMin: 31000, coinMax: 40000, dropChance: 0.35, drops: ['himmelsstein', 'gold_erz'] },

  // --- leereraum ---
  { id: 'void_walker',      name: 'Leerewanderer',      emoji: '⚫', hp: 4500, atk: 480, def: 160, xpReward: 2500, coinMin: 40000, coinMax: 55000, dropChance: 0.35, drops: ['leere_kristall', 'chaos_essenz'] },
  { id: 'primal_horror',    name: 'Urgrauen',           emoji: '👁️', hp: 5500, atk: 520, def: 175, xpReward: 2800, coinMin: 48000, coinMax: 65000, dropChance: 0.30, drops: ['leere_kristall', 'chaos_essenz'] },
  { id: 'the_empty',        name: 'Die Leere',          emoji: '🌑', hp: 6000, atk: 550, def: 185, xpReward: 3000, coinMin: 52000, coinMax: 70000, dropChance: 0.25, drops: ['leere_kristall', 'seelenstein'] },
  { id: 'chaos_god',        name: 'Chaosgott',          emoji: '⚡', hp: 7000, atk: 600, def: 200, xpReward: 3500, coinMin: 60000, coinMax: 80000, dropChance: 0.40, drops: ['leere_kristall', 'chaos_essenz'] },
];

// ====================================================================
// 3. RESSOURCEN (20 Einträge)
// ====================================================================
const RESOURCES = [
  { id: 'holz',          name: 'Holz',           emoji: '🪵', regions: ['dorf', 'wald', 'dschungel', 'elfenwald'], baseAmount: [2, 5],  sellPrice: 15  },
  { id: 'stein',         name: 'Stein',          emoji: '🪨', regions: ['dorf', 'berge', 'hoehle', 'wueste'],      baseAmount: [2, 6],  sellPrice: 12  },
  { id: 'erz',           name: 'Eisenerz',       emoji: '⚙️', regions: ['hoehle', 'berge'],                         baseAmount: [1, 4],  sellPrice: 40  },
  { id: 'gold_erz',      name: 'Golderz',        emoji: '🥇', regions: ['berge', 'vulkan', 'wueste'],               baseAmount: [1, 3],  sellPrice: 150 },
  { id: 'sumpfkraut',    name: 'Sumpfkraut',     emoji: '🌿', regions: ['sumpf'],                                   baseAmount: [2, 5],  sellPrice: 60  },
  { id: 'giftpilz',      name: 'Giftpilz',       emoji: '🍄', regions: ['sumpf', 'hoehle'],                         baseAmount: [1, 4],  sellPrice: 80  },
  { id: 'dschungelfrucht', name: 'Dschungelfrucht', emoji: '🍈', regions: ['dschungel'],                            baseAmount: [2, 5],  sellPrice: 55  },
  { id: 'froststoff',    name: 'Froststoff',     emoji: '🧊', regions: ['tundra', 'berge'],                         baseAmount: [1, 4],  sellPrice: 120 },
  { id: 'vulkankern',    name: 'Vulkankern',     emoji: '🔥', regions: ['vulkan'],                                  baseAmount: [1, 3],  sellPrice: 200 },
  { id: 'perle',         name: 'Meeresperle',    emoji: '🐚', regions: ['meer'],                                    baseAmount: [1, 3],  sellPrice: 180 },
  { id: 'wolkenfaser',   name: 'Wolkenfaser',    emoji: '☁️', regions: ['wolken'],                                  baseAmount: [1, 3],  sellPrice: 250 },
  { id: 'seelenstein',   name: 'Seelenstein',    emoji: '💀', regions: ['unterwelt', 'leereraum'],                  baseAmount: [1, 2],  sellPrice: 400 },
  { id: 'elfenholz',     name: 'Elfenholz',      emoji: '🌳', regions: ['elfenwald'],                               baseAmount: [1, 3],  sellPrice: 300 },
  { id: 'drachenschuppe', name: 'Drachenschuppe', emoji: '🐉', regions: ['drachenberg'],                            baseAmount: [1, 2],  sellPrice: 500 },
  { id: 'himmelsstein',  name: 'Himmelsstein',   emoji: '✨', regions: ['himmelsturm'],                             baseAmount: [1, 2],  sellPrice: 750 },
  { id: 'leere_kristall', name: 'Leerekristall', emoji: '⚫', regions: ['leereraum'],                               baseAmount: [1, 2],  sellPrice: 1000 },
  { id: 'leder',         name: 'Leder',          emoji: '🥩', regions: ['dorf', 'wald', 'dschungel', 'wueste'],    baseAmount: [1, 4],  sellPrice: 25  },
  { id: 'knochen',       name: 'Knochen',        emoji: '🦴', regions: ['dorf', 'wald', 'hoehle', 'berge', 'wueste', 'sumpf', 'dschungel', 'tundra', 'vulkan', 'meer', 'wolken', 'unterwelt', 'elfenwald', 'drachenberg', 'himmelsturm', 'leereraum'], baseAmount: [1, 5], sellPrice: 20 },
  { id: 'magisches_erz', name: 'Magisches Erz',  emoji: '🔮', regions: ['hoehle', 'elfenwald'],                    baseAmount: [1, 2],  sellPrice: 350 },
  { id: 'chaos_essenz',  name: 'Chaos-Essenz',   emoji: '⚡', regions: ['leereraum', 'unterwelt'],                  baseAmount: [1, 2],  sellPrice: 800 },
];

// ====================================================================
// HILFSFUNKTIONEN
// ====================================================================
function findRegion(id) {
  return REGIONS.find(r => r.id === id) || null;
}

function findMonster(id) {
  return MONSTERS.find(m => m.id === id) || null;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// ====================================================================
// 4. WorldManager CLASS
// ====================================================================
class WorldManager {
  constructor(economy) {
    this.eco = economy;
    this.db  = economy.db;
  }

  // ------------------------------------------------------------------
  // Standort
  // ------------------------------------------------------------------
  async getLocation(userId) {
    const result = await this.db.execute({
      sql:  'SELECT region_id FROM player_location WHERE user_id = ?',
      args: [userId],
    });
    const row = result.rows[0];
    if (!row) return REGIONS[0];
    return findRegion(row.region_id) || REGIONS[0];
  }

  // ------------------------------------------------------------------
  // Reisen
  // ------------------------------------------------------------------
  async travel(userId, regionId) {
    const target = findRegion(regionId);
    if (!target) return { ok: false, message: '❌ Unbekannte Region.' };

    const { level } = await this.eco.getLevelInfo(userId);
    if (level < target.minLevel) {
      return {
        ok:      false,
        message: `❌ Du brauchst mindestens Level ${target.minLevel} für ${target.emoji} ${target.name}.`,
      };
    }

    if (target.travelCost > 0) {
      const remaining = await this.eco.deductBalance(userId, target.travelCost);
      if (remaining === null) {
        return {
          ok:      false,
          message: `❌ Du brauchst ${target.travelCost.toLocaleString()} Coins für die Reise.`,
        };
      }
    }

    await this.db.execute({
      sql:  `INSERT INTO player_location (user_id, region_id, arrived_at)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET region_id = excluded.region_id, arrived_at = excluded.arrived_at`,
      args: [userId, regionId, nowSec()],
    });

    await this.eco.addStat(userId, 'regions_visited', 1);

    return {
      ok:     true,
      region: target,
      message: `✅ Du bist nach ${target.emoji} *${target.name}* gereist! (Kosten: ${target.travelCost.toLocaleString()} Coins)`,
    };
  }

  // ------------------------------------------------------------------
  // Kampf
  // ------------------------------------------------------------------
  async fight(userId) {
    const region  = await this.getLocation(userId);
    const { level } = await this.eco.getLevelInfo(userId);

    // Zufälliges Monster aus der Region wählen
    const monsterId = region.monsters[Math.floor(Math.random() * region.monsters.length)];
    const monster   = findMonster(monsterId);
    if (!monster) return { ok: false, message: '❌ Kein Monster gefunden.' };

    // Spieler-Werte
    const userMaxHp  = 100 + level * 20;
    const userAtk    = 10  + level * 3;
    const userDef    = 5   + level * 2;

    let userHp    = userMaxHp;
    let monsterHp = monster.hp;
    const rounds  = [];
    let roundNum  = 0;

    while (userHp > 0 && monsterHp > 0 && roundNum < 20) {
      roundNum++;
      const userDmg    = Math.max(1, userAtk    - monster.def);
      const monsterDmg = Math.max(1, monster.atk - userDef);
      monsterHp -= userDmg;
      if (monsterHp > 0) userHp -= monsterDmg;
      rounds.push({ round: roundNum, userDmg, monsterDmg, userHp: Math.max(0, userHp), monsterHp: Math.max(0, monsterHp) });
    }

    const win = monsterHp <= 0;
    let xpGained    = 0;
    let coinsGained = 0;
    let drop        = null;
    let leveledUp   = false;
    let newLevel    = level;

    if (win) {
      xpGained    = monster.xpReward;
      coinsGained = randInt(monster.coinMin, monster.coinMax);
      const xpResult = await this.eco.addXp(userId, xpGained);
      leveledUp = xpResult.leveledUp;
      newLevel  = xpResult.level;
      await this.eco.addBalance(userId, coinsGained);

      // Drop-Check
      if (monster.drops && monster.drops.length > 0 && Math.random() < monster.dropChance) {
        const dropId = monster.drops[Math.floor(Math.random() * monster.drops.length)];
        drop = dropId;
        await this._addResource(userId, dropId, 1);
      }

      // Kills tracken
      await this.db.execute({
        sql:  'INSERT INTO monster_kills (user_id, monster_id, killed_at, region_id) VALUES (?, ?, ?, ?)',
        args: [userId, monster.id, nowSec(), region.id],
      });
      await this.eco.addStat(userId, 'monster_kills', 1);

    } else {
      // Niederlage: kleiner XP-Trost
      xpGained = Math.max(1, Math.floor(monster.xpReward * 0.1));
      await this.eco.addXp(userId, xpGained);
    }

    return {
      ok:         true,
      win,
      monster,
      rounds:     rounds.length,
      xpGained,
      coinsGained,
      drop,
      leveledUp,
      newLevel,
      userHpLeft: Math.max(0, userHp),
      region,
    };
  }

  // ------------------------------------------------------------------
  // Jagd (3 Kämpfe, 5 Ladungen pro Tag)
  // ------------------------------------------------------------------
  async hunt(userId) {
    const charges = await this.getHuntCharges(userId);
    if (charges.remaining <= 0) {
      return { ok: false, message: '❌ Keine Jagdladungen mehr. Morgen wieder verfügbar.' };
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const metaKey = `hunt_used_${today}`;
    const usedToday = (await this.eco.getMeta(userId, metaKey)) || 0;
    await this.eco.setMeta(userId, metaKey, usedToday + 1);

    const results = [];
    for (let i = 0; i < 3; i++) {
      const fightResult = await this.fight(userId);
      results.push(fightResult);
    }

    const totalXp    = results.reduce((s, r) => s + r.xpGained, 0);
    const totalCoins = results.reduce((s, r) => s + r.coinsGained, 0);
    const wins       = results.filter(r => r.win).length;
    const drops      = results.map(r => r.drop).filter(Boolean);

    return {
      ok:         true,
      results,
      totalXp,
      totalCoins,
      wins,
      losses:     3 - wins,
      drops,
      chargesLeft: charges.remaining - 1,
    };
  }

  async getHuntCharges(userId) {
    const total    = 5;
    const today    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const metaKey  = `hunt_used_${today}`;
    const used     = (await this.eco.getMeta(userId, metaKey)) || 0;
    return { used, total, remaining: Math.max(0, total - used) };
  }

  // ------------------------------------------------------------------
  // Flucht
  // ------------------------------------------------------------------
  async flee(userId) {
    const success = Math.random() < 0.5;
    if (success) {
      return { ok: true, message: '🏃 Du bist erfolgreich geflohen!' };
    }
    // Kleiner XP-Verlust bei Fehlschlag (symbolisch, addXp mit 0 reicht)
    return { ok: false, message: '❌ Die Flucht ist gescheitert! Du wirst angegriffen.' };
  }

  // ------------------------------------------------------------------
  // Sammeln
  // ------------------------------------------------------------------
  async gather(userId) {
    const cooldownSec = 30 * 60; // 30 Minuten
    const lastGather  = (await this.eco.getMeta(userId, 'gather_last')) || 0;
    const now         = nowSec();
    const diff        = now - lastGather;

    if (diff < cooldownSec) {
      const remaining = cooldownSec - diff;
      const mins = Math.ceil(remaining / 60);
      return { ok: false, message: `⏳ Noch ${mins} Minute(n) warten bis zum nächsten Sammeln.` };
    }

    const region      = await this.getLocation(userId);
    const regionRes   = RESOURCES.filter(r => r.regions.includes(region.id));

    if (regionRes.length === 0) {
      return { ok: false, message: '❌ In dieser Region gibt es nichts zu sammeln.' };
    }

    // 1–3 zufällige Ressourcentypen sammeln
    const count    = Math.min(regionRes.length, randInt(1, 3));
    const shuffled = [...regionRes].sort(() => Math.random() - 0.5).slice(0, count);
    const gathered = [];

    for (const res of shuffled) {
      const amount = randInt(res.baseAmount[0], res.baseAmount[1]);
      await this._addResource(userId, res.id, amount);
      gathered.push({ resource: res, amount });
    }

    await this.eco.setMeta(userId, 'gather_last', now);
    await this.eco.addStat(userId, 'gather_count', 1);

    return { ok: true, gathered, region };
  }

  // ------------------------------------------------------------------
  // Ressourcen abfragen
  // ------------------------------------------------------------------
  async getResources(userId) {
    const result = await this.db.execute({
      sql:  'SELECT resource_id, amount FROM world_resources WHERE user_id = ? AND amount > 0',
      args: [userId],
    });
    return result.rows.map(row => ({
      resource: RESOURCES.find(r => r.id === row.resource_id) || { id: row.resource_id, name: row.resource_id, emoji: '📦' },
      amount:   row.amount,
    }));
  }

  // ------------------------------------------------------------------
  // Ressourcen verkaufen
  // ------------------------------------------------------------------
  async sellResources(userId, resourceId, amount) {
    const res = RESOURCES.find(r => r.id === resourceId);
    if (!res) return { ok: false, message: '❌ Unbekannte Ressource.' };

    amount = parseInt(amount, 10);
    if (!amount || amount < 1) return { ok: false, message: '❌ Ungültige Menge.' };

    // Aktuellen Bestand prüfen
    const result = await this.db.execute({
      sql:  'SELECT amount FROM world_resources WHERE user_id = ? AND resource_id = ?',
      args: [userId, resourceId],
    });
    const current = result.rows[0] ? result.rows[0].amount : 0;

    if (current < amount) {
      return { ok: false, message: `❌ Du hast nur ${current}x ${res.emoji} ${res.name}.` };
    }

    const earned = res.sellPrice * amount;
    await this.db.execute({
      sql:  'UPDATE world_resources SET amount = amount - ? WHERE user_id = ? AND resource_id = ?',
      args: [amount, userId, resourceId],
    });
    await this.eco.addBalance(userId, earned);
    await this.eco.addStat(userId, 'resources_sold', amount);

    return {
      ok:      true,
      resource: res,
      amount,
      earned,
      message: `✅ ${amount}x ${res.emoji} ${res.name} für ${earned.toLocaleString()} Coins verkauft.`,
    };
  }

  // ------------------------------------------------------------------
  // Monster-Kills
  // ------------------------------------------------------------------
  async getMonsterKills(userId) {
    const totalResult = await this.db.execute({
      sql:  'SELECT COUNT(*) as total FROM monster_kills WHERE user_id = ?',
      args: [userId],
    });
    const total = totalResult.rows[0] ? totalResult.rows[0].total : 0;

    const perMonsterResult = await this.db.execute({
      sql:  'SELECT monster_id, COUNT(*) as kills FROM monster_kills WHERE user_id = ? GROUP BY monster_id ORDER BY kills DESC',
      args: [userId],
    });

    const perMonster = perMonsterResult.rows.map(row => ({
      monster: findMonster(row.monster_id) || { id: row.monster_id, name: row.monster_id, emoji: '👾' },
      kills:   row.kills,
    }));

    return { total, perMonster };
  }

  // ------------------------------------------------------------------
  // Weltkarte (Text)
  // ------------------------------------------------------------------
  async getWorldMap() {
    const lines = ['🗺️ *Weltkarte*\n'];
    for (const region of REGIONS) {
      lines.push(`${region.emoji} *${region.name}* (Level ${region.minLevel}+) – Reisekosten: ${region.travelCost.toLocaleString()} Coins`);
    }
    return lines.join('\n');
  }

  // ------------------------------------------------------------------
  // Regions-Info
  // ------------------------------------------------------------------
  async getRegionInfo(regionId) {
    const region = findRegion(regionId);
    if (!region) return null;

    const monsters  = region.monsters.map(id => findMonster(id)).filter(Boolean);
    const resources = RESOURCES.filter(r => r.regions.includes(region.id));

    return { region, monsters, resources };
  }

  // ------------------------------------------------------------------
  // Erkunden (1h Cooldown)
  // ------------------------------------------------------------------
  async explore(userId) {
    const cooldownSec = 60 * 60;
    const lastExplore = (await this.eco.getMeta(userId, 'explore_last')) || 0;
    const now         = nowSec();
    const diff        = now - lastExplore;

    if (diff < cooldownSec) {
      const remaining = cooldownSec - diff;
      const mins = Math.ceil(remaining / 60);
      return { ok: false, message: `⏳ Noch ${mins} Minute(n) bis zur nächsten Erkundung.` };
    }

    await this.eco.setMeta(userId, 'explore_last', now);
    await this.eco.addStat(userId, 'explore_count', 1);

    const region = await this.getLocation(userId);
    const roll   = Math.random();
    let discovery;

    if (roll < 0.40) {
      // Münzen-Fund (häufigster Fall)
      const base   = 100 + region.minLevel * 50;
      const coins  = randInt(base, base * 3);
      await this.eco.addBalance(userId, coins);
      discovery = { type: 'coins', value: coins, message: `💰 Du hast ${coins.toLocaleString()} Coins gefunden!` };

    } else if (roll < 0.70) {
      // Ressource gefunden
      const regionRes = RESOURCES.filter(r => r.regions.includes(region.id));
      if (regionRes.length > 0) {
        const res    = regionRes[Math.floor(Math.random() * regionRes.length)];
        const amount = randInt(1, 3);
        await this._addResource(userId, res.id, amount);
        discovery = { type: 'resource', resource: res, amount, message: `${res.emoji} Du hast ${amount}x ${res.name} entdeckt!` };
      } else {
        const coins = randInt(200, 800);
        await this.eco.addBalance(userId, coins);
        discovery = { type: 'coins', value: coins, message: `💰 Du hast ${coins.toLocaleString()} Coins gefunden!` };
      }

    } else if (roll < 0.90) {
      // XP-Bonus
      const xp = 10 + region.minLevel * 5;
      const xpResult = await this.eco.addXp(userId, xp);
      discovery = { type: 'xp', value: xp, leveledUp: xpResult.leveledUp, message: `⭐ Du hast ${xp} XP gewonnen!` };

    } else {
      // Seltener Hinweis (Rarität-Flavor)
      const hints = [
        '🗝️ Du entdeckst eine mysteriöse Höhle… aber der Eingang ist versperrt.',
        '📜 Eine alte Karte zeigt auf ein unbekanntes Land jenseits der Berge.',
        '💎 In der Ferne glitzert etwas – doch du kannst es nicht erreichen.',
        '👁️ Du spürst, dass jemand dich beobachtet. Dann – Stille.',
        '🌟 Ein Sternschnuppenregen erhellt die Nacht. Irgendwas Großes naht.',
      ];
      discovery = {
        type:    'hint',
        message: hints[Math.floor(Math.random() * hints.length)],
      };
    }

    return { ok: true, discovery, region };
  }

  // ------------------------------------------------------------------
  // Welt-Leaderboard (Top 10 nach Monster-Kills)
  // ------------------------------------------------------------------
  async getWorldLeaderboard() {
    const result = await this.db.execute({
      sql:  `SELECT user_id, COUNT(*) as kills
             FROM monster_kills
             GROUP BY user_id
             ORDER BY kills DESC
             LIMIT 10`,
      args: [],
    });
    return result.rows.map((row, i) => ({
      rank:   i + 1,
      userId: row.user_id,
      kills:  row.kills,
    }));
  }

  // ------------------------------------------------------------------
  // Interne Hilfsmethode: Ressource zum Inventar hinzufügen
  // ------------------------------------------------------------------
  async _addResource(userId, resourceId, amount) {
    await this.db.execute({
      sql:  `INSERT INTO world_resources (user_id, resource_id, amount)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id, resource_id) DO UPDATE SET amount = amount + excluded.amount`,
      args: [userId, resourceId, amount],
    });
  }
}

// ====================================================================
// 6. EXPORTS
// ====================================================================
module.exports = { WorldManager, REGIONS, MONSTERS, RESOURCES, findRegion, findMonster };
