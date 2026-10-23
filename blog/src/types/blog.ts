/** 博客文章摘要（列表 / 卡片使用） */
export interface BlogIndexItem {
  slug: string
  title?: string
  date?: string
  cover?: string
  summary?: string
  tags?: string[]
  categories?: string[]
  /** 浏览量（由统计接口填充；获取失败时缺省，列表不展示统计） */
  views?: number
  /** 点赞数（由统计接口填充；获取失败时缺省，列表不展示统计） */
  likes?: number
}

/** 文章正文配置（详情页） */
export interface BlogConfig {
  title?: string
  date?: string
  language?: string
  tags?: string[]
  categories?: string[]
  in_feed?: boolean
  summary?: string
  keywords?: string[]
  authors?: string[]
  cover?: string
  [key: string]: unknown
}

/** 文章详情（正文 + 元信息 + TOC） */
export interface BlogPost {
  slug: string
  config?: BlogConfig
  html: string
  toc: TocItem[]
  /** 原始 Markdown 源码（仅 mock/接口数据源提供，供编辑页载入） */
  raw?: string
}

/** 目录条目 */
export interface TocItem {
  id: string
  level: number
  text: string
}

/** 本地发布的文章（Pinia + localStorage 持久化；后端 Djongo 接口接入后改走 POST） */
export interface LocalArticle {
  slug: string
  title: string
  date: string
  summary: string
  categories: string[]
  /** 正文：format=html 为富文本 HTML（渲染前需经 DOMPurify 清洗）；format=markdown 为 Markdown 源码 */
  content: string
  /** 发布时间戳，用于同日期文章的倒序排序 */
  createdAt: number
  /** 正文格式；缺省视为 html（兼容早期数据）。数据源（mock）文章编辑后以 markdown 覆盖保存 */
  format?: 'html' | 'markdown'
}

/** 分类（文章列表页分组） */
export interface Category {
  slug: string
  name?: string
  count?: number
}

/** 关于页 */
export interface About {
  title?: string
  list?: { title?: string; list?: string[] }[]
}

/** 站点主题色 */
export interface SiteTheme {
  colorBrand: string
  colorPrimary: string
  colorSecondary: string
  colorBrandSecondary: string
  colorBg: string
  colorBorder: string
  colorCard: string
  colorArticle: string
}

/** 站点内容配置（迁移自蓝本 site-content.json） */
export interface SiteContent {
  meta: { title: string; description: string; username: string }
  theme: SiteTheme
  backgroundColors: string[]
  artImages: { id: string; url: string }[]
  currentArtImageId: string
  backgroundImages: { id: string; url: string }[]
  currentBackgroundImageId: string
  socialButtons: SocialButtonConfig[]
  clockShowSeconds: boolean
  summaryInContent: boolean
  enableCategories: boolean
  enableChristmas: boolean
  beian: { text?: string; link?: string }
  [key: string]: unknown
}

/** 社交按钮配置 */
export interface SocialButtonConfig {
  id: string
  type: 'github' | 'juejin' | 'email' | 'link' | 'wechat' | 'x' | 'tg' | 'bilibili' | 'zhihu' | 'weibo' | string
  value: string
  label?: string
  order: number
}
