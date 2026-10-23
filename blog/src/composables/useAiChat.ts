/**
 * useAiChat.ts —— AI 助手流式对话 composable（WebSocket + 对话记忆）
 *
 * 依赖后端（blog_terminal/）：
 * - WS /ws/ai/chat/?token=<JWT>（Django Channels，见 blog/consumers.py）：
 *   发送 {type:"chat", message, thread_id?} → 接收 start / token* / done / error；
 *   thread_id 为空时服务端以首条消息自动新建会话（start 帧回传新 id）——对话记忆
 *   由 Django ORM checkpointer 按 thread_id 持久化（见 blog/checkpointer.py）；
 * - REST /ai/threads/：历史列表 / 单会话消息 / 删除（见 api/ai.ts）。
 *
 * 流式渲染策略：token 逐段追加到最后一条 AI 消息（streaming=true 显示光标）；
 * done 用完整 reply 覆盖（与服务端持久化文本完全一致）并附来源。
 * 凭证失效（服务端以 4401 关闭）时清除本地登录态并派发 AUTH_EXPIRED_EVENT，
 * 与 api client 的 401 处理保持一致（AIChatEntry 收到事件后引导重新登录）。
 */
import { onBeforeUnmount, ref } from 'vue'
import { getChatThread, type ChatSource } from '@/api/ai'
import { emitAuthExpired } from '@/utils/auth-events'
import { clearStoredAuthUser, readStoredToken } from '@/utils/auth-storage'

/** 界面消息（role 与后端历史回读一致：user / ai） */
export interface AiChatMessage {
  id: number
  role: 'user' | 'ai'
  text: string
  /** 回答来源（博客片段 / 联网结果），仅 AI 消息可能有 */
  sources?: ChatSource[]
  /** 正在流式接收（渲染打字光标；done / error / 连接中断后置 false） */
  streaming?: boolean
}

/** 面板初始欢迎语（新建对话时同样恢复此条） */
export const AI_WELCOME_TEXT =
  '喵～我是这个博客的 AI 小助手，可以问我博客里的文章内容；如果知识库里没有相关内容，我会上网帮你搜一搜～'

/** 服务端下行帧（blog/consumers.py 协议） */
interface ServerFrame {
  type?: string
  thread_id?: string
  content?: string
  reply?: string
  sources?: ChatSource[]
  detail?: string
}

export function useAiChat() {
  // 注意：seq / socket 等 let 声明必须先于下方 ref 初始化——welcomeMessage()
  // 会在初始化时执行并访问 seq，放在后面会触发 TDZ（暂时性死区）
  let socket: WebSocket | null = null
  let connectPromise: Promise<void> | null = null
  let seq = 0

  const messages = ref<AiChatMessage[]>([welcomeMessage()])
  /** 流式接收中：禁用发送与「新建 / 切换会话」（服务端单连接串行处理） */
  const streaming = ref(false)
  /** 当前会话 id：null 表示新对话（首条消息由服务端创建会话并回传） */
  const threadId = ref<string | null>(null)

  function welcomeMessage(): AiChatMessage {
    return { id: ++seq, role: 'ai', text: AI_WELCOME_TEXT }
  }

  /** WS 地址：开发期经 vite /ws 代理到 Django（daphne），生产环境需由部署层反代同名路径 */
  function wsUrl(): string {
    const token = readStoredToken() ?? ''
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}/ws/ai/chat/?token=${encodeURIComponent(token)}`
  }

  /* -------------------- 下行帧处理 -------------------- */

  function onSocketMessage(ev: MessageEvent) {
    let data: ServerFrame
    try {
      data = JSON.parse(String(ev.data)) as ServerFrame
    } catch {
      return
    }

    switch (data.type) {
      case 'start':
        // 新会话：记录服务端回传的 thread_id，后续提问延续该会话记忆
        if (data.thread_id) threadId.value = String(data.thread_id)
        break
      case 'token':
        if (data.content) appendToken(String(data.content))
        break
      case 'done':
        finishStreaming(String(data.reply ?? ''), data.sources)
        break
      case 'error':
        failStreaming(String(data.detail || 'AI 服务暂时不可用，请稍后再试'))
        break
    }
  }

  /** token 追加：末条 AI 消息处于 streaming 时拼接，否则新起一条 */
  function appendToken(text: string) {
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'ai' && last.streaming) {
      last.text += text
      return
    }
    messages.value.push({ id: ++seq, role: 'ai', text, streaming: true })
  }

  /** done：以完整 reply 覆盖流式增量（与后端持久化一致），并补来源 */
  function finishStreaming(reply: string, sources?: ChatSource[]) {
    streaming.value = false
    let target = messages.value[messages.value.length - 1]
    if (!target || target.role !== 'ai' || !target.streaming) {
      target = { id: ++seq, role: 'ai', text: '' }
      messages.value.push(target)
    }
    target.text = reply || target.text
    target.streaming = false
    if (sources?.length) target.sources = sources
  }

  /** error：结束流式状态，追加错误文案（已收到的增量内容保留） */
  function failStreaming(detail: string) {
    streaming.value = false
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'ai' && last.streaming) last.streaming = false
    messages.value.push({ id: ++seq, role: 'ai', text: `（${detail}）` })
  }

  /** 连接关闭：4401 视为会话过期（同 HTTP 401）；流式中断则收尾提示 */
  function onSocketClose(ev: CloseEvent) {
    if (ev.code === 4401) {
      if (readStoredToken()) clearStoredAuthUser()
      emitAuthExpired()
    }
    if (streaming.value) {
      streaming.value = false
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'ai' && last.streaming) last.streaming = false
      if (ev.code !== 4401) {
        messages.value.push({ id: ++seq, role: 'ai', text: '（连接已中断，请重试）' })
      }
    }
  }

  /* -------------------- 连接与发送 -------------------- */

  /** 建立（或复用）WS 连接；握手失败 / 凭证无效（4401）以 reject 通知调用方 */
  function ensureSocket(): Promise<void> {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve()
    if (connectPromise) return connectPromise

    connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl())
      socket = ws
      let opened = false

      ws.onopen = () => {
        opened = true
        resolve()
      }
      ws.onmessage = onSocketMessage
      ws.onclose = (ev) => {
        if (socket === ws) {
          socket = null
          connectPromise = null
        }
        if (!opened) {
          reject(new Error(ev.code === 4401 ? '登录已过期，请重新登录' : '无法连接到 AI 服务，请稍后重试'))
        }
        onSocketClose(ev)
      }
    })
    return connectPromise
  }

  /** 主动断开（登出 / 组件卸载）：摘除监听后关闭，不触发 4401 处理与中断提示 */
  function closeSocket() {
    const ws = socket
    socket = null
    connectPromise = null
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.close()
    }
  }

  /** 发送一条提问（流式中忽略；threadId 为空由服务端新建会话） */
  async function send(rawText: string): Promise<void> {
    const text = rawText.trim()
    if (!text || streaming.value) return

    messages.value.push({ id: ++seq, role: 'user', text })
    streaming.value = true
    try {
      await ensureSocket()
      socket?.send(JSON.stringify({ type: 'chat', message: text, thread_id: threadId.value || undefined }))
    } catch (e) {
      streaming.value = false
      messages.value.push({
        id: ++seq,
        role: 'ai',
        text: `（${e instanceof Error ? e.message : '无法连接到 AI 服务，请稍后重试'}）`
      })
    }
  }

  /* -------------------- 会话管理 -------------------- */

  /** 新建对话：清空上下文（流式中禁止）；新会话由首条消息自动创建 */
  function newChat() {
    if (streaming.value) return
    threadId.value = null
    messages.value = [welcomeMessage()]
  }

  /** 进入历史会话：REST 拉取消息回显，此后提问延续该会话记忆（流式中禁止切换） */
  async function loadThread(id: string): Promise<void> {
    if (streaming.value) return
    const res = await getChatThread(id)
    threadId.value = id
    const history: AiChatMessage[] = (res.messages || []).map((m) => ({
      id: ++seq,
      role: m.role,
      text: m.content,
      sources: m.sources?.length ? m.sources : undefined
    }))
    messages.value = history.length ? history : [welcomeMessage()]
  }

  /** 登出：断开连接并恢复初始态 */
  function reset() {
    closeSocket()
    streaming.value = false
    threadId.value = null
    messages.value = [welcomeMessage()]
  }

  onBeforeUnmount(closeSocket)

  return { messages, streaming, threadId, send, newChat, loadThread, reset }
}
