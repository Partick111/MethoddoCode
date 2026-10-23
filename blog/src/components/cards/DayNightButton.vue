<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <!-- 日/月切换按钮：固定在视口右上角（安全边距 top/right 16px），避开左侧导航卡；z-40 高于其他卡片不被遮挡 -->
  <button
    type="button"
    class="fixed top-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-300 hover:scale-105"
    :class="
      theme.isNight
        ? 'border-amber-300/70 bg-amber-400/15 shadow-[0_0_14px_rgba(251,191,36,0.55)]'
        : 'border-white/60 bg-white/10 backdrop-blur hover:bg-white/20'
    "
    :title="theme.isNight ? '切换到白天' : '切换到夜间'"
    :aria-pressed="theme.isNight ? 'true' : 'false'"
    @click="theme.toggle()"
  >
    <component
      :is="theme.isNight ? Sun : Moon"
      :size="20"
      :stroke-width="1.8"
      class="transition-colors duration-300"
      :class="theme.isNight ? 'text-amber-300' : 'text-brand'"
    />
  </button>
</template>
