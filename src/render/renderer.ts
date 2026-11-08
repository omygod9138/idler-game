import type { BattleState, Combatant, GameState, LaneState } from '@/engine/types'
import { getClass } from '@/engine/data/classes'
import { LANE_WIDTH } from '@/engine/battle'
import { OUTPOSTS } from '@/engine/data/world'
import { drawDigits, getSprite } from './sprites'

export const LANE_H = 72
const GROUND_Y = 50

interface Floater { x: number; y: number; text: string; color: string; t: number; ttl: number }
interface Projectile { x0: number; x1: number; y: number; t: number; ttl: number; color: string }
interface Burst { x: number; r: number; t: number; ttl: number; color: string; label: string }
interface UnitFx { lunge: number; hurt: number; deathT: number }

interface LaneFx {
  battle: BattleState | null
  floaters: Floater[]
  projectiles: Projectile[]
  bursts: Burst[]
  fx: Map<number, UnitFx>
  scroll: number
}

const THEMES: Record<string, { sky: string[]; hill: string; ground: string; dirt: string; deco: string }> = {
  meadow: { sky: ['#6ec3ff', '#8fd3ff', '#b5e4ff'], hill: '#5aa04a', ground: '#7bc05a', dirt: '#8a5a32', deco: '#3f7a35' },
  forest: { sky: ['#3b6e8a', '#4f8aa0', '#6ea8b5'], hill: '#2b4d2b', ground: '#3f7a35', dirt: '#5a3a22', deco: '#1d3a1d' },
  crypt: { sky: ['#2a1d3a', '#3a2a4f', '#4f3a5f'], hill: '#3a3048', ground: '#5a5068', dirt: '#2a2030', deco: '#1a1424' },
  pass: { sky: ['#8aa8c9', '#a8c4dc', '#cfe0ee'], hill: '#e8f0f8', ground: '#d9e6f2', dirt: '#7a8aa0', deco: '#5a6a80' },
  capital: { sky: ['#f2a65a', '#f7c47a', '#fbe0a0'], hill: '#b8833a', ground: '#c9a36b', dirt: '#7a5a32', deco: '#8a4b2a' },
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private lanes: LaneFx[] = []
  private last = performance.now()

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(lanes: number, cssWidth: number) {
    const h = LANE_H * lanes
    if (this.canvas.width !== LANE_WIDTH || this.canvas.height !== h) {
      this.canvas.width = LANE_WIDTH
      this.canvas.height = h
    }
    // integer scaling keeps pixels crisp
    // keep the strip compact with many lanes (cap ~440px tall, but never below 2x)
    const byWidth = Math.floor(cssWidth / LANE_WIDTH)
    const byHeight = Math.max(2, Math.floor(440 / h))
    const scale = Math.max(1, Math.min(byWidth, byHeight))
    this.canvas.style.width = `${LANE_WIDTH * scale}px`
    this.canvas.style.height = `${h * scale}px`
    this.ctx.imageSmoothingEnabled = false
  }

  draw(state: GameState, laneCount: number) {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const theme = THEMES[OUTPOSTS[state.outpostIdx]!.id]!
    for (let i = 0; i < laneCount; i++) {
      const lane = state.lanes[i]!
      const fx = (this.lanes[i] ??= { battle: null, floaters: [], projectiles: [], bursts: [], fx: new Map(), scroll: 0 })
      if (fx.battle !== lane.battle) { fx.battle = lane.battle; fx.fx.clear(); fx.projectiles = []; fx.bursts = [] }
      this.consumeEvents(lane, fx)
      this.ctx.save()
      this.ctx.translate(0, i * LANE_H)
      this.ctx.beginPath()
      this.ctx.rect(0, 0, LANE_WIDTH, LANE_H)
      this.ctx.clip()
      // walk between waves: scroll background
      if (!lane.battle && lane.squad.length) fx.scroll += dt * 30
      this.drawBackground(theme, fx.scroll, i)
      this.drawLane(state, lane, fx, dt)
      this.drawLaneLabel(lane, i)
      this.ctx.restore()
    }
  }

  private consumeEvents(lane: LaneState, fx: LaneFx) {
    const b = lane.battle
    if (!b || !b.events.length) return
    const byId = new Map(b.units.map((u) => [u.uid, u]))
    for (const e of b.events.splice(0)) {
      switch (e.t) {
        case 'attack': {
          const s = byId.get(e.src), d = byId.get(e.dst)
          if (!s || !d) break
          this.unitFx(fx, s.uid).lunge = 0.18
          if (e.ranged) fx.projectiles.push({ x0: s.x, x1: d.x, y: this.feetY(s) - 9, t: 0, ttl: 0.22, color: projColor(s.classId) })
          break
        }
        case 'damage': {
          const d = byId.get(e.dst)
          if (!d) break
          this.unitFx(fx, d.uid).hurt = 0.12
          fx.floaters.push({ x: d.x + rnd(-3, 3), y: this.feetY(d) - 20, text: `${e.amount}${e.crit ? '!' : ''}`, color: e.crit ? '#ffd54a' : d.side === 'ally' ? '#ff6a6a' : '#ffffff', t: 0, ttl: 0.8 })
          break
        }
        case 'heal': {
          const d = byId.get(e.dst)
          if (d) fx.floaters.push({ x: d.x, y: this.feetY(d) - 20, text: `+${e.amount}`, color: '#7cff8a', t: 0, ttl: 0.9 })
          break
        }
        case 'skill': {
          const color = { cleave: '#ffffff', fireball: '#ff6a3d', heal: '#7cff8a', volley: '#ffd54a', guard: '#4fa3ff', smite: '#fff6a0' }[e.kind]
          fx.bursts.push({ x: e.kind === 'heal' || e.kind === 'guard' ? (byId.get(e.src)?.x ?? e.x) : e.x, r: e.area ?? 14, t: 0, ttl: 0.45, color, label: e.name })
          break
        }
        case 'death':
          this.unitFx(fx, e.dst).deathT = 0.001
          break
      }
    }
  }

  private unitFx(fx: LaneFx, uid: number): UnitFx {
    let u = fx.fx.get(uid)
    if (!u) { u = { lunge: 0, hurt: 0, deathT: 0 }; fx.fx.set(uid, u) }
    return u
  }

  private feetY(u: Combatant) {
    return GROUND_Y + (getClass(u.classId).row === 'front' ? 10 : 6)
  }

  private drawBackground(th: (typeof THEMES)[string], scroll: number, laneIdx: number) {
    const c = this.ctx
    // banded sky
    th.sky.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 10, LANE_WIDTH, i === th.sky.length - 1 ? GROUND_Y : 10) })
    // far hills (parallax)
    c.fillStyle = th.hill
    const off = (scroll * 0.3 + laneIdx * 57) % 64
    for (let x = -64; x < LANE_WIDTH + 64; x += 64) {
      const hx = Math.round(x - off)
      for (let k = 0; k < 16; k++) c.fillRect(hx + k * 2, GROUND_Y - 4 - Math.round(Math.sin((k / 15) * Math.PI) * 10), 2, 14)
    }
    // ground
    c.fillStyle = th.ground
    c.fillRect(0, GROUND_Y, LANE_WIDTH, LANE_H - GROUND_Y)
    c.fillStyle = th.dirt
    c.fillRect(0, LANE_H - 4, LANE_WIDTH, 4)
    // grass tufts / deco
    c.fillStyle = th.deco
    const goff = Math.round(scroll) % 24
    for (let x = -24; x < LANE_WIDTH + 24; x += 24) {
      const gx = x - goff + ((x * 7) % 11)
      c.fillRect(gx, GROUND_Y + 2, 1, 2)
      c.fillRect(gx + 2, GROUND_Y + 1, 1, 3)
      c.fillRect(gx + 9, GROUND_Y + 14, 2, 1)
    }
    // lane separator
    c.fillStyle = '#1a1424'
    c.fillRect(0, LANE_H - 1, LANE_WIDTH, 1)
  }

  private drawLane(state: GameState, lane: LaneState, fx: LaneFx, dt: number) {
    const c = this.ctx
    const b = lane.battle
    if (!b) {
      // squad walking between waves
      lane.squad.forEach((id, i) => {
        const d = state.duelists[id]!
        const cls = getClass(d.classId)
        const x = 110 - i * 20
        const bob = Math.floor(performance.now() / 150 + i) % 2
        const spr = getSprite(cls.sprite, cls.palette, false)
        c.drawImage(spr.normal, Math.round(x - 8), GROUND_Y + (cls.row === 'front' ? 10 : 6) - 16 - bob)
      })
      if (lane.mode === 'duel') this.banner('DUEL INCOMING', '#ffd54a')
      return
    }
    // sort: back row first so front row overlaps
    const units = [...b.units].sort((a, z) => this.feetY(a) - this.feetY(z))
    for (const u of units) {
      const f = this.unitFx(fx, u.uid)
      f.lunge = Math.max(0, f.lunge - dt)
      f.hurt = Math.max(0, f.hurt - dt)
      if (!u.alive) {
        if (f.deathT === 0) f.deathT = 0.001
        f.deathT += dt
        if (f.deathT > 0.6) continue
        c.globalAlpha = Math.max(0, 1 - f.deathT / 0.6)
      }
      const cls = getClass(u.classId)
      const facingLeft = u.side === 'enemy'
      const spr = getSprite(cls.sprite, cls.palette, facingLeft)
      const lungeDx = f.lunge > 0 ? (facingLeft ? -2 : 2) : 0
      const bob = u.alive ? Math.floor(performance.now() / 220 + u.uid) % 2 : 0
      const fy = this.feetY(u)
      c.drawImage(f.hurt > 0 ? spr.flash : spr.normal, Math.round(u.x - 8 + lungeDx), fy - 16 - bob)
      c.globalAlpha = 1
      if (u.alive) this.bars(u, fy)
    }
    // projectiles
    fx.projectiles = fx.projectiles.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.projectiles) {
      const x = p.x0 + (p.x1 - p.x0) * (p.t / p.ttl)
      c.fillStyle = p.color
      c.fillRect(Math.round(x) - 1, p.y, 3, 1)
      c.fillRect(Math.round(x), p.y - 1, 1, 3)
    }
    // skill bursts
    fx.bursts = fx.bursts.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.bursts) {
      const k = p.t / p.ttl
      c.fillStyle = p.color
      c.globalAlpha = 1 - k
      const r = Math.round(p.r * (0.4 + k * 0.6))
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2
        c.fillRect(Math.round(p.x + Math.cos(ang) * r), Math.round(GROUND_Y + 2 + Math.sin(ang) * r * 0.35), 2, 2)
      }
      c.globalAlpha = 1
      if (k < 0.7) this.label(p.label, p.x, 8, p.color)
    }
    // floating numbers
    fx.floaters = fx.floaters.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.floaters) drawDigits(c, p.text, p.x, p.y - p.t * 14, p.color)
    if (lane.mode === 'duel') this.label('DUEL', LANE_WIDTH / 2, 8, '#ffd54a')
  }

  private bars(u: Combatant, fy: number) {
    const c = this.ctx
    const x = Math.round(u.x - 6)
    const y = fy - 20
    c.fillStyle = '#1a1424'
    c.fillRect(x - 1, y - 1, 14, u.side === 'ally' ? 5 : 4)
    c.fillStyle = '#4a2a2a'
    c.fillRect(x, y, 12, 2)
    c.fillStyle = u.side === 'ally' ? '#5ad65a' : '#e04a4a'
    c.fillRect(x, y, Math.ceil((12 * u.hp) / u.maxHp), 2)
    if (u.guard < 1) { c.fillStyle = '#4fa3ff'; c.fillRect(x, y - 2, 12, 1) }
    if (u.side === 'ally') {
      c.fillStyle = '#ffd54a'
      c.fillRect(x, y + 3, Math.round((12 * u.energy) / 100), 1)
    }
  }

  private label(text: string, x: number, y: number, color: string) {
    const c = this.ctx
    c.font = '8px "Press Start 2P", monospace'
    c.textAlign = 'center'
    c.textBaseline = 'top'
    c.fillStyle = '#1a1424'
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.fillText(text, Math.round(x) + dx!, y + dy!)
    c.fillStyle = color
    c.fillText(text, Math.round(x), y)
  }

  private banner(text: string, color: string) {
    this.label(text, LANE_WIDTH / 2, 20, color)
  }

  private drawLaneLabel(lane: LaneState, i: number) {
    this.label(`${i + 1}`, 8, 3, lane.squad.length ? '#ffffff' : '#7a7a8a')
    if (!lane.squad.length) this.label('EMPTY SQUAD', LANE_WIDTH / 2, 30, '#d9e2ec')
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
function projColor(classId: string) {
  return ({ mage: '#ff6a3d', wizard: '#ff3d6a', priest: '#ffe27a', bishop: '#9fffe0' } as Record<string, string>)[classId] ?? '#d9e2ec'
}
