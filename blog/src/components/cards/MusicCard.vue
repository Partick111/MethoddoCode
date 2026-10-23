<script setup lang="ts">
import { computed } from 'vue'
import { Music, Pause, Play } from 'lucide-vue-next'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { useMusicStore } from '@/stores/music'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
/** 全局音乐播放器（与左下角歌单弹窗共享同一播放状态） */
const music = useMusicStore()
const cs = computed(() => config.cardStyles)

const styles = computed(() => cs.value.musicCard)
const hi = computed(() => cs.value.hiCard)
const clock = computed(() => cs.value.clockCard)
const calendar = computed(() => cs.value.calendarCard)

const x = computed(
  () => center.x + CARD_SPACING + (hi.value.width ?? 0) / 2 - (styles.value.offset ?? 0)
)
const y = computed(
  () =>
    center.y -
    (clock.value.offset ?? 0) +
    CARD_SPACING +
    (calendar.value.height ?? 0) +
    CARD_SPACING
)
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false"
    card-key="musicCard"
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
      class="flex items-center gap-3"
    >
      <Music class="text-brand h-8 w-8 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="text-secondary truncate text-sm">{{ music.current.title }}</div>
        <div class="mt-1 h-2 rounded-full bg-white/60">
          <div
            class="bg-linear h-full rounded-full transition-all duration-300"
            :style="{ width: `${music.progress}%` }"
          />
        </div>
      </div>
      <button
        @click="music.toggle()"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white transition-opacity hover:opacity-80"
        :aria-label="music.playing ? '暂停' : '播放'"
      >
        <Pause v-if="music.playing" class="text-brand h-4 w-4" />
        <Play v-else class="text-brand ml-1 h-4 w-4" />
      </button>
    </Card>
  </HomeDraggableLayer>
</template>
