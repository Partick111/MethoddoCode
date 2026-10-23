<script setup lang="ts">
/**
 * LogoutConfirmModal.vue —— 退出登录确认弹窗
 *
 * 由 AIChatEntry 在 AI 面板标题栏「退出登录」按钮点击时弹出；
 * 确认后调用 auth.logout()（本地先行清除，再通知后端登出接口），
 * 成功后关闭自身并 emit('logout')，由调用方处理面板关闭等后续。
 *
 * 交互：取消 / Esc / 点击遮罩关闭；提交过程中禁止关闭；
 * 视觉复用项目 .card / 圆角 / backdrop-blur 体系，与 AuthModal 一致的玻璃质感。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

/** 由父组件控制显隐：<LogoutConfirmModal v-model:open="show" @logout="..." /> */
const visible = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ logout: [] }>()

const auth = useAuthStore()
const username = computed(() => auth.user?.username ?? '')
const submitting = ref(false)
const error = ref('')

function close() {
  if (submitting.value) return
  visible.value = false
}

/** 确认退出：auth.logout() 内部先清本地登录态（避免 401 弹「会话过期」），后端失败不影响结果 */
async function confirmLogout() {
  if (submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    await auth.logout()
    visible.value = false
    emit('logout')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '退出失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

/** 每次打开时重置状态 */
watch(visible, (v) => {
  if (v) {
    error.value = ''
    submitting.value = false
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 半透明遮罩：点击关闭；z-index 高于 AI 面板（60） -->
    <Transition name="logout-mask">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- 确认面板：居中显示，pointer-events-none 保证空白区域不拦截点击 -->
    <Transition name="logout-modal">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center p-4"
      >
        <section
          class="card logout-panel pointer-events-auto relative w-[360px] max-w-full !rounded-[28px] !p-6"
          role="alertdialog"
          aria-modal="true"
          aria-label="退出登录"
        >
          <header class="flex items-start gap-3">
            <span
              class="text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
            >
              <LogOut :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-medium">退出登录</h2>
              <p class="text-secondary mt-1 text-xs leading-relaxed">
                确定要退出当前账号
                <span v-if="username" class="text-brand font-medium">{{ username }}</span>
                吗？退出后需重新登录才能使用 AI 助手。
              </p>
            </div>
          </header>

          <p v-if="error" class="mt-3 text-xs" style="color: #e5484d">{{ error }}</p>

          <footer class="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              class="text-secondary rounded-xl border px-4 py-2 text-sm transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="submitting"
              @click="close"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-xl px-5 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style="background-color: #e5484d"
              :disabled="submitting"
              @click="confirmLogout"
            >
              {{ submitting ? '退出中…' : '退出登录' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩淡入 / 淡出 */
.logout-mask-enter-active,
.logout-mask-leave-active {
  transition: opacity 0.24s ease;
}
.logout-mask-enter-from,
.logout-mask-leave-to {
  opacity: 0;
}

/* 面板淡入 + 轻微放大 */
.logout-modal-enter-active,
.logout-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.logout-modal-enter-from,
.logout-modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .logout-mask-enter-active,
  .logout-mask-leave-active,
  .logout-modal-enter-active,
  .logout-modal-leave-active {
    transition: none;
  }
}
</style>
