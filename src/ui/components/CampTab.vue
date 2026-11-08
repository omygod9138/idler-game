<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGame } from '@/stores/game'
import { FACILITY_INFO, QUARTERS, facilityUpgradeCost, upgradeFacility, type FacilityId } from '@/engine'

const game = useGame()
const s = computed(() => game.state)
const ids = Object.keys(FACILITY_INFO) as FacilityId[]
const armed = ref(false)
function reset() {
  if (!armed.value) { armed.value = true; setTimeout(() => (armed.value = false), 3000); return }
  armed.value = false
  game.resetGame()
}
const nextQ = computed(() => QUARTERS[s.value.facilities.quarters + 1])
</script>

<template>
  <section class="panel">
    <p class="h">CAMP FACILITIES</p>
    <div class="facs">
      <div v-for="id in ids" :key="id" class="fac">
        <div class="row"><b>{{ FACILITY_INFO[id].name }}</b><span class="tag">LV {{ s.facilities[id] }}/{{ FACILITY_INFO[id].max }}</span></div>
        <div class="muted">{{ FACILITY_INFO[id].desc }}</div>
        <div v-if="id === 'quarters' && nextQ" class="muted">Next: Lv cap {{ nextQ.levelCap }}, {{ nextQ.squads }} squads, COST {{ nextQ.cost }}</div>
        <div v-if="id === 'tavern'" class="muted">Passive: {{ (s.facilities.tavern * 0.5).toFixed(1) }} g/s</div>
        <button v-if="s.facilities[id] < FACILITY_INFO[id].max" class="btn sm primary" @click="game.act(upgradeFacility, id)">
          Upgrade · {{ facilityUpgradeCost(id, s.facilities[id]).gold.toLocaleString() }}g
          <template v-if="facilityUpgradeCost(id, s.facilities[id]).ore"> + {{ facilityUpgradeCost(id, s.facilities[id]).ore }} ore</template>
        </button>
        <span v-else class="muted">MAX</span>
      </div>
    </div>
    <div class="row" style="margin-top: 20px">
      <button class="btn sm" @click="game.persist()">Save now</button>
      <button class="btn sm" title="Dev: simulate 5 minutes live" @click="game.fastForward(300)">Dev: +5 min</button>
      <button class="btn sm danger" @click="reset">{{ armed ? 'Click again to wipe' : 'Reset save' }}</button>
    </div>
  </section>
</template>

<style scoped>
.facs { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.fac { display: grid; gap: 6px; background: #241c30; border: 2px solid var(--line); padding: 10px; align-content: start; }
.fac .btn { justify-self: start; }
</style>
