// Procedural 16x16 pixel sprites: a char-map template + per-class palette + weapon overlay.
// No image assets needed; swap for real sprite sheets later by replacing getSprite().

type Palette = Record<string, string>

const HUMAN = [
  '................',
  '.....oooooo.....',
  '....ohhhhhho....',
  '....ohhhhhhho...',
  '....osssseso....',
  '....osssssso....',
  '.....osssso.....',
  '....obbbbbbo....',
  '...obbcbbcbbo...',
  '...osbbbbbbso...',
  '....obbbbbbo....',
  '....occcccco....',
  '....olloollo....',
  '....oll..llo....',
  '...oddo..oddo...',
  '...oooo..oooo...',
]

const SLIME = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '......oooo......',
  '....oobbbboo....',
  '...obbcbbbbbo...',
  '..obbcbbbbbbbo..',
  '..obbbbbebbebo..',
  '.obbbbbbebbebbo.',
  '.obbbbbbbbbbbbo.',
  '.obbbbbbbbbbbbo.',
  '..oddddddddddo..',
  '...oooooooooo...',
]

const BAT = [
  '................',
  '................',
  '................',
  '.o............o.',
  '.oo....oo....oo.',
  '.obo..obbo..obo.',
  '.obbo.obbo.obbo.',
  '.obbbobebeobbbo.',
  '.obbbbbbbbbbbbo.',
  '..obbcbbbbcbbo..',
  '...oo.obbo.oo...',
  '.......oo.......',
  '................',
  '................',
  '................',
  '................',
]

const WEAPONS: Record<string, string[]> = {
  sword: [
    '..............w.', '..............w.', '..............w.', '..............w.',
    '..............w.', '.............kwk', '..............k.',
  ],
  shield: [
    '', '', '', '', '', '', '', '..gg............', '.gwwg...........', '.gwwg...........', '.gwwg...........', '..gg............',
  ],
  staff: [
    '.............g..', '............ggg.', '.............g..', '.............k..', '.............k..',
    '.............k..', '.............k..', '.............k..', '.............k..', '.............k..',
    '.............k..', '.............k..', '.............k..',
  ],
  holy: [
    '.............w..', '............wgw.', '.............w..', '.............k..', '.............k..',
    '.............k..', '.............k..', '.............k..', '.............k..', '.............k..',
    '.............k..', '.............k..',
  ],
  bow: [
    '', '', '', '.............k..', '..............k.', '.............wk.', '.............w.k',
    '.............w.k', '.............w.k', '.............wk.', '..............k.', '.............k..',
  ],
  club: [
    '', '', '', '', '..............kk', '.............kkk', '..............k.', '.............k..', '............k...',
  ],
}

const BASE: Palette = { o: '#1a1424', s: '#f2c9a0', e: '#1a1424', d: '#4a3326', w: '#d9e2ec', k: '#8a5a32', g: '#ffd54a' }

const PALETTES: Record<string, Palette> = {
  warrior: { ...BASE, h: '#8a4b2a', b: '#b8333a', c: '#e8c547', l: '#4b4f6b' },
  knight: { ...BASE, h: '#a8b3c4', b: '#5d6f8f', c: '#e8c547', l: '#3a4258', g: '#4fa3ff' },
  mage: { ...BASE, h: '#3b3ea8', b: '#4b4fc9', c: '#9fd3ff', l: '#2a2b6b', g: '#ff6a3d' },
  wizard: { ...BASE, h: '#5a2a8a', b: '#7b3fbf', c: '#ffd54a', l: '#3a1d5c', g: '#ff3d6a' },
  priest: { ...BASE, h: '#f2e6c9', b: '#f2f2f2', c: '#e8c547', l: '#c9c9d9', g: '#ffe27a' },
  bishop: { ...BASE, h: '#e8c547', b: '#fff6e0', c: '#b8333a', l: '#d9c9a0', g: '#9fffe0' },
  archer: { ...BASE, h: '#3f7a35', b: '#5aa04a', c: '#c9a36b', l: '#3b5a2c' },
  ranger: { ...BASE, h: '#2b4d2b', b: '#2f6e4f', c: '#e8c547', l: '#24402f' },
  goblin: { ...BASE, s: '#7bc05a', h: '#4a6b2a', b: '#7a5a3a', c: '#a07a4a', l: '#4a3a2a', e: '#ff3d3d' },
  skeleton: { ...BASE, s: '#e8e2d0', h: '#e8e2d0', b: '#cfc8b0', c: '#8a8270', l: '#b8b09a', e: '#ff3d3d' },
  slime: { ...BASE, b: '#5ac85a', c: '#b8f2a0', d: '#2f7a3a', e: '#1a1424' },
  bat: { ...BASE, b: '#5a3a7a', c: '#8a6aaa', e: '#ffd54a' },
}

const TEMPLATE: Record<string, string[]> = { human: HUMAN, slime: SLIME, bat: BAT }

const WEAPON_FOR: Record<string, string[]> = {
  warrior: ['sword'], knight: ['shield', 'sword'], goblin: ['club'],
  mage: ['staff'], wizard: ['staff'], priest: ['holy'], bishop: ['holy'],
  archer: ['bow'], ranger: ['bow'], skeleton: ['bow'],
}

export interface SpriteSet { normal: HTMLCanvasElement; flash: HTMLCanvasElement }
const cache = new Map<string, SpriteSet>()

function paint(rows: string[], pal: Palette, ctx: CanvasRenderingContext2D, flash: boolean) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!
      if (ch === '.' || ch === ' ') continue
      const col = pal[ch]
      if (!col) continue
      ctx.fillStyle = flash ? (ch === 'o' ? '#ffffff' : '#ffeaea') : col
      ctx.fillRect(x, y, 1, 1)
    }
  })
}

function build(sprite: string, palette: string, flipped: boolean, flash: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const ctx = c.getContext('2d')!
  if (flipped) { ctx.translate(16, 0); ctx.scale(-1, 1) }
  const pal = PALETTES[palette] ?? BASE
  paint(TEMPLATE[sprite] ?? HUMAN, pal, ctx, flash)
  for (const w of WEAPON_FOR[palette] ?? []) paint(WEAPONS[w]!, pal, ctx, flash)
  return c
}

export function getSprite(sprite: string, palette: string, flipped: boolean): SpriteSet {
  const key = `${sprite}:${palette}:${flipped}`
  let s = cache.get(key)
  if (!s) {
    s = { normal: build(sprite, palette, flipped, false), flash: build(sprite, palette, flipped, true) }
    cache.set(key, s)
  }
  return s
}

/** Small portrait as data URL for the Vue UI. */
export function portraitURL(sprite: string, palette: string, scale = 3): string {
  const src = getSprite(sprite, palette, false).normal
  const c = document.createElement('canvas')
  c.width = 16 * scale
  c.height = 16 * scale
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL()
}

// 3x5 pixel digits for damage numbers
export const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'], '!': ['010', '010', '010', '000', '010'],
}

export function drawDigits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  const w = text.length * 4 - 1
  let cx = Math.round(x - w / 2)
  y = Math.round(y)
  for (const ch of text) {
    const g = DIGITS[ch]
    if (g) {
      // outline
      ctx.fillStyle = '#1a1424'
      g.forEach((r, gy) => { for (let gx = 0; gx < 3; gx++) if (r[gx] === '1') ctx.fillRect(cx + gx - 1, y + gy - 1, 3, 3) })
      ctx.fillStyle = color
      g.forEach((r, gy) => { for (let gx = 0; gx < 3; gx++) if (r[gx] === '1') ctx.fillRect(cx + gx, y + gy, 1, 1) })
    }
    cx += 4
  }
}
