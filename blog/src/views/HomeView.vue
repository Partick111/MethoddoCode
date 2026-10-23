<script setup lang="ts">
import { computed } from 'vue'
import Card from '@/components/Card.vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import HiCard from '@/components/cards/HiCard.vue'
import ClockCard from '@/components/cards/ClockCard.vue'
import CalendarCard from '@/components/cards/CalendarCard.vue'
import MusicCard from '@/components/cards/MusicCard.vue'
import ArticleCard from '@/components/cards/ArticleCard.vue'
import SocialButtons from '@/components/cards/SocialButtons.vue'
import ShareCard from '@/components/cards/ShareCard.vue'
import WriteButtons from '@/components/cards/WriteButtons.vue'
import BeianCard from '@/components/cards/BeianCard.vue'
import AIChatEntry from '@/components/AIChatEntry.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { CARD_SPACING } from '@/consts'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)
const site = computed(() => config.siteContent)

const art = computed(() => cs.value.artCard)
const hi = computed(() => cs.value.hiCard)

function opt(card?: { width?: number; height?: number }) {
  return { width: card?.width ?? 0, height: card?.height ?? 0 }
}

/* art 卡坐标沿用蓝本：位于 hi 卡正上方 */
const artStyle = computed(() => ({
  x: center.x - opt(art.value).width / 2,
  y: center.y - opt(hi.value).height / 2 - opt(art.value).height - CARD_SPACING
}))

/* ---- 美术图（art-card） ---- */
const artUrl = computed(() => {
  const images = site.value.artImages ?? []
  const current = images.find(i => i.id === site.value.currentArtImageId)
  return current?.url || images[0]?.url || '/images/art/cat.svg'
})

function openArt() {
  if (artUrl.value) window.open(artUrl.value, '_blank', 'noopener')
}
</script>

<template>
  <div
    :class="
      maxSM
        ? 'flex flex-col items-center gap-6 px-4 pt-24 pb-24'
        : 'relative h-screen w-full overflow-hidden'
    "
  >
    <!-- 顶部美术图卡片（hat 默认禁用，由 BlurredBubblesBackground 提供顶部氛围） -->
    <HomeDraggableLayer
      v-if="art?.enabled !== false"
      card-key="artCard"
      :x="artStyle.x"
      :y="artStyle.y"
      :width="opt(art).width"
      :height="opt(art).height"
      :order="art?.order"
    >
      <Card
        :width="opt(art).width"
        :height="opt(art).height"
        :x="artStyle.x"
        :y="artStyle.y"
        :order="art?.order"
        class="!p-1"
      >
        <img
          :src="artUrl"
          alt="wall art"
          class="h-full w-full cursor-pointer rounded-[34px] object-cover"
          @click="openArt"
        />
      </Card>
    </HomeDraggableLayer>

    <!-- 各卡片按蓝本绝对坐标排布（右侧：写文章/时钟/日历/音乐；底部：文章/社交/分享） -->
    <WriteButtons />
    <ClockCard />
    <CalendarCard />
    <HiCard />
    <MusicCard />
    <ArticleCard />
    <SocialButtons />
    <ShareCard />
    <BeianCard />

    <!-- 首页右下角固定位：原 LikeButton 点赞按钮已由 AI 聊天入口（AIChatEntry）接替（原 LikeButton.vue 组件文件未改动，仍用于详情页侧栏与关于页）。
         新入口自带 fixed right-5 bottom-5 z-50 定位 + 右侧滑出聊天面板（z-60），移动端保持 fixed 且不被卡片遮挡。 -->
    <AIChatEntry />
  </div>
</template>
