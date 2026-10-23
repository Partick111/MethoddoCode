<script setup lang="ts">
/**
 * MusicButton.vue —— 左下角音乐列表入口按钮
 *
 * 圆形玻璃按钮（与右下角 AI 入口对称），点击打开歌单弹窗 MusicPanel；
 * 播放中图标高亮并带呼吸动画，全站常驻（挂在 AppLayout）。
 */
import { ref } from 'vue'
import { Music } from 'lucide-vue-next'
import MusicPanel from '@/components/MusicPanel.vue'
import { useMusicStore } from '@/stores/music'

const music = useMusicStore()
const open = ref(false)
</script>

<template>
  <!-- 入口按钮：左下角悬浮位（fixed left-5 bottom-5），与 AI 入口（右下角）左右对称 -->
  <div class="fixed left-5 bottom-5 z-50 max-sm:left-4 max-sm:bottom-4">
    <button
      type="button"
      class="card enter-card relative flex h-[54px] w-[54px] items-center justify-center !rounded-full !p-0 transition-transform duration-300 hover:scale-105"
      :title="open ? '收起歌单' : '打开歌单'"
      :aria-expanded="open"
      aria-label="音乐歌单"
      @click="open = !open"
    >
      <Music
        :size="22"
        class="transition-colors"
        :class="music.playing ? 'text-brand animate-pulse' : 'text-secondary'"
      />
    </button>
  </div>

  <!-- 歌单弹窗 -->
  <MusicPanel v-model:open="open" />
</template>
