import type { BattleState, Combatant, Side, Stats } from './types'
import { getClass } from './data/classes'
import { getPassive } from './data/passives'
import type { Rng } from './rng'

// 1-D lane auto-battle. Allies on the left facing right, enemies on the right.
export const LANE_WIDTH = 400
export const BATTLE_TIMEOUT = 60
// halved with the 2x attack speed so skills keep roughly the same cadence in seconds
const ENERGY_PER_ATTACK = 16
const ENERGY_PER_HIT = 5
const MAX_EVENTS = 300

export interface CombatantSpec {
  ref?: string
  name: string
  classId: string
  level: number
  stats: Stats
  /** passive id (kit slot 1); monsters have none */
  passive?: string
}

export function createBattle(allies: CombatantSpec[], enemies: CombatantSpec[], rng: Rng): BattleState {
  const b: BattleState = { units: [], elapsed: 0, over: false, winner: null, events: [], uidCounter: 0 }
  place(b, allies, 'ally', rng)
  place(b, enemies, 'enemy', rng)
  return b
}

function place(b: BattleState, specs: CombatantSpec[], side: Side, rng: Rng) {
  let front = 0
  let back = 0
  for (const s of specs) {
    const row = getClass(s.classId).row
    const slot = row === 'front' ? front++ : back++
    // start close to the centre so melee meets in ~1s instead of ~3s
    const offset = (row === 'front' ? 160 : 108) - slot * 22
    const x = side === 'ally' ? offset : LANE_WIDTH - offset
    const u: Combatant = {
      uid: ++b.uidCounter, side, ref: s.ref, name: s.name, classId: s.classId, level: s.level,
      stats: s.stats, hp: s.stats.hp, maxHp: s.stats.hp, x,
      energy: Math.min(100, getPassive(s.passive)?.startEnergy ?? 0),
      atkTimer: s.stats.interval * (0.3 + rng() * 0.7), alive: true, guard: 1, guardT: 0,
      passive: s.passive, windUsed: false,
    }
    b.units.push(u)
  }
}

const alive = (b: BattleState, side: Side) => b.units.filter((u) => u.alive && u.side === side)
const foe = (s: Side): Side => (s === 'ally' ? 'enemy' : 'ally')

function nearest(b: BattleState, u: Combatant): Combatant | undefined {
  let best: Combatant | undefined
  let bd = Infinity
  for (const o of b.units) {
    if (!o.alive || o.side === u.side) continue
    const d = Math.abs(o.x - u.x)
    if (d < bd) { bd = d; best = o }
  }
  return best
}

function emit(b: BattleState, e: BattleState['events'][number]) {
  b.events.push(e)
  if (b.events.length > MAX_EVENTS) b.events.splice(0, b.events.length - MAX_EVENTS)
}

function gainEnergy(u: Combatant, amount: number) {
  const mult = 1 + (getPassive(u.passive)?.energyGain ?? 0)
  u.energy = Math.min(100, u.energy + amount * mult)
}

/** Apply raw damage to a unit: emits damage/death and triggers Second Wind. */
function hurt(b: BattleState, dst: Combatant, amount: number, crit: boolean) {
  dst.hp -= amount
  emit(b, { t: 'damage', dst: dst.uid, amount, crit })
  if (dst.hp <= 0) {
    dst.hp = 0
    dst.alive = false
    emit(b, { t: 'death', dst: dst.uid })
    return
  }
  const wind = getPassive(dst.passive)?.secondWind
  if (wind && !dst.windUsed && dst.hp < dst.maxHp * 0.3) {
    dst.windUsed = true
    emit(b, { t: 'passive', src: dst.uid, name: getPassive(dst.passive)!.name })
    heal(b, dst, dst.maxHp * wind)
  }
}

function dealDamage(b: BattleState, src: Combatant, dst: Combatant, mult: number, rng: Rng, basic = false) {
  if (!dst.alive) return
  const crit = rng() < src.stats.crit
  const variance = 0.9 + rng() * 0.2
  const raw = src.stats.atk * mult * variance * (crit ? 1.75 : 1)
  const reduced = raw * (60 / (60 + dst.stats.def)) * dst.guard
  const amount = Math.max(1, Math.round(reduced))
  hurt(b, dst, amount, crit)
  if (dst.alive) gainEnergy(dst, ENERGY_PER_HIT)
  const lifesteal = basic ? getPassive(src.passive)?.lifesteal : 0
  if (lifesteal && src.alive) heal(b, src, amount * lifesteal)
  const thorns = getPassive(dst.passive)?.thorns
  if (thorns && src.alive) hurt(b, src, Math.max(1, Math.round(amount * thorns)), false)
}

function heal(b: BattleState, dst: Combatant, amount: number) {
  if (!dst.alive) return
  const a = Math.round(Math.min(amount, dst.maxHp - dst.hp))
  if (a <= 0) return
  dst.hp += a
  emit(b, { t: 'heal', dst: dst.uid, amount: a })
}

/** Kit slot 3: the class active, fired as soon as energy is full. */
function castActive(b: BattleState, u: Combatant, target: Combatant, rng: Rng) {
  const sk = getClass(u.classId).active
  emit(b, { t: 'skill', src: u.uid, name: sk.name, x: target.x, area: sk.area, kind: sk.kind })
  const enemies = alive(b, foe(u.side))
  const friends = alive(b, u.side)
  switch (sk.kind) {
    case 'cleave':
    case 'fireball':
      for (const e of enemies) if (Math.abs(e.x - target.x) <= (sk.area ?? 20)) dealDamage(b, u, e, sk.power, rng)
      break
    case 'volley':
      for (let i = 0; i < (sk.hits ?? 3); i++) {
        const pool = alive(b, foe(u.side))
        if (!pool.length) break
        dealDamage(b, u, pool[Math.floor(rng() * pool.length)]!, sk.power, rng)
      }
      break
    case 'heal': {
      const low = friends.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a), friends[0]!)
      heal(b, low, u.stats.atk * sk.power)
      break
    }
    case 'guard':
      for (const f of friends) { f.guard = 1 - sk.power; f.guardT = 4 }
      break
    case 'smite':
      for (const e of enemies) if (Math.abs(e.x - target.x) <= (sk.area ?? 30)) dealDamage(b, u, e, sk.power, rng)
      for (const f of friends) heal(b, f, u.stats.atk * 0.5)
      break
  }
}

/** Advance the battle by dt seconds. Call with small dt (≤0.1) for stable results. */
export function stepBattle(b: BattleState, dt: number, rng: Rng): void {
  if (b.over) return
  b.elapsed += dt
  for (const u of b.units) {
    if (!u.alive) continue
    if (u.guardT > 0 && (u.guardT -= dt) <= 0) u.guard = 1
    const target = nearest(b, u)
    if (!target) break
    const cls = getClass(u.classId)
    const dist = Math.abs(target.x - u.x)
    const inRange = dist <= u.stats.range
    // Active: fires the moment energy is full (support actives don't need a target in range).
    if (u.energy >= 100 && (inRange || cls.active.kind === 'heal' || cls.active.kind === 'guard')) {
      u.energy = 0
      castActive(b, u, target, rng)
      if (!u.alive) continue
    }
    if (!inRange) {
      const dir = target.x > u.x ? 1 : -1
      u.x += dir * Math.min(u.stats.speed * dt, dist - u.stats.range)
      continue
    }
    if (!target.alive) continue
    // Basic attack on the attack timer; builds energy.
    u.atkTimer -= dt
    if (u.atkTimer > 0) continue
    u.atkTimer = u.stats.interval
    emit(b, { t: 'attack', src: u.uid, dst: target.uid, ranged: cls.ranged })
    dealDamage(b, u, target, cls.basic.power, rng, true)
    if (u.alive) gainEnergy(u, ENERGY_PER_ATTACK)
  }
  const a = alive(b, 'ally').length
  const e = alive(b, 'enemy').length
  if (!a || !e || b.elapsed >= BATTLE_TIMEOUT) {
    b.over = true
    b.winner = e === 0 && a > 0 ? 'ally' : 'enemy'
  }
}

/** Run a battle to completion (used by tests and quick-sim). */
export function simulate(b: BattleState, rng: Rng, dt = 0.05): BattleState {
  while (!b.over) stepBattle(b, dt, rng)
  return b
}
