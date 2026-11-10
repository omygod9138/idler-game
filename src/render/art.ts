// PixelLab character art, shared with the auto-battler project (src/assets/sprites/<id>/).
// Only east-facing frames are bundled; enemies are mirrored at draw time.
// A class without its own art can borrow another's with a hue shift (see ART).

export type Anim = 'idle' | 'walk' | 'attack' | 'death'

export interface Clip {
  frames: HTMLCanvasElement[]
  /** white silhouettes for hit flash, same order as frames */
  flash: HTMLCanvasElement[]
  /** row just below the feet in the first frame */
  foot: number
  /** relative hold per frame (1 = one tick); absent = every frame holds 1 */
  hold?: number[]
  /** frame where the blow lands: hit reactions and VFX sync to it */
  hit?: number
  /** procedural effect drawn at the hit frame */
  vfx?: 'slash'
}

/** Ticks a clip lasts, and ticks before frame `i` starts. */
export const clipTicks = (c: Clip, upTo = c.frames.length) =>
  c.hold ? c.hold.slice(0, upTo).reduce((a, b) => a + b, 0) : upTo

export interface ArtSet {
  still: Clip
  anims: Partial<Record<Anim, Clip>>
  /** named extra clips (e.g. skill animations) */
  extra: Record<string, Clip>
  /** opaque height of the still, art px */
  visible: number
  /** art px → world units */
  scale: number
}

interface PixelLabExport {
  states?: { frames?: { rotations?: Record<string, string>; animations?: Record<string, unknown> } }[]
}

const metas = import.meta.glob<PixelLabExport>('../assets/sprites/*/metadata.json', { eager: true, import: 'default' })
const pngs = import.meta.glob<string>(
  ['../assets/sprites/*/*/rotations/east.png', '../assets/sprites/*/*/animations/*/east/*.png'],
  { eager: true, query: '?url', import: 'default' },
)

/** Which art each class uses. `hue` rotates saturated, non-skin colours (degrees). */
export const ART: Record<string, { id: string; hue?: number }> = {
  warrior: { id: 'warrior' },
  knight: { id: 'warrior', hue: 200 },
  mage: { id: 'mage' },
  wizard: { id: 'mage', hue: 70 },
  priest: { id: 'mage', hue: 175 },
  bishop: { id: 'mage', hue: 140 },
  archer: { id: 'ranger' },
  ranger: { id: 'ranger', hue: 260 },
  slime: { id: 'slime' }, wolf: { id: 'wolf' }, orc: { id: 'orc' }, skeleton: { id: 'skeleton' },
  wraith: { id: 'wraith' }, troll: { id: 'troll' }, draugr: { id: 'draugr' }, drake: { id: 'drake' }, jotunn: { id: 'jotunn' },
}

/** Clip-name keywords → role. First matching clip per role wins. */
const ROLES: [Anim, RegExp][] = [
  ['death', /death|dying|die|fall/i],
  ['attack', /attack|slash|strike|stab|shoot|cast|fireball/i],
  ['walk', /walk|run|march/i],
  ['idle', /idle|breath|stand/i],
]

/**
 * Hand timing for generated clips: pick/reorder source frames, hold weights, impact frame.
 * `role` makes the clip that art's default for that anim.
 */
const TUNING: { art: string; clip: RegExp; frames?: number[]; hold: number[]; hit: number; vfx?: Clip['vfx']; role?: Anim }[] = [
  // Overhead slash (v2 frames, shield kept). Quick lift, blade cocked back over the shoulder and held
  // (anticipation; one duplicate hold frame dropped), fast snap through, hit-stop on contact, slow settle.
  { art: 'warrior', clip: /^overhead-slash-v2$/, frames: [0, 1, 2, 3, 5, 6, 7, 8, 9], hold: [0.8, 0.8, 0.8, 1, 2.4, 0.7, 2.2, 1.4, 1.2], hit: 6, vfx: 'slash', role: 'attack' },
]

/** On-screen height in world units (lane art is drawn at 2 canvas px per world unit). */
const HERO_HEIGHT = 28
const MOB_HEIGHT: Record<string, number> = {
  slime: 14, wolf: 17, skeleton: 27, orc: 32, wraith: 30, troll: 37, draugr: 36, drake: 42, jotunn: 46,
}

const sets = new Map<string, ArtSet>()
export const art = (classId: string): ArtSet | undefined => sets.get(classId)

function eastFrames(entry: unknown): string[] {
  if (Array.isArray(entry)) return entry.filter((f): f is string => typeof f === 'string')
  if (entry && typeof entry === 'object') return eastFrames((entry as Record<string, unknown>).east)
  return []
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error(`Could not load ${url}`))
    i.src = url
  })

function toCanvas(img: CanvasImageSource & { width: number; height: number }) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0)
  return c
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

/** Palette swap: rotate hue of saturated pixels, leaving skin tones and greys alone. */
function hueShift(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const c = toCanvas(src)
  const g = c.getContext('2d')!
  const im = g.getImageData(0, 0, c.width, c.height)
  const d = im.data
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const [h, s, l] = rgbToHsl(d[i]!, d[i + 1]!, d[i + 2]!)
    if (s < 0.25) continue
    const skin = h >= 12 && h <= 40 && l > 0.45 && s < 0.75
    if (skin) continue
    const [r, gg, b] = hslToRgb((h + deg + 360) % 360, s, l)
    d[i] = r; d[i + 1] = gg; d[i + 2] = b
  }
  g.putImageData(im, 0, 0)
  return c
}

function silhouette(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = toCanvas(src)
  const g = c.getContext('2d')!
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  return c
}

function bounds(c: HTMLCanvasElement) {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let top = c.height, bottom = -1
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3]! > 0) { top = Math.min(top, y); bottom = y; break }
  return bottom < 0 ? { top: 0, bottom: c.height - 1 } : { top, bottom }
}

function makeClip(frames: HTMLCanvasElement[]): Clip {
  return { frames, flash: frames.map(silhouette), foot: bounds(frames[0]!).bottom + 1 }
}

/** Raw frames per art id (no hue), loaded once and shared by every class using that art. */
type RawSet = { still: HTMLCanvasElement[]; clips: Record<string, HTMLCanvasElement[]> }

async function loadRaw(dir: string, meta: PixelLabExport): Promise<RawSet | null> {
  const url = (p: string) => pngs[`${dir}/${p}`]
  const clips: RawSet['clips'] = {}
  let stillUrl: string | undefined
  for (const st of meta.states ?? []) {
    stillUrl ??= st.frames?.rotations?.east ? url(st.frames.rotations.east) : undefined
    for (const [name, entry] of Object.entries(st.frames?.animations ?? {})) {
      const urls = eastFrames(entry).map(url).filter((u): u is string => !!u)
      if (urls.length && !clips[name]) clips[name] = (await Promise.all(urls.map(loadImage))).map(toCanvas)
    }
  }
  if (!stillUrl) return null
  return { still: [toCanvas(await loadImage(stillUrl))], clips }
}

function buildSet(classId: string, raw: RawSet, hue?: number): ArtSet {
  const tint = (fs: HTMLCanvasElement[]) => (hue ? fs.map((f) => hueShift(f, hue)) : fs)
  const anims: ArtSet['anims'] = {}
  const extra: ArtSet['extra'] = {}
  const id = ART[classId]!.id
  const forced: ArtSet['anims'] = {}
  for (const [name, frames] of Object.entries(raw.clips)) {
    const tune = TUNING.find((t) => t.art === id && t.clip.test(name))
    const picked = tune?.frames ? tune.frames.map((i) => frames[i]!).filter(Boolean) : frames
    const clip = makeClip(tint(picked))
    if (tune) Object.assign(clip, { hold: tune.hold.slice(0, picked.length), hit: tune.hit, vfx: tune.vfx })
    extra[name] = clip
    if (tune?.role) forced[tune.role] = clip
    const role = ROLES.find(([, re]) => re.test(name))?.[0]
    if (role && !anims[role]) anims[role] = clip
  }
  Object.assign(anims, forced)
  const still = makeClip(tint(raw.still))
  const { top, bottom } = bounds(still.frames[0]!)
  const visible = bottom + 1 - top
  return { still, anims, extra, visible, scale: (MOB_HEIGHT[id] ?? HERO_HEIGHT) / visible }
}

let loading: Promise<void> | null = null

/** Load all art. Await once before mounting the UI. */
export function loadArt(): Promise<void> {
  loading ??= (async () => {
    const raws = new Map<string, RawSet>()
    await Promise.all(
      Object.entries(metas).map(async ([path, meta]) => {
        const dir = path.slice(0, path.lastIndexOf('/'))
        const id = dir.slice(dir.lastIndexOf('/') + 1)
        try {
          const r = await loadRaw(dir, meta)
          if (r) raws.set(id, r)
        } catch (e) {
          console.warn(`Art "${id}" not loaded`, e)
        }
      }),
    )
    for (const [classId, a] of Object.entries(ART)) {
      const raw = raws.get(a.id)
      if (raw) sets.set(classId, buildSet(classId, raw, a.hue))
    }
  })()
  return loading
}

/** Cropped still as data URL, for UI portraits. */
export function artPortrait(classId: string, size: number): string | null {
  const a = sets.get(classId)
  if (!a) return null
  const f = a.still.frames[0]!
  const { top, bottom } = bounds(f)
  const h = bottom + 1 - top
  const side = Math.max(h, 40)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  const k = size / side
  g.drawImage(f, 0, top - (side - h), f.width, side, (size - f.width * k) / 2, 0, f.width * k, size)
  return c.toDataURL()
}
