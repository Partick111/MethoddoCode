<script setup lang="ts">
import { computed } from 'vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)
const site = computed(() => config.siteContent)

const styles = computed(() => cs.value.beianCard)
const hi = computed(() => cs.value.hiCard)

const x = computed(() => center.x + (hi.value.width ?? 0) / 2 - (styles.value.width ?? 0) + 200)
const y = computed(() => center.y + (hi.value.height ?? 0) / 2 + CARD_SPACING + 180)

const beian = computed(() => site.value.beian)
/* 无备案信息时整卡不渲染 */
const hasBeian = computed(() => Boolean(beian.value?.text))
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false && hasBeian"
    card-key="beianCard"
    :x="x"
    :y="y"
    :width="styles.width"
    :height="styles.height"
    :order="styles.order"
  >
    <div class="flex h-full w-[86px] items-center justify-center break-words">
      <a
        v-if="beian.link"
        :href="beian.link"
        target="_blank"
        rel="noopener noreferrer"
        class="line-clamp-3 text-center text-xs text-black/70"
        style="word-break: break-all"
      >
        {{ beian.text }}
      </a>
      <div v-else class="line-clamp-3 text-center text-xs text-black/70">{{ beian.text }}</div>
    </div>
  </HomeDraggableLayer>
</template>
