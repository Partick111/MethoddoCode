/**
 * 推荐分享链接（Pinia store）。
 *
 * - 默认链接来自 src/config/mock-share.ts；博主添加的链接存 localStorage（键 yysuni_share_links）
 * - 删除默认链接记入隐藏列表（打包静态数据无法物理删除，同文章隐藏机制），
 *   本地添加的链接可直接物理删除；清除浏览器 localStorage 即可恢复默认数据
 * - 使用方：推荐分享页 ShareView、首页随机推荐卡 ShareCard
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MOCK_SHARES, type MockShareItem } from '@/config/mock-share'

/** 本地存储键：博主添加的链接 / 被删除的默认链接（url 列表） */
const ADDED_KEY = 'yysuni_share_links'
const REMOVED_KEY = 'yysuni_share_removed'

export interface ShareLink extends MockShareItem {
  /** 是否博主添加的本地链接（本地链接支持物理删除） */
  isLocal?: boolean
}

/** 校验数据形状，过滤损坏项 */
function sanitizeLinks(input: unknown): ShareLink[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (item): item is ShareLink =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as ShareLink).name === 'string' &&
        typeof (item as ShareLink).url === 'string'
    )
    .map(item => ({
      name: item.name,
      url: item.url,
      description: typeof item.description === 'string' ? item.description : '',
      isLocal: true
    }))
}

export const useShareLinksStore = defineStore('share-links', () => {
  /** 博主添加的链接 */
  const added = ref<ShareLink[]>([])
  /** 被删除的默认链接 url */
  const removed = ref<string[]>([])
  const loaded = ref(false)

  function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      const rawAdded = localStorage.getItem(ADDED_KEY)
      if (rawAdded) added.value = sanitizeLinks(JSON.parse(rawAdded))
      const rawRemoved = localStorage.getItem(REMOVED_KEY)
      if (rawRemoved) {
        const parsed = JSON.parse(rawRemoved)
        if (Array.isArray(parsed)) removed.value = parsed.filter((u): u is string => typeof u === 'string')
      }
    } catch {
      /* 本地数据损坏时按空处理，不阻塞页面 */
    }
  }

  function persistAdded(): boolean {
    try {
      localStorage.setItem(ADDED_KEY, JSON.stringify(added.value))
      return true
    } catch {
      return false
    }
  }

  function persistRemoved(): boolean {
    try {
      localStorage.setItem(REMOVED_KEY, JSON.stringify(removed.value))
      return true
    } catch {
      return false
    }
  }

  /** 合并列表：默认链接（剔除已删除）+ 博主添加的链接 */
  const links = computed<ShareLink[]>(() => [
    ...MOCK_SHARES.filter(item => !removed.value.includes(item.url)).map(item => ({
      ...item,
      isLocal: false
    })),
    ...added.value
  ])

  /** 博主添加链接（持久化失败返回 false） */
  function addLink(input: { name: string; url: string; description: string }): boolean {
    const next: ShareLink = { ...input, isLocal: true }
    const backup = [...added.value]
    added.value = [...added.value, next]
    if (!persistAdded()) {
      added.value = backup
      return false
    }
    return true
  }

  /** 删除链接：本地添加的直接移除；默认链接记入隐藏列表（持久化失败返回 false） */
  function removeLink(link: ShareLink): boolean {
    if (link.isLocal) {
      const backup = [...added.value]
      added.value = added.value.filter(item => item.url !== link.url)
      if (!persistAdded()) {
        added.value = backup
        return false
      }
      return true
    }
    const backup = [...removed.value]
    removed.value = [...removed.value, link.url]
    if (!persistRemoved()) {
      removed.value = backup
      return false
    }
    return true
  }

  void load()

  return { added, removed, links, addLink, removeLink, load }
})
