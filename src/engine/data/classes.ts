import type { ClassDef } from '../types'

// Base classes (rank I) + one rank II branch each.
// COST per rank follows the reference game: I=1, II=2, III=3, IV=4, V=6.
// Add more classes here — everything else is data-driven.

const melee = { range: 18, speed: 34 }
const ranged = { range: 130, speed: 26 }

export const CLASSES: Record<string, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Warrior', rank: 1, cost: 1, row: 'front', ranged: false,
    base: { hp: 120, atk: 12, def: 6, interval: 1.1, crit: 0.05, ...melee },
    growth: { hp: 14, atk: 1.6, def: 0.9 },
    skill: { id: 'cleave', name: 'Cleave', kind: 'cleave', power: 2.0, area: 28 },
    upgradesTo: ['knight'], sprite: 'human', palette: 'warrior',
  },
  mage: {
    id: 'mage', name: 'Mage', rank: 1, cost: 1, row: 'back', ranged: true,
    base: { hp: 70, atk: 15, def: 2, interval: 1.6, crit: 0.05, ...ranged },
    growth: { hp: 7, atk: 2.2, def: 0.3 },
    skill: { id: 'fireball', name: 'Fireball', kind: 'fireball', power: 1.6, area: 42 },
    upgradesTo: ['wizard'], sprite: 'human', palette: 'mage',
  },
  priest: {
    id: 'priest', name: 'Priest', rank: 1, cost: 1, row: 'back', ranged: true,
    base: { hp: 80, atk: 8, def: 3, interval: 1.5, crit: 0.03, ...ranged, range: 110 },
    growth: { hp: 8, atk: 1.2, def: 0.4 },
    skill: { id: 'heal', name: 'Heal', kind: 'heal', power: 2.6 },
    upgradesTo: ['bishop'], sprite: 'human', palette: 'priest',
  },
  archer: {
    id: 'archer', name: 'Archer', rank: 1, cost: 1, row: 'back', ranged: true,
    base: { hp: 85, atk: 13, def: 3, interval: 0.9, crit: 0.12, ...ranged, range: 150 },
    growth: { hp: 8, atk: 1.8, def: 0.4 },
    skill: { id: 'volley', name: 'Volley', kind: 'volley', power: 0.9, hits: 3 },
    upgradesTo: ['ranger'], sprite: 'human', palette: 'archer',
  },

  // ---- Rank II ----
  knight: {
    id: 'knight', name: 'Knight', rank: 2, cost: 2, row: 'front', ranged: false,
    base: { hp: 220, atk: 16, def: 12, interval: 1.2, crit: 0.05, ...melee },
    growth: { hp: 22, atk: 2, def: 1.5 },
    skill: { id: 'guard', name: 'Shield Wall', kind: 'guard', power: 0.5 },
    upgradesTo: [], sprite: 'human', palette: 'knight',
  },
  wizard: {
    id: 'wizard', name: 'Wizard', rank: 2, cost: 2, row: 'back', ranged: true,
    base: { hp: 100, atk: 26, def: 4, interval: 1.5, crit: 0.07, ...ranged },
    growth: { hp: 10, atk: 3.2, def: 0.5 },
    skill: { id: 'meteor', name: 'Meteor', kind: 'fireball', power: 2.4, area: 60 },
    upgradesTo: [], sprite: 'human', palette: 'wizard',
  },
  bishop: {
    id: 'bishop', name: 'Bishop', rank: 2, cost: 2, row: 'back', ranged: true,
    base: { hp: 120, atk: 14, def: 5, interval: 1.4, crit: 0.03, ...ranged, range: 110 },
    growth: { hp: 12, atk: 1.8, def: 0.6 },
    skill: { id: 'smite', name: 'Holy Smite', kind: 'smite', power: 2.2, area: 40 },
    upgradesTo: [], sprite: 'human', palette: 'bishop',
  },
  ranger: {
    id: 'ranger', name: 'Ranger', rank: 2, cost: 2, row: 'back', ranged: true,
    base: { hp: 120, atk: 21, def: 5, interval: 0.8, crit: 0.18, ...ranged, range: 160 },
    growth: { hp: 11, atk: 2.7, def: 0.6 },
    skill: { id: 'rain', name: 'Arrow Rain', kind: 'volley', power: 1.0, hits: 5 },
    upgradesTo: [], sprite: 'human', palette: 'ranger',
  },

  // ---- Monsters (frontier waves) ----
  slime: {
    id: 'slime', name: 'Slime', rank: 1, cost: 0, row: 'front', ranged: false,
    base: { hp: 60, atk: 7, def: 1, interval: 1.4, crit: 0, range: 16, speed: 20 },
    growth: { hp: 9, atk: 1.1, def: 0.4 },
    skill: { id: 'bounce', name: 'Bounce', kind: 'cleave', power: 1.5, area: 20 },
    upgradesTo: [], sprite: 'slime', palette: 'slime',
  },
  goblin: {
    id: 'goblin', name: 'Goblin', rank: 1, cost: 0, row: 'front', ranged: false,
    base: { hp: 75, atk: 10, def: 3, interval: 1.0, crit: 0.05, range: 18, speed: 36 },
    growth: { hp: 10, atk: 1.4, def: 0.6 },
    skill: { id: 'stab', name: 'Stab', kind: 'cleave', power: 1.8, area: 10 },
    upgradesTo: [], sprite: 'human', palette: 'goblin',
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton Archer', rank: 1, cost: 0, row: 'back', ranged: true,
    base: { hp: 55, atk: 11, def: 2, interval: 1.3, crit: 0.05, range: 120, speed: 24 },
    growth: { hp: 7, atk: 1.5, def: 0.3 },
    skill: { id: 'bone', name: 'Bone Volley', kind: 'volley', power: 0.8, hits: 2 },
    upgradesTo: [], sprite: 'human', palette: 'skeleton',
  },
  bat: {
    id: 'bat', name: 'Bat', rank: 1, cost: 0, row: 'front', ranged: false,
    base: { hp: 40, atk: 9, def: 0, interval: 0.7, crit: 0.1, range: 16, speed: 55 },
    growth: { hp: 6, atk: 1.3, def: 0.2 },
    skill: { id: 'drain', name: 'Drain', kind: 'cleave', power: 1.6, area: 10 },
    upgradesTo: [], sprite: 'bat', palette: 'bat',
  },
}

export const RECRUITABLE = ['warrior', 'mage', 'priest', 'archer']

export function getClass(id: string): ClassDef {
  const c = CLASSES[id]
  if (!c) throw new Error(`Unknown class ${id}`)
  return c
}
