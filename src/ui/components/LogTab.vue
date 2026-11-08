<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '@/stores/game'

const game = useGame()
const s = computed(() => game.state)
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
</script>

<template>
  <section class="panel">
    <p class="h">EXPEDITION LOG · {{ s.stats.waves }} waves · {{ s.stats.kills }} kills</p>
    <ul>
      <li v-for="(e, i) in s.log" :key="i" :class="e.kind"><span class="muted">[{{ fmt(e.t) }}]</span> {{ e.text }}</li>
    </ul>
  </section>
</template>

<style scoped>
ul { list-style: none; padding: 0; margin: 0; max-height: 380px; overflow: auto; }
.loot { color: #4fa3ff; } .win { color: var(--gold); } .loss { color: var(--bad); }
</style>
