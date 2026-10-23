<script setup lang="ts">
/**
 * LifeRecordModal.vue —— 「生活记录」新增 / 编辑弹窗
 *
 * 由生活记录页 LifeView 的「添加动态」/ 每条记录的编辑按钮打开（仅博主可见入口）；
 * 字段：日期（默认今天）/ 标题（必填）/ 心情 emoji（可选）/ 正文（必填）/ 配图 URL（可选，每行一个）。
 * record 为空时新增，否则编辑现有记录；提交写入 life-records store，成功后关闭并 emit('saved')。
 * 交互与视觉：对齐 ShareLinkModal（Esc / 遮罩关闭、玻璃质感弹窗）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NotebookPen, X } from 'lucide-vue-next'
import { useLifeRecordsStore, type LifeRecord } from '@/stores/life-records'

const visible = defineModel<boolean>('open', { default: false })
/** 编辑目标：null 表示新增 */
const props = defineProps<{ record?: LifeRecord | null }>()
const emit = defineEmits<{ saved: [] }>()

const store = useLifeRecordsStore()

const isEdit = computed(() => !!props.record)

const date = ref('')
const title = ref('')
const mood = ref('')
const content = ref('')
/** 配图 URL：每行一个 */
const imagesText = ref('')
const error = ref('')

/** 本地日期 YYYY-MM-DD（避免 toISOString 的时区偏移） */
function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function close() {
  visible.value = false
}

function submit() {
  error.value = ''
  const finalTitle = title.value.trim()
  const finalContent = content.value.trim()
  const finalDate = date.value.trim()

  if (!finalDate) {
    error.value = '请选择日期'
    return
  }
  if (!finalTitle) {
    error.value = '请填写标题'
    return
  }
  if (!finalContent) {
    error.value = '请填写正文内容'
    return
  }

  const images = imagesText.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const payload = {
    date: finalDate,
    title: finalTitle,
    content: finalContent,
    mood: mood.value.trim(),
    images
  }

  const ok = props.record
    ? store.updateRecord({ id: props.record.id, ...payload })
    : store.addRecord(payload)
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

/** 每次打开时重置表单：编辑模式回填记录，新增模式留空 */
watch(visible, v => {
  if (!v) return
  error.value = ''
  if (props.record) {
    date.value = props.record.date
    title.value = props.record.title
    mood.value = props.record.mood ?? ''
    content.value = props.record.content
    imagesText.value = (props.record.images ?? []).join('\n')
  } else {
    date.value = todayLocal()
    title.value = ''
    mood.value = ''
    content.value = ''
    imagesText.value = ''
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点击关闭；z-index 高于 AI 面板（60） -->
    <Transition name="life-mask">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- 编辑面板：居中显示 -->
    <Transition name="life-modal">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center p-4"
      >
        <section
          class="card life-panel pointer-events-auto relative w-[460px] max-w-full !rounded-[28px] !p-6"
          role="dialog"
          aria-modal="true"
          :aria-label="isEdit ? '编辑动态' : '添加动态'"
        >
          <header class="flex items-start gap-3">
            <span
              class="text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
            >
              <NotebookPen :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-medium">{{ isEdit ? '编辑动态' : '添加动态' }}</h2>
              <p class="text-secondary mt-0.5 text-xs">
                {{ isEdit ? '修改后的内容会立刻更新到时间线' : '记录一条新的生活动态，会出现在时间线最前' }}
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
            <div class="flex gap-3">
              <div class="flex-1">
                <span class="text-secondary mb-1 block text-xs">日期</span>
                <input
                  v-model="date"
                  type="date"
                  class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                  style="background-color: var(--color-card)"
                />
              </div>
              <div class="w-28">
                <span class="text-secondary mb-1 block text-xs">心情（可选）</span>
                <input
                  v-model="mood"
                  type="text"
                  maxlength="8"
                  placeholder="🌱"
                  class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                  style="background-color: var(--color-card)"
                />
              </div>
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">标题</span>
              <input
                v-model="title"
                type="text"
                maxlength="60"
                placeholder="例如：周末去看了猫"
                class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">正文</span>
              <textarea
                v-model="content"
                rows="5"
                maxlength="1000"
                placeholder="记录一下今天的点滴…"
                class="text-primary w-full resize-none rounded-2xl border px-3 py-2 text-sm leading-relaxed outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">配图（可选，每行一个图片路径）</span>
              <textarea
                v-model="imagesText"
                rows="2"
                placeholder="/images/art/cat.png"
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
.life-mask-enter-active,
.life-mask-leave-active {
  transition: opacity 0.24s ease;
}
.life-mask-enter-from,
.life-mask-leave-to {
  opacity: 0;
}

.life-modal-enter-active,
.life-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.life-modal-enter-from,
.life-modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .life-mask-enter-active,
  .life-mask-leave-active,
  .life-modal-enter-active,
  .life-modal-leave-active {
    transition: none;
  }
}
</style>
