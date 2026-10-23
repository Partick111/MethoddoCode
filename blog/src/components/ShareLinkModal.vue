<script setup lang="ts">
/**
 * ShareLinkModal.vue —— 「推荐分享」添加链接弹窗
 *
 * 由推荐分享页 ShareView 的「添加链接」按钮打开（仅博主可见入口）；
 * 字段：名称（必填）/ 链接（必填，缺省协议自动补 https://）/ 描述（可选）。
 * 提交写入 share-links store（localStorage 持久化），成功后关闭并 emit('added')。
 * 交互与视觉：对齐 LogoutConfirmModal（Esc / 遮罩关闭、玻璃质感弹窗）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Link2, X } from 'lucide-vue-next'
import { useShareLinksStore } from '@/stores/share-links'

/** 由父组件控制显隐：<ShareLinkModal v-model:open="show" @added="..." /> */
const visible = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()

const store = useShareLinksStore()

const name = ref('')
const url = ref('')
const description = ref('')
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
  const finalUrl = normalizeUrl(url.value)
  const finalDesc = description.value.trim()

  if (!finalName) {
    error.value = '请填写链接名称'
    return
  }
  if (!url.value.trim()) {
    error.value = '请填写链接地址'
    return
  }
  try {
    new URL(finalUrl)
  } catch {
    error.value = '链接格式不正确，请检查后重试'
    return
  }
  if (!store.addLink({ name: finalName, url: finalUrl, description: finalDesc })) {
    error.value = '保存失败（本地存储不可用或容量已满）'
    return
  }
  visible.value = false
  emit('added')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

/** 每次打开时重置表单 */
watch(visible, v => {
  if (v) {
    name.value = ''
    url.value = ''
    description.value = ''
    error.value = ''
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点击关闭；z-index 高于 AI 面板（60） -->
    <Transition name="share-mask">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- 添加链接面板：居中显示 -->
    <Transition name="share-modal">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center p-4"
      >
        <section
          class="card share-panel pointer-events-auto relative w-[420px] max-w-full !rounded-[28px] !p-6"
          role="dialog"
          aria-modal="true"
          aria-label="添加链接"
        >
          <header class="flex items-start gap-3">
            <span
              class="text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
            >
              <Link2 :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-medium">添加链接</h2>
              <p class="text-secondary mt-0.5 text-xs">添加后会出现在推荐分享列表，链接可直接点击访问</p>
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
                maxlength="40"
                placeholder="例如：Uiverse"
                class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">链接</span>
              <input
                v-model="url"
                type="url"
                placeholder="https://example.com（可省略 https://）"
                class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                style="background-color: var(--color-card)"
              />
            </div>
            <div>
              <span class="text-secondary mb-1 block text-xs">描述（可选）</span>
              <textarea
                v-model="description"
                rows="3"
                maxlength="200"
                placeholder="简单介绍这个链接的内容…"
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
              添加
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.share-mask-enter-active,
.share-mask-leave-active {
  transition: opacity 0.24s ease;
}
.share-mask-enter-from,
.share-mask-leave-to {
  opacity: 0;
}

.share-modal-enter-active,
.share-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.share-modal-enter-from,
.share-modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .share-mask-enter-active,
  .share-mask-leave-active,
  .share-modal-enter-active,
  .share-modal-leave-active {
    transition: none;
  }
}
</style>
