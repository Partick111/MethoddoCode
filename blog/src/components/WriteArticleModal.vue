<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Editor from '@tinymce/tinymce-vue'
import { ragIndexArticle } from '@/api/ai'
import categoriesJson from '@/mocks/categories.json'
import { htmlToPlainText, useLocalArticlesStore } from '@/stores/local-articles'
import { useAuthStore } from '@/stores/auth'
import { makeTinyMceInit } from '@/utils/tinymce'
import type { Category, LocalArticle } from '@/types/blog'

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ published: [article: LocalArticle] }>()

const store = useLocalArticlesStore()
const auth = useAuthStore()
const categories = categoriesJson as Category[]

const title = ref('')
const category = ref('')
const content = ref('')
const error = ref('')
const success = ref('')
const submitting = ref(false)

/** TinyMCE 自托管配置：见 utils/tinymce.ts */
const init = makeTinyMceInit(340)

watch(visible, isOpen => {
  if (isOpen) {
    error.value = ''
    success.value = ''
  }
})

function close() {
  if (submitting.value) return
  visible.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && visible.value) close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function publish() {
  const trimmedTitle = title.value.trim()
  const plainText = htmlToPlainText(content.value)

  error.value = ''
  success.value = ''

  // 权限保险：入口虽仅博主可见，仍拒绝非博主提交
  if (!auth.isSuperuser) {
    error.value = '无权限：仅博主可发布文章'
    return
  }
  if (!trimmedTitle) {
    error.value = '请填写文章标题'
    return
  }
  if (!category.value) {
    error.value = '请选择所属分类'
    return
  }
  if (!plainText) {
    error.value = '请填写文章正文'
    return
  }

  submitting.value = true
  void publishFlow(trimmedTitle, plainText)
}

/** 发布流程：本地保存 → 同步 AI 知识库（RAG）→ 提示并延时关闭 */
async function publishFlow(trimmedTitle: string, plainText: string) {
  try {
    const article = store.addArticle({
      title: trimmedTitle,
      category: category.value,
      content: content.value
    })
    emit('published', article)
    title.value = ''
    category.value = ''
    content.value = ''
    // 同步 AI 知识库（RAG）：失败不阻塞发布结果，提示可稍后在设置中重建
    let ragNote = '，已同步到 AI 知识库'
    try {
      await ragIndexArticle({ slug: article.slug, title: article.title, content: plainText })
    } catch {
      ragNote = '（AI 知识库同步失败，可稍后在 AI 设置中重建）'
    }
    success.value = `《${article.title}》发布成功${ragNote}`
    window.setTimeout(() => {
      visible.value = false
    }, 1500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发布失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[200] overflow-y-auto bg-black/40 px-4 py-8 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        class="card mx-auto"
        style="
          position: relative;
          width: 100%;
          max-width: 780px;
          padding: 24px;
          border-radius: 24px;
        "
      >
        <header class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-primary text-lg font-medium">写文章</h2>
            <p class="text-secondary mt-1 text-xs">
              发布后将出现在博客列表与首页「最新文章」中，并自动同步进 AI 知识库
            </p>
          </div>
          <button
            type="button"
            class="text-secondary hover:text-primary -mt-1 px-2 text-2xl leading-none"
            aria-label="关闭"
            @click="close"
          >
            ×
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
          <div class="overflow-hidden rounded-2xl border">
            <Editor
              v-if="visible"
              v-model="content"
              :init="init"
              tinymce-script-src="/tinymce/tinymce.min.js"
            />
          </div>
        </div>

        <p v-if="error" class="text-xs" style="color: #e5484d">{{ error }}</p>
        <p v-else-if="success" class="text-xs" style="color: #2f9e44">{{ success }}</p>

        <footer class="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            class="text-secondary rounded-xl border px-4 py-2 text-sm"
            @click="close"
          >
            取消
          </button>
          <button
            type="button"
            class="brand-btn rounded-xl px-5 py-2 text-sm text-white disabled:opacity-60"
            :disabled="submitting"
            @click="publish"
          >
            发布
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
