/**
 * 生活记录（Pinia store）。
 *
 * - 默认记录来自 src/config/mock-life.ts；博主新增 / 编辑的内容存 localStorage
 * - 新增记录存 yysuni_life_added；对默认记录的编辑存 yysuni_life_overrides；
 *   删除默认记录记入 yysuni_life_removed（打包静态数据无法物理删除，同文章隐藏机制），
 *   本地新增的记录可直接物理删除；清除浏览器 localStorage 即可恢复默认数据
 * - 使用方：生活记录页 LifeView、编辑弹窗 LifeRecordModal
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MOCK_LIFE, type MockLifeItem } from '@/config/mock-life'

/** 本地存储键：新增记录 / 编辑覆盖（id → 记录）/ 已删除的默认记录 id */
const ADDED_KEY = 'yysuni_life_added'
const OVERRIDES_KEY = 'yysuni_life_overrides'
const REMOVED_KEY = 'yysuni_life_removed'

export type LifeRecord = MockLifeItem

/** 新增 / 编辑时的表单输入 */
export interface LifeRecordInput {
  date: string
  title: string
  content: string
  mood: string
  images: string[]
}

/** 校验记录形状，过滤损坏项 */
function sanitizeRecords(input: unknown): LifeRecord[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (item): item is LifeRecord =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as LifeRecord).id === 'string' &&
        typeof (item as LifeRecord).date === 'string' &&
        typeof (item as LifeRecord).title === 'string' &&
        typeof (item as LifeRecord).content === 'string'
    )
    .map(item => ({
      id: item.id,
      date: item.date,
      title: item.title,
      content: item.content,
      mood: typeof item.mood === 'string' ? item.mood : '',
      images: Array.isArray(item.images)
        ? item.images.filter((img): img is string => typeof img === 'string')
        : []
    }))
}

/** 校验编辑覆盖表（id → 记录），过滤损坏项 */
function sanitizeOverrides(input: unknown): Record<string, LifeRecord> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const result: Record<string, LifeRecord> = {}
  for (const item of sanitizeRecords(Object.values(input as Record<string, unknown>))) {
    result[item.id] = item
  }
  return result
}

export const useLifeRecordsStore = defineStore('life-records', () => {
  /** 博主新增的记录 */
  const added = ref<LifeRecord[]>([])
  /** 对默认记录的编辑覆盖（id → 记录） */
  const overrides = ref<Record<string, LifeRecord>>({})
  /** 被删除的记录 id（默认记录无法物理删除） */
  const removed = ref<string[]>([])
  const loaded = ref(false)

  function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      const rawAdded = localStorage.getItem(ADDED_KEY)
      if (rawAdded) added.value = sanitizeRecords(JSON.parse(rawAdded))
      const rawOverrides = localStorage.getItem(OVERRIDES_KEY)
      if (rawOverrides) overrides.value = sanitizeOverrides(JSON.parse(rawOverrides))
      const rawRemoved = localStorage.getItem(REMOVED_KEY)
      if (rawRemoved) {
        const parsed = JSON.parse(rawRemoved)
        if (Array.isArray(parsed)) {
          removed.value = parsed.filter((id): id is string => typeof id === 'string')
        }
      }
    } catch {
      /* 本地数据损坏时按空处理，不阻塞页面 */
    }
  }

  function persist(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  }

  /** 合并列表：默认记录（应用编辑覆盖、剔除已删除）+ 博主新增，按日期倒序（同日新增在前） */
  const items = computed<LifeRecord[]>(() => {
    const defaults = MOCK_LIFE.filter(item => !removed.value.includes(item.id)).map(item => ({
      ...item,
      ...(overrides.value[item.id] ?? {})
    }))
    const locals = added.value.filter(item => !removed.value.includes(item.id))
    return [...locals, ...defaults].sort((a, b) => (a.date < b.date ? 1 : -1))
  })

  /** 新增记录（持久化失败返回 false） */
  function addRecord(input: LifeRecordInput): boolean {
    const next: LifeRecord = {
      id: `life-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date: input.date,
      title: input.title,
      content: input.content,
      mood: input.mood || undefined,
      images: input.images.length ? input.images : undefined
    }
    const backup = [...added.value]
    added.value = [...added.value, next]
    if (!persist(ADDED_KEY, added.value)) {
      added.value = backup
      return false
    }
    return true
  }

  /** 编辑记录：新增的直接更新；默认记录记入编辑覆盖表（持久化失败返回 false） */
  function updateRecord(record: LifeRecord): boolean {
    const normalized: LifeRecord = {
      id: record.id,
      date: record.date,
      title: record.title,
      content: record.content,
      mood: record.mood || undefined,
      images: record.images?.length ? record.images : undefined
    }
    if (added.value.some(item => item.id === record.id)) {
      const backup = [...added.value]
      added.value = added.value.map(item => (item.id === record.id ? normalized : item))
      if (!persist(ADDED_KEY, added.value)) {
        added.value = backup
        return false
      }
      return true
    }
    const backup = { ...overrides.value }
    overrides.value = { ...overrides.value, [record.id]: normalized }
    if (!persist(OVERRIDES_KEY, overrides.value)) {
      overrides.value = backup
      return false
    }
    return true
  }

  /** 删除记录：新增的直接移除；默认记录记入隐藏列表（持久化失败返回 false） */
  function removeRecord(record: LifeRecord): boolean {
    if (added.value.some(item => item.id === record.id)) {
      const backup = [...added.value]
      added.value = added.value.filter(item => item.id !== record.id)
      if (!persist(ADDED_KEY, added.value)) {
        added.value = backup
        return false
      }
      return true
    }
    const backup = [...removed.value]
    removed.value = [...removed.value, record.id]
    if (!persist(REMOVED_KEY, removed.value)) {
      removed.value = backup
      return false
    }
    // 顺带清理该记录的编辑覆盖，避免残留
    if (overrides.value[record.id]) {
      const next = { ...overrides.value }
      delete next[record.id]
      overrides.value = next
      persist(OVERRIDES_KEY, overrides.value)
    }
    return true
  }

  void load()

  return { added, overrides, removed, items, addRecord, updateRecord, removeRecord, load }
})
