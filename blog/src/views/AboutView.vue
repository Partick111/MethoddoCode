<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Editor from '@tinymce/tinymce-vue'
import { Save, SquarePen } from 'lucide-vue-next'
import DOMPurify from 'dompurify'
import BilibiliIcon from '@/components/icons/BilibiliIcon.vue'
import LikeButton from '@/components/LikeButton.vue'
import { getAbout } from '@/api/blog'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'
import { htmlToPlainText } from '@/stores/local-articles'
import { makeTinyMceInit } from '@/utils/tinymce'
import type { About } from '@/types/blog'

const STORAGE_KEY = 'yysuni_about_edit'

/**
 * 本地编辑记录（富文本结构）：{ title, html }
 * 旧版为 { title, list } 分组简本文结构，载入时自动迁移为富文本
 */
interface LocalAbout {
  title?: string
  html: string
}

const config = useConfigStore()
const auth = useAuthStore()
const data = ref<About | null>(null)
const loading = ref(true)

/** 本地编辑记录（null 表示未编辑过，展示数据源分组卡片） */
const localAbout = ref<LocalAbout | null>(null)

/** 编辑态：编辑标记 + 标题 + 富文本正文 */
const editing = ref(false)
const editTitle = ref('')
const editHtml = ref('')
const editError = ref('')

/** TinyMCE 自托管配置：见 utils/tinymce.ts（与写文章弹窗 / 文章编辑页一致） */
const init = makeTinyMceInit(320, '编辑关于页正文…')

const bilibiliUrl =
  (config.siteContent.socialButtons ?? []).find(b => b.type === 'bilibili')?.value || '#'

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** about 对象（数据源分组结构）-> 富文本 HTML（进入编辑器） */
function aboutToHtml(about: About): string {
  const parts: string[] = []
  for (const group of about.list ?? []) {
    if (group.title) parts.push(`<h2>${escapeHtml(group.title)}</h2>`)
    if (group.list?.length) {
      parts.push(`<ul>${group.list.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`)
    }
  }
  return parts.join('\n')
}

/** 读取本地已保存内容；旧版分组结构自动迁移为富文本结构并写回 */
function loadFromStorage(): LocalAbout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalAbout> & Partial<About>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.html === 'string') {
      return { title: parsed.title, html: parsed.html }
    }
    const migrated: LocalAbout = {
      title: parsed.title,
      html: aboutToHtml({ title: parsed.title, list: parsed.list })
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return null
  }
}

/** 展示标题：本地记录优先，其次数据源 */
const displayTitle = computed(() => localAbout.value?.title || data.value?.title || '关于')

/** 展示正文：本地富文本记录（DOMPurify 二次清洗后渲染） */
const displayHtml = computed(() =>
  localAbout.value ? DOMPurify.sanitize(localAbout.value.html) : ''
)

function startEdit() {
  editTitle.value = displayTitle.value
  editHtml.value = localAbout.value?.html ?? (data.value ? aboutToHtml(data.value) : '')
  editError.value = ''
  editing.value = true
}

function saveEdit() {
  const title = editTitle.value.trim() || '关于'
  if (!htmlToPlainText(editHtml.value)) {
    editError.value = '正文不能为空'
    return
  }
  try {
    const next: LocalAbout = { title, html: editHtml.value }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    localAbout.value = next
    editing.value = false
  } catch {
    editError.value = '保存失败（本地存储不可用或容量已满）'
  }
}

function cancelEdit() {
  editing.value = false
  editError.value = ''
}

onMounted(async () => {
  localAbout.value = loadFromStorage()
  if (localAbout.value) {
    loading.value = false
    return
  }
  try {
    data.value = await getAbout()
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div
    class="relative mx-auto flex w-full max-w-[840px] flex-col items-center gap-6 px-6 pt-32 pb-16"
  >
    <!-- card 类自带 absolute，须补 relative 使其回归文档流，否则正文/加载卡片不占高度导致下方点赞按钮与内容重叠错位 -->
    <div v-if="loading" class="card relative px-6 py-3 text-sm text-secondary">加载中…</div>

    <template v-else>
      <div class="mb-12 w-full text-center">
        <h1 class="text-4xl font-bold">{{ displayTitle }}</h1>
      </div>

      <!-- 编辑模式：标题 + TinyMCE 富文本（保存后写入 localStorage 本地持久化，夜间样式随主题变量自动协调） -->
      <div v-if="editing" class="card relative w-full !rounded-[24px] !p-4 md:!p-6">
        <div class="mb-3">
          <span class="text-secondary mb-1 block text-xs">标题</span>
          <input
            v-model="editTitle"
            type="text"
            maxlength="40"
            placeholder="关于页标题"
            class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
            style="background-color: var(--color-card)"
          />
        </div>
        <div class="mb-1">
          <span class="text-secondary mb-1 block text-xs">正文</span>
          <div class="overflow-hidden rounded-2xl border">
            <Editor v-model="editHtml" :init="init" tinymce-script-src="/tinymce/tinymce.min.js" />
          </div>
        </div>
        <p v-if="editError" class="mb-1 text-xs" style="color: #e5484d">{{ editError }}</p>
        <div class="mt-3 flex items-center justify-end gap-3">
          <button
            type="button"
            class="text-secondary rounded-xl border px-4 py-2 text-sm transition-colors hover:text-brand"
            @click="cancelEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="brand-btn flex items-center gap-2 rounded-xl px-5 py-2 text-sm text-white"
            @click="saveEdit"
          >
            <Save :size="16" />
            保存
          </button>
        </div>
      </div>

      <!-- 本地富文本内容（博主编辑后的版本） -->
      <div
        v-else-if="displayHtml"
        class="card bg-article relative w-full !rounded-[24px] !p-6 md:!p-8"
      >
        <div class="prose max-w-none" v-html="displayHtml" />
      </div>

      <!-- 数据源分组卡片（尚未本地编辑过的默认展示） -->
      <div v-else class="flex w-full flex-col gap-6">
        <section
          v-for="(group, gi) in data?.list || []"
          :key="gi"
          class="card relative w-full"
        >
          <h2 v-if="group.title" class="text-lg font-semibold">
            {{ group.title }}
          </h2>
          <ul v-if="group.list?.length" class="mt-4 space-y-3">
            <li
              v-for="(line, li) in group.list"
              :key="li"
              class="text-secondary flex items-start gap-3 text-sm leading-relaxed"
            >
              <span class="bg-secondary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
              <span>{{ line }}</span>
            </li>
          </ul>
        </section>
      </div>

      <!-- 博主操作区：仅博主（超级管理员）可见，与页面内容分隔 -->
      <div
        v-if="auth.isSuperuser && !editing"
        class="flex w-full justify-center border-t pt-6"
        style="border-color: var(--color-border)"
      >
        <button
          type="button"
          class="btn-rounded flex items-center gap-2 border px-5 py-2 text-sm font-medium text-brand transition-all hover:scale-105 hover:shadow-md"
          title="编辑本页内容"
          @click="startEdit"
        >
          <SquarePen :size="16" />
          编辑本页内容
        </button>
      </div>

      <div class="mt-8 flex items-center justify-center gap-6">
        <a
          :href="bilibiliUrl || '#'"
          class="flex h-[53px] w-[53px] items-center justify-center rounded-full border border-gray-200 bg-white text-[#00a1d6] transition-transform hover:-translate-y-1 hover:scale-105"
        >
          <BilibiliIcon :size="24" />
        </a>
        <LikeButton slug="about" :delay="1200" />
      </div>
    </template>
  </div>
</template>
