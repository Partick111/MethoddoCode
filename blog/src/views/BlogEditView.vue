<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Editor from '@tinymce/tinymce-vue'
import { ArrowLeft, Save } from 'lucide-vue-next'
import { ragIndexArticle } from '@/api/ai'
import { getBlogDetail } from '@/api/blog'
import { htmlToPlainText, useLocalArticlesStore } from '@/stores/local-articles'
import { useAuthStore } from '@/stores/auth'
import { makeTinyMceInit } from '@/utils/tinymce'
import { markdownToBasicHtml } from '@/utils/markdown'
import categoriesJson from '@/mocks/categories.json'
import type { Category } from '@/types/blog'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const store = useLocalArticlesStore()

const categories = categoriesJson as Category[]
const slug = computed(() => String(route.params.slug || ''))

const loading = ref(true)
const loadError = ref('')

const title = ref('')
const category = ref('')
const content = ref('')
/** 原始发布日期：编辑不改变发布日期 */
const date = ref('')

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

/** TinyMCE 自托管配置：见 utils/tinymce.ts */
const init = makeTinyMceInit(480, '编辑文章正文…')

onMounted(async () => {
  // 游客由路由守卫拦截（requiresAuth）；此处无论是否博主都先载入数据，
  // 模板再根据 isSuperuser 决定渲染表单或无权限提示（避免 /me 校验未完成时短暂误判）
  try {
    const local = store.findBySlug(slug.value)
    if (local) {
      title.value = local.title
      category.value = local.categories[0] || ''
      date.value = local.date
      // 旧版 markdown 覆盖记录：转为 HTML 后进编辑器，保存后升级为 html 记录
      content.value =
        local.format === 'markdown' ? await markdownToBasicHtml(local.content) : local.content
    } else {
      const detail = await getBlogDetail(slug.value)
      title.value = detail.config?.title || slug.value
      category.value = detail.config?.categories?.[0] || ''
      date.value = detail.config?.date || ''
      // 数据源文章：Markdown 轻量转为 HTML 载入富文本编辑器，保存为本地 html 覆盖记录
      content.value =
        typeof detail.raw === 'string' ? await markdownToBasicHtml(detail.raw) : detail.html
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '文章加载失败'
  } finally {
    loading.value = false
  }
})

/** 正文纯文本（用于非空校验） */
const plainText = computed(() => htmlToPlainText(content.value))

function save() {
  saveError.value = ''
  saveSuccess.value = ''

  // 权限保险：入口虽仅博主可见，仍拒绝非博主提交
  if (!auth.isSuperuser) {
    saveError.value = '无权限：仅博主可编辑文章'
    return
  }
  if (!title.value.trim()) {
    saveError.value = '请填写文章标题'
    return
  }
  if (!category.value) {
    saveError.value = '请选择所属分类'
    return
  }
  if (!plainText.value) {
    saveError.value = '请填写文章正文'
    return
  }

  saving.value = true
  void saveFlow()
}

/** 保存流程：本地 upsert → 同步 AI 知识库（RAG，同 slug 覆盖旧向量）→ 延时返回文章页 */
async function saveFlow() {
  try {
    store.saveArticle(slug.value, {
      title: title.value,
      category: category.value,
      content: content.value,
      date: date.value,
      format: 'html'
    })
    // 同步 AI 知识库（RAG）：失败不阻塞保存结果，提示可稍后在设置中重建
    let ragNote = ''
    try {
      await ragIndexArticle({
        slug: slug.value,
        title: title.value.trim(),
        content: plainText.value
      })
    } catch {
      ragNote = '（AI 知识库同步失败，可稍后在 AI 设置中重建）'
    }
    saveSuccess.value = `保存成功${ragNote}，正在返回文章页…`
    window.setTimeout(() => {
      router.push({ name: 'blog-detail', params: { slug: slug.value } })
    }, ragNote ? 1500 : 700)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

function backToPost() {
  router.push({ name: 'blog-detail', params: { slug: slug.value } })
}
</script>

<template>
  <div class="mx-auto w-full max-w-[860px] px-6 pt-24 pb-16">
    <!-- 加载中 / 加载失败 -->
    <div v-if="loading" class="card px-6 py-3 text-sm text-secondary">加载中…</div>
    <div v-else-if="loadError" class="card px-6 py-6 text-center text-sm text-secondary">
      <p>{{ loadError }}</p>
      <button
        type="button"
        class="text-secondary btn-rounded mt-4 border px-5 py-2 text-sm"
        @click="router.push('/blog')"
      >
        返回文章列表
      </button>
    </div>

    <!-- 无权限（游客由路由守卫拦截；此处针对登录的非博主用户） -->
    <div v-else-if="!auth.isSuperuser" class="card px-6 py-10 text-center">
      <p class="text-primary text-sm">无权限访问：仅博主（超级管理员）可编辑文章。</p>
      <button
        type="button"
        class="text-secondary btn-rounded mt-4 border px-5 py-2 text-sm"
        @click="router.push('/')"
      >
        返回首页
      </button>
    </div>

    <!-- 编辑表单 -->
    <div v-else class="card bg-article !rounded-[24px] !p-6 md:!p-8">
      <header class="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-primary text-xl font-medium">编辑文章</h1>
          <p class="text-secondary mt-1 text-xs">slug：{{ slug }}</p>
        </div>
        <button
          type="button"
          class="text-secondary flex items-center gap-1 text-sm transition-opacity hover:opacity-70"
          @click="backToPost"
        >
          <ArrowLeft :size="16" />
          返回文章
        </button>
      </header>

      <div class="mb-3">
        <span class="text-secondary mb-1 block text-xs">标题</span>
        <input
          v-model="title"
          type="text"
          maxlength="80"
          placeholder="请输入文章标题"
          class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
          style="background-color: var(--color-card)"
        />
      </div>

      <div class="mb-3">
        <span class="text-secondary mb-1 block text-xs">所属分类</span>
        <select
          v-model="category"
          class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
          style="background-color: var(--color-card)"
        >
          <option value="">请选择分类</option>
          <option v-for="item in categories" :key="item.slug" :value="item.slug">
            {{ item.name || item.slug }}
          </option>
        </select>
      </div>

      <div class="mb-3">
        <span class="text-secondary mb-1 block text-xs">正文</span>
        <!-- 统一富文本编辑：数据源文章载入时已由 Markdown 转为 HTML，保存为本地覆盖记录 -->
        <div class="overflow-hidden rounded-2xl border">
          <Editor v-model="content" :init="init" tinymce-script-src="/tinymce/tinymce.min.js" />
        </div>
      </div>

      <p v-if="saveError" class="text-xs" style="color: #e5484d">{{ saveError }}</p>
      <p v-else-if="saveSuccess" class="text-xs" style="color: #2f9e44">{{ saveSuccess }}</p>

      <footer class="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          class="text-secondary rounded-xl border px-4 py-2 text-sm"
          @click="backToPost"
        >
          取消
        </button>
        <button
          type="button"
          class="brand-btn flex items-center gap-2 rounded-xl px-5 py-2 text-sm text-white disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          <Save :size="16" />
          保存修改
        </button>
      </footer>
    </div>
  </div>
</template>
