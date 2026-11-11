import type { BattleState, Combatant, GameState, LaneState, SkillKind } from '@/engine/types'
import { getClass } from '@/engine/data/classes'
import { LANE_WIDTH } from '@/engine/battle'
import { OUTPOSTS } from '@/engine/data/world'
import { drawDigits, getSprite } from './sprites'
import { art, clipTicks, type Anim, type ArtSet, type Clip } from './art'

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
/** Sword smear: a crescent swept from behind the head down to the front, around (x, y). */
interface Slash { x: number; y: number; dir: 1 | -1; r: number; t: number; ttl: number }
/** Impact star + chips at the point of contact. */
interface Spark { x: number; y: number; dir: 1 | -1; t: number; ttl: number; big: boolean; rays: { a: number; len: number }[] }
/** Work held back until an attack clip reaches its hit frame. */
interface Later { t: number; run: () => void }
interface UnitFx { anim: Anim; clip?: Clip; t: number; fps: number; hurt: number; flashCd: number; lastX: number; deathT: number; moveT: number }

/** Keep walking this long after the last position change: the sim moves units at 10 Hz, the renderer draws at ~60 Hz. */
const WALK_HOLD = 0.2

interface LaneFx {
  battle: BattleState | null
  /** seconds since `battle` ended (lane.battle went null) */
  after: number
  floaters: Floater[]
  projectiles: Projectile[]
  bursts: Burst[]
  slashes: Slash[]
  sparks: Spark[]
  later: Later[]
  /** seconds of hit shake left */
  shake: number
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
      const fx = (this.lanes[i] ??= { battle: null, after: 0, floaters: [], projectiles: [], bursts: [], slashes: [], sparks: [], later: [], shake: 0, fx: new Map(), scroll: 0 })
      if (lane.battle && fx.battle !== lane.battle) {
        fx.battle = lane.battle; fx.after = 0; fx.fx.clear(); fx.projectiles = []; fx.bursts = []
        fx.slashes = []; fx.sparks = []; fx.later = []; fx.shake = 0
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
    // target uid → delay until the swing aimed at it lands (melee clips with a hit frame)
    const landing = new Map<number, number>()
    const at = (uid: number, run: () => void) => {
      const t = landing.get(uid)
      if (t) fx.later.push({ t, run })
      else run()
    }
    for (const e of b.events.splice(0)) {
      switch (e.t) {
        case 'attack': {
          const s = byId.get(e.src), d = byId.get(e.dst)
          if (!s || !d) break
          const sf = this.play(fx, s, 'attack')
          if (e.ranged) fx.projectiles.push({ x0: s.x, x1: d.x, y: this.midY(s), t: 0, ttl: 0.22, color: projColor(s.classId) })
          else if (sf.clip?.hit !== undefined) {
            const t = clipTicks(sf.clip, sf.clip.hit) / sf.fps
            landing.set(d.uid, t)
            // the smear starts at the end of the wind-up hold so it reads as the swing itself, not an afterimage
            if (sf.clip.vfx === 'slash') fx.later.push({ t: Math.max(0.001, t - 1 / sf.fps), run: () => this.slash(fx, s, d) })
          }
          break
        }
        case 'damage': {
          const d = byId.get(e.dst)
          if (!d) break
          at(d.uid, () => {
            const uf = this.unitFx(fx, d)
            // short flash with a cooldown: at high hit rates a unit would otherwise stay white
            if (uf.flashCd <= 0) { uf.hurt = 0.06; uf.flashCd = 0.3 }
            if (fx.floaters.length > 10) fx.floaters.shift()
            fx.floaters.push({ x: d.x + rnd(-6, 6), y: this.topY(d) - 6 - rnd(0, 4), text: `${e.amount}${e.crit ? '!' : ''}`, color: e.crit ? '#ffd54a' : d.side === 'ally' ? '#ff6a6a' : '#ffffff', t: 0, ttl: 0.6 })
            if (e.crit) for (const sp of fx.sparks) if (sp.t === 0) sp.big = true
          })
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
          if (d) at(d.uid, () => { this.play(fx, d, 'death'); this.unitFx(fx, d).deathT = 0.0001 })
          break
        }
      }
    }
  }

  private unitFx(fx: LaneFx, u: Combatant): UnitFx {
    let f = fx.fx.get(u.uid)
    if (!f) { f = { anim: 'idle', t: Math.random(), fps: FPS, hurt: 0, flashCd: 0, lastX: u.x, deathT: 0, moveT: 0 }; fx.fx.set(u.uid, f) }
    return f
  }

  /** Swing lands: smear on the attacker, spark + shake on the target. */
  private slash(fx: LaneFx, s: Combatant, d: Combatant) {
    const dir = d.x >= s.x ? 1 : -1
    const h = this.height(s.classId)
    fx.slashes.push({ x: s.x + dir * h * 0.1, y: this.feetY(s) - h * 0.52, dir, r: h * 0.5, t: 0, ttl: 0.24 })
    // spray mostly away from the attacker, a few strays back
    const rays = Array.from({ length: 11 }, (_, i) => ({ a: i < 8 ? rnd(-1.2, 1.0) : rnd(2.2, 4.0), len: rnd(5, 11) }))
    fx.sparks.push({ x: d.x - dir * this.height(d.classId) * 0.18, y: this.midY(d), dir, t: 0, ttl: 0.3, big: false, rays })
    fx.shake = Math.max(fx.shake, 0.1)
  }

  private play(fx: LaneFx, u: Combatant, anim: Anim, named?: RegExp): UnitFx {
    const f = this.unitFx(fx, u)
    const a = art(u.classId)
    f.anim = anim
    f.t = 0
    f.clip = a ? (named && Object.entries(a.extra).find(([n]) => named.test(n))?.[1]) || a.anims[anim] : undefined
    // an attack swing must finish before the next one starts
    f.fps = anim === 'attack' && f.clip ? Math.max(FPS, clipTicks(f.clip) / (u.stats.interval * 0.9)) : FPS
    return f
  }

  // ---------- geometry ----------

  /** Every unit stands on one baseline; rows differ only in x. */
  private feetY(_u: { classId: string }) {
    return GROUND_Y + 12
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
    fx.later = fx.later.filter((l) => (l.t -= dt) > 0 || (l.run(), false))
    fx.shake = Math.max(0, fx.shake - dt)
    c.save()
    if (fx.shake > 0) c.translate(fx.shake > 0.05 ? 1 : -0.5, 0)
    const units = [...b.units]
    for (const u of units) {
      const f = this.unitFx(fx, u)
      f.hurt = Math.max(0, f.hurt - dt)
      f.flashCd -= dt
      f.t += dt
      const a = art(u.classId)
      const flip = u.side === 'enemy'
      const fy = this.feetY(u)

      // a unit killed by a swing still in flight stays up until the blow lands
      const shown = u.alive || !f.deathT
      if (!shown) {
        f.deathT += dt
        const clipLen = f.clip && f.anim === 'death' ? clipTicks(f.clip) / FPS : 0
        const fade = Math.max(0, f.deathT - clipLen)
        if (fade > 0.5) continue
        c.globalAlpha = 1 - fade / 0.5
      } else if (f.anim === 'attack' || f.anim === 'death') {
        if (!f.clip || f.t >= clipTicks(f.clip) / f.fps) { f.anim = 'idle'; f.clip = undefined; f.fps = FPS }
      }
      // Positions only change on sim ticks, so most drawn frames see no movement: hold the walk briefly.
      f.moveT = Math.abs(u.x - f.lastX) > 0.01 ? WALK_HOLD : Math.max(0, f.moveT - dt)
      if (shown && f.anim !== 'attack' && f.anim !== 'death') {
        const want: Anim = f.moveT > 0 && !b.over && u.alive ? 'walk' : 'idle'
        if (f.anim !== want) { f.anim = want; f.clip = a?.anims[want] }
      }
      f.lastX = u.x

      if (a) {
        const clip = f.clip ?? (shown ? a.still : a.anims.death ?? a.still)
        const loop = f.anim === 'idle' || f.anim === 'walk'
        this.drawClip(a, clip, frameAt(clip, f.t, loop, f.fps), u.x, fy, flip, f.hurt > 0)
      } else this.drawFallback(u.classId, u.x, fy, flip, f.hurt > 0)
      c.globalAlpha = 1
      if (shown) this.bars(u, this.topY(u) - 4)
    }
    fx.slashes = fx.slashes.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.slashes) this.drawSlash(p)
    fx.sparks = fx.sparks.filter((p) => (p.t += dt) < p.ttl)
    for (const p of fx.sparks) this.drawSpark(p)
    c.restore()

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

  /**
   * Crescent smear in half-unit (1 device px) pixels: steel-blue rim, white leading edge, thick near the
   * front and tapering into the tail. The head races down in the first third, then the tail eats it away.
   */
  private drawSlash(p: Slash) {
    const c = this.ctx
    const k = p.t / p.ttl
    const A0 = -1.8, A1 = 0.45 // radians, screen space (y down), mirrored by dir: from behind the head to low front
    const head = Math.min(1, k * 4.5)
    const tail = Math.max(0, (k - 0.3) / 0.7) ** 0.7
    const px = 0.5
    for (let s = tail; s <= head; s += 0.006) {
      const a = A0 + (A1 - A0) * s
      // thickness grows toward the head, thins at the very tip; shrinks as the smear dies
      const w = p.r * 0.5 * Math.sin(Math.min(1, s / 0.85) * Math.PI * 0.5) * (s > 0.92 ? (1 - s) / 0.08 : 1) * (1 - tail * 0.6)
      const cos = Math.cos(a) * p.dir, sin = Math.sin(a)
      for (let d = 0; d <= w; d += px) {
        const rr = p.r - d
        c.fillStyle = d < px * 1.5 ? '#ffffff' : d < w * 0.35 ? '#ffd9c4' : d < w * 0.7 ? '#ff5240' : '#b0182c'
        c.fillRect(Math.round((p.x + cos * rr) / px) * px, Math.round((p.y + sin * rr) / px) * px, px, px)
      }
    }
    // speed streaks thrown forward off the blade's path once it lands
    if (head >= 1 && k < 0.8) {
      const reach = p.r * (0.6 + k * 1.2)
      for (const [dy, len, col] of [[-3, 1, '#ff5240'], [0, 1.3, '#ffffff'], [2.5, 0.8, '#b0182c']] as const) {
        const y = Math.round((p.y + p.r * 0.35 + dy) / px) * px
        const x0 = p.x + p.dir * p.r * 0.7
        c.fillStyle = col
        c.fillRect(Math.min(x0, x0 + p.dir * reach * len), y, Math.abs(reach * len * (1 - k)), px)
      }
    }
  }

  /** White impact star that pops then shrinks, with a red streak spray and falling droplets. */
  private drawSpark(p: Spark) {
    const c = this.ctx
    const k = p.t / p.ttl
    const px = 0.5
    const q = (v: number) => Math.round(v / px) * px
    const x = q(p.x), y = q(p.y)
    const len = (p.big ? 11 : 7) * (k < 0.2 ? k / 0.2 : Math.max(0, 1 - (k - 0.2) / 0.5))
    for (let i = -len; i <= len; i += px) {
      c.fillStyle = Math.abs(i) > len * 0.6 ? '#ffd54a' : '#ffffff'
      c.fillRect(x + i, y, px, px * (Math.abs(i) < len * 0.3 ? 2 : 1))
      if (Math.abs(i) <= len * 0.75) c.fillRect(x, y + i * 0.8, px * (Math.abs(i) < len * 0.3 ? 2 : 1), px)
    }
    if (k < 0.35) { c.fillStyle = '#ffffff'; c.fillRect(x - px * 2, y - px * 2, px * 5, px * 5) }
    // streaks: each ray shoots out, its tail chases the head, then drops as droplets
    for (const r of p.rays) {
      const ang = r.a
      const cos = Math.cos(ang) * p.dir, sin = Math.sin(ang)
      const headD = 2 + r.len * Math.min(1, k * 2.2)
      const tailD = 2 + r.len * Math.max(0, k * 2.2 - 0.6)
      for (let d = tailD; d <= headD; d += px) {
        c.fillStyle = d > headD - 1 ? '#ff8a6a' : '#e0283a'
        c.fillRect(q(x + cos * d), q(y + sin * d), px, px)
      }
      if (k > 0.45) {
        const fall = (k - 0.45) * 22
        c.fillStyle = '#9a1424'
        c.fillRect(q(x + cos * headD), q(y + sin * headD + fall * fall * 0.15), px, px)
      }
    }
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
  if (!clip.hold) {
    const i = Math.floor(t * fps)
    return loop ? i % n : Math.min(n - 1, i)
  }
  const total = clipTicks(clip)
  let tick = t * fps
  if (loop) tick %= total
  for (let i = 0; i < n; i++) if ((tick -= clip.hold[i]!) < 0) return i
  return n - 1
}
/** Snap to whole device pixels. */
const snap = (v: number) => Math.round(v * RES) / RES
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
function projColor(classId: string) {
  return ({ mage: '#ff6a3d', wizard: '#ff3d6a', priest: '#ffe27a', bishop: '#9fffe0', wraith: '#9fe0ff', drake: '#ff6a3d' } as Record<string, string>)[classId] ?? '#d9e2ec'
}
