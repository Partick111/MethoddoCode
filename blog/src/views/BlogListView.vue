<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import BlogArticleRow from '@/components/BlogArticleRow.vue'
import { getBlogIndex } from '@/api/blog'
import { fetchArticleStatsBatch } from '@/api/stats'
import { useReadArticlesStore } from '@/stores/read-articles'
import type { BlogIndexItem } from '@/types/blog'

const items = ref<BlogIndexItem[]>([])
const loading = ref(true)
const read = useReadArticlesStore()

const keyword = ref('')
const submitted = ref('')

onMounted(async () => {
  read.load()
  try {
    items.value = await getBlogIndex()
    void loadStats(items.value.map(item => item.slug))
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
})

/** 批量拉取浏览量/点赞数并合并到列表项（失败静默降级：不展示统计，不影响列表） */
async function loadStats(slugs: string[]) {
  try {
    const stats = await fetchArticleStatsBatch(slugs)
    const map = new Map(stats.map(s => [s.slug, s]))
    items.value = items.value.map(item => {
      const s = map.get(item.slug)
      return s ? { ...item, views: s.views, likes: s.likes } : item
    })
  } catch {
    /* 统计接口不可用时列表照常展示 */
  }
}

const filteredItems = computed(() => {
  const kw = submitted.value.toLowerCase()
  if (!kw) return items.value
  return items.value.filter(
    item =>
      (item.title || '').toLowerCase().includes(kw) ||
      (item.summary || '').toLowerCase().includes(kw) ||
      item.slug.toLowerCase().includes(kw)
  )
})

/** 点击「搜索」按钮或回车才提交关键词、触发过滤 */
function doSearch() {
  submitted.value = keyword.value.trim()
}

/** 分类归属：以文章 categories 的首个分类为准 */
type CategoryKey = 'fullstack' | 'videoclip' | 'ai'

function itemsOfCategory(key: CategoryKey): BlogIndexItem[] {
  return filteredItems.value.filter(item => item.categories?.[0] === key)
}

/** 三个分块各自的数据：全栈（主卡）/ 视频剪辑 / AI，篇数由各自长度实时统计 */
const fullstackItems = computed(() => itemsOfCategory('fullstack'))
const videoclipItems = computed(() => itemsOfCategory('videoclip'))
const aiItems = computed(() => itemsOfCategory('ai'))
</script>

<template>
  <div class="flex min-h-screen flex-col items-center gap-6 px-6 pt-24 pb-16 max-sm:pt-20">
    <!-- 顶部已去掉分类切换按键，近期文章固定单一视图 -->

    <!-- 搜索框：group 容器随 hover 整体浮起，图标/输入框/按钮作为其子元素一起联动，避免图标按钮呆板贴图 -->
    <div
      class="group relative w-full max-w-[840px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
    >
      <Search
        class="text-secondary pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2"
        :size="16"
      />
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索文章标题或摘要…"
        class="card relative w-full !rounded-2xl !py-2.5 !pl-9 !pr-24 text-sm focus:outline-none hover:!scale-100"
        @keyup.enter="doSearch"
      />
      <button
        type="button"
        class="btn-rounded absolute top-1/2 right-2 -translate-y-1/2 bg-[#0e2433] px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:scale-105 hover:bg-[#1a3a4f]"
        @click="doSearch"
      >
        搜索
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="text-secondary card relative px-6 py-3 text-sm">加载中…</div>

    <!-- 空状态 -->
    <div
      v-else-if="filteredItems.length === 0"
      class="card relative px-6 py-3 text-sm text-secondary"
    >
      暂无匹配的文章
    </div>

    <!-- 文章大卡 + 两个新分块：文章卡与下方两块之间、两新块之间均留 8px(gap-2) 空白；两新块左右并排、总宽不超出文章卡 -->
    <div v-else class="flex w-full max-w-[840px] flex-col gap-2">
      <!-- 文章大卡（全栈）：只渲染全栈类文章，内容区固定高度、内部纵向滚动 -->
      <section class="card relative flex w-full flex-col gap-4 !p-6">
        <header class="flex items-center justify-between gap-3 text-base">
          <div class="flex items-center gap-3">
            <span class="font-medium">全栈</span>
            <span class="h-2 w-2 rounded-full bg-[#D9D9D9]" />
            <span class="text-secondary text-sm">{{ fullstackItems.length }} 篇</span>
          </div>
        </header>

        <!-- 纵向滚动列表：内容区固定高度、内部 overflow-y 滚动，鼠标滚轮即可上下浏览全部文章 -->
        <div
          class="nice-scrollbar h-[230px] overflow-y-auto overscroll-contain pr-2 max-sm:h-[200px]"
        >
          <BlogArticleRow v-for="item in fullstackItems" :key="item.slug" :item="item" />
          <div
            v-if="!fullstackItems.length"
            class="text-secondary flex h-full items-center justify-center text-sm"
          >
            暂无内容
          </div>
        </div>
      </section>

      <!-- 两个新分块：左右并排（flex-1 平分），宽度不超出文章卡，标题风格/对齐与主卡一致，各自渲染所属分类文章 -->
      <div class="flex w-full gap-2">
        <div class="card relative flex w-full min-w-0 flex-1 flex-col gap-4 !p-6">
          <header class="flex items-center gap-3 text-base">
            <span class="font-medium">视频剪辑</span>
            <span class="h-2 w-2 rounded-full bg-[#D9D9D9]" />
            <span class="text-secondary text-sm">{{ videoclipItems.length }} 篇</span>
          </header>
          <div
            class="nice-scrollbar h-[230px] overflow-y-auto overscroll-contain pr-2 max-sm:h-[200px]"
          >
            <BlogArticleRow v-for="item in videoclipItems" :key="item.slug" :item="item" />
            <div
              v-if="!videoclipItems.length"
              class="text-secondary flex h-full items-center justify-center text-sm"
            >
              暂无内容
            </div>
          </div>
        </div>
        <div class="card relative flex w-full min-w-0 flex-1 flex-col gap-4 !p-6">
          <header class="flex items-center gap-3 text-base">
            <span class="font-medium">AI</span>
            <span class="h-2 w-2 rounded-full bg-[#D9D9D9]" />
            <span class="text-secondary text-sm">{{ aiItems.length }} 篇</span>
          </header>
          <div
            class="nice-scrollbar h-[230px] overflow-y-auto overscroll-contain pr-2 max-sm:h-[200px]"
          >
            <BlogArticleRow v-for="item in aiItems" :key="item.slug" :item="item" />
            <div
              v-if="!aiItems.length"
              class="text-secondary flex h-full items-center justify-center text-sm"
            >
              暂无内容
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
