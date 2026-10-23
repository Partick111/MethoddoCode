import { defineStore } from 'pinia'
import { ref } from 'vue'
import dayjs from 'dayjs'
import blogIndexJson from '@/mocks/blog-index.json'
import { BLOG_SLUG_KEY } from '@/consts'
import type { BlogIndexItem, LocalArticle } from '@/types/blog'

const STORAGE_KEY = BLOG_SLUG_KEY + 'local_articles'
/** 已删除的数据源（mock）文章 slug：演示数据为打包静态文件无法物理删除，以本地隐藏记录代替 */
const HIDDEN_KEY = BLOG_SLUG_KEY + 'hidden_articles'

/** 富文本 HTML → 纯文本（用于自动摘要截取，仅取文本不渲染） */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const holder = document.createElement('div')
  holder.innerHTML = html
  return (holder.textContent || '').replace(/\s+/g, ' ').trim()
}

/** Markdown 源码 → 纯文本（用于自动摘要；不做完整解析，仅剥离常见标记） */
export function markdownToPlainText(md: string): string {
  if (!md) return ''
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$([^$\n]+)\$/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 由标题推导 slug（纯中文标题退化为时间戳 slug），并保证与已有 slug 不冲突 */
function makeSlug(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `post-${dayjs().format('YYYYMMDDHHmmss')}`
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  return slug
}

/** 正文自动摘要，约 60 字（html=富文本内容；markdown=源码） */
function makeSummary(content: string, format: 'html' | 'markdown' = 'html'): string {
  const text = format === 'markdown' ? markdownToPlainText(content) : htmlToPlainText(content)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/** mock 索引中的 slug 集合（用于冲突检测） */
function mockSlugs(): string[] {
  const list = (blogIndexJson as { list: BlogIndexItem[] }).list ?? []
  return list.map(item => item.slug).filter(Boolean)
}

/**
 * 本地发布文章 store：Pinia + localStorage 持久化。
 * 后端 Djongo 接口就绪后，可将 addArticle 内的持久化替换为 POST /blogs/ 请求。
 */
export const useLocalArticlesStore = defineStore('local-articles', () => {
  const articles = ref<LocalArticle[]>([])
  /** 被删除（隐藏）的数据源（mock）文章 slug 列表 */
  const hiddenSlugs = ref<string[]>([])

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      articles.value = Array.isArray(parsed) ? (parsed as LocalArticle[]) : []
    } catch {
      articles.value = []
    }
  }

  function loadHidden() {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      hiddenSlugs.value = Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      hiddenSlugs.value = []
    }
  }

  /** 写回 localStorage；返回是否写入成功（容量超限时返回 false） */
  function persist(): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(articles.value))
      return true
    } catch {
      return false
    }
  }

  /** 写回隐藏列表；返回是否写入成功 */
  function persistHidden(): boolean {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenSlugs.value))
      return true
    } catch {
      return false
    }
  }

  function findBySlug(slug: string): LocalArticle | null {
    return articles.value.find(item => item.slug === slug) ?? null
  }

  /** slug 是否为数据源（mock）文章 */
  function isMockSlug(slug: string): boolean {
    return mockSlugs().includes(slug)
  }

  /** 是否已被删除（隐藏） */
  function isHidden(slug: string): boolean {
    return hiddenSlugs.value.includes(slug)
  }

  function isSlugTaken(slug: string): boolean {
    return mockSlugs().includes(slug) || articles.value.some(item => item.slug === slug)
  }

  function addArticle(input: { title: string; category: string; content: string }): LocalArticle {
    const now = dayjs()
    const taken = new Set<string>([...mockSlugs(), ...articles.value.map(item => item.slug)])
    const article: LocalArticle = {
      slug: makeSlug(input.title, taken),
      title: input.title.trim(),
      date: now.format('YYYY-MM-DD'),
      summary: makeSummary(input.content),
      categories: [input.category],
      content: input.content,
      createdAt: now.valueOf()
    }

    articles.value = [article, ...articles.value]
    if (!persist()) {
      // 写入失败（多为 localStorage 容量超限）时回滚，避免内存与本地数据不一致
      articles.value = articles.value.filter(item => item.slug !== article.slug)
      throw new Error('本地存储写入失败，可能已超出浏览器容量限制，请精简正文后重试')
    }
    return article
  }

  /**
   * 保存编辑结果（同 slug upsert）：
   * - 本地文章 → 原地更新（保留发布时间与排序时间戳）；
   * - 数据源（mock）文章 → 写入同 slug 覆盖记录，列表/详情读取时优先展示覆盖版本。
   */
  function saveArticle(
    slug: string,
    input: {
      title: string
      category: string
      content: string
      date: string
      format: 'html' | 'markdown'
    }
  ): LocalArticle {
    const index = articles.value.findIndex(item => item.slug === slug)
    const prev = index >= 0 ? articles.value[index] : null
    const fallback = dayjs().format('YYYY-MM-DD')

    const next: LocalArticle = {
      slug,
      title: input.title.trim(),
      date: input.date || fallback,
      summary: makeSummary(input.content, input.format),
      categories: [input.category],
      content: input.content,
      // 数据源覆盖记录沿用数据源排序位次（createdAt=0），本地文章保留原时间戳
      createdAt: prev ? prev.createdAt : isMockSlug(slug) ? 0 : Date.now(),
      format: input.format
    }
    if (prev) next.date = prev.date || next.date

    if (prev) {
      articles.value[index] = next
      if (!persist()) {
        articles.value[index] = prev
        throw new Error('本地存储写入失败，可能已超出浏览器容量限制，请精简正文后重试')
      }
    } else {
      articles.value = [next, ...articles.value]
      if (!persist()) {
        articles.value = articles.value.filter(item => item.slug !== slug)
        throw new Error('本地存储写入失败，可能已超出浏览器容量限制，请精简正文后重试')
      }
    }
    return next
  }

  /** 移除本地记录（本地发布文章 / 数据源覆盖记录）；无匹配记录时返回 false */
  function removeArticle(slug: string): boolean {
    const backup = articles.value
    const next = backup.filter(item => item.slug !== slug)
    if (next.length === backup.length) return false
    articles.value = next
    if (!persist()) {
      articles.value = backup
      throw new Error('本地存储写入失败，删除未生效')
    }
    return true
  }

  /** 隐藏数据源（mock）文章（演示数据为打包静态文件，无法物理删除） */
  function hideArticle(slug: string) {
    if (isHidden(slug)) return
    hiddenSlugs.value = [slug, ...hiddenSlugs.value]
    if (!persistHidden()) {
      hiddenSlugs.value = hiddenSlugs.value.filter(item => item !== slug)
      throw new Error('本地存储写入失败，删除未生效')
    }
  }

  /**
   * 删除文章（博主操作）：
   * - 数据源（mock）文章：写入隐藏记录（如需恢复演示数据，清除浏览器 localStorage 即可）；
   * - 本地记录（本地发布 / 数据源覆盖）：从 localStorage 移除。
   */
  function deleteArticle(slug: string) {
    removeArticle(slug)
    if (isMockSlug(slug)) hideArticle(slug)
  }

  load()
  loadHidden()

  return {
    articles,
    hiddenSlugs,
    load,
    persist,
    findBySlug,
    isSlugTaken,
    isMockSlug,
    isHidden,
    addArticle,
    saveArticle,
    removeArticle,
    hideArticle,
    deleteArticle
  }
})
