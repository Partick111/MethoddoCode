<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/utils/cn'
import { useSize } from '@/composables/useSize'
import { ANIMATION_DELAY, CARD_SPACING } from '@/consts'

const props = withDefaults(
  defineProps<{
    x?: number
    y?: number
    width?: number
    height?: number
    order?: number
    className?: string
    animate?: boolean
  }>(),
  {
    x: undefined,
    y: undefined,
    width: undefined,
    height: undefined,
    order: 0,
    className: '',
    animate: true
  }
)

const { maxSM } = useSize()

const style = computed(() => {
  const base: Record<string, string> = {}
  if (!maxSM) {
    // 定位职责由 HomeDraggableLayer 承担，本组件仅在未由父层固定大小时显式提供尺寸
    if (props.width !== undefined) base.width = `${props.width}px`
    if (props.height !== undefined) base.height = `${props.height}px`
  }
  if (props.animate) {
    base.animationDelay = `${props.order * ANIMATION_DELAY}s`
  }
  return base
})

const classes = computed(() =>
  cn('card enter-card', !maxSM && 'relative', maxSM && 'static relative w-full', props.className)
)
void CARD_SPACING
</script>

<template>
  <div class="relative" :class="classes" :style="style">
    <slot />
  </div>
</template>
