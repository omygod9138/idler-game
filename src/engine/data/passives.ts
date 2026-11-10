import type { PassiveDef, PassiveMods, Rarity } from '../types'
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

// Gear passives: a separate, smaller-valued pool. Rare/epic gear rolls a minor
// one, legendary/mythic a major one; they stack with the duelist's own passive.
const g = (id: string, name: string, desc: string, rest: Partial<PassiveDef>): PassiveDef => ({ id, name, desc, ...rest })
export const GEAR_PASSIVES_MINOR: Record<string, PassiveDef> = Object.fromEntries([
  g('g_honed', 'Honed', '+6% ATK', { stats: { atk: 0.06 } }),
  g('g_padded', 'Padded', '+8% max HP', { stats: { hp: 0.08 } }),
  g('g_swift', 'Swift', '+6% attack speed', { stats: { haste: 0.06 } }),
  g('g_spark', 'Spark', '+12% energy gain', { energyGain: 0.12 }),
  g('g_thirst', 'Thirsting', 'Basic attacks heal 8% of damage dealt', { lifesteal: 0.08 }),
  g('g_barbed', 'Barbed', 'Reflects 10% of damage taken', { thorns: 0.1 }),
  g('g_bulwark', 'Bulwark', '6% less damage taken', { damageReduction: 0.06 }),
  g('g_executioner', 'Executioner', '+25% damage to enemies below 30% HP', { executeBonus: 0.25 }),
].map((p) => [p.id, p]))
export const GEAR_PASSIVES_MAJOR: Record<string, PassiveDef> = Object.fromEntries([
  g('g_phoenix', 'Phoenix Plume', 'Once per battle, survive a lethal hit at 1 HP', { undying: true }),
  g('g_storm', 'Stormcaller', 'Active skill +30% power', { activePower: 0.3 }),
  g('g_echo', 'Echo', '20% chance for a basic attack to strike twice', { extraBasic: 0.2 }),
  g('g_tide', 'Tidal Heart', 'Starts battle with 40% energy', { startEnergy: 0.4 }),
  g('g_harvest', 'Harvest Moon', 'Killing blows refill 50% energy', { killEnergy: 0.5 }),
  g('g_verdant', 'Verdant Core', 'Regenerates 2% max HP per second', { regen: 0.02 }),
].map((p) => [p.id, p]))

export function getPassive(id: string | undefined): PassiveDef | undefined {
  return id ? PASSIVES[id] ?? GEAR_PASSIVES_MINOR[id] ?? GEAR_PASSIVES_MAJOR[id] : undefined
}

export function rollGearPassive(rng: Rng, rarity: Rarity): string | undefined {
  if (rarity === 'common') return undefined
  const pool = rarity === 'rare' || rarity === 'epic' ? GEAR_PASSIVES_MINOR : GEAR_PASSIVES_MAJOR
  return pick(rng, Object.keys(pool))
}

/** Fold several passives into one modifier bag; numbers add (with sane caps). */
export function mergeMods(ids: (string | undefined)[]): PassiveMods {
  const m: PassiveMods = {
    energyGain: 0, startEnergy: 0, killEnergy: 0, extraBasic: 0, regen: 0, damageReduction: 0,
    activePower: 0, lifesteal: 0, thorns: 0, executeBonus: 0, secondWind: 0,
  }
  for (const id of ids) {
    const p = getPassive(id)
    if (!p) continue
    m.energyGain += p.energyGain ?? 0
    m.startEnergy += p.startEnergy ?? 0
    m.killEnergy += p.killEnergy ?? 0
    m.extraBasic += p.extraBasic ?? 0
    m.regen += p.regen ?? 0
    m.damageReduction += p.damageReduction ?? 0
    m.activePower += p.activePower ?? 0
    m.lifesteal += p.lifesteal ?? 0
    m.thorns += p.thorns ?? 0
    m.executeBonus += p.executeBonus ?? 0
    if (p.undying) m.undying ??= p.name
    if (p.secondWind && p.secondWind > m.secondWind) { m.secondWind = p.secondWind; m.secondWindName = p.name }
  }
  m.startEnergy = Math.min(1, m.startEnergy)
  m.extraBasic = Math.min(0.5, m.extraBasic)
  m.damageReduction = Math.min(0.5, m.damageReduction)
  return m
}

export function rollPassive(rng: Rng): string {
  return pick(rng, PASSIVE_IDS)
}
