<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Eye, Heart } from 'lucide-vue-next'
import { useReadArticlesStore } from '@/stores/read-articles'
import type { BlogIndexItem } from '@/types/blog'

const props = defineProps<{ item: BlogIndexItem }>()

const read = useReadArticlesStore()

const dateText = computed(() => dayjs(props.item.date).format('MM-DD'))
const isRead = computed(() => read.isRead(props.item.slug))
/** 统计是否已从后端加载（加载失败/未加载时不展示，避免误导为 0） */
const hasStats = computed(() => props.item.views !== undefined || props.item.likes !== undefined)
</script>

<template>
  <!-- 文章行：日期 + 圆点 + 标题/摘要 + 标签（分类标签 pill 已移除，分类由所在分块标题体现） -->
  <RouterLink
    :to="`/blog/${item.slug}`"
    class="group flex min-h-10 items-center gap-3 py-3 transition-all"
  >
    <span class="text-secondary w-[44px] shrink-0 text-sm font-medium tabular-nums">
      {{ dateText }}
    </span>
    <span class="relative flex h-2 w-2 shrink-0 items-center justify-center">
      <span
        class="bg-secondary group-hover:bg-brand h-[5px] w-[5px] rounded-full transition-all group-hover:h-4"
      />
    </span>
    <span class="min-w-0 flex-1">
      <span
        class="block truncate text-sm font-medium transition-all group-hover:translate-x-2 group-hover:text-brand"
      >
        {{ item.title || item.slug }}
        <span v-if="isRead" class="text-secondary ml-2 text-xs">[已阅读]</span>
      </span>
      <span v-if="item.summary" class="text-secondary mt-1.5 block truncate text-xs">
        {{ item.summary }}
      </span>
    </span>
    <span v-if="item.tags?.length" class="flex flex-wrap items-center gap-2 max-sm:hidden">
      <span v-for="t in item.tags" :key="t" class="text-secondary text-sm">#{{ t }}</span>
    </span>
    <!-- 浏览量 / 点赞数：来自后端统计接口（一人一赞的真实点赞总数） -->
    <span
      v-if="hasStats"
      class="text-secondary flex shrink-0 items-center gap-3 text-xs tabular-nums"
    >
      <span class="flex items-center gap-1" :title="`浏览量 ${item.views ?? 0}`">
        <Eye :size="13" />
        {{ item.views ?? 0 }}
      </span>
      <span class="flex items-center gap-1" :title="`点赞数 ${item.likes ?? 0}`">
        <Heart :size="13" />
        {{ item.likes ?? 0 }}
      </span>
    </span>
  </RouterLink>
</template>
