<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ScrollText,
  FolderKanban,
  Info,
  Share2,
  NotebookPen
} from 'lucide-vue-next'
import { useCenter } from '@/composables/useCenter'
import { useSizeStore } from '@/stores/size'
import { useConfigStore } from '@/stores/config'
import { CARD_SPACING, ANIMATION_DELAY } from '@/consts'

const route = useRoute()
const center = useCenter()
const sizeStore = useSizeStore()
const config = useConfigStore()
const cs = computed(() => config.cardStyles)

const navItems = [
  { label: '近期文章', href: '/blog', icon: ScrollText },
  { label: '我的项目', href: '/projects', icon: FolderKanban },
  { label: '关于网站', href: '/about', icon: Info },
  { label: '推荐分享', href: '/share', icon: Share2 },
  { label: '生活记录', href: '/life', icon: NotebookPen }
]

/**
 * 形态切换（对齐蓝本 nav-card.tsx）：首页 -> full 左侧竖排导航卡；其他页 -> icons 左上角横向胶囊；移动端强制 icons
 */
const form = computed<'full' | 'icons'>(() =>
  sizeStore.maxSM ? 'icons' : route.path === '/' ? 'full' : 'icons'
)

const activeIndex = computed(() => {
  const i = navItems.findIndex((it) => route.path === it.href)
  return i >= 0 ? i : -1
})

/** 悬停罩子：hoveredIndex 记录当前悬浮项；contentHover 控制罩子显隐（鼠标不在不显示） */
const hoveredIndex = ref(-1)
const contentHover = ref(false)

/** full 形态：每项高 52、space-y-2(8) 纵向位移 */
const FULL_ITEM_HEIGHT = 52
const FULL_ITEM_GAP = 8

const hoverStyle = computed(() => {
  if (form.value === 'full') {
    return {
      left: '0px',
      top: `${hoveredIndex.value * (FULL_ITEM_HEIGHT + FULL_ITEM_GAP)}px`,
      width: '100%',
      height: `${FULL_ITEM_HEIGHT}px`
    }
  }
  return {}
})

/** 定位：full 在 hi 卡左侧（蓝本坐标）；icons 左上角 24,16（maxSM 用 Tailwind 居中类） */
const position = computed(() => {
  const ns = cs.value.navCard
  if (form.value === 'full') {
    const hs = cs.value.hiCard
    return {
      x: Math.round(center.x - (hs.width ?? 0) / 2 - (ns.width ?? 0) - CARD_SPACING),
      y: Math.round(center.y + (hs.height ?? 0) / 2 - (ns.height ?? 0))
    }
  }
  return { x: 24, y: 16 }
})

const fullSize = computed(() => {
  const ns = cs.value.navCard
  return { width: ns.width ?? 280, height: ns.height ?? 434 }
})

/** 入场延迟：与 card-styles.json 中 navCard.order 联动（对齐蓝本顺时针入场） */
const entranceDelay = computed(() => `${(cs.value.navCard.order ?? 10) * ANIMATION_DELAY}s`)

function onNavEnter(i: number) {
  contentHover.value = true
  hoveredIndex.value = i
}
function onNavLeave() {
  contentHover.value = false
  hoveredIndex.value = activeIndex.value >= 0 ? activeIndex.value : 0
}

/** 当前项是否高亮：悬停中跟随罩子；否则路由激活项常亮 */
function isItemActive(i: number) {
  return contentHover.value ? hoveredIndex.value === i : i === activeIndex.value
}

function isActive(href: string) {
  return route.path === href
}

onMounted(() => {
  hoveredIndex.value = activeIndex.value >= 0 ? activeIndex.value : 0
})
</script>

<template>
  <div
    class="fixed z-30"
    :class="sizeStore.maxSM ? 'top-16 left-1/2 -translate-x-1/2' : ''"
    :style="sizeStore.maxSM ? undefined : { left: `${position.x}px`, top: `${position.y}px` }"
  >
    <!-- full：首页最左侧竖排导航卡（头像+站点名+(开发中)+General+5 导航项+悬停白罩） -->
    <div
      v-if="form === 'full'"
      class="card enter-card"
      :style="{ width: `${fullSize.width}px`, height: `${fullSize.height}px`, animationDelay: entranceDelay }"
    >
      <!-- 头像 + 站点名 + (开发中) -->
      <RouterLink to="/" class="flex items-center gap-3" title="回到首页">
        <img
          src="/images/avatar.jpg"
          alt="avatar"
          class="h-10 w-10 rounded-full object-cover"
          style="box-shadow: 0 12px 20px -5px #e2d9ce"
        />
        <span class="font-averia mt-1 text-2xl leading-none font-medium">{{ config.siteContent.meta.title }}</span>
        <span class="text-brand mt-2 text-xs font-medium">(开发中)</span>
      </RouterLink>

      <div class="text-secondary mt-6 text-sm uppercase">General</div>

      <!-- 导航列表 + 随鼠标移动的白底圆角罩子 -->
      <div class="relative mt-2 space-y-2" @mouseleave="onNavLeave">
        <div
          v-if="contentHover && form === 'full'"
          class="absolute rounded-full border"
          :style="{
            ...hoverStyle,
            backgroundImage: 'linear-gradient(to right bottom, var(--color-border) 60%, var(--color-card) 100%)',
            transition:
              'left .25s cubic-bezier(.4,0,.2,1), top .25s cubic-bezier(.4,0,.2,1), width .25s cubic-bezier(.4,0,.2,1), height .25s cubic-bezier(.4,0,.2,1)'
          }"
        />
        <RouterLink
          v-for="(it, i) in navItems"
          :key="it.href"
          :to="it.href"
          class="text-secondary relative z-10 flex items-center gap-3 rounded-full px-5 py-3"
          @mouseenter="onNavEnter(i)"
        >
          <div class="flex h-7 w-7 items-center justify-center">
            <component
              :is="it.icon"
              :size="28"
              class="transition-colors"
              :class="isItemActive(i) ? 'text-brand' : ''"
            />
          </div>
          <span class="text-sm transition-colors" :class="isItemActive(i) ? 'text-primary font-medium' : ''">
            {{ it.label }}
          </span>
        </RouterLink>
      </div>
    </div>

    <!-- icons：非首页左上角横向图标胶囊（仅保留右侧 5 个导航按钮：近期文章/我的项目/关于网站/推荐分享/生活记录） -->
    <div
      v-else
      class="card enter-card flex w-max items-center gap-1 rounded-full !p-1.5"
      :style="{ animationDelay: entranceDelay }"
      :class="sizeStore.maxSM ? 'max-w-[calc(100vw-2rem)] overflow-x-auto' : ''"
    >
      <!-- 头像：返回首页 -->
      <RouterLink
        to="/"
        class="mr-1 shrink-0 rounded-full transition-transform hover:scale-105"
        title="回到首页"
      >
        <img
          src="/images/avatar.jpg"
          alt="avatar"
          class="h-9 w-9 rounded-full object-cover"
          style="box-shadow: 0 12px 20px -5px #e2d9ce"
        />
      </RouterLink>

      <!-- 站点导航图标：近期文章 / 我的项目 / 关于网站 / 推荐分享 / 生活记录 -->
      <div class="relative flex shrink-0 items-center gap-0.5" @mouseleave="onNavLeave">
        <RouterLink
          v-for="(it, i) in navItems"
          :key="it.href"
          :to="it.href"
          class="relative z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          :class="
            isItemActive(i) || isActive(it.href)
              ? 'bg-brand/10 text-brand'
              : 'text-secondary hover:bg-white/60 hover:text-brand'
          "
          :title="it.label"
          @mouseenter="onNavEnter(i)"
        >
          <component :is="it.icon" :size="18" />
        </RouterLink>
      </div>
    </div>
  </div>
</template>
