import type { SiteTheme } from '@/types/blog'

/**
 * 将站点主题色注入为 CSS 变量（对齐蓝本 layout.tsx 注入行为）。
 * 覆盖 Tailwind v4 @theme 默认值，实现"首页主题色成功率可用 CSS 变量方案"。
 */
export function applyTheme(theme: SiteTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--color-brand', theme.colorBrand)
  root.style.setProperty('--color-primary', theme.colorPrimary)
  root.style.setProperty('--color-secondary', theme.colorSecondary)
  root.style.setProperty('--color-brand-secondary', theme.colorBrandSecondary)
  root.style.setProperty('--color-bg', theme.colorBg)
  root.style.setProperty('--color-border', theme.colorBorder)
  root.style.setProperty('--color-card', theme.colorCard)
  root.style.setProperty('--color-article', theme.colorArticle)
  root.style.setProperty('--color-background', theme.colorBg)
}
