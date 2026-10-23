/**
 * 登录态本地存储封装（auth store 与 axios 拦截器共用的单一数据源）。
 * 独立成文件是为了避免 stores/auth 与 api/client 相互 import 形成循环依赖。
 */

/** 当前登录用户持久化 key（需求文档约定） */
export const AUTH_USER_KEY = 'blog-auth-user'

export interface StoredAuthUser {
  username: string
  /** JWT access token（请求头 Authorization: Bearer <token>） */
  token: string
  /** JWT refresh token（预留后续静默续期） */
  refresh?: string
  /** 最近一次登录时间戳 */
  loginAt: number
  /** 是否博主（Django is_superuser，超级管理员）：登录/注册/me 响应由服务端下发，决定写文章/编辑/删除入口是否可见 */
  isSuperuser?: boolean
}

export function readStoredAuthUser(): StoredAuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAuthUser
    return parsed && typeof parsed.token === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** 供 axios 请求拦截器读取 token（不经过 store，避免循环依赖） */
export function readStoredToken(): string | null {
  return readStoredAuthUser()?.token ?? null
}

export function writeStoredAuthUser(user: StoredAuthUser): void {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  } catch {
    /* localStorage 不可用时仅内存态生效 */
  }
}

export function clearStoredAuthUser(): void {
  try {
    localStorage.removeItem(AUTH_USER_KEY)
  } catch {
    /* ignore */
  }
}
