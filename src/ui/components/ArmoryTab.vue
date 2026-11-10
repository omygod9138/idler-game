<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGame } from '@/stores/game'
import { equip, equippedBy, forge, forgeCost, getPassive, sell, sellPrice, RARITIES, RARITY_COLOR, type Gear } from '@/engine'

const game = useGame()
const s = computed(() => game.state)
const filter = ref<'all' | 'free'>('all')
const owners = computed(() => equippedBy(s.value))
const items = computed(() =>
  Object.values(s.value.gear)
    .filter((g) => filter.value === 'all' || !owners.value[g.id])
    .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || score(b) - score(a)),
)
const score = (g: Gear) => g.hp + g.atk * 6 + g.def * 5
const selName = computed(() => (game.selectedId ? s.value.duelists[game.selectedId]?.name : null))
const fc = computed(() => forgeCost(s.value))
function sellAllCommon() {
  for (const g of Object.values(s.value.gear)) if (g.rarity === 'common' && !owners.value[g.id]) sell(s.value, g.id)
  game.refresh()
}
</script>

<template>
  <section class="panel">
    <div class="row head">
      <p class="h">ARMORY · {{ Object.keys(s.gear).length }} items</p>
      <button class="btn sm primary" @click="game.act(forge)">Forge ({{ fc.gold }}g + {{ fc.ore }} ore)</button>
      <button class="btn sm" @click="sellAllCommon">Sell unequipped commons</button>
      <button class="btn sm" :class="{ on: filter === 'free' }" @click="filter = filter === 'all' ? 'free' : 'all'">Unequipped only</button>
      <span class="muted">Equip target: <b>{{ selName ?? '—' }}</b> (select in Squads)</span>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Slot</th><th>HP</th><th>ATK</th><th>DEF</th><th>Passive</th><th>Owner</th><th></th></tr></thead>
      <tbody>
        <tr v-for="g in items" :key="g.id">
          <td :style="{ color: RARITY_COLOR[g.rarity] }">{{ g.name }}</td>
          <td class="muted">{{ g.slot }}</td>
          <td>{{ g.hp || '' }}</td><td>{{ g.atk || '' }}</td><td>{{ g.def || '' }}</td>
          <td :title="getPassive(g.passive)?.desc">{{ getPassive(g.passive)?.name ?? '' }}</td>
          <td class="muted">{{ owners[g.id] ? s.duelists[owners[g.id]!]?.name : '' }}</td>
          <td class="row">
            <button class="btn sm" :disabled="!game.selectedId" @click="game.act(equip, game.selectedId!, g.id)">Equip</button>
            <button class="btn sm" @click="game.act(sell, g.id)">Sell {{ sellPrice(g) }}g</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!items.length" class="muted">No gear yet. Enemies drop gear (15% drop, ¼ gear) or forge with ore.</p>
  </section>
</template>

<style scoped>
.head { margin-bottom: 8px; }
.head .h { margin: 0; }
table { width: 100%; border-collapse: collapse; }
th { font-family: var(--px); font-size: 8px; text-align: left; color: var(--muted); padding: 4px; border-bottom: 2px solid var(--line); }
td { padding: 3px 4px; border-bottom: 1px solid #241c30; }
</style>
