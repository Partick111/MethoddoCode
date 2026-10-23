<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)

const styles = computed(() => cs.value.clockCard)
const hi = computed(() => cs.value.hiCard)
const site = computed(() => config.siteContent)
const showSeconds = computed(() => site.value.clockShowSeconds ?? false)

/* 每 1s 刷新，保证走秒（clockShowSeconds=false 时同样走秒，观感一致） */
const now = ref(new Date())
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})
onUnmounted(() => clearInterval(timer))

const x = computed(() => center.x + CARD_SPACING + (hi.value.width ?? 0) / 2)
const y = computed(() => center.y - (styles.value.offset ?? 0) - (styles.value.height ?? 0))

const hh = computed(() => String(now.value.getHours()).padStart(2, '0'))
const mm = computed(() => String(now.value.getMinutes()).padStart(2, '0'))
const ss = computed(() => String(now.value.getSeconds()).padStart(2, '0'))

/* 输出顺序：H1 H2 ':' M1 M2 ( ':' S1 S2 )，'—' 表示冒号占位 */
const digits = computed(() => {
  const base: string[] = [hh.value[0], hh.value[1], '—', mm.value[0], mm.value[1]]
  return showSeconds.value ? [...base, '—', ss.value[0], ss.value[1]] : base
})

/* 七段数码管段点亮映射（蓝本 segmentMap） */
const SEGMENT_MAP: Record<number, boolean[]> = {
  0: [true, true, true, true, true, true, false],
  1: [false, true, true, false, false, false, false],
  2: [true, true, false, true, true, false, true],
  3: [true, true, true, true, false, false, true],
  4: [false, true, true, false, false, true, true],
  5: [true, false, true, true, false, true, true],
  6: [true, false, true, true, true, true, true],
  7: [true, true, true, false, false, false, false],
  8: [true, true, true, true, true, true, true],
  9: [true, true, true, true, false, true, true]
}

/* 7 段 path：索引 0..6 对应 a/b/c/d/e/f/g（与蓝本 segments 顺序一致） */
const SEGMENT_PATHS = [
  'M4.20248 3.49482C2.82797 2.27303 3.69218 0 5.53121 0H22.6867C24.5522 0 25.4019 2.32821 23.975 3.52982L23.5791 3.86316C23.2186 4.16681 22.7623 4.33333 22.2909 4.33333H5.90621C5.41638 4.33333 4.94359 4.15358 4.57748 3.82815L4.20248 3.49482Z',
  'M24.8497 4.25654C26.1428 3.12502 28.1667 4.04338 28.1667 5.76169L28.1667 21.8498C28.1667 23.4207 26.4388 24.3784 25.1067 23.5458L24.7734 23.3375C24.1886 22.972 23.8334 22.3311 23.8334 21.6415L23.8334 6.05336C23.8334 5.47663 24.0823 4.92798 24.5163 4.54821L24.8497 4.25654Z',
  'M25.1862 28.489C26.5194 27.7391 28.1667 28.7025 28.1667 30.2322L28.1667 46.6299C28.1667 48.4117 26.0124 49.3041 24.7525 48.0441L24.4191 47.7108C24.0441 47.3357 23.8334 46.827 23.8334 46.2966L23.8334 30.4197C23.8334 29.6971 24.2231 29.0308 24.8528 28.6765L25.1862 28.489Z',
  'M23.9259 48.6321C25.1234 49.9094 24.2177 52 22.4669 52L5.69978 52C3.9489 52 3.04321 49.9094 4.24071 48.6321L4.55321 48.2988C4.9313 47.8955 5.45947 47.6667 6.01228 47.6667L22.1544 47.6667C22.7072 47.6667 23.2353 47.8955 23.6134 48.2988L23.9259 48.6321Z',
  'M3.4564 47.7859C2.21509 49.1048 4.23823e-07 48.2263 6.6133e-07 46.4152L2.79423e-06 30.1501C3.00022e-06 28.5793 1.72791 27.6216 3.06 28.4541L3.39333 28.6625C3.9781 29.028 4.33334 29.6689 4.33334 30.3585L4.33333 46.061C4.33333 46.5705 4.13891 47.0607 3.78973 47.4317L3.4564 47.7859Z',
  'M3.06 23.5458C1.7279 24.3784 -8.31295e-08 23.4207 -1.47217e-07 21.8498L-8.06095e-07 5.69981C-8.77526e-07 3.94893 2.09055 3.04323 3.36788 4.24073L3.70121 4.55323C4.10452 4.93133 4.33333 5.45949 4.33333 6.01231L4.33333 21.6415C4.33333 22.3311 3.97809 22.972 3.39333 23.3375L3.06 23.5458Z',
  'M3.85122 24.13C4.16644 23.936 4.5293 23.8333 4.89942 23.8333H23.3022C23.6503 23.8333 23.9923 23.9242 24.2945 24.0969L24.5862 24.2635C25.9298 25.0313 25.9298 26.9687 24.5862 27.7365L24.2945 27.9032C23.9923 28.0758 23.6503 28.1667 23.3022 28.1667H4.89942C4.5293 28.1667 4.16644 28.064 3.85122 27.87L3.58039 27.7033C2.31131 26.9224 2.31132 25.0777 3.58039 24.2967L3.85122 24.13Z'
]

const activeColor = 'var(--color-primary)'
const inactiveColor = 'rgba(0, 0, 0, 0.05)'

function isActive(value: number, segIndex: number): boolean {
  const map = SEGMENT_MAP[value] ?? SEGMENT_MAP[0]
  return !!map[segIndex]
}
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false"
    card-key="clockCard"
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
      class="p-2"
    >
      <div
        class="card-rounded bg-secondary/20 flex h-full w-full cursor-pointer items-center justify-center gap-1.5 p-2"
        data-role="clock-card"
      >
        <template v-for="(d, idx) in digits" :key="idx">
          <svg
            v-if="d !== '—'"
            width="29"
            height="52"
            viewBox="0 0 29 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            class="max-sm:h-10 max-sm:w-auto"
          >
            <path
              v-for="(_, p) in SEGMENT_PATHS"
              :key="p"
              :d="SEGMENT_PATHS[p]"
              :fill="isActive(Number(d), p) ? activeColor : inactiveColor"
            />
          </svg>
          <div v-else class="flex flex-col justify-center gap-2">
            <div class="bg-primary h-1.5 w-1.5" />
            <div class="bg-primary h-1.5 w-1.5" />
          </div>
        </template>
      </div>
    </Card>
  </HomeDraggableLayer>
</template>
