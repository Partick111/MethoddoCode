<script setup lang="ts">
import { computed } from 'vue'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)

const styles = computed(() => cs.value.hiCard)
const site = computed(() => config.siteContent)
const username = computed(() => site.value.meta.username || 'Patrick')

const x = computed(() => center.x - (styles.value.width ?? 0) / 2)
const y = computed(() => center.y - (styles.value.height ?? 0) / 2)

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 6 && h < 12) return 'Good Morning'
  if (h >= 12 && h < 18) return 'Good Afternoon'
  if (h >= 18 && h < 22) return 'Good Evening'
  return 'Good Night'
}

const greetingText = computed(() => getGreeting())
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false"
    card-key="hiCard"
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
      class="relative flex flex-col items-center justify-center gap-4 text-center"
    >
      <!-- 圆形大头像 -->
      <img
        src="/images/avatar.jpg"
        :alt="`${username} avatar`"
        class="mx-auto rounded-full object-cover"
        style="width: 120px; height: 120px; box-shadow: 0 16px 32px -5px #e2d9ce"
      />
      <!-- 大标题：衬线 + 渐变强调用户名 -->
      <h1 class="font-averia text-2xl leading-snug">
        {{ greetingText }}
        <br />
        I'm <span class="text-linear text-[32px]">{{ username }}</span> , Nice to
        <br />
        meet you!
      </h1>
    </Card>
  </HomeDraggableLayer>
</template>
