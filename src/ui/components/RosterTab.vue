<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '@/stores/game'
import {
  activeLanes, assign, dismiss, duelistStats, expToNext, getClass, power, quarters, rankUp, squadCost,
  unequip, useTome, getPassive, MAX_LANES, MAX_SQUAD, RANK_UP, SUBCLASSES_ENABLED, RARITY_COLOR, type GearSlot,
} from '@/engine'
import Portrait from './Portrait.vue'

const game = useGame()
const s = computed(() => game.state)
const q = computed(() => quarters(s.value))
const lanes = computed(() => activeLanes(s.value))
const laneOf = (id: string) => s.value.lanes.findIndex((l) => l.squad.includes(id))
const roster = computed(() =>
  Object.values(s.value.duelists)
    .map((d) => ({ d, cls: getClass(d.classId), st: duelistStats(d, s.value.gear), lane: laneOf(d.id) }))
    .sort((a, b) => power(b.st) - power(a.st)),
)
const sel = computed(() => roster.value.find((r) => r.d.id === game.selectedId) ?? roster.value[0])
const slots: GearSlot[] = ['weapon', 'armor', 'accessory']
</script>

<template>
  <div class="layout">
    <section class="panel">
      <p class="h">SQUADS · COST LIMIT {{ q.cost }} · LV CAP {{ q.levelCap }}</p>
      <div class="lanes">
        <div v-for="i in MAX_LANES" :key="i" class="lane" :class="{ locked: i > lanes.length }">
          <div class="row lane-head">
            <span class="tag">LANE {{ i }}</span>
            <span v-if="i <= lanes.length" class="muted">COST {{ squadCost(s, s.lanes[i - 1]!) }}/{{ q.cost }}</span>
            <span v-else class="muted">Locked · upgrade Quarters</span>
          </div>
          <div class="slots">
            <div v-for="k in MAX_SQUAD" :key="k" class="slot">
              <template v-if="s.lanes[i - 1]!.squad[k - 1]">
                <button class="mini" @click="game.selectedId = s.lanes[i - 1]!.squad[k - 1]!">
                  <Portrait :class-id="s.duelists[s.lanes[i - 1]!.squad[k - 1]!]!.classId" :scale="2" />
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <p class="h" style="margin-top: 14px">ROSTER ({{ roster.length }})</p>
      <div class="roster scroll">
        <button v-for="r in roster" :key="r.d.id" class="card" :class="{ active: sel?.d.id === r.d.id }" @click="game.selectedId = r.d.id">
          <Portrait :class-id="r.d.classId" :scale="2" />
          <div class="info">
            <div>{{ r.d.name }} <span :class="'pot-' + r.d.potential">[{{ r.d.potential }}]</span></div>
            <div class="muted">{{ r.cls.name }} · Lv {{ r.d.level }} · C{{ r.cls.cost }}</div>
          </div>
          <span class="tag">{{ r.lane >= 0 ? 'L' + (r.lane + 1) : '—' }}</span>
        </button>
      </div>
    </section>

    <section v-if="sel" class="panel detail">
      <div class="row">
        <Portrait :class-id="sel.d.classId" :scale="5" />
        <div>
          <p class="h">{{ sel.d.name }}</p>
          <div>{{ sel.cls.name }} (Rank {{ sel.cls.rank }}) · {{ sel.cls.row }} row</div>
          <div>Potential <b :class="'pot-' + sel.d.potential">{{ sel.d.potential }}</b> · COST {{ sel.cls.cost }}</div>
        </div>
      </div>

      <p class="h">KIT</p>
      <div class="kit">
        <div><span class="tag">PASSIVE</span> <b>{{ getPassive(sel.d.passive)?.name ?? '—' }}</b> <span class="muted">{{ getPassive(sel.d.passive)?.desc }}</span></div>
        <div><span class="tag">BASIC</span> <b>{{ sel.cls.basic.name }}</b> <span class="muted">{{ Math.round(sel.cls.basic.power * 100) }}% ATK · +energy</span></div>
        <div><span class="tag">ACTIVE</span> <b>{{ sel.cls.active.name }}</b> <span class="muted">casts at {{ sel.cls.energyMax }} energy</span></div>
      </div>

      <div class="lv">
        <span>Lv {{ sel.d.level }}/{{ q.levelCap }}</span>
        <div class="bar"><i :style="{ width: (100 * sel.d.exp) / expToNext(sel.d.level) + '%', background: 'var(--blue)' }" /></div>
        <button class="btn sm" :disabled="s.materials.tome < 1" @click="game.act(useTome, sel.d.id)">Use Tome ({{ s.materials.tome }})</button>
      </div>

      <div class="stats">
        <div>HP <b>{{ sel.st.hp }}</b></div>
        <div>ATK <b>{{ sel.st.atk }}</b></div>
        <div>DEF <b>{{ sel.st.def }}</b></div>
        <div>SPD <b>{{ (1 / sel.st.interval).toFixed(2) }}/s</b></div>
        <div>RNG <b>{{ sel.st.range }}</b></div>
        <div>CRIT <b>{{ Math.round(sel.st.crit * 100) }}%</b></div>
      </div>

      <p class="h">ASSIGN</p>
      <div class="row">
        <button v-for="i in lanes.length" :key="i" class="btn sm" :class="{ on: sel.lane === i - 1 }" @click="game.act(assign, sel.d.id, i - 1)">Lane {{ i }}</button>
        <button class="btn sm" :disabled="sel.lane < 0" @click="game.act(assign, sel.d.id, null)">Bench</button>
      </div>

      <p class="h">GEAR</p>
      <div class="gear">
        <div v-for="slot in slots" :key="slot" class="gslot">
          <span class="muted">{{ slot }}</span>
          <template v-if="sel.d.gear[slot] && s.gear[sel.d.gear[slot]!]">
            <span :style="{ color: RARITY_COLOR[s.gear[sel.d.gear[slot]!]!.rarity] }">{{ s.gear[sel.d.gear[slot]!]!.name }}</span>
            <button class="btn sm" @click="game.act(unequip, sel.d.id, slot)">×</button>
          </template>
          <span v-else class="muted">— (Armory tab)</span>
        </div>
      </div>

      <template v-if="SUBCLASSES_ENABLED && sel.cls.upgradesTo.length">
        <p class="h">CLASS HALL</p>
        <div v-for="t in sel.cls.upgradesTo" :key="t" class="row">
          <Portrait :class-id="t" :scale="2" />
          <span>{{ getClass(t).name }} · C{{ getClass(t).cost }}</span>
          <span class="muted">Lv {{ RANK_UP[2].minLevel }}, {{ RANK_UP[2].gold }}g, 1 badge, Hall Lv1</span>
          <button class="btn sm primary" @click="game.act(rankUp, sel.d.id, t)">Advance</button>
        </div>
      </template>

      <div class="row" style="margin-top: 14px">
        <button class="btn sm danger" @click="game.act(dismiss, sel.d.id)">Dismiss</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 10px; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
.lanes { display: grid; gap: 8px; }
.lane { display: flex; align-items: center; gap: 12px; justify-content: space-between; background: #241c30; padding: 6px 8px; border: 2px solid var(--line); }
.lane.locked { opacity: .45; }
.lane-head { min-width: 220px; }
.slots { display: flex; gap: 6px; }
.slot { width: 36px; height: 36px; border: 2px dashed #4a3e5c; display: grid; place-items: center; }
.mini { background: none; border: 0; padding: 0; cursor: pointer; }
.roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; max-height: 340px; }
.card { display: flex; gap: 8px; align-items: center; text-align: left; background: #241c30; border: 2px solid var(--line); color: var(--text); padding: 4px 6px; cursor: pointer; font-family: var(--body); font-size: 19px; }
.card.active { border-color: var(--gold); }
.card .info { flex: 1; line-height: 1; }
.detail { display: grid; gap: 10px; align-content: start; }
.lv { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 12px; background: #241c30; padding: 8px; border: 2px solid var(--line); }
.gear { display: grid; gap: 4px; }
.gslot { display: grid; grid-template-columns: 90px 1fr auto; gap: 8px; align-items: center; }
.h { margin-bottom: 0; }
.kit { display: grid; gap: 4px; background: #241c30; padding: 8px; border: 2px solid var(--line); }
</style>
