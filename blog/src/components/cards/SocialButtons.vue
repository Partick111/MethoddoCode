<script setup lang="ts">
import { computed } from 'vue'
import BilibiliIcon from '@/components/icons/BilibiliIcon.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import type { SocialButtonConfig } from '@/types/blog'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)
const site = computed(() => config.siteContent)

const styles = computed(() => cs.value.socialButtons)
const hi = computed(() => cs.value.hiCard)

const x = computed(() => center.x + (hi.value.width ?? 0) / 2 - (styles.value.width ?? 0))
const y = computed(() => center.y + (hi.value.height ?? 0) / 2 + CARD_SPACING)

const sortedButtons = computed(() =>
  [...(site.value.socialButtons ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
)

const socialIcon: Record<string, object> = {
  bilibili: BilibiliIcon
}

function socialHref(btn: SocialButtonConfig): string | null {
  return btn.value || null
}

function socialColor(btn: SocialButtonConfig): string {
  return '#00a1d6'
}

function socialForeground(btn: SocialButtonConfig): string {
  return '#ffffff'
}
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false"
    card-key="socialButtons"
    :x="x"
    :y="y"
    :width="styles.width"
    :height="styles.height"
    :order="styles.order"
  >
    <div class="flex h-full w-full flex-row-reverse items-center justify-center gap-3">
      <a
        v-for="btn in sortedButtons"
        :key="btn.id"
        :href="socialHref(btn) ?? '#'"
        class="font-averia flex items-center gap-2 rounded-xl text-xl font-medium transition-transform hover:scale-105"
        :class="btn.label ? 'px-3 py-2.5' : 'p-1.5'"
        :style="{ backgroundColor: socialColor(btn), color: socialForeground(btn) }"
      >
        <component :is="socialIcon[btn.type] ?? BilibiliIcon" :size="btn.label ? 24 : 32" />
        <span v-if="btn.label">{{ btn.label }}</span>
      </a>
    </div>
  </HomeDraggableLayer>
</template>
