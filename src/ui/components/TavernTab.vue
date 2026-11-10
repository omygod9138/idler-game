<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '@/stores/game'
import { gatherCandidates, gatherCost, hire, getClass, getPassive, computeStats } from '@/engine'
import Portrait from './Portrait.vue'

const game = useGame()
const s = computed(() => game.state)
</script>

<template>
  <section class="panel">
    <p class="h">TAVERN · LV {{ s.facilities.tavern }}</p>
    <p class="muted">Passers-by looking for a guild. Higher Tavern level → more candidates and better Potential (F→S, ×0.75–×1.25 stats).</p>
    <button class="btn primary" @click="game.act(gatherCandidates)">Gather candidates ({{ gatherCost(s) }}g)</button>
    <div class="cands">
      <div v-for="c in s.candidates" :key="c.id" class="cand">
        <Portrait :class-id="c.classId" :scale="4" />
        <div class="info">
          <div>{{ c.name }}</div>
          <div>{{ getClass(c.classId).name }} · <b :class="'pot-' + c.potential">{{ c.potential }}</b></div>
          <div :title="getPassive(c.passive)?.desc">Passive: {{ getPassive(c.passive)?.name ?? '—' }}</div>
          <div class="muted">HP {{ computeStats(c.classId, 1, c.potential, [], c.passive).hp }} · ATK {{ computeStats(c.classId, 1, c.potential, [], c.passive).atk }}</div>
        </div>
        <button class="btn sm" :disabled="s.gold < c.price" @click="game.act(hire, c.id)">Hire {{ c.price.toLocaleString() }}g</button>
      </div>
      <p v-if="!s.candidates.length" class="muted">Nobody here. Gather to attract candidates.</p>
    </div>
  </section>
</template>

<style scoped>
.cands { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; margin-top: 12px; }
.cand { display: flex; align-items: center; gap: 10px; background: #241c30; border: 2px solid var(--line); padding: 8px; }
.info { flex: 1; line-height: 1.05; }
</style>
