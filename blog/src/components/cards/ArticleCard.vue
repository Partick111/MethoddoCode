<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { getBlogIndex } from '@/api/blog'
import type { BlogIndexItem } from '@/types/blog'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)

const styles = computed(() => cs.value.articleCard)
const hi = computed(() => cs.value.hiCard)
const social = computed(() => cs.value.socialButtons)

const x = computed(
  () =>
    center.x +
    (hi.value.width ?? 0) / 2 -
    (social.value.width ?? 0) -
    CARD_SPACING -
    (styles.value.width ?? 0)
)
const y = computed(() => center.y + (hi.value.height ?? 0) / 2 + CARD_SPACING)

/* ---- 最新文章 ---- */
const latest = ref<BlogIndexItem | null>(null)
const loadingLatest = ref(true)

onMounted(async () => {
  try {
    const list = await getBlogIndex()
    latest.value = list[0] ?? null
  } catch {
    latest.value = null
  } finally {
    loadingLatest.value = false
  }
})

function formatDate(input?: string): string {
  if (!input) return dayjs().format('YYYY/M/D')
  const d = dayjs(input)
  return d.isValid() ? d.format('YYYY/M/D') : input
}
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false"
    card-key="articleCard"
    :x="x"
    :y="y"
    :width="styles.width"
    :height="styles.height"
    :order="styles.order"
  >
    <Card
      :width="styles.width"
      :height="styles.height"
      :x="x"
      :y="y"
      :order="styles.order"
      class="space-y-2"
    >
      <h2 class="text-secondary text-sm">最新文章</h2>

      <div v-if="loadingLatest" class="flex h-[60px] items-center justify-center">
        <span class="text-secondary text-xs">加载中...</span>
      </div>

      <RouterLink
        v-else-if="latest && latest.slug"
        :to="`/blog/${latest.slug}`"
        class="flex transition-opacity hover:opacity-80"
      >
        <img
          v-if="latest.cover"
          :src="latest.cover"
          alt="cover"
          class="mr-3 h-12 w-12 shrink-0 rounded-xl border object-cover"
        />
        <div v-else class="text-secondary mr-3 grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/60">
          +
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-sm font-medium">{{ latest.title || latest.slug }}</h3>
          <p v-if="latest.summary" class="text-secondary mt-1 line-clamp-3 text-xs">{{ latest.summary }}</p>
          <p class="text-secondary mt-3 text-xs">{{ formatDate(latest.date) }}</p>
        </div>
      </RouterLink>

      <div v-else class="flex h-[60px] items-center justify-center">
        <span class="text-secondary text-xs">暂无文章</span>
      </div>
    </Card>
  </HomeDraggableLayer>
</template>
