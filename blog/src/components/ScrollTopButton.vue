<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ArrowUp } from 'lucide-vue-next'
import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{
    className?: string
    delay?: number
  }>(),
  {
    className: '',
    delay: 800
  }
)

const show = ref(false)
const active = ref(false)
let showTimer: number | null = null

onMounted(() => {
  showTimer = window.setTimeout(() => {
    show.value = true
  }, props.delay)
  window.addEventListener('scroll', handleScroll, { passive: true } as AddEventListenerOptions)
  handleScroll()
})

onUnmounted(() => {
  if (showTimer) window.clearTimeout(showTimer)
  window.removeEventListener('scroll', handleScroll)
})

function handleScroll() {
  active.value = window.scrollY > 200
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  setTimeout(() => (active.value = false), 1000)
}

const finalClass = computed(() =>
  cn('card flex items-center justify-center gap-2 rounded-full p-3 text-sm', props.className)
)
</script>

<template>
  <button
    v-if="show && active"
    type="button"
    aria-label="Scroll to top"
    class="enter-card transition-transform hover:scale-105"
    :class="finalClass"
    @click="scrollTop"
  >
    <ArrowUp class="h-6 w-6 text-[var(--color-secondary)]" />
  </button>
</template>
