<script setup lang="ts">
import { computed } from 'vue'
import { useSize } from '@/composables/useSize'
import { ANIMATION_DELAY } from '@/consts'

const props = withDefaults(
  defineProps<{
    cardKey: string
    x?: number
    y?: number
    width?: number
    height?: number
    order?: number
  }>(),
  {
    x: 0,
    y: 0,
    width: undefined,
    height: undefined,
    order: 0
  }
)

const { maxSM } = useSize()

const style = computed(() => {
  const base: Record<string, string> = {}
  if (!maxSM) {
    base.left = `${props.x}px`
    base.top = `${props.y}px`
    if (props.width !== undefined) base.width = `${props.width}px`
    if (props.height !== undefined) base.height = `${props.height}px`
  }
  base.animationDelay = `${props.order * ANIMATION_DELAY}s`
  return base
})

const wrapperClass = computed(() => (!maxSM ? 'absolute enter-card' : 'static max-sm:static'))
</script>

<template>
  <div :class="wrapperClass" :style="style">
    <slot />
  </div>
</template>
