import type { Duelist, Gear, Potential, Stats } from './types'
import { getClass } from './data/classes'
import { POTENTIAL_MULT, TUNING } from './data/world'
import { getPassive } from './data/passives'

/** Final combat stats = ((base + growth*(lvl-1)) * potential + flat gear) * (duelist + gear passives). */
export function computeStats(
  classId: string,
  level: number,
  potential: Potential = 'C',
  gear: Gear[] = [],
  passive?: string,
): Stats {
  const c = getClass(classId)
  const m = POTENTIAL_MULT[potential]
  const l = level - 1
  const s: Stats = {
    ...c.base,
    interval: c.base.interval / TUNING.attackSpeed,
    hp: Math.round((c.base.hp + c.growth.hp * l) * m * TUNING.hp),
    atk: Math.round((c.base.atk + c.growth.atk * l) * m),
    def: Math.round((c.base.def + c.growth.def * l) * m),
  }
  for (const g of gear) {
    s.hp += g.hp
    s.atk += g.atk
    s.def += g.def
  }
  // Stat passives from the duelist and their gear add together.
  const p = { hp: 0, atk: 0, def: 0, crit: 0, haste: 0 }
  for (const id of [passive, ...gear.map((g) => g.passive)]) {
    const st = getPassive(id)?.stats
    if (st) for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] += st[k] ?? 0
  }
  s.hp = Math.round(s.hp * (1 + p.hp))
  s.atk = Math.round(s.atk * (1 + p.atk))
  s.def = Math.round(s.def * (1 + p.def))
  s.crit += p.crit
  s.interval /= 1 + p.haste
  return s
}

export function equippedGear(d: Duelist, gearMap: Record<string, Gear>): Gear[] {
  return Object.values(d.gear).map((id) => gearMap[id!]).filter((g): g is Gear => !!g)
}

export function duelistStats(d: Duelist, gearMap: Record<string, Gear>): Stats {
  const gear = equippedGear(d, gearMap)
  return computeStats(d.classId, d.level, d.potential, gear, d.passive)
}

/** Rough power number for UI sorting / balance checks. */
export function power(s: Stats): number {
  return Math.round(s.hp * 0.25 + (s.atk / s.interval) * 4 + s.def * 3)
}

export function expToNext(level: number): number {
  return Math.round(20 * Math.pow(level, 1.6))
}
