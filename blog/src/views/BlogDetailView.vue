<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ragDeleteArticle } from '@/api/ai'
import { getBlogDetail } from '@/api/blog'
import { recordArticleView } from '@/api/stats'
import { useReadArticlesStore } from '@/stores/read-articles'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'
import { useLocalArticlesStore } from '@/stores/local-articles'
import { useSize } from '@/composables/useSize'
import { Eye, Heart, SquarePen, Trash2 } from 'lucide-vue-next'
import BlogSidebar from '@/components/BlogSidebar.vue'
import type { BlogPost } from '@/types/blog'

const route = useRoute()
const router = useRouter()
const read = useReadArticlesStore()
const config = useConfigStore()
const auth = useAuthStore()
const localArticles = useLocalArticlesStore()
const { maxSM } = useSize()

const slug = computed(() => String(route.params.slug || ''))
const post = ref<BlogPost | null>(null)
const loading = ref(true)
const error = ref('')

/* 底部统计：浏览量（进入页面 +1）/ 点赞数（一人一赞的真实总数），均来自后端 */
const views = ref(0)
const likes = ref(0)
const statsLoaded = ref(false)

/* 博主操作：编辑入口 / 删除二次确认 */
const confirmingDelete = ref(false)
const deleteError = ref('')

onMounted(async () => {
  try {
    post.value = await getBlogDetail(slug.value)
    read.markRead(slug.value)
    void loadStats()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '文章加载失败'
  } finally {
    loading.value = false
  }
})

/** 浏览量 +1 并拉取最新统计（失败静默降级：底部统计不展示，不影响文章阅读） */
async function loadStats() {
  try {
    const stats = await recordArticleView(slug.value)
    views.value = stats.views
    likes.value = stats.likes
    statsLoaded.value = true
  } catch {
    /* 统计接口不可用时忽略 */
  }
}

const title = computed(() => post.value?.config?.title || slug.value)
const dateStr = computed(() =>
  post.value?.config?.date ? dayjs(post.value.config.date).format('YYYY年 M月 D日') : ''
)
const tags = computed(() => post.value?.config?.tags || [])
const summary = computed(() => post.value?.config?.summary || '')
const cover = computed(() => post.value?.config?.cover || '')

/** 进入文章编辑页（仅博主可见入口） */
function goEdit() {
  router.push({ name: 'blog-edit', params: { slug: slug.value } })
}

/** 删除文章：数据源文章转隐藏记录，本地文章直接移除，成功后回列表；同时清理 AI 知识库向量 */
function doDelete() {
  deleteError.value = ''
  try {
    localArticles.deleteArticle(slug.value)
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : '删除失败，请稍后重试'
    confirmingDelete.value = false
    return
  }
  // 知识库向量清理：不阻塞跳转，失败静默（可在 AI 设置中重建兜底）
  ragDeleteArticle(slug.value).catch(() => {
    /* 向量删除失败不影响文章删除结果 */
  })
  router.push('/blog')
}

/** 复制按钮（markdown.ts 在代码块中注入了 data-copy-code，采用事件委托） */
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const btn = target.closest?.('.code-block-copy-btn') as HTMLElement | null
  if (!btn) return
  const encoded = btn.getAttribute('data-copy-code') || ''
  if (!encoded) return
  const code = decodeURIComponent(encoded)
  navigator.clipboard
    .writeText(code)
    .then(() => {
      btn.textContent = '已复制'
      window.setTimeout(() => (btn.innerText = ''), 1200)
    })
    .catch(() => {
      /* ignore */
    })
}
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-[1140px] items-start justify-center gap-6 px-6 pt-24 pb-16"
  >
    <!-- 加载中 / 错误 -->
    <div v-if="loading" class="card px-6 py-3 text-sm text-secondary">加载中…</div>
    <div v-else-if="error" class="card px-6 py-3 text-sm text-secondary">
      {{ error }}
    </div>

    <!-- 正文 -->
    <article
      v-else-if="post"
      class="card bg-article static w-full max-w-[740px] shrink !rounded-[24px] !p-6 md:!p-8"
    >
      <h1 class="text-2xl font-semibold">{{ title }}</h1>

      <div class="text-secondary mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        <span v-for="t in tags" :key="t">#{{ t }}</span>
      </div>

      <div v-if="dateStr" class="text-secondary mt-3 text-center text-sm">
        {{ dateStr }}
      </div>

      <div
        v-if="summary && config.siteContent.summaryInContent"
        class="text-secondary mt-6 text-center text-sm"
      >
        “{{ summary }}”
      </div>

      <div class="prose mt-8 max-w-none" v-html="post.html" @click="onContentClick" />

      <!-- 博主操作区：仅博主（is_superuser 超级管理员）可见，位于文章最下方 -->
      <footer
        v-if="auth.isSuperuser"
        class="mt-10 border-t pt-6"
        style="border-color: var(--color-border)"
      >
        <div v-if="!confirmingDelete" class="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            class="btn-rounded flex items-center gap-2 border px-5 py-2 text-sm font-medium text-brand transition-all hover:scale-105 hover:shadow-md"
            title="编辑本页内容"
            @click="goEdit"
          >
            <SquarePen :size="16" />
            编辑本页内容
          </button>
          <button
            type="button"
            class="btn-rounded flex items-center gap-2 border px-5 py-2 text-sm font-medium transition-all hover:scale-105 hover:shadow-md"
            style="color: #e5484d; border-color: #e5484d"
            title="删除本页文章"
            @click="confirmingDelete = true"
          >
            <Trash2 :size="16" />
            删除文章
          </button>
        </div>
        <div v-else class="flex flex-wrap items-center justify-center gap-3">
          <span class="text-secondary text-sm"
            >确认删除《{{ title }}》？删除后不可恢复。</span
          >
          <button
            type="button"
            class="btn-rounded border px-5 py-2 text-sm font-medium text-white transition-all hover:scale-105"
            style="background-color: #e5484d; border-color: #e5484d"
            @click="doDelete"
          >
            确认删除
          </button>
          <button
            type="button"
            class="text-secondary btn-rounded border px-5 py-2 text-sm"
            @click="confirmingDelete = false"
          >
            取消
          </button>
        </div>
        <p v-if="deleteError" class="mt-3 text-center text-xs" style="color: #e5484d">
          {{ deleteError }}
        </p>
      </footer>

      <!-- 底部统计：浏览量（进入页面自动 +1）/ 点赞数，最下面一行（后端统计） -->
      <div
        v-if="statsLoaded"
        class="text-secondary mt-10 flex items-center justify-center gap-6 border-t pt-6 text-sm"
        style="border-color: var(--color-border)"
      >
        <span class="flex items-center gap-2" title="浏览量">
          <Eye :size="15" />
          浏览 {{ views }}
        </span>
        <span class="flex items-center gap-2" title="点赞数">
          <Heart :size="15" />
          点赞 {{ likes }}
        </span>
      </div>
    </article>

    <!-- 侧栏（桌面端） -->
    <BlogSidebar
      v-if="post && !maxSM"
      :cover="cover || undefined"
      :summary="summary || undefined"
      :toc="post.toc"
      :slug="slug"
    />

    <!-- 移动端 TOC / 点赞 -->
    <div
      v-if="post && maxSM"
      class="card fixed right-4 bottom-6 z-40 flex items-center gap-2 !rounded-full !p-2"
    >
      <a
        v-if="post.toc.length"
        href="#"
        @click.prevent=""
        title="目录"
        class="text-sm"
      >
        目录
      </a>
    </div>
  </div>
</template>
