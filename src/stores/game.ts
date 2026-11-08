import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef, triggerRef } from 'vue'
import * as E from '@/engine'
import type { GameState, OfflineReport } from '@/engine'

const LOGIC_MS = 100
const UI_MS = 250
const AUTOSAVE_MS = 15000
/** gaps longer than this (tab hidden / sleep) are settled with offline estimation */
const MAX_LIVE_CATCHUP = 5

/**
 * The engine state is kept as a raw (non-reactive) object for performance —
 * the battle sim mutates it 10x/s. Vue re-renders on triggerRef() at UI_MS.
 */
export const useGame = defineStore('game', () => {
  const loaded = E.load()
  const state = shallowRef<GameState>(markRaw(loaded.state))
  const offline = ref<OfflineReport | null>(loaded.offline)
  const toast = ref<{ text: string; id: number } | null>(null)
  const selectedId = ref<string | null>(Object.keys(loaded.state.duelists)[0] ?? null)

  let lastTick = Date.now()
  let timers: number[] = []

  function refresh() { triggerRef(state) }

  function start() {
    stop()
    lastTick = Date.now()
    timers.push(window.setInterval(loop, LOGIC_MS))
    timers.push(window.setInterval(refresh, UI_MS))
    timers.push(window.setInterval(persist, AUTOSAVE_MS))
    window.addEventListener('beforeunload', persist)
    document.addEventListener('visibilitychange', onVisibility)
  }

  function stop() {
    timers.forEach(clearInterval)
    timers = []
    window.removeEventListener('beforeunload', persist)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  function loop() {
    const now = Date.now()
    let dt = (now - lastTick) / 1000
    lastTick = now
    if (dt > MAX_LIVE_CATCHUP) {
      const r = E.applyOffline(state.value, dt)
      if (r) offline.value = r
      dt = 0
    }
    while (dt > 0) {
      const step = Math.min(dt, 0.25)
      E.tick(state.value, step)
      dt -= step
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') persist()
  }

  function persist() { E.save(state.value) }

  /** Run an engine action; surface its error as a toast. */
  function act<A extends unknown[]>(fn: (s: GameState, ...a: A) => E.ActionResult, ...args: A): boolean {
    const err = fn(state.value, ...args)
    if (err) toast.value = { text: err, id: Date.now() }
    refresh()
    return !err
  }

  function resetGame() {
    E.wipe()
    state.value = markRaw(E.newGame())
    selectedId.value = Object.keys(state.value.duelists)[0] ?? null
    offline.value = null
    refresh()
  }

  // Dev helper: fast-forward simulated time (live sim, not estimation)
  function fastForward(seconds: number) {
    for (let t = 0; t < seconds; t += 0.25) E.tick(state.value, 0.25)
    refresh()
  }

  return { state, offline, toast, selectedId, start, stop, act, refresh, persist, resetGame, fastForward }
})
