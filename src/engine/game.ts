import type {
  Candidate, Duelist, FacilityId, GameState, Gear, GearSlot, LaneState, LogEntry, Potential, Rarity,
} from './types'
import { CLASSES, RECRUITABLE, getClass } from './data/classes'
import {
  DROP_CHANCE, FACILITY_INFO, FORGE_COST, GEAR_BASE, GEAR_SHARE, HIRE_COST, NAMES, OUTPOSTS, POTENTIALS,
  QUARTERS, RANK_UP, RARITIES, RARITY_MULT, SUBCLASSES_ENABLED, facilityUpgradeCost,
} from './data/world'
import { makeRng, pick, randInt, type Rng } from './rng'
import { computeStats, duelistStats, expToNext } from './stats'
import { createBattle, simulate, stepBattle, type CombatantSpec } from './battle'

export const SAVE_VERSION = 1
/** Every battle is TEAM_SIZE v TEAM_SIZE: squads hold this many duelists and waves spawn this many enemies. */
export const TEAM_SIZE = 3
export const MAX_SQUAD = TEAM_SIZE
export const MAX_LANES = 3
const SUBSTEP = 0.05
const WAVE_COOLDOWN = 1.2
const REVIVE_COOLDOWN = 3
const MAX_OFFLINE_SECONDS = 8 * 3600

// ---------- creation ----------

export function newGame(seed = Date.now() % 2147483647): GameState {
  const s: GameState = {
    version: SAVE_VERSION, seed, idCounter: 0, time: 0, lastSavedAt: Date.now(),
    gold: 1200, materials: { ore: 0, tome: 0, bronzeBadge: 0 },
    followers: 0, outpostIdx: 0, duelsWon: 0,
    facilities: { quarters: 0, tavern: 0, blacksmith: 0, classHall: 0 },
    duelists: {}, gear: {}, candidates: [],
    lanes: Array.from({ length: MAX_LANES }, (_, i): LaneState => ({
      index: i, squad: [], mode: 'frontier', battle: null, cooldown: 0.5, wave: 0,
    })),
    log: [], stats: { kills: 0, waves: 0, avgWaveSeconds: 12 },
  }
  const rng = makeRng(s)
  // Battles are 3v3, so the guild starts with a full base-class squad.
  const hero = addDuelist(s, rng, 'warrior', 'C')
  const archer = addDuelist(s, rng, 'archer', 'D')
  const priest = addDuelist(s, rng, 'priest', 'D')
  s.lanes[0]!.squad.push(hero.id, archer.id, priest.id)
  log(s, `${hero.name} the Warrior founds your guild with ${archer.name} and ${priest.name}.`, 'info')
  return s
}

const nid = (s: GameState, p: string) => `${p}${++s.idCounter}`

function addDuelist(s: GameState, rng: Rng, classId: string, potential: Potential, name?: string): Duelist {
  const d: Duelist = {
    id: nid(s, 'd'), name: name ?? pick(rng, NAMES), classId, level: 1, exp: 0, potential, gear: {},
  }
  s.duelists[d.id] = d
  return d
}

export function log(s: GameState, text: string, kind: LogEntry['kind'] = 'info') {
  s.log.unshift({ t: s.time, text, kind })
  if (s.log.length > 60) s.log.length = 60
}

// ---------- derived ----------

export const quarters = (s: GameState) => QUARTERS[s.facilities.quarters]!
export const activeLanes = (s: GameState) => s.lanes.slice(0, Math.min(MAX_LANES, quarters(s).squads))
export const outpost = (s: GameState) => OUTPOSTS[s.outpostIdx]!
export const canDuel = (s: GameState) => s.followers >= outpost(s).followersRequired && !s.lanes.some((l) => l.mode === 'duel')

export function squadCost(s: GameState, lane: LaneState): number {
  return lane.squad.reduce((sum, id) => sum + getClass(s.duelists[id]!.classId).cost, 0)
}

export function equippedBy(s: GameState): Record<string, string> {
  const map: Record<string, string> = {}
  for (const d of Object.values(s.duelists)) for (const g of Object.values(d.gear)) if (g) map[g] = d.id
  return map
}

function addExp(s: GameState, d: Duelist, amount: number): boolean {
  const cap = quarters(s).levelCap
  if (d.level >= cap) return false
  d.exp += amount
  let leveled = false
  while (d.level < cap && d.exp >= expToNext(d.level)) {
    d.exp -= expToNext(d.level)
    d.level++
    leveled = true
  }
  if (d.level >= cap) d.exp = 0
  return leveled
}

// ---------- battle orchestration ----------

function allySpecs(s: GameState, lane: LaneState): CombatantSpec[] {
  return lane.squad.map((id) => {
    const d = s.duelists[id]!
    return { ref: d.id, name: d.name, classId: d.classId, level: d.level, stats: duelistStats(d, s.gear) }
  })
}

function waveSpecs(s: GameState, rng: Rng): CombatantSpec[] {
  const o = outpost(s)
  return Array.from({ length: TEAM_SIZE }, () => {
    const classId = pick(rng, o.pool)
    const level = randInt(rng, o.levelMin, o.levelMax)
    return { name: CLASSES[classId]!.name, classId, level, stats: computeStats(classId, level, 'D') }
  })
}

function duelSpecs(s: GameState, rng: Rng): CombatantSpec[] {
  return outpost(s).duel.squad.map((e) => ({
    name: e.name ?? pick(rng, NAMES), classId: e.classId, level: e.level,
    stats: computeStats(e.classId, e.level, e.potential ?? 'C'),
  }))
}

function startBattle(s: GameState, lane: LaneState, rng: Rng) {
  const enemies = lane.mode === 'duel' ? duelSpecs(s, rng) : waveSpecs(s, rng)
  lane.battle = createBattle(allySpecs(s, lane), enemies, rng)
  lane.wave++
}

function resolveBattle(s: GameState, lane: LaneState, rng: Rng) {
  const b = lane.battle!
  const won = b.winner === 'ally'
  const o = outpost(s)
  if (lane.mode === 'duel') {
    if (won) {
      const first = s.duelsWon <= s.outpostIdx
      s.duelsWon = Math.max(s.duelsWon, s.outpostIdx + 1)
      const bonus = o.goldPerKill * 40
      s.gold += bonus
      if (first) s.materials.bronzeBadge++
      log(s, `Duel won vs ${o.duel.guild}! +${bonus}g${first ? ', +1 Bronze Badge' : ''}`, 'win')
      if (s.outpostIdx < OUTPOSTS.length - 1) {
        s.outpostIdx++
        s.followers = 0
        log(s, `Expedition moves to ${outpost(s).name}.`, 'info')
        for (const l of s.lanes) if (l !== lane) { l.battle = null; l.cooldown = WAVE_COOLDOWN }
      }
    } else {
      log(s, `Duel lost vs ${o.duel.guild}. Train up and retry.`, 'loss')
    }
    lane.mode = 'frontier'
    lane.battle = null
    lane.cooldown = REVIVE_COOLDOWN
    return
  }

  if (!won) {
    lane.battle = null
    lane.cooldown = REVIVE_COOLDOWN
    return
  }
  const kills = b.units.filter((u) => u.side === 'enemy').length
  grantWaveRewards(s, lane, kills, 1, rng)
  s.stats.avgWaveSeconds = s.stats.avgWaveSeconds * 0.8 + (b.elapsed + WAVE_COOLDOWN) * 0.2
  lane.battle = null
  lane.cooldown = WAVE_COOLDOWN
}

/** Shared by live play and offline progress. `waves` may be > 1 for batch rewards. */
function grantWaveRewards(s: GameState, lane: LaneState, kills: number, waves: number, rng: Rng, quiet = false) {
  const o = outpost(s)
  const totalKills = kills * waves
  const gold = Math.round(o.goldPerKill * totalKills)
  s.gold += gold
  s.stats.kills += totalKills
  s.stats.waves += waves
  s.followers = Math.min(o.followersRequired, s.followers + waves)
  const exp = o.expPerKill * totalKills
  for (const id of lane.squad) {
    const d = s.duelists[id]!
    if (addExp(s, d, exp) && !quiet) log(s, `${d.name} reached Lv ${d.level}.`, 'info')
  }
  // drops
  const rolls = Math.min(totalKills, 400)
  let gearDrops = 0
  for (let i = 0; i < rolls; i++) {
    if (rng() >= DROP_CHANCE) continue
    if (rng() < GEAR_SHARE) {
      if (gearDrops++ >= 20) continue
      const g = rollGear(s, rng, 0)
      if (!quiet) log(s, `Loot: ${g.name}`, 'loot')
    } else if (rng() < 0.5) s.materials.ore++
    else s.materials.tome++
  }
}

// ---------- main tick ----------

/** Advance the world by dt seconds (live play). */
export function tick(s: GameState, dt: number): void {
  const rng = makeRng(s)
  s.time += dt
  s.gold += s.facilities.tavern * 0.5 * dt
  for (const lane of activeLanes(s)) {
    if (!lane.squad.length) { lane.battle = null; continue }
    if (!lane.battle) {
      lane.cooldown -= dt
      if (lane.cooldown <= 0) startBattle(s, lane, rng)
      continue
    }
    let left = dt
    while (left > 0 && !lane.battle.over) {
      const step = Math.min(SUBSTEP, left)
      stepBattle(lane.battle, step, rng)
      left -= step
    }
    if (lane.battle.over) resolveBattle(s, lane, rng)
  }
}

// ---------- save normalization ----------

/** Bring an older save in line with current rules: squads capped at TEAM_SIZE, sub-classes reverted to their base class while locked. */
export function normalize(s: GameState): void {
  if (!SUBCLASSES_ENABLED) {
    for (const d of Object.values(s.duelists)) {
      if (getClass(d.classId).rank === 1) continue
      const base = Object.values(CLASSES).find((c) => c.upgradesTo.includes(d.classId))
      if (base) d.classId = base.id
    }
  }
  for (const lane of s.lanes) if (lane.squad.length > MAX_SQUAD) lane.squad = lane.squad.slice(0, MAX_SQUAD)
}

// ---------- offline progress ----------

export interface OfflineReport { seconds: number; waves: number; gold: number; followers: number; levels: number }

/** Estimate rewards for time away: sim one sample wave per lane, multiply. */
export function applyOffline(s: GameState, seconds: number): OfflineReport | null {
  seconds = Math.min(seconds, MAX_OFFLINE_SECONDS)
  if (seconds < 30) return null
  const rng = makeRng(s)
  const before = { gold: s.gold, followers: s.followers, levels: sumLevels(s) }
  let waves = 0
  for (const lane of activeLanes(s)) {
    if (!lane.squad.length) continue
    lane.mode = 'frontier'
    // Sample a few waves for win-rate, avg duration and kills per win.
    const SAMPLES = 6
    let wins = 0, time = 0, kills = 0
    for (let i = 0; i < SAMPLES; i++) {
      const b = simulate(createBattle(allySpecs(s, lane), waveSpecs(s, rng), rng), rng)
      time += b.elapsed + (b.winner === 'ally' ? WAVE_COOLDOWN : REVIVE_COOLDOWN)
      if (b.winner === 'ally') { wins++; kills += b.units.filter((u) => u.side === 'enemy').length }
    }
    if (!wins) continue
    const n = Math.floor((seconds / (time / SAMPLES)) * (wins / SAMPLES))
    grantWaveRewards(s, lane, Math.round(kills / wins), n, rng, true)
    waves += n
  }
  s.gold += s.facilities.tavern * 0.5 * seconds
  s.time += seconds
  const r = {
    seconds, waves, gold: Math.round(s.gold - before.gold),
    followers: s.followers - before.followers, levels: sumLevels(s) - before.levels,
  }
  log(s, `Away ${Math.round(seconds / 60)}m: ${waves} waves, +${r.gold}g`, 'info')
  return r
}

const sumLevels = (s: GameState) => Object.values(s.duelists).reduce((a, d) => a + d.level, 0)

// ---------- player actions (return error string or null) ----------

export type ActionResult = string | null

export function challengeDuel(s: GameState, laneIdx: number): ActionResult {
  const lane = s.lanes[laneIdx]
  if (!lane || !activeLanes(s).includes(lane)) return 'Lane locked'
  if (!lane.squad.length) return 'Squad empty'
  if (!canDuel(s)) return `Need ${outpost(s).followersRequired} followers`
  lane.mode = 'duel'
  lane.battle = null
  lane.cooldown = 0.3
  log(s, `Challenging ${outpost(s).duel.guild}!`, 'info')
  return null
}

export function gatherCost(s: GameState) { return 100 * (1 + s.facilities.tavern) }

export function gatherCandidates(s: GameState): ActionResult {
  const cost = gatherCost(s)
  if (s.gold < cost) return 'Not enough gold'
  s.gold -= cost
  const rng = makeRng(s)
  const lvl = s.facilities.tavern
  const base = [22, 26, 24, 16, 8, 3, 1]
  const w = base.map((b, i) => b * Math.pow(1 + 0.35 * lvl, i))
  const total = w.reduce((a, b) => a + b, 0)
  s.candidates = Array.from({ length: 3 + lvl }, (): Candidate => {
    let r = rng() * total
    let gi = 0
    while ((r -= w[gi]!) > 0 && gi < 6) gi++
    const classId = pick(rng, RECRUITABLE)
    return { id: nid(s, 'c'), name: pick(rng, NAMES), classId, potential: POTENTIALS[gi]!, price: HIRE_COST[getClass(classId).rank]! }
  })
  return null
}

export function hire(s: GameState, candidateId: string): ActionResult {
  const c = s.candidates.find((x) => x.id === candidateId)
  if (!c) return 'Gone'
  if (s.gold < c.price) return 'Not enough gold'
  s.gold -= c.price
  s.candidates = s.candidates.filter((x) => x !== c)
  const d = addDuelist(s, makeRng(s), c.classId, c.potential, c.name)
  log(s, `${d.name} (${getClass(d.classId).name}, ${d.potential}) joined.`, 'info')
  return null
}

export function dismiss(s: GameState, duelistId: string): ActionResult {
  if (Object.keys(s.duelists).length <= 1) return 'Cannot dismiss your last duelist'
  for (const l of s.lanes) l.squad = l.squad.filter((id) => id !== duelistId)
  delete s.duelists[duelistId]
  return null
}

export function assign(s: GameState, duelistId: string, laneIdx: number | null): ActionResult {
  const d = s.duelists[duelistId]
  if (!d) return 'Unknown duelist'
  const from = s.lanes.find((l) => l.squad.includes(duelistId))
  if (laneIdx === null) {
    if (from) { from.squad = from.squad.filter((x) => x !== duelistId); from.battle = null; from.cooldown = WAVE_COOLDOWN }
    return null
  }
  const lane = s.lanes[laneIdx]
  if (!lane || !activeLanes(s).includes(lane)) return 'Lane locked (upgrade Quarters)'
  if (lane === from) return null
  if (lane.squad.length >= MAX_SQUAD) return `Squad full (max ${MAX_SQUAD})`
  if (squadCost(s, lane) + getClass(d.classId).cost > quarters(s).cost) return 'Over COST limit'
  if (from) { from.squad = from.squad.filter((x) => x !== duelistId); from.battle = null; from.cooldown = WAVE_COOLDOWN }
  lane.squad.push(duelistId)
  lane.battle = null
  lane.cooldown = WAVE_COOLDOWN
  return null
}

export function upgradeFacility(s: GameState, id: FacilityId): ActionResult {
  const lvl = s.facilities[id]
  if (lvl >= FACILITY_INFO[id].max) return 'Max level'
  const cost = facilityUpgradeCost(id, lvl)
  if (s.gold < cost.gold || s.materials.ore < cost.ore) return 'Not enough resources'
  s.gold -= cost.gold
  s.materials.ore -= cost.ore
  s.facilities[id]++
  log(s, `${FACILITY_INFO[id].name} upgraded to Lv ${s.facilities[id]}.`, 'info')
  return null
}

export function rankUp(s: GameState, duelistId: string, target: string): ActionResult {
  const d = s.duelists[duelistId]
  if (!d) return 'Unknown duelist'
  if (!SUBCLASSES_ENABLED) return 'Sub-classes coming later'
  const cls = getClass(d.classId)
  if (!cls.upgradesTo.includes(target)) return 'Invalid path'
  const t = getClass(target)
  const req = RANK_UP[t.rank as 2]
  if (!req) return 'Rank not available in prototype'
  if (s.facilities.classHall < t.rank - 1) return `Class Hall Lv ${t.rank - 1} required`
  if (d.level < req.minLevel) return `Lv ${req.minLevel} required`
  if (s.gold < req.gold) return 'Not enough gold'
  if (s.materials.bronzeBadge < req.badge) return 'Bronze Badge required (win a Duel)'
  s.gold -= req.gold
  s.materials.bronzeBadge -= req.badge
  d.classId = target
  const lane = s.lanes.find((l) => l.squad.includes(d.id))
  if (lane && squadCost(s, lane) > quarters(s).cost) {
    lane.squad = lane.squad.filter((x) => x !== d.id)
    log(s, `${d.name} removed from squad (COST).`, 'info')
  }
  log(s, `${d.name} advanced to ${t.name}!`, 'win')
  return null
}

export function useTome(s: GameState, duelistId: string): ActionResult {
  const d = s.duelists[duelistId]
  if (!d) return 'Unknown duelist'
  if (s.materials.tome < 1) return 'No EXP Tomes'
  if (d.level >= quarters(s).levelCap) return 'Level cap (upgrade Quarters)'
  s.materials.tome--
  addExp(s, d, Math.round(expToNext(d.level) * 0.6))
  return null
}

// ---------- gear ----------

function rollRarity(rng: Rng, bonus: number): Rarity {
  const w = [70, 22, 6, 1.6, 0.4].map((b, i) => b * Math.pow(1 + bonus, i))
  let r = rng() * w.reduce((a, b) => a + b, 0)
  let i = 0
  while ((r -= w[i]!) > 0 && i < 4) i++
  return RARITIES[i]!
}

function rollGear(s: GameState, rng: Rng, rarityBonus: number): Gear {
  const slot = pick(rng, ['weapon', 'armor', 'accessory'] as GearSlot[])
  const rarity = rollRarity(rng, rarityBonus)
  const b = GEAR_BASE[slot]
  const scale = RARITY_MULT[rarity] * (1 + s.outpostIdx * 0.8) * (0.85 + rng() * 0.3)
  const g: Gear = {
    id: nid(s, 'g'), slot, rarity,
    name: `${rarity[0]!.toUpperCase()}${rarity.slice(1)} ${pick(rng, b.names)}`,
    hp: Math.round(b.hp * scale), atk: Math.round(b.atk * scale), def: Math.round(b.def * scale),
  }
  s.gear[g.id] = g
  return g
}

export function forgeCost(s: GameState) {
  return { gold: FORGE_COST.gold * (1 + s.outpostIdx), ore: FORGE_COST.ore }
}

export function forge(s: GameState): ActionResult {
  const c = forgeCost(s)
  if (s.gold < c.gold || s.materials.ore < c.ore) return 'Not enough resources'
  s.gold -= c.gold
  s.materials.ore -= c.ore
  const g = rollGear(s, makeRng(s), 0.4 + s.facilities.blacksmith * 0.35)
  log(s, `Forged ${g.name}.`, 'loot')
  return null
}

export function equip(s: GameState, duelistId: string, gearId: string): ActionResult {
  const d = s.duelists[duelistId]
  const g = s.gear[gearId]
  if (!d || !g) return 'Invalid'
  for (const o of Object.values(s.duelists)) if (o.gear[g.slot] === gearId) delete o.gear[g.slot]
  d.gear[g.slot] = gearId
  return null
}

export function unequip(s: GameState, duelistId: string, slot: GearSlot): ActionResult {
  const d = s.duelists[duelistId]
  if (!d) return 'Invalid'
  delete d.gear[slot]
  return null
}

export function sellPrice(g: Gear) { return Math.round(40 * RARITY_MULT[g.rarity] * (1 + (g.hp + g.atk * 6 + g.def * 5) / 40)) }

export function sell(s: GameState, gearId: string): ActionResult {
  const g = s.gear[gearId]
  if (!g) return 'Invalid'
  for (const d of Object.values(s.duelists)) if (d.gear[g.slot] === gearId) delete d.gear[g.slot]
  delete s.gear[gearId]
  s.gold += sellPrice(g)
  return null
}
