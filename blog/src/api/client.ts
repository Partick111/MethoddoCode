import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { emitAuthExpired } from '@/utils/auth-events'
import { clearStoredAuthUser, readStoredToken } from '@/utils/auth-storage'

/**
 * axios 请求封装
 *
 * 当前内容来源通过 VITE_CONTENT_SOURCE 控制：
 * - local（默认）：本地 mock 数据
 * - api：请求后端 REST API（Django，见 blog_terminal/）
 *
 * 业务层不感知来源，统一走 @/api 模块。
 * 认证：请求自动携带 Authorization: Bearer <token>；401 时清除本地登录态并派发过期事件。
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器：注入 JWT（直接从 localStorage 读取，避免与 auth store 循环依赖）
client.interceptors.request.use(config => {
  const token = readStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截器：统一提取错误文案；401 自动登出并通知 UI 弹登录窗
client.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  error => {
    const status = error?.response?.status
    const message = error?.response?.data?.detail || error?.message || '网络异常'
    if (status === 401 && readStoredToken()) {
      // 仅当本地存在 token 时视为「会话过期」；登录接口本身的 401 不在此触发（后端返回 400）
      clearStoredAuthUser()
      emitAuthExpired()
    }
    // eslint-disable-next-line no-console
    console.error('[api] request failed:', message)
    return Promise.reject(error)
  }
)

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await client.request<never, AxiosResponse<T>>(config)
  return response.data
}

export default client
