<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { TocItem } from '@/types/blog'

const props = defineProps<{ toc: TocItem[] }>()

const activeIds = ref<Set<string>>(new Set())
const minActiveId = ref<string | null>(null)

let observers: IntersectionObserver[] = []

function recomputeMin() {
  const first = Array.from(activeIds.value).sort(
    (a, b) =>
      props.toc.findIndex(item => item.id === a) - props.toc.findIndex(item => item.id === b)
  )[0]
  minActiveId.value = first ?? null
}

function connect() {
  observers.forEach(o => o.disconnect())
  observers = []
  activeIds.value = new Set()
  minActiveId.value = null
  if (!props.toc.length || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return
  }
  props.toc.forEach(item => {
    const el = document.getElementById(item.id)
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const next = new Set(activeIds.value)
          if (entry.isIntersecting) next.add(entry.target.id)
          else next.delete(entry.target.id)
          activeIds.value = next
          recomputeMin()
        })
      },
      { rootMargin: '-100px 0px -100px 0px', threshold: 0 }
    )
    observer.observe(el)
    observers.push(observer)
  })
}

onMounted(connect)
onBeforeUnmount(() => {
  observers.forEach(o => o.disconnect())
  observers = []
})
</script>

<template>
  <div class="bg-card w-full rounded-xl border p-3 text-sm">
    <h2 class="text-secondary mb-2 font-medium">目录</h2>
    <div class="relative max-h-[300px] space-y-2 overflow-auto scrollbar-none">
      <div v-if="toc.length === 0" class="text-secondary">暂无</div>
      <a
        v-for="item in toc"
        :key="item.id + item.level"
        :href="`#${item.id}`"
        class="relative block transition-colors"
        :class="item.id === minActiveId ? 'text-brand' : 'hover:text-brand'"
        :style="{ paddingLeft: (item.level - 1) * 8 + 12 + 'px' }"
      >
        {{ item.text }}
      </a>
    </div>
  </div>
</template>
