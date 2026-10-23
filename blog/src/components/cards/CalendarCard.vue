<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { CARD_SPACING } from '@/consts'

dayjs.locale('zh-cn')

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)

const styles = computed(() => cs.value.calendarCard)
const hi = computed(() => cs.value.hiCard)
const clock = computed(() => cs.value.clockCard)

const now = computed(() => dayjs())
const currentDate = computed(() => now.value.date())
const firstDayWeekday = computed(() => (now.value.startOf('month').day() + 6) % 7) // 周一=0
const daysInMonth = computed(() => now.value.daysInMonth())
const currentWeekday = computed(() => (now.value.day() + 6) % 7) // 周一=0

const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
const emptyCells = computed(() => new Array(firstDayWeekday.value))
const dayCells = computed(() => new Array(daysInMonth.value))

const x = computed(() => center.x + CARD_SPACING + (hi.value.width ?? 0) / 2)
const y = computed(() => center.y - (clock.value.offset ?? 0) + CARD_SPACING)

const gridTight = computed(() =>
  (styles.value.height ?? 0) < 240 || (styles.value.width ?? 0) < 240 ? 'text-xs' : ''
)
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false"
    card-key="calendarCard"
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
      class="flex flex-col"
    >
      <h3 class="text-secondary text-sm">
        {{ now.format('YYYY/M/D') }} {{ now.format('ddd') }}
      </h3>
      <ul class="text-secondary mt-3 grid h-[206px] flex-1 grid-cols-7 gap-2 text-sm" :class="gridTight">
        <li
          v-for="(label, index) in weekLabels"
          :key="`w-${index}`"
          class="flex items-center justify-center font-medium"
          :class="{ 'text-brand': index === currentWeekday }"
        >
          {{ label }}
        </li>
        <li v-for="(_, index) in emptyCells" :key="`e-${index}`" />
        <li
          v-for="(_, index) in dayCells"
          :key="`d-${index}`"
          class="flex items-center justify-center rounded-lg"
          :class="{ 'bg-linear border font-medium': index + 1 === currentDate }"
        >
          {{ index + 1 }}
        </li>
      </ul>
    </Card>
  </HomeDraggableLayer>
</template>
