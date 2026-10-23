/**
 * 文章统计接口（浏览量 / 点赞）——始终走 Django 后端（blog_terminal/），
 * 与内容数据源开关（VITE_CONTENT_SOURCE）无关：内容可本地 mock，互动数据以服务端为准。
 *
 * 接口约定（见 blog_terminal/blog/views.py）：
 * - GET  /articles/<slug>/stats/  单篇统计（游客可访问；登录时附带 liked）
 * - POST /articles/<slug>/view/   浏览量 +1（游客可访问，进入详情页时调用）
 * - POST /articles/<slug>/like/   点赞（需登录；一人一赞，重复请求幂等）
 * - GET  /articles/stats/?slugs=a,b,c  批量统计（列表页用）
 */
import { request } from './client'

export interface ArticleStats {
  slug: string
  /** 浏览量 */
  views: number
  /** 点赞总数 */
  likes: number
  /** 当前登录用户是否已点赞（游客恒为 false） */
  liked: boolean
}

/** 单篇文章统计（用于点赞按钮还原状态） */
export async function fetchArticleStats(slug: string): Promise<ArticleStats> {
  return request<ArticleStats>({
    url: `/articles/${encodeURIComponent(slug)}/stats/`,
    method: 'GET'
  })
}

/** 浏览量 +1（进入详情页时调用），返回自增后的最新统计 */
export async function recordArticleView(slug: string): Promise<ArticleStats> {
  return request<ArticleStats>({
    url: `/articles/${encodeURIComponent(slug)}/view/`,
    method: 'POST'
  })
}

/** 点赞（需登录）：成功后返回最新统计；已点过赞重复调用为幂等返回 */
export async function likeArticle(slug: string): Promise<ArticleStats> {
  return request<ArticleStats>({
    url: `/articles/${encodeURIComponent(slug)}/like/`,
    method: 'POST'
  })
}

/** 批量统计（列表页用）：未统计过的文章返回 0，顺序与入参一致 */
export async function fetchArticleStatsBatch(slugs: string[]): Promise<ArticleStats[]> {
  if (!slugs.length) return []
  return request<ArticleStats[]>({
    url: '/articles/stats/',
    method: 'GET',
    params: { slugs: slugs.join(',') }
  })
}
