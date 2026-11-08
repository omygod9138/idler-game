<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '@/stores/game'
import { canDuel, outpost, activeLanes, challengeDuel } from '@/engine'

const game = useGame()
const s = computed(() => game.state)
const o = computed(() => outpost(s.value))
const pct = computed(() => (100 * s.value.followers) / o.value.followersRequired)
const duelReady = computed(() => canDuel(s.value))
const dueling = computed(() => s.value.lanes.some((l) => l.mode === 'duel'))

function duel() {
  const lane = activeLanes(s.value).find((l) => l.squad.length)
  game.act(challengeDuel, lane ? lane.index : 0)
}
</script>

<template>
  <header class="panel top">
    <div class="title">IDLE DUELISTS</div>
    <div class="res">
      <span class="gold">● {{ Math.floor(s.gold).toLocaleString() }}</span>
      <span title="Ore">◆ {{ s.materials.ore }}</span>
      <span title="EXP Tomes">▤ {{ s.materials.tome }}</span>
      <span title="Bronze Badges">✪ {{ s.materials.bronzeBadge }}</span>
    </div>
    <div class="outpost">
      <div class="row"><span class="tag">{{ o.name }}</span><span class="muted">vs {{ o.duel.guild }}</span></div>
      <div class="row">
        <div class="bar fol"><i :style="{ width: pct + '%' }" /></div>
        <span>{{ s.followers }}/{{ o.followersRequired }} followers</span>
      </div>
    </div>
    <button class="btn primary" :disabled="!duelReady || dueling" @click="duel">
      {{ dueling ? 'DUELING…' : 'CHALLENGE DUEL' }}
    </button>
  </header>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.title { font-family: var(--px); font-size: 14px; color: var(--gold); text-shadow: 2px 2px 0 #8a4b2a; }
.res { display: flex; gap: 16px; font-size: 22px; }
.gold { color: var(--gold); }
.outpost { flex: 1; min-width: 260px; display: grid; gap: 4px; }
.fol { width: 200px; }
</style>
