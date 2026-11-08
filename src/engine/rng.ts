// Deterministic RNG (mulberry32). State lives in GameState.seed so saves replay identically.
export type Rng = () => number

export function makeRng(holder: { seed: number }): Rng {
  return () => {
    let t = (holder.seed = (holder.seed + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!
