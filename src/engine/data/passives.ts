import type { PassiveDef } from '../types'
import { pick, type Rng } from '../rng'

// Slot 1 of every duelist's kit: one passive, rolled at random when the
// duelist is generated (tavern candidate / duel opponent) and kept for life.
// Stat passives are applied in computeStats; the rest are battle hooks.

export const PASSIVES: Record<string, PassiveDef> = {
  stout: { id: 'stout', name: 'Stout', desc: '+15% max HP', stats: { hp: 0.15 } },
  brawler: { id: 'brawler', name: 'Brawler', desc: '+12% ATK', stats: { atk: 0.12 } },
  ironhide: { id: 'ironhide', name: 'Ironhide', desc: '+25% DEF', stats: { def: 0.25 } },
  nimble: { id: 'nimble', name: 'Nimble', desc: '+12% attack speed', stats: { haste: 0.12 } },
  keen: { id: 'keen', name: 'Keen Eye', desc: '+10% crit chance', stats: { crit: 0.1 } },
  focused: { id: 'focused', name: 'Focused', desc: '+30% energy gain', energyGain: 0.3 },
  eager: { id: 'eager', name: 'Eager', desc: 'Starts battle with half energy', startEnergy: 0.5 },
  flurry: { id: 'flurry', name: 'Flurry', desc: '15% chance for a basic attack to strike twice', extraBasic: 0.15 },
  reaper: { id: 'reaper', name: 'Reaper', desc: 'Killing blows refill 35% energy', killEnergy: 0.35 },
  trollblood: { id: 'trollblood', name: 'Troll Blood', desc: 'Regenerates 1.5% max HP per second', regen: 0.015 },
  stalwart: { id: 'stalwart', name: 'Stalwart', desc: '12% less damage taken', damageReduction: 0.12 },
  spellcraft: { id: 'spellcraft', name: 'Spellcraft', desc: 'Active skill +20% power', activePower: 0.2 },
  undying: { id: 'undying', name: 'Undying', desc: 'Once per battle, survive a lethal hit at 1 HP', undying: true },
  leech: { id: 'leech', name: 'Leech', desc: 'Basic attacks heal 20% of damage dealt', lifesteal: 0.2 },
  spiked: { id: 'spiked', name: 'Spiked', desc: 'Reflects 20% of damage taken', thorns: 0.2 },
  secondWind: { id: 'secondWind', name: 'Second Wind', desc: 'Once per battle, heal 30% HP when below 30%', secondWind: 0.3 },
}

export const PASSIVE_IDS = Object.keys(PASSIVES)

export function getPassive(id: string | undefined): PassiveDef | undefined {
  return id ? PASSIVES[id] : undefined
}

export function rollPassive(rng: Rng): string {
  return pick(rng, PASSIVE_IDS)
}
