<script setup lang="ts">
/**
 * ProjectModal.vue —— 「我的项目」新增 / 编辑弹窗
 *
 * 由我的项目页 ProjectListView 的「添加项目」/ 每条项目的编辑按钮打开（仅博主可见入口）；
 * 字段：名称（必填）/ 描述（可选）/ 项目链接（可选，缺省协议自动补 https://）/ 标签（可选，逗号分隔）。
 * record 为空时新增，否则编辑现有项目；提交写入 projects store，成功后关闭并 emit('saved')。
 * 交互与视觉：对齐 ShareLinkModal（Esc / 遮罩关闭、玻璃质感弹窗）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FolderPen, X } from 'lucide-vue-next'
import { useProjectsStore, type Project } from '@/stores/projects'

const visible = defineModel<boolean>('open', { default: false })
/** 编辑目标：null 表示新增 */
const props = defineProps<{ record?: Project | null }>()
const emit = defineEmits<{ saved: [] }>()

const store = useProjectsStore()

const isEdit = computed(() => !!props.record)

const name = ref('')
const description = ref('')
const url = ref('')
/** 标签：逗号分隔（中英文逗号均可） */
const tagsText = ref('')
const error = ref('')

function close() {
  visible.value = false
}

/** 缺省协议时自动补 https:// */
function normalizeUrl(input: string): string {
  const t = input.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function submit() {
  error.value = ''
  const finalName = name.value.trim()
  if (!finalName) {
    error.value = '请填写项目名称'
    return
  }

  // 链接可选；填写时校验格式
  const rawUrl = url.value.trim()
  let finalUrl = ''
  if (rawUrl) {
    finalUrl = normalizeUrl(rawUrl)
    try {
      new URL(finalUrl)
    } catch {
      error.value = '链接格式不正确，请检查后重试'
      return
    }
  }

  // 标签：逗号分隔 → 数组（去重、去空）
  const tags = [
    ...new Set(
      tagsText.value
        .split(/[,，]/)
        .map(tag => tag.trim())
        .filter(Boolean)
    )
  ]

  const payload = {
    name: finalName,
    description: description.value.trim(),
    tags,
    url: finalUrl
  }

  const ok = props.record
    ? store.updateProject({ id: props.record.id, ...payload })
    : store.addProject(payload)
  if (!ok) {
    error.value = '保存失败（本地存储不可用或容量已满）'
    return
  }
  visible.value = false
  emit('saved')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

/** 每次打开时重置表单：编辑模式回填项目，新增模式留空 */
watch(visible, v => {
  if (!v) return
  error.value = ''
  if (props.record) {
    name.value = props.record.name
    description.value = props.record.description
    url.value = props.record.url ?? ''
    tagsText.value = props.record.tags.join(', ')
  } else {
    name.value = ''
    description.value = ''
    url.value = ''
    tagsText.value = ''
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点击关闭；z-index 高于 AI 面板（60） -->
    <Transition name="project-mask">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- 编辑面板：居中显示 -->
    <Transition name="project-modal">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center p-4"
      >
        <section
          class="card project-panel pointer-events-auto relative w-[460px] max-w-full !rounded-[28px] !p-6"
          role="dialog"
          aria-modal="true"
          :aria-label="isEdit ? '编辑项目' : '添加项目'"
        >
          <header class="flex items-start gap-3">
            <span
              class="text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
            >
              <FolderPen :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-medium">{{ isEdit ? '编辑项目' : '添加项目' }}</h2>
              <p class="text-secondary mt-0.5 text-xs">
                {{ isEdit ? '修改后的内容会立刻更新到项目列表' : '添加后会出现在项目列表最前，链接可直接点击访问' }}
              </p>
            </div>
            <button
              type="button"
              class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
              title="关闭（Esc）"
              aria-label="关闭"
              @click="close"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="mt-4 space-y-3">
            <div>
              <span class="text-secondary mb-1 block text-xs">名称</span>
              <input
                v-model="name"
                type="text"
                maxlength="60"
                placeholder="例如：我的新项目"
                class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">项目链接（可选）</span>
              <input
                v-model="url"
                type="url"
                placeholder="https://github.com/example/repo（可省略 https://）"
                class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">标签（可选，用逗号分隔）</span>
              <input
                v-model="tagsText"
                type="text"
                maxlength="160"
                placeholder="Vue 3, TypeScript, Vite"
                class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">描述（可选）</span>
              <textarea
                v-model="description"
                rows="3"
                maxlength="400"
                placeholder="简单介绍这个项目…"
                class="text-primary w-full resize-none rounded-2xl border px-3 py-2 text-sm leading-relaxed outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
          </div>

          <p v-if="error" class="mt-3 text-xs" style="color: #e5484d">{{ error }}</p>

          <footer class="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              class="text-secondary rounded-xl border px-4 py-2 text-sm transition-colors hover:text-brand"
              @click="close"
            >
              取消
            </button>
            <button
              type="button"
              class="brand-btn rounded-xl px-5 py-2 text-sm text-white"
              @click="submit"
            >
              {{ isEdit ? '保存修改' : '添加' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.project-mask-enter-active,
.project-mask-leave-active {
  transition: opacity 0.24s ease;
}
.project-mask-enter-from,
.project-mask-leave-to {
  opacity: 0;
}

.project-modal-enter-active,
.project-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.project-modal-enter-from,
.project-modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .project-mask-enter-active,
  .project-mask-leave-active,
  .project-modal-enter-active,
  .project-modal-leave-active {
    transition: none;
  }
}
</style>
