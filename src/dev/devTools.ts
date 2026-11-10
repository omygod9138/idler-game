// Dev-only helpers for the debug panel. They poke GameState directly (no rules, no costs)
// so art and balance changes can be checked in seconds. Never imported by the production
// build: App.vue only loads DevPanel when import.meta.env.DEV is true.
import {
  CLASSES, MAX_SQUAD, NAMES, OUTPOSTS, QUARTERS, activeLanes, computeStats, createBattle, duelistStats,
  type BattleState, type CombatantSpec, type Duelist, type GameState, type Potential,
} from '@/engine'
import { makeRng, pick } from '@/engine/rng'

export interface EnemyPick { classId: string; level: number; potential: Potential }

export const ALL_CLASS_IDS = Object.keys(CLASSES)
/** hero classes (cost > 0), rank II included for art checks; everything else is a monster */
export const HERO_IDS = ALL_CLASS_IDS.filter((id) => CLASSES[id]!.cost > 0)
export const MOB_IDS = ALL_CLASS_IDS.filter((id) => CLASSES[id]!.cost === 0)

export function addGold(s: GameState, amount: number) {
  s.gold += amount
}

/** Make sure lane `idx` is playable by raising Quarters if needed. */
export function unlockLane(s: GameState, idx: number) {
  while (activeLanes(s).length <= idx && s.facilities.quarters < QUARTERS.length - 1) s.facilities.quarters++
}

/** Create a duelist of any class at any level, skipping the Tavern. */
export function spawnHero(s: GameState, classId: string, level: number, potential: Potential): Duelist {
  const rng = makeRng(s)
  const d: Duelist = { id: `d${++s.idCounter}`, name: pick(rng, NAMES), classId, level, exp: 0, potential, gear: {} }
  s.duelists[d.id] = d
  return d
}

/** Put exactly these duelists into a lane (ignores COST / squad rules), removing them from other lanes. */
export function setSquad(s: GameState, laneIdx: number, ids: string[]) {
  unlockLane(s, laneIdx)
  const pickIds = ids.slice(0, MAX_SQUAD)
  for (const l of s.lanes) l.squad = l.squad.filter((id) => !pickIds.includes(id))
  const lane = s.lanes[laneIdx]!
  lane.squad = pickIds
  lane.mode = 'frontier'
  lane.battle = null
  lane.cooldown = 0.2
}

const enemySpec = (e: EnemyPick): CombatantSpec => ({
  name: CLASSES[e.classId]!.name, classId: e.classId, level: e.level, stats: computeStats(e.classId, e.level, e.potential),
})

/** Start a fight right now in a lane: its squad vs the given enemies. Rewards still apply on a win. */
export function startTestFight(s: GameState, laneIdx: number, enemies: EnemyPick[]): string | null {
  const lane = s.lanes[laneIdx]
  if (!lane) return 'No such lane'
  if (!lane.squad.length) return 'Lane squad is empty'
  if (!enemies.length) return 'Pick at least one enemy'
  unlockLane(s, laneIdx)
  const allies: CombatantSpec[] = lane.squad.map((id) => {
    const d = s.duelists[id]!
    return { ref: d.id, name: d.name, classId: d.classId, level: d.level, stats: duelistStats(d, s.gear) }
  })
  lane.mode = 'frontier'
  lane.battle = createBattle(allies, enemies.map(enemySpec), makeRng(s))
  lane.wave++
  return null
}

/** The current outpost's duel squad, as enemy picks. */
export function duelEnemies(s: GameState, outpostIdx = s.outpostIdx): EnemyPick[] {
  return OUTPOSTS[outpostIdx]!.duel.squad.map((e) => ({ classId: e.classId, level: e.level, potential: e.potential ?? 'C' }))
}

/** Kill a unit (plays its death clip). */
export function killUnit(b: BattleState, uid: number) {
  const u = b.units.find((x) => x.uid === uid)
  if (!u || !u.alive) return
  u.hp = 0
  u.alive = false
  b.events.push({ t: 'death', dst: uid })
}

/** Full heal; also revives a dead unit (back to idle). */
export function healUnit(b: BattleState, uid: number) {
  const u = b.units.find((x) => x.uid === uid)
  if (!u) return
  const amount = u.maxHp - u.hp
  u.alive = true
  u.hp = u.maxHp
  if (amount > 0) b.events.push({ t: 'heal', dst: uid, amount })
}

/** Fill energy so the unit casts its skill on its next attack. */
export function chargeSkill(b: BattleState, uid: number) {
  const u = b.units.find((x) => x.uid === uid)
  if (u?.alive) { u.energy = 100; u.atkTimer = 0 }
}
