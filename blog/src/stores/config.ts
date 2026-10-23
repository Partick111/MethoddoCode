import { defineStore } from 'pinia'
import siteContentJson from '@/config/site-content.json'
import cardStylesJson from '@/config/card-styles.json'
import { applyTheme } from '@/utils/theme'
import type { SiteContent } from '@/types/blog'

interface CardStyleItem {
  width?: number
  height?: number
  /** 时钟/音乐等卡片相对锚点的纵向/横向偏移（蓝本自 card-styles） */
  offset?: number
  order: number
  offsetX: number | null
  offsetY: number | null
  enabled: boolean
}

/** 卡片位置与尺寸配置（Key 为卡片名） */
export type CardStyles = Record<string, CardStyleItem>

export const useConfigStore = defineStore('config', {
  state: () => ({
    siteContent: siteContentJson as SiteContent,
    cardStyles: cardStylesJson as unknown as CardStyles,
    regenerateKey: 0
  }),
  actions: {
    /** 根据 site-content 主题注入 CSS 变量（对齐蓝本 layout.tsx） */
    initTheme() {
      applyTheme(this.siteContent.theme)
    },
    refreshBackground() {
      this.regenerateKey++
    }
  }
})
