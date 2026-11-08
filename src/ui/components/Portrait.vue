<script setup lang="ts">
import { computed } from 'vue'
import { getClass } from '@/engine'
import { portraitURL } from '@/render/sprites'
import { artPortrait } from '@/render/art'

const props = withDefaults(defineProps<{ classId: string; scale?: number }>(), { scale: 3 })
const src = computed(() => {
  const fromArt = artPortrait(props.classId, 16 * props.scale)
  if (fromArt) return fromArt
  const c = getClass(props.classId)
  return portraitURL(c.sprite, c.palette, props.scale)
})
</script>

<template>
  <img :src="src" :width="16 * scale" :height="16 * scale" class="portrait" alt="" />
</template>

<style scoped>
.portrait { background: #120e18; border: 2px solid var(--line); }
</style>
