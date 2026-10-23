<script setup lang="ts">
/**
 * ProjectListView.vue —— 「我的项目」页面
 *
 * 数据来自 projects store（默认 mock-projects + 博主新增/编辑，localStorage 持久化）。
 * 卡片列表：项目名 + 描述 + 技术栈标签 + 可选访问链接；样式与全站卡片体系统一。
 * 博主（超级管理员）可添加项目（含链接与标签）、编辑、删除（内联二次确认）。
 */
import { ref } from 'vue'
import { ExternalLink, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import ProjectModal from '@/components/ProjectModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useProjectsStore, type Project } from '@/stores/projects'

const auth = useAuthStore()
const store = useProjectsStore()

const showModal = ref(false)
/** 编辑目标：null 表示新增 */
const editing = ref<Project | null>(null)
/** 正在确认删除的项目 id（内联二次确认） */
const confirmingId = ref('')
const deleteError = ref('')

function openAdd() {
  editing.value = null
  showModal.value = true
}

function openEdit(project: Project) {
  editing.value = project
  showModal.value = true
}

function toggleConfirm(project: Project) {
  deleteError.value = ''
  confirmingId.value = confirmingId.value === project.id ? '' : project.id
}

function doRemove(project: Project) {
  if (!store.removeProject(project)) {
    deleteError.value = '删除失败（本地存储不可用）'
  }
  confirmingId.value = ''
}
</script>

<template>
  <div
    class="relative mx-auto flex w-full max-w-[840px] flex-col items-center gap-6 px-6 pt-32 pb-16"
  >
    <!-- 页头 -->
    <div class="mb-8 w-full text-center">
      <h1 class="text-4xl font-bold">我的项目</h1>
      <p class="text-secondary mt-3 text-sm">做过的一些东西，持续更新中</p>
    </div>

    <!-- 博主操作：添加项目（仅超级管理员可见） -->
    <div v-if="auth.isSuperuser" class="-mt-4 flex w-full justify-end">
      <button
        type="button"
        class="brand-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white"
        @click="openAdd"
      >
        <Plus :size="15" />
        添加项目
      </button>
    </div>

    <p v-if="deleteError" class="w-full text-xs" style="color: #e5484d">{{ deleteError }}</p>

    <!-- 项目卡片列表 -->
    <div class="flex w-full flex-col gap-6">
      <section v-for="project in store.items" :key="project.id" class="card relative w-full !p-6">
        <div class="flex items-start gap-4">
          <!-- 图标块：首字符占位（与推荐分享卡风格一致） -->
          <div
            class="bg-brand-secondary/30 text-brand grid h-12 w-12 shrink-0 place-items-center rounded-xl border"
            style="border-color: var(--color-border)"
          >
            <FolderKanban :size="22" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-primary min-w-0 truncate text-base font-medium">
                {{ project.name }}
              </h2>

              <div class="flex shrink-0 items-center gap-1">
                <!-- 访问按钮：仅配置了 url 的项目展示 -->
                <a
                  v-if="project.url"
                  :href="project.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn-rounded text-secondary flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors hover:text-brand"
                  :style="{ borderColor: 'var(--color-border)' }"
                  :title="`访问 ${project.name}`"
                >
                  <ExternalLink :size="13" />
                  访问
                </a>
                <!-- 编辑按钮（仅博主） -->
                <button
                  v-if="auth.isSuperuser"
                  type="button"
                  class="text-secondary flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-brand"
                  :title="`编辑「${project.name}」`"
                  aria-label="编辑项目"
                  @click="openEdit(project)"
                >
                  <Pencil :size="14" />
                </button>
                <!-- 删除按钮（仅博主） -->
                <button
                  v-if="auth.isSuperuser"
                  type="button"
                  class="text-secondary flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                  style="color: #e5484d"
                  :title="`删除「${project.name}」`"
                  aria-label="删除项目"
                  @click="toggleConfirm(project)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>

            <p class="text-secondary mt-2 text-sm leading-relaxed">{{ project.description }}</p>

            <!-- 技术栈标签 -->
            <div v-if="project.tags.length" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="tag in project.tags"
                :key="tag"
                class="text-secondary rounded-full border px-2.5 py-0.5 text-xs"
                :style="{ borderColor: 'var(--color-border)' }"
              >
                {{ tag }}
              </span>
            </div>

            <!-- 链接行（有 url 时展示，可点击） -->
            <a
              v-if="project.url"
              :href="project.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-secondary mt-2 block truncate text-xs opacity-70 transition-colors hover:text-brand"
              :title="project.url"
            >
              {{ project.url }}
            </a>

            <!-- 删除内联二次确认（仅博主） -->
            <div
              v-if="auth.isSuperuser && confirmingId === project.id"
              class="mt-3 flex flex-wrap items-center gap-3 border-t pt-3"
              :style="{ borderColor: 'var(--color-border)' }"
            >
              <span class="text-secondary text-xs">确认删除「{{ project.name }}」？</span>
              <button
                type="button"
                class="rounded-lg px-3 py-1 text-xs text-white transition-opacity hover:opacity-90"
                style="background-color: #e5484d"
                @click="doRemove(project)"
              >
                确认删除
              </button>
              <button
                type="button"
                class="text-secondary rounded-lg border px-3 py-1 text-xs transition-colors hover:text-brand"
                :style="{ borderColor: 'var(--color-border)' }"
                @click="confirmingId = ''"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 空状态（数据被清空时兜底） -->
      <div v-if="!store.items.length" class="card relative px-6 py-3 text-secondary text-sm">
        暂无项目
      </div>
    </div>

    <!-- 新增 / 编辑弹窗（仅博主入口可见） -->
    <ProjectModal v-model:open="showModal" :record="editing" @saved="editing = null" />
  </div>
</template>
