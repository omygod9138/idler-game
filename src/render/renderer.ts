import type { BattleState, Combatant, GameState, LaneState, SkillKind } from '@/engine/types'
import { getClass } from '@/engine/data/classes'
import { LANE_WIDTH } from '@/engine/battle'
import { OUTPOSTS } from '@/engine/data/world'
import { drawDigits, getSprite } from './sprites'
import { art, type Anim, type ArtSet, type Clip } from './art'

/** Lane size in world units; the canvas draws RES device pixels per unit so 64px art stays ~1:1. */
export const LANE_H = 80
const RES = 2
const GROUND_Y = 54
const FPS = 12
/** Keep drawing a finished battle this long so the last death animation plays out. */
const AFTERMATH = 1.0

interface Floater { x: number; y: number; text: string; color: string; t: number; ttl: number }
interface Projectile { x0: number; x1: number; y: number; t: number; ttl: number; color: string }
interface Burst { x: number; r: number; t: number; ttl: number; color: string; label: string }
interface UnitFx { anim: Anim; clip?: Clip; t: number; fps: number; hurt: number; lastX: number; deathT: number }

interface LaneFx {
  battle: BattleState | null
  /** seconds since `battle` ended (lane.battle went null) */
  after: number
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

/** Skill → named clip in the art (warrior export has these). Falls back to the attack clip. */
const SKILL_CLIP: Partial<Record<SkillKind, RegExp>> = { cleave: /heavy-strike/i, guard: /shield-bash/i }

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private lanes: LaneFx[] = []
  private last = performance.now()

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(lanes: number, cssWidth: number) {
    const w = LANE_WIDTH * RES
    const h = LANE_H * lanes * RES
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    // integer CSS scaling keeps pixels crisp; cap height so 3 lanes still fit above the tabs
    const byWidth = cssWidth / w
    const byHeight = 520 / h
    const fit = Math.min(byWidth, byHeight)
    const s = fit >= 1 ? Math.floor(fit) : fit
    this.canvas.style.width = `${w * s}px`
    this.canvas.style.height = `${h * s}px`
    this.ctx.imageSmoothingEnabled = false
  }

  draw(state: GameState, laneCount: number) {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const theme = THEMES[OUTPOSTS[state.outpostIdx]!.id]!
    const c = this.ctx
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.imageSmoothingEnabled = false
    for (let i = 0; i < laneCount; i++) {
      const lane = state.lanes[i]!
      const fx = (this.lanes[i] ??= { battle: null, after: 0, floaters: [], projectiles: [], bursts: [], fx: new Map(), scroll: 0 })
      if (lane.battle && fx.battle !== lane.battle) {
        fx.battle = lane.battle; fx.after = 0; fx.fx.clear(); fx.projectiles = []; fx.bursts = []
      } else if (!lane.battle && fx.battle) {
        fx.after += dt
        if (fx.after > AFTERMATH || !lane.squad.length) { fx.battle = null; fx.fx.clear() }
      }
      this.consumeEvents(fx)
      c.save()
      c.scale(RES, RES)
      c.translate(0, i * LANE_H)
      c.beginPath()
      c.rect(0, 0, LANE_WIDTH, LANE_H)
      c.clip()
      if (!fx.battle && lane.squad.length) fx.scroll += dt * 30
      this.drawBackground(theme, fx.scroll, i)
      if (fx.battle) this.drawBattle(lane, fx, dt)
      else this.drawMarch(state, lane)
      this.drawLaneLabel(lane, i)
      c.restore()
    }
  }

  // ---------- events → effects ----------

  private consumeEvents(fx: LaneFx) {
    const b = fx.battle
    if (!b || !b.events.length) return
    const byId = new Map(b.units.map((u) => [u.uid, u]))
    for (const e of b.events.splice(0)) {
      switch (e.t) {
        case 'attack': {
          const s = byId.get(e.src), d = byId.get(e.dst)
          if (!s || !d) break
          this.play(fx, s, 'attack')
          if (e.ranged) fx.projectiles.push({ x0: s.x, x1: d.x, y: this.midY(s), t: 0, ttl: 0.22, color: projColor(s.classId) })
          break
        }
        case 'damage': {
          const d = byId.get(e.dst)
          if (!d) break
          this.unitFx(fx, d).hurt = 0.12
          fx.floaters.push({ x: d.x + rnd(-3, 3), y: this.topY(d) - 6, text: `${e.amount}${e.crit ? '!' : ''}`, color: e.crit ? '#ffd54a' : d.side === 'ally' ? '#ff6a6a' : '#ffffff', t: 0, ttl: 0.8 })
          break
        }
        case 'heal': {
          const d = byId.get(e.dst)
          if (d) fx.floaters.push({ x: d.x, y: this.topY(d) - 6, text: `+${e.amount}`, color: '#7cff8a', t: 0, ttl: 0.9 })
          break
        }
        case 'skill': {
          const s = byId.get(e.src)
          if (s) this.play(fx, s, 'attack', SKILL_CLIP[e.kind])
          const color = { cleave: '#ffffff', fireball: '#ff6a3d', heal: '#7cff8a', volley: '#ffd54a', guard: '#4fa3ff', smite: '#fff6a0' }[e.kind]
          fx.bursts.push({ x: e.kind === 'heal' || e.kind === 'guard' ? (s?.x ?? e.x) : e.x, r: e.area ?? 14, t: 0, ttl: 0.45, color, label: e.name })
          break
        }
        case 'death': {
          const d = byId.get(e.dst)
          if (d) { this.play(fx, d, 'death'); this.unitFx(fx, d).deathT = 0.0001 }
          break
        }
      }
    }
  }

  private unitFx(fx: LaneFx, u: Combatant): UnitFx {
    let f = fx.fx.get(u.uid)
    if (!f) { f = { anim: 'idle', t: Math.random(), fps: FPS, hurt: 0, lastX: u.x, deathT: 0 }; fx.fx.set(u.uid, f) }
    return f
  }

  private play(fx: LaneFx, u: Combatant, anim: Anim, named?: RegExp) {
    const f = this.unitFx(fx, u)
    const a = art(u.classId)
    f.anim = anim
    f.t = 0
    f.clip = a ? (named && Object.entries(a.extra).find(([n]) => named.test(n))?.[1]) || a.anims[anim] : undefined
    // an attack swing must finish before the next one starts
    f.fps = anim === 'attack' && f.clip ? Math.max(FPS, f.clip.frames.length / (u.stats.interval * 0.9)) : FPS
  }

  // ---------- geometry ----------

  private feetY(u: { classId: string }) {
    return GROUND_Y + (getClass(u.classId).row === 'front' ? 12 : 6)
  }
  private height(classId: string) {
    const a = art(classId)
    return a ? a.visible * a.scale : 20
  }
  private topY(u: Combatant) { return this.feetY(u) - this.height(u.classId) }
  private midY(u: Combatant) { return this.feetY(u) - this.height(u.classId) * 0.55 }

  // ---------- drawing ----------

  private drawBackground(th: (typeof THEMES)[string], scroll: number, laneIdx: number) {
    const c = this.ctx
    th.sky.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 12, LANE_WIDTH, i === th.sky.length - 1 ? GROUND_Y : 12) })
    c.fillStyle = th.hill
    const off = (scroll * 0.3 + laneIdx * 57) % 64
    for (let x = -64; x < LANE_WIDTH + 64; x += 64) {
      const hx = Math.round(x - off)
      for (let k = 0; k < 16; k++) c.fillRect(hx + k * 2, GROUND_Y - 4 - Math.round(Math.sin((k / 15) * Math.PI) * 12), 2, 16)
    }
    c.fillStyle = th.ground
    c.fillRect(0, GROUND_Y, LANE_WIDTH, LANE_H - GROUND_Y)
    c.fillStyle = th.dirt
    c.fillRect(0, LANE_H - 4, LANE_WIDTH, 4)
    c.fillStyle = th.deco
    const goff = Math.round(scroll) % 24
    for (let x = -24; x < LANE_WIDTH + 24; x += 24) {
      const gx = x - goff + ((x * 7) % 11)
      c.fillRect(gx, GROUND_Y + 2, 1, 2)
      c.fillRect(gx + 2, GROUND_Y + 1, 1, 3)
      c.fillRect(gx + 9, GROUND_Y + 16, 2, 1)
    }
    c.fillStyle = '#1a1424'
    c.fillRect(0, LANE_H - 1, LANE_WIDTH, 1)
  }

  /** Squad walking right between waves. */
  private drawMarch(state: GameState, lane: LaneState) {
    const t = performance.now() / 1000
    lane.squad.forEach((id, i) => {
      const d = state.duelists[id]!
      const a = art(d.classId)
      const x = 120 - i * 22
      const fy = this.feetY(d)
      if (a) {
        const clip = a.anims.walk ?? a.still
        this.drawClip(a, clip, frameAt(clip, t + i * 0.3, true), x, fy, false, false)
      } else this.drawFallback(d.classId, x, fy, false, false)
    })
    if (lane.mode === 'duel') this.label('DUEL INCOMING', LANE_WIDTH / 2, 22, '#ffd54a')
  }

  private drawBattle(lane: LaneState, fx: LaneFx, dt: number) {
    const c = this.ctx
    const b = fx.battle!
    const units = [...b.units].sort((a, z) => this.feetY(a) - this.feetY(z))
    for (const u of units) {
      const f = this.unitFx(fx, u)
      f.hurt = Math.max(0, f.hurt - dt)
      f.t += dt
      const a = art(u.classId)
      const flip = u.side === 'enemy'
      const fy = this.feetY(u)

      if (!u.alive) {
        f.deathT = (f.deathT || 0.0001) + dt
        const clipLen = f.clip && f.anim === 'death' ? f.clip.frames.length / FPS : 0
        const fade = Math.max(0, f.deathT - clipLen)
        if (fade > 0.5) continue
        c.globalAlpha = 1 - fade / 0.5
      } else if (f.anim === 'attack' || f.anim === 'death') {
        if (!f.clip || f.t >= f.clip.frames.length / f.fps) { f.anim = 'idle'; f.clip = undefined; f.fps = FPS }
      }
      if (u.alive && f.anim !== 'attack') {
        const moving = Math.abs(u.x - f.lastX) > 0.01
        const want: Anim = moving && !b.over ? 'walk' : 'idle'
        if (f.anim !== want) { f.anim = want; f.clip = a?.anims[want] }
      }
      f.lastX = u.x

      if (a) {
        const clip = f.clip ?? (u.alive ? a.still : a.anims.death ?? a.still)
        const loop = f.anim === 'idle' || f.anim === 'walk'
        this.drawClip(a, clip, frameAt(clip, f.t, loop, f.fps), u.x, fy, flip, f.hurt > 0)
      } else this.drawFallback(u.classId, u.x, fy, flip, f.hurt > 0)
      c.globalAlpha = 1
      if (u.alive) this.bars(u, this.topY(u) - 4)
    }

    fx.projectiles = fx.projectiles.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.projectiles) {
      const x = p.x0 + (p.x1 - p.x0) * (p.t / p.ttl)
      c.fillStyle = p.color
      c.fillRect(Math.round(x) - 2, Math.round(p.y), 4, 1)
      c.fillRect(Math.round(x) - 1, Math.round(p.y) - 1, 2, 3)
    }
    fx.bursts = fx.bursts.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.bursts) {
      const k = p.t / p.ttl
      c.fillStyle = p.color
      c.globalAlpha = 1 - k
      const r = Math.round(p.r * (0.4 + k * 0.6))
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2
        c.fillRect(Math.round(p.x + Math.cos(ang) * r), Math.round(GROUND_Y + 8 + Math.sin(ang) * r * 0.3), 2, 2)
      }
      c.globalAlpha = 1
      if (k < 0.7) this.label(p.label, p.x, 3, p.color)
    }
    fx.floaters = fx.floaters.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.floaters) drawDigits(c, p.text, p.x, p.y - p.t * 12, p.color)
    if (lane.mode === 'duel') this.label('DUEL', LANE_WIDTH - 20, 3, '#ffd54a')
  }

  private drawClip(a: ArtSet, clip: Clip, i: number, x: number, feet: number, flip: boolean, flash: boolean) {
    const c = this.ctx
    const img = (flash ? clip.flash : clip.frames)[i]!
    const s = a.scale
    const w = img.width * s
    const h = img.height * s
    const y = snap(feet - clip.foot * s)
    c.save()
    c.translate(snap(x), 0)
    if (flip) c.scale(-1, 1)
    c.drawImage(img, snap(-w / 2), y, w, h)
    c.restore()
  }

  /** Procedural 16px sprite for classes without art. */
  private drawFallback(classId: string, x: number, feet: number, flip: boolean, flash: boolean) {
    const cls = getClass(classId)
    const spr = getSprite(cls.sprite, cls.palette, flip)
    this.ctx.drawImage(flash ? spr.flash : spr.normal, Math.round(x - 10), feet - 20, 20, 20)
  }

  private bars(u: Combatant, y: number) {
    const c = this.ctx
    const x = Math.round(u.x - 7)
    y = Math.round(y)
    c.fillStyle = '#1a1424'
    c.fillRect(x - 1, y - 1, 16, u.side === 'ally' ? 5 : 4)
    c.fillStyle = '#4a2a2a'
    c.fillRect(x, y, 14, 2)
    c.fillStyle = u.side === 'ally' ? '#5ad65a' : '#e04a4a'
    c.fillRect(x, y, Math.ceil((14 * u.hp) / u.maxHp), 2)
    if (u.guard < 1) { c.fillStyle = '#4fa3ff'; c.fillRect(x, y - 2, 14, 1) }
    if (u.side === 'ally') {
      c.fillStyle = '#ffd54a'
      c.fillRect(x, y + 3, Math.round((14 * u.energy) / 100), 1)
    }
  }

  private label(text: string, x: number, y: number, color: string) {
    const c = this.ctx
    c.font = '4px "Press Start 2P", monospace'
    c.textAlign = 'center'
    c.textBaseline = 'top'
    c.fillStyle = '#1a1424'
    for (const [dx, dy] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) c.fillText(text, Math.round(x) + dx!, y + dy!)
    c.fillStyle = color
    c.fillText(text, Math.round(x), y)
  }

  private drawLaneLabel(lane: LaneState, i: number) {
    this.label(`${i + 1}`, 6, 3, lane.squad.length ? '#ffffff' : '#7a7a8a')
    if (!lane.squad.length) this.label('EMPTY SQUAD', LANE_WIDTH / 2, 34, '#d9e2ec')
  }
}

function frameAt(clip: Clip, t: number, loop: boolean, fps = FPS) {
  const n = clip.frames.length
  const i = Math.floor(t * fps)
  return loop ? i % n : Math.min(n - 1, i)
}
/** Snap to whole device pixels. */
const snap = (v: number) => Math.round(v * RES) / RES
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
function projColor(classId: string) {
  return ({ mage: '#ff6a3d', wizard: '#ff3d6a', priest: '#ffe27a', bishop: '#9fffe0', wraith: '#9fe0ff', drake: '#ff6a3d' } as Record<string, string>)[classId] ?? '#d9e2ec'
}
