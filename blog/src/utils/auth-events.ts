/**
 * 认证相关全局事件：解耦「axios 拦截器 / 路由守卫」与 UI 组件（AuthModal）。
 *
 * - AUTH_EXPIRED_EVENT：token 失效（401）时由 api client 派发 → UI 自动登出并弹登录窗；
 * - AUTH_REQUIRED_EVENT：访问受保护资源（requiresAuth 路由等）时派发 → UI 弹登录窗。
 */

export const AUTH_EXPIRED_EVENT = 'blog:auth-expired'
export const AUTH_REQUIRED_EVENT = 'blog:auth-required'

/** 待处理的登录引导文案：组件挂载晚于事件派发时兜底消费，避免提示丢失 */
let pendingNotice: string | null = null

function dispatchAuthEvent(eventName: string, detail: string) {
  if (typeof window === 'undefined') return
  pendingNotice = detail
  window.dispatchEvent(new CustomEvent<string>(eventName, { detail }))
}

/** 登录态过期（401）：UI 应自动登出并弹登录窗引导重新登录 */
export function emitAuthExpired(detail = '登录已过期，请重新登录'): void {
  dispatchAuthEvent(AUTH_EXPIRED_EVENT, detail)
}

/** 需要登录：UI 应弹登录窗（不跳转、不出现受保护界面） */
export function emitAuthRequired(detail = '请先登录后再继续操作'): void {
  dispatchAuthEvent(AUTH_REQUIRED_EVENT, detail)
}

/**
 * 消费待处理的登录引导文案（UI 组件挂载时调用）。
 * 覆盖「事件先于组件挂载派发」的时序（如路由守卫在跳转前派发）。
 */
export function consumePendingAuthNotice(): string | null {
  const notice = pendingNotice
  pendingNotice = null
  return notice
}
