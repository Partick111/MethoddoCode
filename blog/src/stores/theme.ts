import { defineStore } from 'pinia'

const STORAGE_KEY = 'yysuni_night_mode'

/**
 * 主题过渡时长（ms），需与 globals.css 中 `.theme-transition` 的 transition-duration 保持一致。
 * 需求：400~600ms 平滑渐变，避免闪烁跳变。
 */
const TRANSITION_MS = 500

/** 过渡窗口定时器：连续快速切换时复用并重置，避免窗口类被提前移除 */
let transitionTimer: number | null = null

/**
 * 全局日夜主题状态：夜间在 <html> 上挂 .night 类，
 * globals.css 中 .night 覆盖 CSS 变量并切换为夜间星空背景（渐变层 + 星点层均以 500ms 过渡）。
 *
 * 防闪烁设计：
 * 1. index.html 内联脚本在首屏渲染前恢复 .night（刷新不闪白）；
 * 2. toggle 时先开启 `.theme-transition` 过渡窗口再同步切换 .night（同一 tick 完成，无中间态）；
 * 3. 不可过渡的背景图/星点层使用常驻图层 + opacity 渐变（见 globals.css），不依赖 class 瞬变。
 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    isNight: false
  }),
  actions: {
    init() {
      let stored: string | null = null
      try {
        stored = localStorage.getItem(STORAGE_KEY)
      } catch {
        stored = null
      }
      this.isNight = stored === '1'
      // 首屏直接应用（无过渡），与 index.html 内联预设脚本配合避免刷新闪烁
      this.apply(false)
    },
    toggle() {
      this.isNight = !this.isNight
      try {
        localStorage.setItem(STORAGE_KEY, this.isNight ? '1' : '0')
      } catch {
        /* ignore */
      }
      this.apply(true)
    },
    /**
     * 应用主题到 <html>。
     * withTransition=true 时开启 500ms 过渡窗口（.theme-transition 让颜色类属性统一渐变），
     * 窗口结束后移除，避免常驻 transition 拖慢日常交互（hover 等）。
     */
    apply(withTransition = true) {
      if (typeof document === 'undefined') return
      const root = document.documentElement

      if (withTransition) {
        root.classList.add('theme-transition')
        if (transitionTimer !== null) window.clearTimeout(transitionTimer)
        transitionTimer = window.setTimeout(() => {
          root.classList.remove('theme-transition')
          transitionTimer = null
        }, TRANSITION_MS + 60)
      }

      // class 同步切换（同一 tick 内完成，避免中间态白屏/闪烁）
      root.classList.toggle('night', this.isNight)
    }
  }
})
