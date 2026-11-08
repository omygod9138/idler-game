<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '@/stores/game'
import { OUTPOSTS, getClass } from '@/engine'
import Portrait from './Portrait.vue'

const game = useGame()
const s = computed(() => game.state)
</script>

<template>
  <section class="panel">
    <p class="h">THE CONTINENT</p>
    <ol class="road">
      <li v-for="(o, i) in OUTPOSTS" :key="o.id" :class="{ cur: i === s.outpostIdx, done: i < s.duelsWon, locked: i > s.outpostIdx }">
        <div class="row">
          <span class="tag">{{ i < s.duelsWon ? '✓' : i === s.outpostIdx ? '►' : '🔒' }}</span>
          <b>{{ o.name }}</b>
          <span class="muted">Lv {{ o.levelMin }}–{{ o.levelMax }} · {{ o.followersRequired }} followers</span>
        </div>
        <div class="row duel">
          <span class="muted">Duel: {{ o.duel.guild }}</span>
          <span v-for="(e, k) in o.duel.squad" :key="k" class="row en">
            <Portrait :class-id="e.classId" :scale="2" />
            <small>{{ getClass(e.classId).name }} {{ e.level }}</small>
          </span>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.road { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
li { background: #241c30; border: 2px solid var(--line); padding: 8px; }
li.cur { border-color: var(--gold); }
li.locked { opacity: .5; }
.duel { margin-top: 4px; }
.en { gap: 4px; }
</style>
