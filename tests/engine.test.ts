import { describe, expect, it } from 'vitest'
import {
  applyOffline, assign, challengeDuel, computeStats, createBattle, gatherCandidates, hire, load, newGame,
  OUTPOSTS, save, simulate, tick, upgradeFacility, forge, equip, rankUp, TEAM_SIZE, getClass, normalize,
  PASSIVES, stepBattle, GEAR_PASSIVES_MINOR, GEAR_PASSIVES_MAJOR, duelistStats,
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

describe('3-slot kit', () => {
  const mk = (c: string, l: number, passive?: string) => ({ name: c, classId: c, level: l, passive, stats: computeStats(c, l, 'C', [], passive) })

  it('every class has a basic attack and an active', () => {
    for (const id of ['warrior', 'mage', 'priest', 'archer', 'slime', 'drake']) {
      const c = getClass(id)
      expect(c.basic.name).toBeTruthy()
      expect(c.basic.power).toBeGreaterThan(0)
      expect(c.active.name).toBeTruthy()
    }
  })

  it('duelists and candidates roll a passive; hiring keeps it', () => {
    const s = newGame(11)
    for (const d of Object.values(s.duelists)) expect(PASSIVES[d.passive]).toBeDefined()
    s.gold = 1e6
    gatherCandidates(s)
    const c = s.candidates[0]!
    expect(PASSIVES[c.passive]).toBeDefined()
    hire(s, c.id)
    const d = Object.values(s.duelists).find((x) => x.name === c.name && x.classId === c.classId)!
    expect(d.passive).toBe(c.passive)
  })

  it('normalize rolls passives for old saves', () => {
    const s = newGame(12)
    const d = Object.values(s.duelists)[0]!
    delete (d as Partial<typeof d>).passive
    normalize(s)
    expect(PASSIVES[d.passive]).toBeDefined()
  })

  it('stat passives change computed stats', () => {
    const base = computeStats('warrior', 5)
    expect(computeStats('warrior', 5, 'C', [], 'stout').hp).toBeGreaterThan(base.hp)
    expect(computeStats('warrior', 5, 'C', [], 'brawler').atk).toBeGreaterThan(base.atk)
    expect(computeStats('warrior', 5, 'C', [], 'nimble').interval).toBeLessThan(base.interval)
    expect(computeStats('warrior', 5, 'C', [], 'keen').crit).toBeCloseTo(base.crit + 0.1)
  })

  it('active fires the moment energy is full, without waiting for the attack timer', () => {
    const rng = makeRng({ seed: 3 })
    const b = createBattle([mk('priest', 5, 'eager')], [mk('troll', 5)], rng)
    const priest = b.units[0]!
    priest.energy = priest.energyMax
    priest.atkTimer = 99 // basic attack nowhere near ready
    stepBattle(b, 0.05, rng)
    expect(b.events.some((e) => e.t === 'skill' && e.src === priest.uid)).toBe(true)
    expect(priest.energy).toBe(0)
  })

  it('Eager starts with energy; Leech heals on basics; Spiked reflects; Second Wind triggers once', () => {
    const rng = makeRng({ seed: 5 })
    const eager = createBattle([mk('warrior', 5, 'eager')], [mk('slime', 1)], rng)
    expect(eager.units[0]!.energy).toBe(getClass('warrior').energyMax / 2)

    const leech = createBattle([mk('warrior', 10, 'leech')], [mk('troll', 10)], rng)
    simulate(leech, rng)
    expect(leech.events.some((e) => e.t === 'heal' && e.dst === leech.units[0]!.uid)).toBe(true)

    const spiked = createBattle([mk('warrior', 10, 'spiked')], [mk('troll', 10)], rng)
    const [knight, troll] = [spiked.units[0]!, spiked.units[1]!]
    knight.atkTimer = 1e9 // never swings: any damage the troll takes is reflected
    knight.stats = { ...knight.stats, interval: 1e9 }
    for (let i = 0; i < 100 && knight.energy < 90; i++) stepBattle(spiked, 0.05, rng)
    expect(spiked.events.some((e) => e.t === 'damage' && e.dst === troll.uid)).toBe(true)

    const wind = createBattle([mk('warrior', 3, 'secondWind')], [mk('troll', 12)], rng)
    simulate(wind, rng)
    expect(wind.events.filter((e) => e.t === 'passive').length).toBe(1)
  })

  it('supports fill their energy bar faster than tanks', () => {
    expect(getClass('priest').energyMax).toBeLessThan(getClass('warrior').energyMax)
  })

  it('Undying survives one lethal hit; Stalwart takes less damage; Reaper refills energy on kills', () => {
    const rng = makeRng({ seed: 9 })
    const und = createBattle([mk('mage', 1, 'undying')], [mk('troll', 15)], rng)
    simulate(und, rng)
    expect(und.events.filter((e) => e.t === 'passive' && e.src === und.units[0]!.uid)).toHaveLength(1)

    const dmgTaken = (passive?: string) => {
      const r = makeRng({ seed: 21 })
      const b = createBattle([mk('warrior', 5, passive)], [mk('orc', 5)], r)
      for (let i = 0; i < 60; i++) stepBattle(b, 0.05, r)
      return b.units[0]!.maxHp - b.units[0]!.hp
    }
    expect(dmgTaken('stalwart')).toBeLessThan(dmgTaken())

    const reap = createBattle([mk('warrior', 20, 'reaper')], [mk('slime', 1)], rng)
    const w = reap.units[0]!
    simulate(reap, rng)
    expect(w.energy).toBeGreaterThanOrEqual(w.energyMax * 0.35)
  })
})

describe('gear passives', () => {
  it('common gear has none; rare/epic roll minor; legendary/mythic roll major', () => {
    const s = newGame(31)
    s.gold = 1e9; s.materials.ore = 1e6; s.facilities.blacksmith = 10
    for (let i = 0; i < 300; i++) forge(s)
    const gear = Object.values(s.gear)
    for (const g of gear) {
      if (g.rarity === 'common') expect(g.passive).toBeUndefined()
      else if (g.rarity === 'rare' || g.rarity === 'epic') expect(GEAR_PASSIVES_MINOR[g.passive!]).toBeDefined()
      else expect(GEAR_PASSIVES_MAJOR[g.passive!]).toBeDefined()
    }
    expect(gear.some((g) => g.passive)).toBe(true)
  })

  it('stack with the duelist passive in stats and battle', () => {
    const s = newGame(32)
    const d = s.duelists[s.lanes[0]!.squad[0]!]!
    d.passive = 'brawler'
    const before = duelistStats(d, s.gear).atk
    s.gear.x = { id: 'x', name: 'Test Blade', slot: 'weapon', rarity: 'rare', hp: 0, atk: 0, def: 0, passive: 'g_honed' }
    s.gear.y = { id: 'y', name: 'Test Charm', slot: 'accessory', rarity: 'legendary', hp: 0, atk: 0, def: 0, passive: 'g_phoenix' }
    equip(s, d.id, 'x'); equip(s, d.id, 'y')
    expect(duelistStats(d, s.gear).atk).toBeGreaterThan(before)
    for (let i = 0; i < 50 && !s.lanes[0]!.battle; i++) tick(s, 0.1)
    const u = s.lanes[0]!.battle!.units.find((x) => x.ref === d.id)!
    expect(u.mods.undying).toBe('Phoenix Plume')
  })
})
