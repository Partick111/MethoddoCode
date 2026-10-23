<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { useShareLinksStore, type ShareLink } from '@/stores/share-links'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)

const styles = computed(() => cs.value.shareCard)
const hi = computed(() => cs.value.hiCard)
const social = computed(() => cs.value.socialButtons)

const x = computed(() => center.x + (hi.value.width ?? 0) / 2 - (social.value.width ?? 0))
const y = computed(
  () =>
    center.y +
    (hi.value.height ?? 0) / 2 +
    CARD_SPACING +
    (social.value.height ?? 0) +
    CARD_SPACING
)

/** 随机推荐：从分享链接合并列表（默认 + 博主添加，剔除已删除）中随机取一条 */
const store = useShareLinksStore()
const randomItem = ref<ShareLink | null>(null)
onMounted(() => {
  const links = store.links
  if (!links.length) return
  randomItem.value = links[Math.floor(Math.random() * links.length)] ?? null
})
</script>

<template>
  <HomeDraggableLayer
    v-if="styles?.enabled !== false && randomItem"
    card-key="shareCard"
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
    >
      <h2 class="text-secondary text-sm">随机推荐</h2>

      <a :href="randomItem.url" target="_blank" rel="noopener noreferrer" class="mt-2 block space-y-2">
        <div class="flex items-center">
          <div class="bg-brand-secondary/30 text-brand mr-3 grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold">
            {{ randomItem.name.charAt(0) }}
          </div>
          <h3 class="text-sm font-medium">{{ randomItem.name }}</h3>
        </div>
        <p class="text-secondary line-clamp-3 text-xs">{{ randomItem.description }}</p>
      </a>
    </Card>
  </HomeDraggableLayer>
</template>
