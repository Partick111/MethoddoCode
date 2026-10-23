/**
 * 我的项目（Pinia store）。
 *
 * - 默认项目来自 src/config/mock-projects.ts；博主新增 / 编辑的内容存 localStorage
 * - 新增项目存 yysuni_projects_added（新增的展示在列表最前）；
 *   对默认项目的编辑存 yysuni_projects_overrides；删除默认项目记入 yysuni_projects_removed
 *   （打包静态数据无法物理删除，同文章隐藏机制），本地新增的项目可直接物理删除；
 *   清除浏览器 localStorage 即可恢复默认数据
 * - 使用方：我的项目页 ProjectListView、编辑弹窗 ProjectModal
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MOCK_PROJECTS, type MockProject } from '@/config/mock-projects'

/** 本地存储键：新增项目 / 编辑覆盖（id → 项目）/ 已删除的默认项目 id */
const ADDED_KEY = 'yysuni_projects_added'
const OVERRIDES_KEY = 'yysuni_projects_overrides'
const REMOVED_KEY = 'yysuni_projects_removed'

export type Project = MockProject

/** 新增 / 编辑时的表单输入 */
export interface ProjectInput {
  name: string
  description: string
  tags: string[]
  url: string
}

/** 校验项目形状，过滤损坏项 */
function sanitizeProjects(input: unknown): Project[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (item): item is Project =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as Project).id === 'string' &&
        typeof (item as Project).name === 'string'
    )
    .map(item => ({
      id: item.id,
      name: item.name,
      description: typeof item.description === 'string' ? item.description : '',
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      url: typeof item.url === 'string' && item.url ? item.url : undefined
    }))
}

/** 校验编辑覆盖表（id → 项目），过滤损坏项 */
function sanitizeOverrides(input: unknown): Record<string, Project> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const result: Record<string, Project> = {}
  for (const item of sanitizeProjects(Object.values(input as Record<string, unknown>))) {
    result[item.id] = item
  }
  return result
}

export const useProjectsStore = defineStore('projects', () => {
  /** 博主新增的项目（最新添加的在前） */
  const added = ref<Project[]>([])
  /** 对默认项目的编辑覆盖（id → 项目） */
  const overrides = ref<Record<string, Project>>({})
  /** 被删除的项目 id（默认项目无法物理删除） */
  const removed = ref<string[]>([])
  const loaded = ref(false)

  function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      const rawAdded = localStorage.getItem(ADDED_KEY)
      if (rawAdded) added.value = sanitizeProjects(JSON.parse(rawAdded))
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

  /** 合并列表：博主新增（最新在前）+ 默认项目（应用编辑覆盖、剔除已删除） */
  const items = computed<Project[]>(() => [
    ...added.value.filter(item => !removed.value.includes(item.id)),
    ...MOCK_PROJECTS.filter(item => !removed.value.includes(item.id)).map(item => ({
      ...item,
      ...(overrides.value[item.id] ?? {})
    }))
  ])

  /** 新增项目（持久化失败返回 false） */
  function addProject(input: ProjectInput): boolean {
    const next: Project = {
      id: `project-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      description: input.description,
      tags: input.tags,
      url: input.url || undefined
    }
    const backup = [...added.value]
    added.value = [next, ...added.value]
    if (!persist(ADDED_KEY, added.value)) {
      added.value = backup
      return false
    }
    return true
  }

  /** 编辑项目：新增的直接更新；默认项目记入编辑覆盖表（持久化失败返回 false） */
  function updateProject(project: Project): boolean {
    const normalized: Project = {
      id: project.id,
      name: project.name,
      description: project.description,
      tags: project.tags,
      url: project.url || undefined
    }
    if (added.value.some(item => item.id === project.id)) {
      const backup = [...added.value]
      added.value = added.value.map(item => (item.id === project.id ? normalized : item))
      if (!persist(ADDED_KEY, added.value)) {
        added.value = backup
        return false
      }
      return true
    }
    const backup = { ...overrides.value }
    overrides.value = { ...overrides.value, [project.id]: normalized }
    if (!persist(OVERRIDES_KEY, overrides.value)) {
      overrides.value = backup
      return false
    }
    return true
  }

  /** 删除项目：新增的直接移除；默认项目记入隐藏列表（持久化失败返回 false） */
  function removeProject(project: Project): boolean {
    if (added.value.some(item => item.id === project.id)) {
      const backup = [...added.value]
      added.value = added.value.filter(item => item.id !== project.id)
      if (!persist(ADDED_KEY, added.value)) {
        added.value = backup
        return false
      }
      return true
    }
    const backup = [...removed.value]
    removed.value = [...removed.value, project.id]
    if (!persist(REMOVED_KEY, removed.value)) {
      removed.value = backup
      return false
    }
    // 顺带清理该项目的编辑覆盖，避免残留
    if (overrides.value[project.id]) {
      const next = { ...overrides.value }
      delete next[project.id]
      overrides.value = next
      persist(OVERRIDES_KEY, overrides.value)
    }
    return true
  }

  void load()

  return { added, overrides, removed, items, addProject, updateProject, removeProject, load }
})
