<script setup lang="ts">
/**
 * AIChatEntry.vue —— 首页右下角「AI 聊天入口」组件
 *
 * 来源说明：
 * - 位置承接自原 HomeView 右下角 LikeButton 挂载点（wrapper `fixed right-5 bottom-5 z-40`），
 *   本组件自带该定位，不再依赖 likePosition 配置；
 * - LikeButton.vue 组件文件未做任何改动，仍服务于详情页侧栏与关于页（BlogSidebar / AboutView）；
 * - 入口图形为 public/images/cute.gif（源图 C:\Users\Lenovo\Pictures\Saved Pictures\cute.gif，
 *   228×228 十帧动图，复制进 public/images/ 后按圆形裁切显示）。
 *
 * 交互（登录门禁）：
 * - 未登录（游客）点击入口按钮 → 只弹出登录/注册弹窗（AuthModal），不打开 AI 面板；
 *   登录或注册成功后接续自动打开 AI 面板；
 * - 已登录点击入口按钮 → 直接开合 AI 面板；
 * - 页面初始加载不会自动弹出任何弹窗，游客浏览现有内容的行为完全不变；
 * - 面板自页面右侧滑出（桌面 460px 宽，移动端近满宽）；
 * - 面板定位 fixed top-20 right-0 bottom-4：顶部下移 80px 以避让右上角常驻的日夜切换按钮
 *   （DayNightButton 为 fixed top-4 right-4、尺寸 h-11 w-11，底边 y=60px），二者不再重叠；
 * - 输入框随面板加宽（whitespace-nowrap + 精简 placeholder），保证输入内容单行完整展示；
 * - 关闭方式：面板右上角关闭按钮 / Esc 键 / 点击左侧半透明遮罩；
 * - 视觉复用项目 .card / 圆角 / backdrop-blur 体系，面板 z-index 60（遮罩 55），高于导航卡 z-30。
 *
 * 对话（流式 + 对话记忆，见 composables/useAiChat.ts）：
 * - 左上角动态图标点击 → 菜单：「新建对话」（清空上下文）｜「历史记录」；
 * - 历史记录视图：会话列表（点击进入继续聊 / 行内删除 / 加载失败重试），
 *   标题栏返回按钮点击回到对话视图；
 * - 发送后经 WebSocket（Django Channels）流式渲染：token 逐段追加 + 打字光标，
 *   done 帧用完整回复覆盖并附来源（博客片段 / 联网结果）；
 * - 对话记忆由服务端 Django ORM checkpointer 按会话（thread_id）持久化，
 *   同一会话多轮自动携带历史上下文；凭证过期（4401）时引导重新登录；
 * - 标题栏「设置」按钮（关闭按钮左侧，仅登录用户可见）打开 AISettingsModal：
 *   配置大模型 / 嵌入模型（仅博主可改，普通读者只读）+ 知识库状态与重建。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, History, Link2, Plus, Send, Settings, Trash2, X } from 'lucide-vue-next'
import { isAxiosError } from 'axios'
import { deleteChatThread, listChatThreads, type ChatThreadItem } from '@/api/ai'
import AuthModal from '@/components/AuthModal.vue'
import AISettingsModal from '@/components/AISettingsModal.vue'
import LogoutConfirmModal from '@/components/LogoutConfirmModal.vue'
import { useAiChat } from '@/composables/useAiChat'
import { useAuthStore } from '@/stores/auth'
import { AUTH_EXPIRED_EVENT, AUTH_REQUIRED_EVENT, consumePendingAuthNotice } from '@/utils/auth-events'

/** 入口图形：猫咪动图 */
const GIF_URL = '/images/cute.gif'

const auth = useAuthStore()
/** 流式对话状态（WebSocket + checkpointer 对话记忆，见 composables/useAiChat.ts） */
const chat = useAiChat()
const { messages, streaming } = chat

const open = ref(false)
/** 面板视图：chat 对话（默认）/ history 历史记录（左上角图标菜单切换） */
const view = ref<'chat' | 'history'>('chat')
/** 左上角图标菜单（新建对话 / 历史记录）显隐 */
const menuOpen = ref(false)
/** 登录 / 注册弹窗显隐（未登录点击入口按钮、会话过期时打开） */
const showAuthModal = ref(false)
/** 退出登录确认弹窗显隐（标题栏「退出登录」按钮打开） */
const showLogoutConfirm = ref(false)
/** AI 设置弹窗显隐（标题栏「设置」按钮打开，位于关闭按钮左侧） */
const showSettings = ref(false)
/** 弹窗顶部引导提示（会话过期 / 需要登录时由全局事件携带） */
const authNotice = ref('')
const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)

/** 历史记录列表状态（打开历史视图时经 REST 拉取） */
const threads = ref<ChatThreadItem[]>([])
const threadsLoading = ref(false)
const threadsError = ref('')
/** 正在进入 / 删除的历史会话 id（行内禁用与状态提示） */
const loadingThreadId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

/** 流式已开始但尚无增量内容时，仍显示三点指示（有内容后显示打字光标） */
const streamHasText = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return Boolean(last && last.role === 'ai' && last.streaming && last.text)
})

/** 入口按钮点击：已登录直接开合面板；未登录只弹登录/注册弹窗，不打开面板 */
function onEntryClick() {
  if (auth.isLoggedIn) {
    open.value = !open.value
    return
  }
  authNotice.value = ''
  showAuthModal.value = true
}

/** 登录 / 注册成功回调：关闭弹窗并接续打开 AI 面板（重置连接与消息，使用新 token） */
function onAuthSuccess() {
  authNotice.value = ''
  chat.reset()
  view.value = 'chat'
  open.value = true
}

/**
 * 会话过期（401）/ 需要登录事件（由 api client 响应拦截器、路由守卫派发）：
 * 关闭 AI 面板并弹出登录弹窗，携带引导文案（如「登录已过期，请重新登录」）。
 */
function onAuthEvent(e: Event) {
  open.value = false
  consumePendingAuthNotice() // 本处已处理，清除待处理标记避免重复弹出
  authNotice.value = (e as CustomEvent<string>).detail || '请先登录'
  showAuthModal.value = true
}

function closePanel() {
  open.value = false
  showSettings.value = false
  menuOpen.value = false
}

/** 退出登录成功（确认弹窗回调）：关闭面板与设置弹窗，断开 WS 并恢复初始态 */
function onLoggedOut() {
  open.value = false
  showSettings.value = false
  view.value = 'chat'
  chat.reset()
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesEl.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 提取接口错误文案（后端错误统一 { detail }；配置缺失等直接展示给用户） */
function errText(e: unknown): string {
  if (isAxiosError(e)) {
    const detail = (e.response?.data as { detail?: string } | undefined)?.detail
    return detail || e.message || 'AI 接口暂时不可用，请稍后再试'
  }
  return e instanceof Error ? e.message : 'AI 接口暂时不可用，请稍后再试'
}

/** 发送：经 WebSocket 流式问答（对话记忆由服务端 checkpointer 按会话持久化） */
async function send() {
  const text = input.value.trim()
  if (!text || streaming.value) return

  input.value = ''
  await scrollToBottom()
  await chat.send(text)
}

/* -------------------- 左上角图标菜单 / 历史记录 -------------------- */

/** 图标点击：开合菜单（新建对话 / 历史记录） */
function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

/** 新建对话：清空当前上下文并回到对话视图（流式中不可用，菜单项已禁用） */
function startNewChat() {
  menuOpen.value = false
  if (streaming.value) return
  chat.newChat()
  view.value = 'chat'
  input.value = ''
  void scrollToBottom()
}

/** 打开历史记录视图并拉取会话列表 */
async function openHistory() {
  menuOpen.value = false
  view.value = 'history'
  await loadThreads()
}

/** 拉取会话列表（打开历史视图 / 出错重试） */
async function loadThreads() {
  threadsLoading.value = true
  threadsError.value = ''
  try {
    threads.value = (await listChatThreads()).threads || []
  } catch (e) {
    threadsError.value = errText(e)
  } finally {
    threadsLoading.value = false
  }
}

/** 历史视图返回按钮：回到对话 */
function backToChat() {
  view.value = 'chat'
  void scrollToBottom()
}

/** 点击某条历史：加载该会话消息并切回对话视图（此后提问延续该会话记忆） */
async function openThread(t: ChatThreadItem) {
  if (streaming.value || loadingThreadId.value) return
  loadingThreadId.value = t.id
  threadsError.value = ''
  try {
    await chat.loadThread(t.id)
    view.value = 'chat'
    await scrollToBottom()
  } catch (e) {
    threadsError.value = errText(e)
  } finally {
    loadingThreadId.value = null
  }
}

/** 删除某条历史（对话记忆一并清除，不可恢复；删除前确认） */
async function removeThread(t: ChatThreadItem) {
  if (deletingId.value || streaming.value) return
  const ok = window.confirm(`删除会话「${t.title || '未命名会话'}」？\n对话记忆将一并清除，且不可恢复。`)
  if (!ok) return
  deletingId.value = t.id
  threadsError.value = ''
  try {
    await deleteChatThread(t.id)
    threads.value = threads.value.filter((item) => item.id !== t.id)
    // 删除的恰是当前进行中的会话：重置上下文，避免后续提问携带已失效的 thread_id
    if (chat.threadId.value === t.id) chat.newChat()
  } catch (e) {
    threadsError.value = errText(e)
  } finally {
    deletingId.value = null
  }
}

/** 历史列表时间展示：今天显示 HH:mm，今年显示 M/D，更早显示 YYYY/M/D */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // 图标菜单打开：Esc 先收起菜单（面板保持打开）
  if (menuOpen.value) {
    menuOpen.value = false
    return
  }
  // 退出确认 / 设置弹窗打开时，Esc 由其自身监听处理，面板保持打开
  if (showLogoutConfirm.value || showSettings.value) return
  if (open.value) closePanel()
}

/** 面板打开时滚到底部 */
watch(open, (v) => {
  if (v) void scrollToBottom()
})

/** 消息增量（流式 token 追加 / 新消息）时自动跟随滚动到底部 */
watch(messages, () => void scrollToBottom(), { deep: true })

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthEvent)
  window.addEventListener(AUTH_REQUIRED_EVENT, onAuthEvent)
  // 事件早于本组件挂载（如路由守卫）时兜底弹出登录窗
  const pendingNotice = consumePendingAuthNotice()
  if (pendingNotice) {
    authNotice.value = pendingNotice
    showAuthModal.value = true
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthEvent)
  window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthEvent)
})
</script>

<template>
  <!-- 入口按钮：沿用原右下角悬浮位（fixed right-5 bottom-5），圆形 + .card 半透明玻璃风格，GIF 圆形裁切显示 -->
  <div class="fixed right-5 bottom-5 z-50 max-sm:right-4 max-sm:bottom-4">
    <button
      type="button"
      class="card enter-card relative flex h-[54px] w-[54px] items-center justify-center overflow-hidden !rounded-full !p-0 transition-transform duration-300 hover:scale-105"
      :title="open ? '收起 AI 助手' : auth.isLoggedIn ? '打开 AI 助手' : '登录后使用 AI 助手'"
      :aria-expanded="open"
      aria-label="AI 助手"
      @click="onEntryClick"
    >
      <img :src="GIF_URL" alt="AI 助手" class="pointer-events-none h-full w-full object-cover" />
    </button>
  </div>

  <!-- 登录 / 注册弹窗：未登录点击入口按钮 / 会话过期时弹出；成功后接续打开 AI 面板 -->
  <AuthModal v-model:open="showAuthModal" :notice="authNotice" @success="onAuthSuccess" />

  <!-- 退出登录确认弹窗：确认后清除登录态并关闭面板 -->
  <LogoutConfirmModal v-model:open="showLogoutConfirm" @logout="onLoggedOut" />

  <!-- AI 设置弹窗：模型配置（大模型 / 嵌入模型）+ 知识库管理；对登录用户开放，后端再校验博主权限 -->
  <AISettingsModal v-model:open="showSettings" />

  <!-- 遮罩：点击收起；移动端与桌面端共用 -->
  <Transition name="ai-mask">
    <div
      v-if="open"
      class="fixed inset-0 z-[55] bg-black/25 backdrop-blur-[2px]"
      aria-hidden="true"
      @click="closePanel"
    />
  </Transition>

  <!-- 右侧滑出面板：顶部 top-20（80px）让位于右上角常驻的日夜切换按钮（DayNightButton 为 fixed top-4 right-4、高 44px，底边 60px），
       底部 bottom-4 收边，高度由上下边界自适应；加宽至 460px 以便输入框内容单行完整显示 -->
  <Transition name="ai-panel">
    <aside
      v-if="open"
      class="card ai-panel fixed top-20 right-0 bottom-4 z-[60] flex w-[460px] max-w-[92vw] flex-col !rounded-r-none !rounded-l-[32px] !p-4 max-sm:top-20 max-sm:right-2 max-sm:bottom-4 max-sm:w-[calc(100%-1rem)] max-sm:max-w-none max-sm:!rounded-[28px]"
      role="dialog"
      aria-modal="true"
      aria-label="AI 助手面板"
    >
      <!-- 标题栏 -->
      <header class="relative z-20 flex items-center gap-3 border-b pb-3" style="border-color: var(--color-border)">
        <!-- 左上角动态图标：点击弹出「新建对话 / 历史记录」菜单 -->
        <div class="relative shrink-0">
          <button
            type="button"
            class="block h-9 w-9 overflow-hidden rounded-full transition-transform hover:scale-105"
            aria-label="AI 助手菜单"
            title="新建对话 / 历史记录"
            :aria-expanded="menuOpen"
            @click="toggleMenu"
          >
            <img :src="GIF_URL" alt="AI 助手" class="pointer-events-none h-full w-full object-cover" />
          </button>
          <Transition name="ai-menu">
            <div
              v-if="menuOpen"
              class="absolute top-11 left-0 z-20 w-32 overflow-hidden rounded-2xl border shadow-lg"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="streaming"
                title="新建对话"
                @click="startNewChat"
              >
                <Plus :size="14" />
                新建对话
              </button>
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-xs transition-colors hover:bg-white/60"
                :style="{ borderColor: 'var(--color-border)' }"
                title="查看历史记录"
                @click="openHistory"
              >
                <History :size="14" />
                历史记录
              </button>
            </div>
          </Transition>
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-medium">{{ view === 'history' ? '历史记录' : 'AI 助手' }}</h2>
          <div class="mt-0.5 flex items-center gap-2">
            <p v-if="view === 'history'" class="text-secondary min-w-0 truncate text-xs">
              {{ threads.length }} 条会话 · 点击进入继续聊
            </p>
            <p v-else class="text-secondary min-w-0 truncate text-xs">
              知识库问答 · 未命中自动联网
              <template v-if="auth.isLoggedIn"> · {{ auth.user?.username }}</template>
            </p>
            <!-- 退出登录入口：仅对话视图 + 登录态展示，点击弹出确认弹窗 -->
            <button
              v-if="view === 'chat' && auth.isLoggedIn"
              type="button"
              class="text-secondary shrink-0 rounded-full border px-2 py-[1px] text-[10px] leading-4 transition-colors hover:text-brand"
              :style="{ borderColor: 'var(--color-border)' }"
              title="退出登录"
              @click="showLogoutConfirm = true"
            >
              退出登录
            </button>
          </div>
        </div>
        <!-- 返回按钮：历史记录视图专属，点击回到对话 -->
        <button
          v-if="view === 'history'"
          type="button"
          class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
          title="返回对话"
          aria-label="返回对话"
          @click="backToChat"
        >
          <ArrowLeft :size="16" />
        </button>
        <!-- 设置按钮：位于关闭按钮左侧，登录用户可见（配置修改仅博主，弹窗内提示） -->
        <button
          v-if="auth.isLoggedIn"
          type="button"
          class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
          title="AI 设置（模型 / 知识库）"
          aria-label="设置"
          @click="showSettings = true"
        >
          <Settings :size="16" />
        </button>
        <button
          type="button"
          class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
          title="关闭（Esc）"
          aria-label="关闭"
          @click="closePanel"
        >
          <X :size="16" />
        </button>
      </header>

      <!-- 图标菜单展开时的外部点击关闭层（覆盖内容区；header 抬高在其上） -->
      <div v-if="menuOpen" class="absolute inset-0 z-10" aria-hidden="true" @click="menuOpen = false" />

      <!-- 消息列表（对话视图） -->
      <div
        v-if="view === 'chat'"
        ref="messagesEl"
        class="nice-scrollbar mt-3 flex-1 space-y-3 overflow-y-auto pr-1"
      >
        <div
          v-for="m in messages"
          :key="m.id"
          class="flex flex-col"
          :class="m.role === 'user' ? 'items-end' : 'items-start'"
        >
          <p
            class="max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap"
            :class="
              m.role === 'user'
                ? 'bg-brand text-white'
                : 'text-primary border'
            "
            :style="m.role === 'ai' ? { backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' } : undefined"
          >
            {{ m.text }}<span v-if="m.streaming" class="typing-cursor" aria-hidden="true" />
          </p>
          <!-- 回答来源：博客文章（站内跳转）/ 联网搜索结果（新窗口外链） -->
          <div v-if="m.sources?.length" class="mt-1.5 max-w-[85%] space-y-1">
            <template v-for="(s, i) in m.sources" :key="i">
              <RouterLink
                v-if="s.type === 'blog' && s.slug"
                :to="`/blog/${s.slug}`"
                class="text-secondary flex items-start gap-1 rounded-lg border px-2 py-1 text-[10px] leading-4 transition-colors hover:text-brand"
                :style="{ borderColor: 'var(--color-border)' }"
                title="站内文章，点击查看"
              >
                <Link2 :size="10" class="mt-[3px] shrink-0" />
                <span class="min-w-0 break-words">博客：《{{ s.title }}》</span>
              </RouterLink>
              <a
                v-else
                :href="s.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-secondary flex items-start gap-1 rounded-lg border px-2 py-1 text-[10px] leading-4 transition-colors hover:text-brand"
                :style="{ borderColor: 'var(--color-border)' }"
                :title="s.url"
              >
                <Link2 :size="10" class="mt-[3px] shrink-0" />
                <span class="min-w-0 break-words">网页：{{ s.title }}</span>
              </a>
            </template>
          </div>
        </div>

        <!-- 打字中指示（流式已开始但尚无内容） -->
        <div v-if="streaming && !streamHasText" class="flex justify-start">
          <span
            class="text-secondary flex items-center gap-1 rounded-2xl border px-3 py-2 text-xs"
            :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
          >
            <i class="typing-dot" />
            <i class="typing-dot" />
            <i class="typing-dot" />
          </span>
        </div>
      </div>

      <!-- 输入区（对话视图；流式生成中禁止发送） -->
      <div
        v-if="view === 'chat'"
        class="mt-3 flex items-end gap-2 border-t pt-3"
        style="border-color: var(--color-border)"
      >
        <textarea
          v-model="input"
          rows="1"
          class="max-h-24 min-h-[40px] flex-1 resize-none rounded-2xl border px-3 py-2 text-sm leading-relaxed whitespace-nowrap focus:outline-none"
          style="background-color: var(--color-card); color: var(--color-primary)"
          placeholder="说点什么…（Enter 发送）"
          spellcheck="false"
          @keydown.enter.exact.prevent="send"
        />
        <button
          type="button"
          class="brand-btn shrink-0 !rounded-full !p-2.5 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!input.trim() || streaming"
          aria-label="发送"
          @click="send"
        >
          <Send :size="18" />
        </button>
      </div>

      <!-- 历史记录视图：会话列表（点击进入继续聊 / 行内删除） -->
      <div v-else class="nice-scrollbar mt-3 flex-1 overflow-y-auto pr-1">
        <!-- 加载中 -->
        <p v-if="threadsLoading" class="text-secondary py-6 text-center text-xs">加载中…</p>

        <!-- 加载失败：重试 -->
        <div v-else-if="threadsError" class="py-6 text-center text-xs">
          <p class="text-secondary">{{ threadsError }}</p>
          <button
            type="button"
            class="brand-btn mt-3 !rounded-full !px-4 !py-1.5"
            @click="loadThreads"
          >
            重试
          </button>
        </div>

        <!-- 空态 -->
        <p v-else-if="!threads.length" class="text-secondary py-6 text-center text-xs">
          还没有历史会话，回到对话发一条消息就会自动创建～
        </p>

        <!-- 会话列表 -->
        <ul v-else class="space-y-2">
          <li v-for="t in threads" :key="t.id" class="flex items-center gap-1">
            <button
              type="button"
              class="flex min-w-0 flex-1 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors hover:bg-white/60 disabled:opacity-50"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
              :disabled="Boolean(loadingThreadId) || streaming"
              :title="t.title"
              @click="openThread(t)"
            >
              <span class="w-full truncate text-xs">{{ t.title || '未命名会话' }}</span>
              <span class="text-secondary mt-0.5 text-[10px]">
                {{ fmtTime(t.updated_at) }}
                <template v-if="loadingThreadId === t.id"> · 加载中…</template>
              </span>
            </button>
            <button
              type="button"
              class="text-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
              title="删除该会话"
              aria-label="删除会话"
              :disabled="deletingId === t.id || streaming"
              @click="removeThread(t)"
            >
              <Trash2 :size="14" />
            </button>
          </li>
        </ul>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
/* 面板滑入 / 滑出 */
.ai-panel-enter-active,
.ai-panel-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.28s ease;
}
.ai-panel-enter-from,
.ai-panel-leave-to {
  transform: translateX(100%);
  opacity: 0.6;
}

/* 遮罩淡入 / 淡出 */
.ai-mask-enter-active,
.ai-mask-leave-active {
  transition: opacity 0.24s ease;
}
.ai-mask-enter-from,
.ai-mask-leave-to {
  opacity: 0;
}

/* 左上角图标菜单：淡入 / 下移浮出 */
.ai-menu-enter-active,
.ai-menu-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.ai-menu-enter-from,
.ai-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 流式打字光标（跟随 AI 气泡文字色） */
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background-color: currentColor;
  animation: cursor-blink 0.9s steps(1) infinite;
}
@keyframes cursor-blink {
  50% {
    opacity: 0;
  }
}

/* 打字中三点动画 */
.typing-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background-color: var(--color-secondary);
  animation: typing-bounce 1s ease-in-out infinite;
}
.typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}
.typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-panel-enter-active,
  .ai-panel-leave-active,
  .ai-mask-enter-active,
  .ai-mask-leave-active,
  .ai-menu-enter-active,
  .ai-menu-leave-active {
    transition: none;
  }
  .typing-dot {
    animation: none;
  }
  .typing-cursor {
    animation: none;
  }
}
</style>
