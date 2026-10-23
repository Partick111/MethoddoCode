import { request } from './client'
import { renderMarkdown, enhanceHtmlContent } from '@/utils/markdown'
import { useLocalArticlesStore } from '@/stores/local-articles'
import type {
  BlogIndexItem,
  BlogPost,
  BlogConfig,
  Category,
  About,
  LocalArticle
} from '@/types/blog'

/**
 * 内容来源切换：
 * VITE_CONTENT_SOURCE=api 时走 Django REST API；否则走本地 mock。
 * 页面组件不感知该差异。
 */
const SOURCE: 'local' | 'api' = (import.meta.env.VITE_CONTENT_SOURCE as 'local' | 'api') ?? 'local'

/* ============ mock 数据（开发期） ============ */
import blogIndexJson from '@/mocks/blog-index.json'
import categoriesJson from '@/mocks/categories.json'
import aboutJson from '@/mocks/about.json'

const postFiles = import.meta.glob('../mocks/posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function mockGetBlogIndex(): BlogIndexItem[] {
  const list = (blogIndexJson as { list: BlogIndexItem[] }).list
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

async function mockGetBlogDetail(slug: string): Promise<BlogPost> {
  const fileKey = Object.keys(postFiles).find(k => k.endsWith(`/${slug}.md`) || k.endsWith(`${slug}.md`))
  const markdown = fileKey ? postFiles[fileKey] : '# 404\n\n未找到该文章。'
  const { html, toc } = await renderMarkdown(markdown)
  // 从 index 元信息补充配置
  const meta = mockGetBlogIndex().find(item => item.slug === slug)
  const config: BlogConfig = (meta || {}) as BlogConfig
  // raw 保留 Markdown 源码，供博主编辑页载入
  return { slug, config, html, toc, raw: markdown }
}

/* ============ 本地发布文章（Pinia + localStorage）与 mock 数据合并 ============ */

/** 本地文章 → 列表项结构 */
function localIndexItems(): BlogIndexItem[] {
  return useLocalArticlesStore().articles.map(item => ({
    slug: item.slug,
    title: item.title,
    date: item.date,
    summary: item.summary,
    categories: item.categories
  }))
}

/** 本地记录 → 详情页结构（markdown：走完整渲染管线；html：经 enhanceHtmlContent 高亮 + 公式 + 锚点，样式沿用 .prose） */
async function localArticleToPost(article: LocalArticle): Promise<BlogPost> {
  const config: BlogConfig = {
    title: article.title,
    date: article.date,
    summary: article.summary,
    categories: article.categories,
    tags: [],
    authors: []
  }
  if (article.format === 'markdown') {
    const { html, toc } = await renderMarkdown(article.content)
    return { slug: article.slug, config, html, toc, raw: article.content }
  }
  const { html, toc } = await enhanceHtmlContent(article.content)
  return { slug: article.slug, config, html, toc }
}

/**
 * 合并本地记录：按日期倒序，同日期时新发布的本地文章在前。
 * - 已删除（隐藏）的文章从列表剔除；
 * - 数据源文章存在同 slug 覆盖记录（编辑过）时，以本地元信息展示。
 */
function mergeWithLocalArticles(base: BlogIndexItem[]): BlogIndexItem[] {
  const store = useLocalArticlesStore()
  const locals = localIndexItems().filter(item => !store.isHidden(item.slug))
  const localMap = new Map(locals.map(item => [item.slug, item]))
  const baseSlugs = new Set(base.map(item => item.slug))
  const merged = [
    ...base.filter(item => !store.isHidden(item.slug)).map(item => localMap.get(item.slug) ?? item),
    ...locals.filter(item => !baseSlugs.has(item.slug))
  ]
  const createdAt = (slug: string) => store.findBySlug(slug)?.createdAt ?? 0
  return merged.sort((a, b) => {
    const byDate = (b.date || '').localeCompare(a.date || '')
    return byDate !== 0 ? byDate : createdAt(b.slug) - createdAt(a.slug)
  })
}

/* ============ API 数据源（未来 Django） ============ */
async function apiGetBlogIndex(): Promise<BlogIndexItem[]> {
  return request<BlogIndexItem[]>({ url: '/blogs/', method: 'GET' })
}

async function apiGetBlogDetail(slug: string): Promise<BlogPost> {
  const config = await request<BlogConfig>({ url: `/blogs/${slug}/config.json` })
  const md = await request<string>({ url: `/blogs/${slug}/index.md`, responseType: 'text' })
  const { html, toc } = await renderMarkdown(md)
  return { slug, config, html, toc }
}

async function apiGetCategories(): Promise<Category[]> {
  return request<Category[]>({ url: '/categories/', method: 'GET' })
}

async function apiGetAbout(): Promise<About> {
  return request<About>({ url: '/about/list.json' })
}

/* ============ 对外统一接口 ============ */
export async function getBlogIndex(): Promise<BlogIndexItem[]> {
  const base = SOURCE === 'api' ? await apiGetBlogIndex() : mockGetBlogIndex()
  // 本地发布的文章合并进列表：按日期倒序，新发布的文章置顶
  return mergeWithLocalArticles(base)
}

export async function getBlogDetail(slug: string): Promise<BlogPost> {
  const store = useLocalArticlesStore()
  // 本地记录优先：本地发布文章没有对应 md 文件；被编辑过的数据源文章展示覆盖版本
  const local = store.findBySlug(slug)
  if (local && !store.isHidden(slug)) return localArticleToPost(local)
  // 已删除（隐藏）的文章视同不存在
  if (store.isHidden(slug)) throw new Error('文章不存在或已被删除')
  return SOURCE === 'api' ? apiGetBlogDetail(slug) : mockGetBlogDetail(slug)
}

export async function getCategories(): Promise<Category[]> {
  return SOURCE === 'api' ? apiGetCategories() : (categoriesJson as Category[])
}

export async function getAbout(): Promise<About> {
  return SOURCE === 'api' ? apiGetAbout() : (aboutJson as About)
}
