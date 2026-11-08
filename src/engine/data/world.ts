import type { OutpostDef, Potential, Rarity, GearSlot } from '../types'

// ---- Outposts (map progression) ----
// Frontier waves grant Followers; at followersRequired you may challenge the Duel.
export const OUTPOSTS: OutpostDef[] = [
  {
    id: 'meadow', name: 'Greenfield Meadow', levelMin: 1, levelMax: 4,
    pool: ['slime', 'slime', 'wolf'], waveSize: [2, 3], followersRequired: 10,
    duel: { guild: 'Mudfoot Rookies', squad: [
      { classId: 'warrior', level: 6, potential: 'D' },
      { classId: 'archer', level: 5, potential: 'D' },
    ] },
    goldPerKill: 6, expPerKill: 5,
  },
  {
    id: 'forest', name: 'Whisperwood', levelMin: 5, levelMax: 10,
    pool: ['wolf', 'orc', 'slime'], waveSize: [2, 4], followersRequired: 20,
    duel: { guild: 'Thornbark Band', squad: [
      { classId: 'warrior', level: 13, potential: 'C' },
      { classId: 'priest', level: 12, potential: 'C' },
      { classId: 'mage', level: 12, potential: 'C' },
    ] },
    goldPerKill: 14, expPerKill: 11,
  },
  {
    id: 'crypt', name: 'Ashen Crypt', levelMin: 11, levelMax: 18,
    pool: ['skeleton', 'wraith', 'orc', 'skeleton', 'wraith', 'orc', 'draugr'], waveSize: [3, 4], followersRequired: 35,
    duel: { guild: 'Bonewatch Order', squad: [
      { classId: 'knight', level: 22, potential: 'C' },
      { classId: 'archer', level: 21, potential: 'B' },
      { classId: 'priest', level: 20, potential: 'B' },
      { classId: 'mage', level: 21, potential: 'B' },
    ] },
    goldPerKill: 30, expPerKill: 24,
  },
  {
    id: 'pass', name: 'Frostfang Pass', levelMin: 19, levelMax: 28,
    pool: ['troll', 'wolf', 'skeleton', 'wolf', 'troll', 'wraith', 'jotunn'], waveSize: [3, 5], followersRequired: 50,
    duel: { guild: 'Silver Lances', squad: [
      { classId: 'knight', level: 32, potential: 'B' },
      { classId: 'ranger', level: 31, potential: 'B' },
      { classId: 'bishop', level: 30, potential: 'B' },
      { classId: 'wizard', level: 31, potential: 'A' },
    ] },
    goldPerKill: 60, expPerKill: 45,
  },
  {
    id: 'capital', name: 'Duelist Capital', levelMin: 29, levelMax: 40,
    pool: ['troll', 'wraith', 'orc', 'skeleton', 'troll', 'drake', 'draugr', 'jotunn'], waveSize: [4, 5], followersRequired: 80,
    duel: { guild: 'Crown Champions', squad: [
      { classId: 'knight', level: 45, potential: 'A' },
      { classId: 'ranger', level: 44, potential: 'A' },
      { classId: 'bishop', level: 44, potential: 'A' },
      { classId: 'wizard', level: 45, potential: 'S' },
    ] },
    goldPerKill: 110, expPerKill: 80,
  },
]

// ---- Potential grades (stat multiplier). F/C/S match reference; others interpolated. ----
export const POTENTIAL_MULT: Record<Potential, number> = {
  F: 0.75, E: 0.83, D: 0.92, C: 1.0, B: 1.08, A: 1.16, S: 1.25,
}
export const POTENTIALS: Potential[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S']

// ---- Facilities ----
// Quarters: level cap / squads / COST per squad (subset of reference table; lanes capped at 3 in this prototype)
export const QUARTERS = [
  { levelCap: 30, squads: 1, cost: 4 },
  { levelCap: 60, squads: 2, cost: 6 },
  { levelCap: 80, squads: 3, cost: 7 },
  { levelCap: 100, squads: 3, cost: 8 },
  { levelCap: 115, squads: 3, cost: 10 },
  { levelCap: 130, squads: 3, cost: 11 },
]

export const FACILITY_INFO = {
  quarters: { name: 'Quarters', max: QUARTERS.length - 1, desc: 'Level cap, squad count, COST limit' },
  tavern: { name: 'Tavern', max: 5, desc: 'Better recruit Potential, more candidates, passive gold' },
  blacksmith: { name: 'Blacksmith', max: 5, desc: 'Higher forge rarity' },
  classHall: { name: 'Class Hall', max: 3, desc: 'Unlocks class rank-ups (Lv1 = Rank II)' },
} as const

export function facilityUpgradeCost(id: keyof typeof FACILITY_INFO, level: number): { gold: number; ore: number } {
  const base = { quarters: 1500, tavern: 800, blacksmith: 1000, classHall: 3000 }[id]
  return { gold: Math.round(base * Math.pow(3, level)), ore: level * 5 }
}

// Hiring cost by rank (reference values)
export const HIRE_COST = [0, 1000, 5000, 25000, 125000, 625000]
export const RANK_UP = { 2: { minLevel: 20, gold: 5000, badge: 1 } } as const

// ---- Gear ----
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']
export const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.6, epic: 2.5, legendary: 4, mythic: 6.5 }
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c8c8c8', rare: '#4fa3ff', epic: '#b45cff', legendary: '#ffb22e', mythic: '#ff4f6d',
}
export const GEAR_BASE: Record<GearSlot, { names: string[]; hp: number; atk: number; def: number }> = {
  weapon: { names: ['Blade', 'Staff', 'Bow', 'Mace', 'Dagger'], hp: 0, atk: 4, def: 0 },
  armor: { names: ['Mail', 'Robe', 'Vest', 'Plate', 'Cloak'], hp: 25, atk: 0, def: 3 },
  accessory: { names: ['Ring', 'Amulet', 'Charm', 'Band', 'Talisman'], hp: 10, atk: 1.5, def: 1 },
}
export const FORGE_COST = { gold: 300, ore: 3 }

// Drops: 15% per kill, 1/4 of drops are gear (reference); rest are ore/tomes.
export const DROP_CHANCE = 0.15
export const GEAR_SHARE = 0.25

export const NAMES = [
  'Aldo', 'Bryn', 'Cato', 'Dara', 'Eli', 'Fenn', 'Gale', 'Hana', 'Ivo', 'Juno', 'Kai', 'Lio',
  'Mira', 'Nox', 'Orin', 'Pia', 'Quin', 'Rhea', 'Sol', 'Tavi', 'Uma', 'Vex', 'Wren', 'Yuki', 'Zed',
]
