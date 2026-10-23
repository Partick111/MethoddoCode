<script setup lang="ts">
/**
 * AuthModal.vue —— 登录 / 注册弹窗（已接通后端真实认证）
 *
 * 来源：由 AIChatEntry 在「未登录点击 AI 助手入口」或「登录态过期（401）」时弹出；
 *       登录成功后由父组件接续打开 AI 面板。
 * 说明：
 * - 注册仅创建普通读者账号，本页不提供「注册成为博主」，博主账号需到后台开通；
 * - 游客浏览行为完全不受影响，页面初始加载不会自动弹出本弹窗；
 * - 账号校验与真实请求在 src/stores/auth.ts（后端接口：/api/auth/login | register，JWT 由 Django SimpleJWT 签发）。
 *
 * 交互：登录/注册 tab 切换、Enter 提交、关闭按钮 / Esc / 点击遮罩关闭、移动端自适应；
 * 视觉复用项目 .card / 圆角 / backdrop-blur 体系，与 AIChatEntry 面板保持一致的玻璃质感。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, useAuthStore } from '@/stores/auth'

/** 由父组件控制显隐：<AuthModal v-model:open="show" @success="..." /> */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  /** 顶部引导提示（如「登录已过期，请重新登录」）；为空时不展示 */
  notice?: string
}>()
const emit = defineEmits<{ success: [username: string] }>()

const auth = useAuthStore()

const tabs = [
  { value: 'login' as const, label: '登录' },
  { value: 'register' as const, label: '注册' }
]

const tab = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const submitting = ref(false)

const isRegister = computed(() => tab.value === 'register')
const title = computed(() => (isRegister.value ? '注册账号' : '登录'))

function resetFields() {
  password.value = ''
  confirmPassword.value = ''
  error.value = ''
}

function close() {
  if (submitting.value) return
  open.value = false
}

function switchTab(next: 'login' | 'register') {
  if (tab.value === next) return
  tab.value = next
  resetFields()
}

/** 表单提交：前置校验 → 调用 store（后端真实接口）→ 成功后关闭并通知父组件 */
async function submit() {
  error.value = ''
  const name = username.value.trim()

  if (!name) {
    error.value = '请输入用户名'
    return
  }
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    error.value = `用户名需为 ${USERNAME_MIN}-${USERNAME_MAX} 个字符`
    return
  }
  if (!password.value) {
    error.value = '请输入密码'
    return
  }
  if (password.value.length < PASSWORD_MIN) {
    error.value = `密码至少 ${PASSWORD_MIN} 位`
    return
  }
  if (isRegister.value && password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  submitting.value = true
  try {
    if (isRegister.value) await auth.register(name, password.value)
    else await auth.login(name, password.value)

    const loggedName = auth.user?.username ?? name
    open.value = false
    resetFields()
    emit('success', loggedName)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}

/** 每次打开时清空上一次的密码与错误提示（保留已填用户名，便于修改后重试） */
watch(open, (v) => {
  if (v) resetFields()
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 半透明遮罩：点击关闭 -->
    <Transition name="auth-mask">
      <div
        v-if="open"
        class="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- 面板：居中显示，pointer-events-none 保证空白区域不拦截点击 -->
    <Transition name="auth-modal">
      <div v-if="open" class="pointer-events-none fixed inset-0 z-[75] flex items-center justify-center p-4">
        <section
          class="card auth-panel pointer-events-auto relative w-[400px] max-w-full !rounded-[32px] !p-6 max-sm:!rounded-[28px]"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-medium">{{ title }}</h2>
              <p class="text-secondary mt-1 text-xs">
                登录后即可使用 AI 助手；游客可直接浏览全部内容
              </p>
            </div>
            <button
              type="button"
              class="text-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
              title="关闭（Esc）"
              aria-label="关闭"
              @click="close"
            >
              <X :size="16" />
            </button>
          </header>

          <!-- 登录 / 注册 tab -->
          <div
            class="mt-4 flex gap-1 rounded-2xl border p-1"
            :style="{ backgroundColor: 'var(--color-card)' }"
          >
            <button
              v-for="item in tabs"
              :key="item.value"
              type="button"
              class="flex-1 rounded-xl py-1.5 text-sm transition-colors"
              :class="tab === item.value ? 'bg-brand text-white' : 'text-secondary hover:text-brand'"
              @click="switchTab(item.value)"
            >
              {{ item.label }}
            </button>
          </div>

          <!-- 登录引导提示（如「登录已过期，请重新登录」，由父组件传入） -->
          <p
            v-if="props.notice"
            class="mt-3 rounded-2xl border px-3 py-2 text-xs leading-relaxed"
            :style="{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-brand)',
              color: 'var(--color-brand)'
            }"
          >
            {{ props.notice }}
          </p>

          <!-- 表单：Enter 直接提交 -->
          <form class="mt-4 space-y-3" @submit.prevent="submit">
            <label class="block">
              <span class="text-secondary mb-1 block text-xs">用户名</span>
              <input
                v-model="username"
                type="text"
                autocomplete="username"
                class="focus:border-brand w-full rounded-2xl border px-3 py-2 text-sm focus:outline-none"
                :style="{ backgroundColor: 'var(--color-card)', color: 'var(--color-primary)' }"
                :placeholder="`${USERNAME_MIN}-${USERNAME_MAX} 个字符`"
              />
            </label>

            <label class="block">
              <span class="text-secondary mb-1 block text-xs">密码</span>
              <input
                v-model="password"
                type="password"
                :autocomplete="isRegister ? 'new-password' : 'current-password'"
                class="focus:border-brand w-full rounded-2xl border px-3 py-2 text-sm focus:outline-none"
                :style="{ backgroundColor: 'var(--color-card)', color: 'var(--color-primary)' }"
                :placeholder="`至少 ${PASSWORD_MIN} 位`"
              />
            </label>

            <label v-if="isRegister" class="block">
              <span class="text-secondary mb-1 block text-xs">确认密码</span>
              <input
                v-model="confirmPassword"
                type="password"
                autocomplete="new-password"
                class="focus:border-brand w-full rounded-2xl border px-3 py-2 text-sm focus:outline-none"
                :style="{ backgroundColor: 'var(--color-card)', color: 'var(--color-primary)' }"
                placeholder="再次输入密码"
              />
            </label>

            <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

            <button
              type="submit"
              class="brand-btn w-full justify-center !rounded-2xl py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="submitting"
            >
              {{ submitting ? '处理中…' : isRegister ? '注册并登录' : '登录' }}
            </button>
          </form>

          <p class="text-secondary mt-3 text-[11px] leading-relaxed">
            <template v-if="isRegister">
              本页仅注册普通读者账号，不提供「注册成为博主」；需要博主权限请到后台开通账号。
            </template>
            <template v-else>
              还没有账号？切到「注册」即可创建普通读者账号；博主账号由后台开通。
            </template>
          </p>
          <p class="text-secondary mt-1 text-[10px] leading-relaxed">
            开发者接入：认证接口为 <code>/api/auth/</code>（Django + DRF + SimpleJWT，见 blog_terminal/），开发期由 Vite 代理转发。
          </p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩淡入 / 淡出 */
.auth-mask-enter-active,
.auth-mask-leave-active {
  transition: opacity 0.24s ease;
}
.auth-mask-enter-from,
.auth-mask-leave-to {
  opacity: 0;
}

/* 面板淡入 + 轻微放大 */
.auth-modal-enter-active,
.auth-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.auth-modal-enter-from,
.auth-modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .auth-mask-enter-active,
  .auth-mask-leave-active,
  .auth-modal-enter-active,
  .auth-modal-leave-active {
    transition: none;
  }
}
</style>
