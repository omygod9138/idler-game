<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useGame } from '@/stores/game'
import { activeLanes } from '@/engine'
import { Renderer } from '@/render/renderer'

const game = useGame()
const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
let r: Renderer | null = null
let raf = 0

function frame() {
  if (r && wrap.value) {
    const n = activeLanes(game.state).length
    r.resize(n, wrap.value.clientWidth)
    r.draw(game.state, n)
  }
  raf = requestAnimationFrame(frame)
}

onMounted(() => {
  r = new Renderer(canvas.value!)
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<template>
  <div ref="wrap" class="panel stage">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.stage { padding: 6px; display: flex; justify-content: center; background: #120e18; }
canvas { display: block; }
</style>
