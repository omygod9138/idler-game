import type { Duelist, Gear, Potential, Stats } from './types'
import { getClass } from './data/classes'
import { POTENTIAL_MULT, TUNING } from './data/world'
import { getPassive } from './data/passives'

/** Final combat stats = ((base + growth*(lvl-1)) * potential + flat gear) * passive. */
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
  const p = getPassive(passive)?.stats
  if (p) {
    if (p.hp) s.hp = Math.round(s.hp * (1 + p.hp))
    if (p.atk) s.atk = Math.round(s.atk * (1 + p.atk))
    if (p.def) s.def = Math.round(s.def * (1 + p.def))
    if (p.crit) s.crit += p.crit
    if (p.haste) s.interval /= 1 + p.haste
  }
  return s
}

export function duelistStats(d: Duelist, gearMap: Record<string, Gear>): Stats {
  const gear = Object.values(d.gear).map((id) => gearMap[id!]).filter((g): g is Gear => !!g)
  return computeStats(d.classId, d.level, d.potential, gear, d.passive)
}

/** Rough power number for UI sorting / balance checks. */
export function power(s: Stats): number {
  return Math.round(s.hp * 0.25 + (s.atk / s.interval) * 4 + s.def * 3)
}

export function expToNext(level: number): number {
  return Math.round(20 * Math.pow(level, 1.6))
}
