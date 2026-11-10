import type { ClassDef } from '../types'

// Base classes (rank I) + one rank II branch each.
// COST per rank follows the reference game: I=1, II=2, III=3, IV=4, V=6.
// Kit: basic (attack timer) + active (energy full); passive is rolled per duelist.
// Add more classes here — everything else is data-driven.

const melee = { range: 24, speed: 34 }
const ranged = { range: 130, speed: 26 }

function mob(
  id: string, name: string, base: ClassDef['base'], growth: ClassDef['growth'], active: ClassDef['active'],
  row: ClassDef['row'] = 'front', isRanged = false,
): ClassDef {
  const basic = { name: isRanged ? 'Shot' : 'Strike', power: 1 }
  return { id, name, rank: 1, cost: 0, row, ranged: isRanged, base, growth, basic, active, upgradesTo: [], sprite: id === 'slime' ? 'slime' : 'human', palette: id }
}

export const CLASSES: Record<string, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Warrior', rank: 1, cost: 1, row: 'front', ranged: false,
    base: { hp: 120, atk: 12, def: 6, interval: 1.1, crit: 0.05, ...melee },
    growth: { hp: 14, atk: 1.6, def: 0.9 },
    basic: { name: 'Slash', power: 1 },
    active: { id: 'cleave', name: 'Cleave', kind: 'cleave', power: 2.0, area: 28 },
    upgradesTo: ['knight'], sprite: 'human', palette: 'warrior',
  },
  mage: {
    id: 'mage', name: 'Mage', rank: 1, cost: 1, row: 'back', ranged: true,
    base: { hp: 70, atk: 15, def: 2, interval: 1.6, crit: 0.05, ...ranged },
    growth: { hp: 7, atk: 2.2, def: 0.3 },
    basic: { name: 'Arcane Bolt', power: 1 },
    active: { id: 'fireball', name: 'Fireball', kind: 'fireball', power: 1.6, area: 42 },
    upgradesTo: ['wizard'], sprite: 'human', palette: 'mage',
  },
  priest: {
    id: 'priest', name: 'Priest', rank: 1, cost: 1, row: 'back', ranged: true,
    base: { hp: 80, atk: 8, def: 3, interval: 1.5, crit: 0.03, ...ranged, range: 110 },
    growth: { hp: 8, atk: 1.2, def: 0.4 },
    basic: { name: 'Rebuke', power: 1 },
    active: { id: 'heal', name: 'Heal', kind: 'heal', power: 2.6 },
    upgradesTo: ['bishop'], sprite: 'human', palette: 'priest',
  },
  archer: {
    id: 'archer', name: 'Archer', rank: 1, cost: 1, row: 'back', ranged: true,
    base: { hp: 85, atk: 13, def: 3, interval: 0.9, crit: 0.12, ...ranged, range: 150 },
    growth: { hp: 8, atk: 1.8, def: 0.4 },
    basic: { name: 'Quick Shot', power: 1 },
    active: { id: 'volley', name: 'Volley', kind: 'volley', power: 0.9, hits: 3 },
    upgradesTo: ['ranger'], sprite: 'human', palette: 'archer',
  },

  // ---- Rank II ----
  knight: {
    id: 'knight', name: 'Knight', rank: 2, cost: 2, row: 'front', ranged: false,
    base: { hp: 220, atk: 16, def: 12, interval: 1.2, crit: 0.05, ...melee },
    growth: { hp: 22, atk: 2, def: 1.5 },
    basic: { name: 'Lance Thrust', power: 1 },
    active: { id: 'guard', name: 'Shield Wall', kind: 'guard', power: 0.5 },
    upgradesTo: [], sprite: 'human', palette: 'knight',
  },
  wizard: {
    id: 'wizard', name: 'Wizard', rank: 2, cost: 2, row: 'back', ranged: true,
    base: { hp: 100, atk: 26, def: 4, interval: 1.5, crit: 0.07, ...ranged },
    growth: { hp: 10, atk: 3.2, def: 0.5 },
    basic: { name: 'Mana Lance', power: 1 },
    active: { id: 'meteor', name: 'Meteor', kind: 'fireball', power: 2.4, area: 60 },
    upgradesTo: [], sprite: 'human', palette: 'wizard',
  },
  bishop: {
    id: 'bishop', name: 'Bishop', rank: 2, cost: 2, row: 'back', ranged: true,
    base: { hp: 120, atk: 14, def: 5, interval: 1.4, crit: 0.03, ...ranged, range: 110 },
    growth: { hp: 12, atk: 1.8, def: 0.6 },
    basic: { name: 'Judgement', power: 1 },
    active: { id: 'smite', name: 'Holy Smite', kind: 'smite', power: 2.2, area: 40 },
    upgradesTo: [], sprite: 'human', palette: 'bishop',
  },
  ranger: {
    id: 'ranger', name: 'Ranger', rank: 2, cost: 2, row: 'back', ranged: true,
    base: { hp: 120, atk: 21, def: 5, interval: 0.8, crit: 0.18, ...ranged, range: 160 },
    growth: { hp: 11, atk: 2.7, def: 0.6 },
    basic: { name: 'Piercing Shot', power: 1 },
    active: { id: 'rain', name: 'Arrow Rain', kind: 'volley', power: 1.0, hits: 5 },
    upgradesTo: [], sprite: 'human', palette: 'ranger',
  },

  // ---- Monsters (frontier waves). Art ids match src/assets/sprites. ----
  slime: mob('slime', 'Slime', { hp: 60, atk: 7, def: 1, interval: 1.4, crit: 0, range: 22, speed: 20 },
    { hp: 9, atk: 1.1, def: 0.4 }, { id: 'bounce', name: 'Bounce', kind: 'cleave', power: 1.5, area: 20 }),
  wolf: mob('wolf', 'Dire Wolf', { hp: 45, atk: 9, def: 0, interval: 0.7, crit: 0.1, range: 24, speed: 55 },
    { hp: 6, atk: 1.3, def: 0.2 }, { id: 'maul', name: 'Maul', kind: 'cleave', power: 1.6, area: 10 }),
  orc: mob('orc', 'Orc Brute', { hp: 90, atk: 10, def: 4, interval: 1.1, crit: 0.05, range: 26, speed: 30 },
    { hp: 12, atk: 1.4, def: 0.7 }, { id: 'smash', name: 'Smash', kind: 'cleave', power: 1.8, area: 18 }),
  skeleton: mob('skeleton', 'Skeleton Archer', { hp: 55, atk: 11, def: 2, interval: 1.3, crit: 0.05, range: 120, speed: 24 },
    { hp: 7, atk: 1.5, def: 0.3 }, { id: 'bone', name: 'Bone Volley', kind: 'volley', power: 0.8, hits: 2 }, 'back', true),
  wraith: mob('wraith', 'Wraith', { hp: 60, atk: 13, def: 1, interval: 1.2, crit: 0.1, range: 90, speed: 32 },
    { hp: 8, atk: 1.8, def: 0.3 }, { id: 'wail', name: 'Wail', kind: 'fireball', power: 1.4, area: 36 }, 'back', true),
  troll: mob('troll', 'Cave Troll', { hp: 160, atk: 12, def: 6, interval: 1.5, crit: 0.03, range: 28, speed: 22 },
    { hp: 20, atk: 1.6, def: 1 }, { id: 'quake', name: 'Quake', kind: 'cleave', power: 1.8, area: 34 }),
  // elites: rare spawns in later outposts
  draugr: mob('draugr', 'Draugr Lord', { hp: 220, atk: 16, def: 8, interval: 1.2, crit: 0.08, range: 28, speed: 26 },
    { hp: 26, atk: 2.2, def: 1.2 }, { id: 'reap', name: 'Reap', kind: 'cleave', power: 2.2, area: 30 }),
  jotunn: mob('jotunn', 'Frost Jotunn', { hp: 320, atk: 18, def: 10, interval: 1.6, crit: 0.05, range: 32, speed: 18 },
    { hp: 34, atk: 2.4, def: 1.4 }, { id: 'frost', name: 'Frost Slam', kind: 'fireball', power: 2.0, area: 44 }),
  drake: mob('drake', 'Fire Drake', { hp: 260, atk: 22, def: 7, interval: 1.4, crit: 0.08, range: 100, speed: 28 },
    { hp: 28, atk: 2.8, def: 1.1 }, { id: 'breath', name: 'Fire Breath', kind: 'fireball', power: 2.2, area: 50 }, 'back', true),
}

export const RECRUITABLE = ['warrior', 'mage', 'priest', 'archer']

export function getClass(id: string): ClassDef {
  const c = CLASSES[id]
  if (!c) throw new Error(`Unknown class ${id}`)
  return c
}
