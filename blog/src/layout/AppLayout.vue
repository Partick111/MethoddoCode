<script setup lang="ts">
import { onMounted } from 'vue'
import BlurredBubblesBackground from '@/components/BlurredBubblesBackground.vue'
import NavCard from '@/components/NavCard.vue'
import DayNightButton from '@/components/cards/DayNightButton.vue'
import MusicButton from '@/components/MusicButton.vue'
import ScrollTopButton from '@/components/ScrollTopButton.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { useReadArticlesStore } from '@/stores/read-articles'
import { useThemeStore } from '@/stores/theme'

const center = useCenter()
const { initSize, maxSM } = useSize()
const config = useConfigStore()
const read = useReadArticlesStore()
const theme = useThemeStore()

onMounted(() => {
  center.initCenter()
  initSize()
  read.load()
})
</script>

<template>
  <!-- 白天显示彩色气泡背景；夜间切换为星空图（html.night 背景），隐藏气泡避免叠层干扰 -->
  <BlurredBubblesBackground
    v-if="!theme.isNight"
    :colors="config.siteContent.backgroundColors"
    :regenerate-key="config.regenerateKey"
  />

  <main class="relative z-10 h-full min-h-screen">
    <slot />
    <NavCard />
  </main>

  <!-- 日夜切换按钮：独立 fixed 定位在视口右上角，全站常驻 -->
  <DayNightButton />

  <!-- 音乐歌单入口：左下角悬浮按钮，点击弹出歌单（音频文件放 public/music/） -->
  <MusicButton />

  <ScrollTopButton v-if="maxSM" class="fixed right-6 bottom-8 z-50 shadow-md bg-brand/20" />
</template>
