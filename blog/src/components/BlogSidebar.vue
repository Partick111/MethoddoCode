<script setup lang="ts">
import BlogToc from '@/components/BlogToc.vue'
import LikeButton from '@/components/LikeButton.vue'
import ScrollTopButton from '@/components/ScrollTopButton.vue'
import { useConfigStore } from '@/stores/config'
import type { TocItem } from '@/types/blog'

defineProps<{
  cover?: string
  summary?: string
  toc: TocItem[]
  slug?: string
}>()

const config = useConfigStore()
</script>

<template>
  <div class="sticky flex w-[200px] shrink-0 flex-col items-start gap-4 self-start max-sm:hidden" style="top: 24px">
    <div v-if="cover" class="bg-card w-full rounded-xl border p-3">
      <img :src="cover" alt="cover" class="h-auto w-full rounded-xl border object-cover" />
    </div>

    <div
      v-if="summary && !config.siteContent.summaryInContent"
      class="bg-card w-full rounded-xl border p-3 text-sm"
    >
      <h2 class="text-secondary mb-2 font-medium">摘要</h2>
      <div class="text-secondary scrollbar-none max-h-[240px] cursor-text overflow-auto">
        {{ summary }}
      </div>
    </div>

    <BlogToc :toc="toc" />

    <LikeButton :slug="slug" :delay="2200" />

    <ScrollTopButton :delay="2400" />
  </div>
</template>
