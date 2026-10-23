/**
 * 随机推荐卡片 mock 数据（抽取自蓝本 src/app/share/list.json）。
 * logo 图片未同步到 Vue 工程 public，卡片内以首字符占位展示。
 */
export interface MockShareItem {
  name: string
  url: string
  description: string
}

export const MOCK_SHARES: MockShareItem[] = [
  {
    name: 'The Monolith Project',
    url: 'https://themonolithproject.net/',
    description:
      '奇幻宇宙的动画演绎，像看电影一样。"跨越多星之际，一座沉默的巨石碑悄然苏醒。巨石碑计划：每一次触碰，皆可重写现实。"'
  },
  {
    name: 'Uiverse',
    url: 'https://uiverse.io/',
    description: '不可错过的参考库，有很多交互效果，包括热门的 Button、Loader 设计，内容丰富，还在不断更新。'
  },
  {
    name: 'Magic UI',
    url: 'https://magicui.design/',
    description: 'shadcn/ui 伴生库，有很多实用设计。取用也很方便，可以自己复制独立的代码。'
  }
]
