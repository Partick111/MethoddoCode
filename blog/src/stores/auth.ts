import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isAxiosError } from 'axios'
import client from '@/api/client'
import { AUTH_EXPIRED_EVENT } from '@/utils/auth-events'
import {
  clearStoredAuthUser,
  readStoredAuthUser,
  writeStoredAuthUser,
  type StoredAuthUser
} from '@/utils/auth-storage'

/* ===== 认证接入开关与端点 ===== */
/** 接入真实后端认证时置 true；false 走本地占位逻辑（无后端请求）。
 *  已接入 Django（blog_terminal/）：注册/登录/me/登出见 blog/urls.py，
 *  开发期请求经 vite 代理 /api → http://127.0.0.1:8000（见 vite.config.ts）。 */
const ENABLE_REMOTE_AUTH = true
/** 后端认证端点（相对 API_BASE=/api）；POST { username, password } → { token, refresh, user } */
const AUTH_LOGIN_ENDPOINT = '/auth/login/'
const AUTH_REGISTER_ENDPOINT = '/auth/register/'
/** GET → { id, username, is_superuser }，受保护：token 失效返回 401 */
const AUTH_ME_ENDPOINT = '/auth/me/'
const AUTH_LOGOUT_ENDPOINT = '/auth/logout/'
/* 本地占位账号表 key：仅 ENABLE_REMOTE_AUTH=false 时使用；接入后端后不再读写 */
const ACCOUNTS_KEY = 'blog-auth-accounts'
/* 说明：本 store 不内置任何预置测试账号；注册仅创建普通读者用户，不涉及博主身份——博主账号需到后台开通。 */
/* ========================================================================= */

/** 用户名 / 密码基础规则（AuthModal 复用同一套规则做前置校验） */
export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const PASSWORD_MIN = 6

/** 后端认证接口成功响应结构 */
interface AuthResponse {
  token: string
  refresh?: string
  user?: { id?: number; username?: string; is_superuser?: boolean }
}

export interface AuthUser extends StoredAuthUser {}

interface LocalAccount {
  username: string
  password: string
  createdAt: number
}

/** 本地预检 JWT 是否已过期（解析 payload.exp；最终以服务端 401 为准） */
function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) return false
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const json = JSON.parse(atob(padded)) as { exp?: number }
    return typeof json.exp === 'number' && json.exp * 1000 <= Date.now()
  } catch {
    return false
  }
}

/**
 * 登录态 store：Pinia + localStorage 持久化（key: blog-auth-user）。
 * 游客（未登录）可照常浏览全站内容；仅 AI 助手入口要求登录后才可使用。
 * token 失效（401）时由 api client 清除本地存储并派发 AUTH_EXPIRED_EVENT，本 store 同步登出。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)
  /** 是否博主（Django is_superuser 超级管理员）：个人博客仅博主可写文章 / 编辑 / 删除 */
  const isSuperuser = computed(() => user.value?.isSuperuser === true)

  /**
   * 启动时恢复登录态：
   * 1. 本地 token 缺失/已过期 → 直接清理为未登录；
   * 2. token 形态有效 → 先恢复本地登录态（刷新不闪登出），再后台请求 /me 校验；
   *    若服务端返回 401，由 api client 统一清除并派发过期事件。
   */
  async function load() {
    const stored = readStoredAuthUser()
    if (!stored || isTokenExpired(stored.token)) {
      if (stored) clearStoredAuthUser()
      user.value = null
      return
    }
    user.value = stored
    if (!ENABLE_REMOTE_AUTH) return
    try {
      const { data } = await client.get<{ username?: string; is_superuser?: boolean }>(AUTH_ME_ENDPOINT)
      // 以服务端为准刷新用户名与博主身份（token 有效的前提下）
      if (user.value) {
        user.value = {
          ...user.value,
          username: data?.username ?? user.value.username,
          isSuperuser: data?.is_superuser === true
        }
        persistUser()
      }
    } catch {
      /* 网络异常：保留本地登录态；401 已由响应拦截器处理（自动登出 + 弹窗） */
    }
  }

  function persistUser() {
    try {
      if (user.value) writeStoredAuthUser(user.value)
      else clearStoredAuthUser()
    } catch {
      /* localStorage 不可用时忽略，仅内存态生效 */
    }
  }

  function readAccounts(): LocalAccount[] {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? (parsed as LocalAccount[]) : []
    } catch {
      return []
    }
  }

  function writeAccounts(list: LocalAccount[]) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
    } catch {
      throw new Error('本地存储写入失败，可能已超出浏览器容量限制')
    }
  }

  function assertCredentials(username: string, password: string) {
    if (!username || !password) throw new Error('请输入用户名与密码')
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
      throw new Error(`用户名需为 ${USERNAME_MIN}-${USERNAME_MAX} 个字符`)
    }
    if (password.length < PASSWORD_MIN) throw new Error(`密码至少 ${PASSWORD_MIN} 位`)
  }

  function applySession(session: {
    username: string
    token: string
    refresh?: string
    isSuperuser?: boolean
  }) {
    user.value = {
      username: session.username,
      token: session.token,
      refresh: session.refresh,
      loginAt: Date.now(),
      isSuperuser: session.isSuperuser === true
    }
    persistUser()
  }

  /** 调用后端认证接口；把 axios 错误转换为弹窗可直接展示的 Error（优先后端 detail 文案） */
  async function postAuth(url: string, username: string, password: string): Promise<AuthResponse> {
    try {
      const { data } = await client.post<AuthResponse>(url, { username, password })
      return data
    } catch (e) {
      if (isAxiosError(e)) throw new Error(e.response?.data?.detail || '网络异常，请稍后重试')
      throw e instanceof Error ? e : new Error('操作失败，请稍后重试')
    }
  }

  /**
   * 登录。成功写入登录态（localStorage 持久化），失败抛出带提示文案的 Error（由弹窗展示）。
   * ENABLE_REMOTE_AUTH=false 时走本地占位分支（无后端请求）。
   */
  async function login(rawUsername: string, rawPassword: string): Promise<void> {
    const username = rawUsername.trim()
    assertCredentials(username, rawPassword)

    if (ENABLE_REMOTE_AUTH) {
      const data = await postAuth(AUTH_LOGIN_ENDPOINT, username, rawPassword)
      applySession({
        username: data.user?.username ?? username,
        token: data.token,
        refresh: data.refresh,
        isSuperuser: data.user?.is_superuser
      })
      return
    }

    // 本地占位：仅校验用户自行注册过的账号（无任何预置账号）
    const hit = readAccounts().find(item => item.username.toLowerCase() === username.toLowerCase())
    if (!hit || hit.password !== rawPassword) throw new Error('用户名或密码错误')
    applySession({ username: hit.username, token: `local-${Date.now()}` })
  }

  /** 注册（仅普通读者用户，不涉及博主身份）：成功后直接进入登录态 */
  async function register(rawUsername: string, rawPassword: string): Promise<void> {
    const username = rawUsername.trim()
    assertCredentials(username, rawPassword)

    if (ENABLE_REMOTE_AUTH) {
      const data = await postAuth(AUTH_REGISTER_ENDPOINT, username, rawPassword)
      applySession({
        username: data.user?.username ?? username,
        token: data.token,
        refresh: data.refresh,
        isSuperuser: data.user?.is_superuser
      })
      return
    }

    const accounts = readAccounts()
    if (accounts.some(item => item.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('该用户名已被注册，请更换用户名或直接登录')
    }
    writeAccounts([...accounts, { username, password: rawPassword, createdAt: Date.now() }])
    applySession({ username, token: `local-${Date.now()}` })
  }

  /**
   * 退出登录：本地先行清空（保证 401 场景不弹「会话过期」），
   * 再通知后端（JWT 无状态，失败不影响登出结果）。
   */
  async function logout(): Promise<void> {
    user.value = null
    persistUser()
    if (!ENABLE_REMOTE_AUTH) return
    try {
      await client.post(AUTH_LOGOUT_ENDPOINT)
    } catch {
      /* 后端登出失败不影响本地登出结果 */
    }
  }

  // 会话过期（401）：api client 已清除 localStorage，这里同步内存状态
  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_EXPIRED_EVENT, () => {
      user.value = null
    })
  }

  void load()

  return { user, isLoggedIn, isSuperuser, load, login, register, logout }
})
