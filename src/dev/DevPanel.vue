<script setup lang="ts">
// Dev-only debug panel (toggle with the DEV button or the ` key). Loaded by App.vue only
// when import.meta.env.DEV, so none of this ships in `npm run build`.
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useGame } from '@/stores/game'
import { CLASSES, MAX_SQUAD, OUTPOSTS, POTENTIALS, activeLanes, getClass, tick, type Potential } from '@/engine'
import {
  HERO_IDS, MOB_IDS, addGold, chargeSkill, duelEnemies, healUnit, killUnit, setSquad, spawnHero, startTestFight,
  type EnemyPick,
} from './devTools'

const game = useGame()
const s = () => game.state

// ---- open / close ----
const KEY = 'idler-game:devpanel'
const open = ref(readOpen())
function readOpen() { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
function toggle() { open.value = !open.value; try { localStorage.setItem(KEY, open.value ? '1' : '0') } catch { /* ignore */ } }
function onKey(e: KeyboardEvent) {
  if (e.key !== '`' || (e.target as HTMLElement)?.closest('input, select, textarea')) return
  e.preventDefault()
  toggle()
}

// ---- time scale (drives the store's own start/stop; extra ticks for >1x) ----
const speed = ref<0 | 1 | 4>(1)
let fastTimer = 0
function setSpeed(v: 0 | 1 | 4) {
  speed.value = v
  clearInterval(fastTimer)
  if (v === 0) game.stop()
  else game.start()
  if (v === 4) fastTimer = window.setInterval(() => { for (let k = 0; k < 3; k++) tick(s(), 0.1) }, 100)
}

// ---- refresh panel lists while open ----
const now = ref(0)
let uiTimer = 0
onMounted(() => {
  window.addEventListener('keydown', onKey)
  uiTimer = window.setInterval(() => { if (open.value) now.value++ }, 250)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearInterval(uiTimer)
  clearInterval(fastTimer)
  clearInterval(loopTimer)
})

function done(err?: string | null) {
  if (err) game.toast = { text: err, id: Date.now() }
  game.refresh()
  now.value++
}

// ---- heroes ----
const hire = reactive({ classId: 'mage', level: 10, potential: 'C' as Potential })
const lane = ref(0)
const roster = computed(() => { void now.value; return Object.values(s().duelists) })
const picked = ref<string[]>([])
function laneOf(id: string) { void now.value; const i = s().lanes.findIndex((l) => l.squad.includes(id)); return i < 0 ? '-' : `L${i + 1}` }
function spawn() {
  const d = spawnHero(s(), hire.classId, hire.level, hire.potential)
  picked.value = [...picked.value, d.id].slice(-MAX_SQUAD)
  done()
}
function putInLane() {
  if (!picked.value.length) return done(`Tick up to ${MAX_SQUAD} heroes first`)
  setSquad(s(), lane.value, picked.value)
  done()
}

// ---- test fight ----
const foes = ref<EnemyPick[]>([{ classId: 'slime', level: 1, potential: 'D' }])
const addFoe = reactive({ classId: 'slime', level: 1, potential: 'D' as Potential })
const loopFight = ref(false)
let loopTimer = 0
function fight() {
  const err = startTestFight(s(), lane.value, foes.value)
  done(err)
  clearInterval(loopTimer)
  if (!err && loopFight.value) {
    const idx = lane.value, list = foes.value.map((f) => ({ ...f }))
    loopTimer = window.setInterval(() => {
      if (!loopFight.value) return clearInterval(loopTimer)
      if (!s().lanes[idx]!.battle) startTestFight(s(), idx, list)
    }, 300)
  }
}
function useDuel() { foes.value = duelEnemies(s()) }

// ---- units in the current battle ----
const units = computed(() => {
  void now.value
  const b = s().lanes[lane.value]?.battle
  return b ? b.units.map((u) => ({ uid: u.uid, side: u.side, name: u.name, classId: u.classId, hp: Math.round(u.hp), maxHp: u.maxHp, alive: u.alive })) : []
})
function unitAct(fn: typeof killUnit, uid: number) {
  const b = s().lanes[lane.value]?.battle
  if (b) fn(b, uid)
  done()
}

// ---- one-click presets ----
function quickAnimTest() {
  // warrior + mage vs a high-HP slime: idle, walk, attack and skills play for a long time
  const ids = Object.values(s().duelists)
  const w = ids.find((d) => d.classId === 'warrior') ?? spawnHero(s(), 'warrior', 10, 'C')
  const m = ids.find((d) => d.classId === 'mage') ?? spawnHero(s(), 'mage', 10, 'C')
  lane.value = 0
  setSquad(s(), 0, [w.id, m.id])
  foes.value = [{ classId: 'troll', level: 30, potential: 'S' }]
  done(startTestFight(s(), 0, foes.value))
}
function quickAllHeroes() {
  // one of each hero class across the lanes
  const made = HERO_IDS.map((id) => spawnHero(s(), id, 15, 'B'))
  for (let i = 0; i < made.length; i += MAX_SQUAD) setSquad(s(), Math.min(2, i / MAX_SQUAD), made.slice(i, i + MAX_SQUAD).map((d) => d.id))
  done()
}

function reset() {
  if (!confirm('Wipe the save and start a new game?')) return
  game.resetGame()
  picked.value = []
  done()
}

const laneCount = computed(() => { void now.value; return activeLanes(s()).length })
const name = (id: string) => CLASSES[id]?.name ?? id
</script>

<template>
  <button class="dev-toggle btn sm" :class="{ on: open }" title="Debug panel (`)" @click="toggle">DEV</button>
  <aside v-if="open" class="dev panel">
    <p class="h">DEBUG <span class="muted">(` to hide)</span></p>

    <section>
      <div class="row">
        <span class="lbl">Time</span>
        <button class="btn sm" :class="{ on: speed === 0 }" @click="setSpeed(0)">Pause</button>
        <button class="btn sm" :class="{ on: speed === 1 }" @click="setSpeed(1)">1x</button>
        <button class="btn sm" :class="{ on: speed === 4 }" @click="setSpeed(4)">4x</button>
      </div>
      <div class="row">
        <span class="lbl">Gold</span>
        <button class="btn sm" @click="addGold(s(), 1000); done()">+1k</button>
        <button class="btn sm" @click="addGold(s(), 100000); done()">+100k</button>
        <button class="btn sm danger" @click="reset">Reset save</button>
      </div>
      <div class="row">
        <span class="lbl">Quick</span>
        <button class="btn sm primary" @click="quickAnimTest">Warrior+Mage vs Troll</button>
        <button class="btn sm" @click="quickAllHeroes">All hero classes</button>
      </div>
    </section>

    <section>
      <p class="sub">Heroes</p>
      <div class="row">
        <select v-model="hire.classId"><option v-for="id in HERO_IDS" :key="id" :value="id">{{ name(id) }} (R{{ getClass(id).rank }})</option></select>
        <label>Lv <input v-model.number="hire.level" type="number" min="1" max="99" /></label>
        <select v-model="hire.potential"><option v-for="p in POTENTIALS" :key="p">{{ p }}</option></select>
        <button class="btn sm" @click="spawn">Add</button>
      </div>
      <div class="list">
        <label v-for="d in roster" :key="d.id" class="item">
          <input v-model="picked" type="checkbox" :value="d.id" :disabled="!picked.includes(d.id) && picked.length >= MAX_SQUAD" />
          {{ d.name }} · {{ name(d.classId) }} {{ d.level }} <span class="muted">{{ laneOf(d.id) }}</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Lane</span>
        <button v-for="i in 3" :key="i" class="btn sm" :class="{ on: lane === i - 1 }" @click="lane = i - 1">{{ i }}</button>
        <button class="btn sm" @click="putInLane">Put ticked in lane</button>
        <span class="muted">{{ laneCount }} open</span>
      </div>
    </section>

    <section>
      <p class="sub">Test fight · lane {{ lane + 1 }}</p>
      <div class="row">
        <select v-model="addFoe.classId">
          <optgroup label="Monsters"><option v-for="id in MOB_IDS" :key="id" :value="id">{{ name(id) }}</option></optgroup>
          <optgroup label="Heroes"><option v-for="id in HERO_IDS" :key="id" :value="id">{{ name(id) }}</option></optgroup>
        </select>
        <label>Lv <input v-model.number="addFoe.level" type="number" min="1" max="99" /></label>
        <button class="btn sm" @click="foes.push({ ...addFoe })">Add</button>
        <button class="btn sm" @click="useDuel">{{ OUTPOSTS[s().outpostIdx]!.name }} duel</button>
      </div>
      <div class="row">
        <span v-for="(f, i) in foes" :key="i" class="tag" @click="foes.splice(i, 1)" title="click to remove">{{ name(f.classId) }} {{ f.level }} ×</span>
        <span v-if="!foes.length" class="muted">no enemies</span>
      </div>
      <div class="row">
        <button class="btn sm primary" @click="fight">Fight now</button>
        <label><input v-model="loopFight" type="checkbox" /> repeat</label>
      </div>
    </section>

    <section>
      <p class="sub">Units · lane {{ lane + 1 }}</p>
      <p v-if="!units.length" class="muted">No battle in this lane.</p>
      <div v-for="u in units" :key="u.uid" class="unit" :class="{ dead: !u.alive }">
        <span :class="u.side">{{ u.side === 'ally' ? '◀' : '▶' }}</span>
        <span class="uname">{{ u.name }} <span class="muted">{{ u.hp }}/{{ u.maxHp }}</span></span>
        <button class="btn sm" :disabled="!u.alive" @click="unitAct(killUnit, u.uid)">Kill</button>
        <button class="btn sm" @click="unitAct(healUnit, u.uid)">{{ u.alive ? 'Heal' : 'Revive' }}</button>
        <button class="btn sm" :disabled="!u.alive" @click="unitAct(chargeSkill, u.uid)">Skill</button>
      </div>
      <p class="muted tip">Tip: Pause, then Kill to watch a death clip without the fight ending.</p>
    </section>
  </aside>
</template>

<style scoped>
.dev-toggle { position: fixed; right: 8px; bottom: 8px; z-index: 41; }
.dev {
  position: fixed; top: 8px; right: 8px; bottom: 44px; width: min(380px, calc(100vw - 16px));
  overflow: auto; z-index: 40; font-size: 17px; display: flex; flex-direction: column; gap: 10px;
}
.dev .h { margin: 0; }
section { display: flex; flex-direction: column; gap: 6px; border-top: 2px solid var(--line); padding-top: 8px; }
.sub { font-family: var(--px); font-size: 9px; margin: 0; color: var(--blue); }
.lbl { width: 44px; color: var(--muted); }
select, input[type='number'] { font: inherit; font-size: 16px; background: #1e1828; color: var(--text); border: 2px solid var(--line); padding: 1px 4px; }
input[type='number'] { width: 52px; }
.list { max-height: 140px; overflow: auto; background: #1e1828; border: 2px solid var(--line); padding: 4px; }
.item { display: block; white-space: nowrap; }
.tag { cursor: pointer; }
.unit { display: flex; gap: 4px; align-items: center; }
.unit.dead { opacity: 0.5; }
.uname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ally { color: var(--good); } .enemy { color: var(--bad); }
.tip { margin: 0; font-size: 15px; }
</style>
