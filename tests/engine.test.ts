import { describe, expect, it } from 'vitest'
import {
  applyOffline, assign, challengeDuel, computeStats, createBattle, gatherCandidates, hire, load, newGame,
  OUTPOSTS, save, simulate, tick, upgradeFacility, forge, equip, rankUp, TEAM_SIZE, getClass, normalize,
} from '../src/engine'
import { makeRng } from '../src/engine/rng'

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('battle', () => {
  it('is deterministic for the same seed', () => {
    const run = () => {
      const h = { seed: 42 }
      const rng = makeRng(h)
      const mk = (c: string, l: number) => ({ name: c, classId: c, level: l, stats: computeStats(c, l) })
      return simulate(createBattle([mk('warrior', 5), mk('mage', 5)], [mk('slime', 3), mk('wolf', 3)], rng), rng)
    }
    const a = run(), b = run()
    expect(a.winner).toBe(b.winner)
    expect(a.elapsed).toBe(b.elapsed)
  })

  it('a level-5 duo beats meadow monsters', () => {
    const h = { seed: 7 }
    const rng = makeRng(h)
    const mk = (c: string, l: number) => ({ name: c, classId: c, level: l, stats: computeStats(c, l) })
    const b = simulate(createBattle([mk('warrior', 5), mk('priest', 5)], [mk('slime', 3), mk('slime', 3), mk('wolf', 3)], rng), rng)
    expect(b.winner).toBe('ally')
  })
})

describe('game loop', () => {
  it('starting squad clears waves and earns followers', () => {
    const s = newGame(1)
    for (let i = 0; i < 600; i++) tick(s, 0.1) // 60s
    expect(s.stats.waves).toBeGreaterThan(0)
    expect(s.followers).toBeGreaterThan(0)
    expect(s.gold).toBeGreaterThan(1200 - 1)
  })

  it('starts with a full 3-duelist squad; squads hold at most TEAM_SIZE', () => {
    const s = newGame(2)
    expect(s.lanes[0]!.squad).toHaveLength(TEAM_SIZE)
    s.gold = 1e6
    gatherCandidates(s); hire(s, s.candidates[0]!.id)
    const extra = Object.keys(s.duelists).find((id) => !s.lanes[0]!.squad.includes(id))!
    expect(assign(s, extra, 0)).toMatch(/full/i)
    expect(assign(s, extra, 1)).toMatch(/locked/i) // quarters 0 = 1 lane
    expect(upgradeFacility(s, 'quarters')).toBeNull()
    expect(assign(s, extra, 1)).toBeNull()
  })

  it('every fight is 3v3: frontier waves and duels field TEAM_SIZE enemies', () => {
    expect(TEAM_SIZE).toBe(3)
    for (const o of OUTPOSTS) {
      expect(o.duel.squad).toHaveLength(TEAM_SIZE)
      for (const e of o.duel.squad) expect(getClass(e.classId).rank).toBe(1)
    }
    const s = newGame(6)
    for (let i = 0; i < 50 && !s.lanes[0]!.battle; i++) tick(s, 0.1)
    expect(s.lanes[0]!.battle!.units.filter((u) => u.side === 'enemy')).toHaveLength(TEAM_SIZE)
  })

  it('duel requires followers; winning advances outpost', () => {
    const s = newGame(3)
    expect(challengeDuel(s, 0)).not.toBeNull()
    s.followers = OUTPOSTS[0]!.followersRequired
    s.duelists[s.lanes[0]!.squad[0]!]!.level = 25
    expect(challengeDuel(s, 0)).toBeNull()
    for (let i = 0; i < 1200 && s.outpostIdx === 0; i++) tick(s, 0.1)
    expect(s.outpostIdx).toBe(1)
    expect(s.materials.bronzeBadge).toBe(1)
  })

  it('sub-classes are locked for now (base classes only)', () => {
    const s = newGame(4)
    const id = s.lanes[0]!.squad[0]!
    s.gold = 1e6; s.facilities.classHall = 1; s.materials.bronzeBadge = 1
    s.duelists[id]!.level = 20
    expect(rankUp(s, id, 'knight')).toMatch(/later/)
    expect(s.duelists[id]!.classId).toBe('warrior')
  })

  it('normalize trims old 4-man squads and reverts sub-classes', () => {
    const s = newGame(8)
    s.gold = 1e6
    for (let i = 0; i < 3; i++) { gatherCandidates(s); hire(s, s.candidates[0]!.id) }
    s.lanes[0]!.squad = Object.keys(s.duelists) // 6: an old save could hold 4+
    const hero = s.lanes[0]!.squad[0]!
    s.duelists[hero]!.classId = 'knight'
    normalize(s)
    expect(s.lanes[0]!.squad).toHaveLength(TEAM_SIZE)
    expect(s.duelists[hero]!.classId).toBe('warrior')
  })

  it('forge + equip raises stats', () => {
    const s = newGame(5)
    s.gold = 1e5; s.materials.ore = 30
    expect(forge(s)).toBeNull()
    const g = Object.values(s.gear)[0]!
    const id = s.lanes[0]!.squad[0]!
    expect(equip(s, id, g.id)).toBeNull()
    expect(s.duelists[id]!.gear[g.slot]).toBe(g.id)
  })
})

describe('save / offline', () => {
  it('round-trips and grants offline rewards', () => {
    const store = memStore()
    const s = newGame(9)
    save(s, store)
    const { state, offline } = load(store, Date.now() + 3600_000)
    expect(state.duelists).toEqual(expect.objectContaining(Object.fromEntries(Object.keys(s.duelists).map((k) => [k, expect.anything()]))))
    expect(offline?.waves).toBeGreaterThan(0)
    expect(offline!.gold).toBeGreaterThan(0)
  })

  it('ignores short absences', () => {
    expect(applyOffline(newGame(1), 10)).toBeNull()
  })
})
