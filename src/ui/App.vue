<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useGame } from '@/stores/game'
import TopBar from './components/TopBar.vue'
import BattleView from './components/BattleView.vue'
import RosterTab from './components/RosterTab.vue'
import TavernTab from './components/TavernTab.vue'
import CampTab from './components/CampTab.vue'
import ArmoryTab from './components/ArmoryTab.vue'
import MapTab from './components/MapTab.vue'
import LogTab from './components/LogTab.vue'

const game = useGame()
const tabs = [
  { id: 'roster', label: 'Squads', comp: RosterTab },
  { id: 'tavern', label: 'Tavern', comp: TavernTab },
  { id: 'armory', label: 'Armory', comp: ArmoryTab },
  { id: 'camp', label: 'Camp', comp: CampTab },
  { id: 'map', label: 'Map', comp: MapTab },
  { id: 'log', label: 'Log', comp: LogTab },
] as const
const tab = ref<(typeof tabs)[number]['id']>('roster')

const toastVisible = ref(false)
let toastTimer = 0
watch(() => game.toast, (t) => {
  if (!t) return
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toastVisible.value = false), 2200)
})

onMounted(() => game.start())
onUnmounted(() => game.stop())

function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
</script>

<template>
  <div class="app">
    <TopBar />
    <BattleView />
    <nav class="tabs">
      <button v-for="t in tabs" :key="t.id" class="btn" :class="{ on: tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
    </nav>
    <main class="content">
      <component :is="tabs.find((t) => t.id === tab)!.comp" />
    </main>

    <div v-if="toastVisible && game.toast" class="toast panel">{{ game.toast.text }}</div>

    <div v-if="game.offline" class="modal-bg" @click.self="game.offline = null">
      <div class="panel modal">
        <p class="h">WELCOME BACK</p>
        <p>Away for <b>{{ fmtTime(game.offline.seconds) }}</b>. Your guild kept fighting:</p>
        <ul>
          <li>{{ game.offline.waves }} waves cleared</li>
          <li class="gold">+{{ game.offline.gold.toLocaleString() }} gold</li>
          <li>+{{ game.offline.followers }} followers</li>
          <li>+{{ game.offline.levels }} levels</li>
        </ul>
        <button class="btn primary" @click="game.offline = null">Collect</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app { max-width: 1460px; margin: 0 auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.content { min-height: 360px; }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); font-family: var(--px); font-size: 10px; color: var(--gold); z-index: 20; }
.modal-bg { position: fixed; inset: 0; background: #0008; display: grid; place-items: center; z-index: 30; }
.modal { min-width: 320px; }
.modal ul { padding-left: 20px; }
.gold { color: var(--gold); }
</style>
