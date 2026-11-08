import type { Duelist, Gear, Potential, Stats } from './types'
import { getClass } from './data/classes'
import { POTENTIAL_MULT } from './data/world'

/** Final combat stats = (base + growth*(lvl-1)) * potential + flat gear. */
export function computeStats(
  classId: string,
  level: number,
  potential: Potential = 'C',
  gear: Gear[] = [],
): Stats {
  const c = getClass(classId)
  const m = POTENTIAL_MULT[potential]
  const l = level - 1
  const s: Stats = {
    ...c.base,
    hp: Math.round((c.base.hp + c.growth.hp * l) * m),
    atk: Math.round((c.base.atk + c.growth.atk * l) * m),
    def: Math.round((c.base.def + c.growth.def * l) * m),
  }
  for (const g of gear) {
    s.hp += g.hp
    s.atk += g.atk
    s.def += g.def
  }
  return s
}

export function duelistStats(d: Duelist, gearMap: Record<string, Gear>): Stats {
  const gear = Object.values(d.gear).map((id) => gearMap[id!]).filter((g): g is Gear => !!g)
  return computeStats(d.classId, d.level, d.potential, gear)
}

/** Rough power number for UI sorting / balance checks. */
export function power(s: Stats): number {
  return Math.round(s.hp * 0.25 + (s.atk / s.interval) * 4 + s.def * 3)
}

export function expToNext(level: number): number {
  return Math.round(20 * Math.pow(level, 1.6))
}
