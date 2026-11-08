import type { GameState } from './types'
import { SAVE_VERSION, applyOffline, newGame, type OfflineReport } from './game'

const KEY = 'idler-game:save'

export interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function serialize(s: GameState): string {
  // Battles are transient; drop them so saves stay small and forward-compatible.
  const copy: GameState = { ...s, lastSavedAt: Date.now(), lanes: s.lanes.map((l) => ({ ...l, battle: null, mode: 'frontier' as const })) }
  return JSON.stringify(copy)
}

export function save(s: GameState, store: Storage = localStorage) {
  s.lastSavedAt = Date.now()
  store.setItem(KEY, serialize(s))
}

export function load(store: Storage = localStorage, now = Date.now()): { state: GameState; offline: OfflineReport | null } {
  const raw = store.getItem(KEY)
  if (!raw) return { state: newGame(), offline: null }
  try {
    const s = JSON.parse(raw) as GameState
    if (s.version !== SAVE_VERSION) throw new Error('version mismatch')
    const offline = applyOffline(s, (now - s.lastSavedAt) / 1000)
    return { state: s, offline }
  } catch (e) {
    console.warn('Save corrupted or outdated, starting fresh', e)
    return { state: newGame(), offline: null }
  }
}

export function wipe(store: Storage = localStorage) { store.removeItem(KEY) }
