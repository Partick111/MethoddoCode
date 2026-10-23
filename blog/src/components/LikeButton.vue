<script setup lang="ts">
/**
 * LikeButton.vue —— 文章点赞按钮（计数来自 Django 后端）
 *
 * 规则（对齐需求）：
 * - 登录才能点赞：未登录点击 → 弹出登录/注册弹窗（AuthModal），登录成功后自动完成本次点赞；
 * - 一个用户只能赞一次：服务端「用户 + slug」唯一约束保证，已点赞再点仅提示不再计数；
 * - 计数为后端真实点赞总数（GET /articles/<slug>/stats/），游客可见。
 *
 * 视觉沿用原蓝本：磨砂圆钮 + 红心 + 计数徽标 + 点赞粒子/抖动特效。
 * 使用位置：文章详情页侧栏（BlogSidebar）与关于页（AboutView）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Heart } from 'lucide-vue-next'
import { isAxiosError } from 'axios'
import AuthModal from '@/components/AuthModal.vue'
import { fetchArticleStats, likeArticle } from '@/api/stats'
import { useAuthStore } from '@/stores/auth'

const props = withDefaults(
  defineProps<{
    slug?: string
    className?: string
    delay?: number
  }>(),
  {
    slug: 'yysuni',
    className: '',
    delay: 1000
  }
)

const auth = useAuthStore()

const liked = ref(false)
const show = ref(false)
const justLiked = ref(false)
/** 点赞总数（null = 尚未从后端加载完成，徽标暂不展示） */
const count = ref<number | null>(null)
const particles = ref<{ id: number; x: number; y: number }[]>([])
/** 短暂提示文案（每人限赞一次 / 网络异常等） */
const hint = ref('')
const busy = ref(false)

/* 登录弹窗：未登录点击点赞时打开；登录成功后自动接续完成本次点赞 */
const showAuth = ref(false)
const authNotice = ref('')
const pendingLike = ref(false)

let countTimer: number | null = null
let justTimer: number | null = null
let particleTimer: number | null = null
let hintTimer: number | null = null

onMounted(() => {
  countTimer = window.setTimeout(() => {
    show.value = true
  }, props.delay)

  void syncStats()
})

/** 拉取后端统计：还原点赞总数与当前用户是否已点赞（失败静默降级，隐藏徽标） */
async function syncStats() {
  try {
    const stats = await fetchArticleStats(props.slug)
    count.value = stats.likes
    liked.value = stats.liked
  } catch {
    /* 统计接口不可用：保持缺省展示，不影响页面其余功能 */
  }
}

/** 按钮下方短暂提示（2.2s 自动消失） */
function showHint(text: string) {
  hint.value = text
  if (hintTimer !== null) window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    hint.value = ''
    hintTimer = null
  }, 2200)
}

function handleLike() {
  if (busy.value) return
  // 一人一赞：已点赞再点仅提示，不重复计数
  if (liked.value) {
    showHint('每人只能点赞一次哦')
    return
  }
  // 登录门禁：未登录先弹登录窗，登录成功后自动完成本次点赞
  if (!auth.isLoggedIn) {
    pendingLike.value = true
    authNotice.value = '登录后才能点赞哦'
    showAuth.value = true
    return
  }
  void submitLike()
}

/** 发起点赞（登录态下调用；服务端幂等，重复请求不会重复计数） */
async function submitLike() {
  if (busy.value) return
  busy.value = true
  try {
    const stats = await likeArticle(props.slug)
    count.value = stats.likes
    liked.value = stats.liked
    if (stats.liked) {
      justLiked.value = true
      particles.value = Array.from({ length: 6 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 60 - 30,
        y: Math.random() * 60 - 30
      }))
      justTimer = window.setTimeout(() => (justLiked.value = false), 600)
      particleTimer = window.setTimeout(() => (particles.value = []), 1000)
    }
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 401) {
      // 登录态失效（api client 已清除本地登录）：弹登录窗引导重新登录，登录后续赞
      pendingLike.value = true
      authNotice.value = '登录已过期，请重新登录'
      showAuth.value = true
    } else {
      showHint(e instanceof Error ? e.message : '点赞失败，请稍后重试')
    }
  } finally {
    busy.value = false
  }
}

/** 登录 / 注册成功：接续完成登录前的那次点赞 */
function onAuthSuccess() {
  if (!pendingLike.value) return
  pendingLike.value = false
  void submitLike()
}

/** 登录弹窗关闭且仍未登录（用户取消）：放弃待办点赞，避免下次登录时意外补赞 */
watch(showAuth, v => {
  if (!v && !auth.isLoggedIn) pendingLike.value = false
})

onBeforeUnmount(() => {
  for (const timer of [countTimer, justTimer, particleTimer, hintTimer]) {
    if (timer !== null) window.clearTimeout(timer)
  }
})

const heartClass = computed(() => (liked.value ? 'fill-rose-400 text-rose-400' : 'fill-rose-200 text-rose-200'))
const badgeClass = computed(() => (liked.value ? 'bg-rose-400' : 'bg-gray-300'))
const buttonTitle = computed(() =>
  liked.value ? '已点赞（每人限赞一次）' : auth.isLoggedIn ? '点赞' : '登录后才能点赞'
)
</script>

<template>
  <div class="relative inline-flex">
    <button
      v-if="show"
      type="button"
      :aria-label="liked ? '已点赞' : '点赞'"
      :title="buttonTitle"
      class="enter-card card heartbeat-container relative overflow-visible rounded-full p-3 transition-transform hover:scale-105 disabled:cursor-not-allowed"
      :class="props.className"
      :disabled="busy"
      @click="handleLike"
    >
      <!-- 粒子特效：中心起始，沿 --fly-x/--fly-y 向外飞散（对齐蓝本 6 颗随机 ±30px） -->
      <span
        v-for="p in particles"
        :key="p.id"
        class="particle pointer-events-none absolute inset-0 flex items-center justify-center"
        :style="{ '--fly-x': `${p.x}px`, '--fly-y': `${p.y}px` }"
      >
        <Heart class="fill-rose-400 text-rose-400" :size="12" />
      </span>

      <!-- 计数徽标：来自后端；加载完成前不展示 -->
      <span
        v-if="count !== null"
        class="absolute -top-2 left-9 min-w-6 rounded-full px-1.5 py-1 text-center text-xs text-white tabular-nums"
        :class="badgeClass"
      >
        {{ count }}
      </span>

      <div :class="justLiked ? 'just-liked jiggle' : ''">
        <Heart class="heartbeat" :class="heartClass" :size="28" />
      </div>
    </button>

    <!-- 短暂提示：绝对定位在按钮下方，不挤压侧栏布局 -->
    <Transition name="like-hint">
      <span
        v-if="hint"
        class="text-secondary absolute top-full left-0 mt-2 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap"
        :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
      >
        {{ hint }}
      </span>
    </Transition>

    <!-- 登录 / 注册弹窗：未登录点赞时弹出，登录成功后自动完成点赞 -->
    <AuthModal v-model:open="showAuth" :notice="authNotice" @success="onAuthSuccess" />
  </div>
</template>

<style scoped>
.jiggle {
  animation: jiggle 0.6s ease-out;
}
@keyframes jiggle {
  0% {
    transform: scale(1) rotate(0deg);
  }
  30% {
    transform: scale(1.4) rotate(-10deg);
  }
  60% {
    transform: scale(1) rotate(10deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}
.particle-enter-active {
  transition: all 0.8s ease-out;
  animation: particle-fly 0.8s ease-out forwards;
}
@keyframes particle-fly {
  0% {
    opacity: 1;
    scale: 0;
  }
  60% {
    opacity: 1;
    scale: 1.2;
  }
  100% {
    opacity: 0;
    scale: 0.8;
  }
}

/* 提示气泡淡入淡出 */
.like-hint-enter-active,
.like-hint-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.like-hint-enter-from,
.like-hint-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
