/**
 * ai.ts —— AI 助手（RAG 问答 + 大模型配置 + 知识库管理）接口封装
 *
 * 对应后端 blog_terminal/blog/views.py：
 * - /ai/chat/          对话（LangGraph：知识库混合检索 → 未命中则联网搜索）
 * - /ai/config/        GET 读配置（Key 打码）/ PUT 保存（登录即可，按用户隔离）
 * - /ai/config/test/   模型连通性测试（登录即可）
 * - /ai/rag/index/     索引单篇文章（保存 / 编辑文章后调用，仅博主）
 * - /ai/rag/delete/    删除文章向量（删除文章后调用，仅博主）
 * - /ai/rag/rebuild/   全量重建知识库（仅博主）
 * - /ai/rag/status/    知识库状态（登录可读）
 * - /ai/threads/       会话列表 / 详情 / 删除（历史记录；消息由 checkpointer 持久化）
 *
 * 说明：嵌入模型全站固定（openai:text-embedding-3-small），不在配置接口中。
 * 流式问答走 WebSocket（/ws/ai/chat/，见 composables/useAiChat.ts）；/ai/chat/ 为一次性兜底。
 */
import { request } from './client'

/** 大模型配置（每个登录用户各存一份，对话消耗各自额度） */
export interface AIGroupConfig {
  provider: string
  model: string
  base_url: string
  /** 已保存的 Key 打码展示；原样回传视为「未修改」 */
  api_key: string
  configured: boolean
}

export interface AIConfigPayload {
  llm: AIGroupConfig
  can_edit: boolean
}

/** 回答来源：博客文章片段 / 联网搜索结果 */
export interface ChatSource {
  type: 'blog' | 'web'
  title: string
  slug?: string
  url?: string
}

export interface ChatReply {
  reply: string
  sources: ChatSource[]
  used_web: boolean
}

export interface RagStatus {
  milvus_ok: boolean
  collection_exists: boolean
  chunks: number
  articles: number
  slugs: string[]
  detail?: string
}

export interface RagArticleInput {
  slug: string
  title: string
  content: string
}

/** 读取自己的 AI 配置（登录用户；Key 打码） */
export function getAIConfig() {
  return request<AIConfigPayload>({ url: '/ai/config/', method: 'GET' })
}

/** 保存自己的 AI 配置（登录即可；api_key 传空或打码值表示保持不变） */
export function saveAIConfig(payload: {
  llm?: { provider: string; model: string; base_url: string; api_key: string }
}) {
  return request<AIConfigPayload>({ url: '/ai/config/', method: 'PUT', data: payload, timeout: 20000 })
}

/** 测试模型连通性（登录即可；api_key 为空时后端使用当前用户已保存的 Key） */
export function testAIModel(payload: { kind?: 'llm' | 'embed'; model?: string; base_url?: string; api_key?: string }) {
  return request<{ ok: boolean; detail: string }>({
    url: '/ai/config/test/',
    method: 'POST',
    data: payload,
    timeout: 60000
  })
}

/** 知识库状态 */
export function getRagStatus() {
  return request<RagStatus>({ url: '/ai/rag/status/', method: 'GET', timeout: 20000 })
}

/** 索引单篇文章（保存 / 编辑文章后调用） */
export function ragIndexArticle(payload: RagArticleInput) {
  return request<{ ok: boolean; chunks: number }>({
    url: '/ai/rag/index/',
    method: 'POST',
    data: payload,
    timeout: 120000
  })
}

/** 删除文章的全部向量 */
export function ragDeleteArticle(slug: string) {
  return request<{ ok: boolean; removed: number }>({
    url: '/ai/rag/delete/',
    method: 'POST',
    data: { slug },
    timeout: 60000
  })
}

/** 全量重建知识库（原子操作：全部文章嵌入成功后才替换集合，失败不清空现有知识库；嵌入耗时较长） */
export function ragRebuild(articles: RagArticleInput[]) {
  return request<{ ok: boolean; indexed: number; chunks: number; failed: { slug: string; error: string }[] }>({
    url: '/ai/rag/rebuild/',
    method: 'POST',
    data: { articles },
    timeout: 600000
  })
}

/** 对话（登录后可用；长请求单独放宽超时：检索 + 生成 + 可能联网搜索） */
export function aiChat(payload: { message: string; history: { role: string; content: string }[] }) {
  return request<ChatReply>({ url: '/ai/chat/', method: 'POST', data: payload, timeout: 120000 })
}

/* ==================== 会话历史（对话记忆，checkpointer 持久化） ==================== */

/** AI 会话列表项（历史记录） */
export interface ChatThreadItem {
  id: string
  title: string
  /** 最近活跃时间（ISO 8601，后端 isoformat 输出） */
  updated_at: string
}

/** 历史消息（从 checkpointer 最新状态回读，role 与界面一致：user / ai） */
export interface ChatHistoryMessage {
  role: 'user' | 'ai'
  content: string
  sources?: ChatSource[]
}

/** 我的 AI 会话列表（历史记录，按最近活跃排序，最多 50 条） */
export function listChatThreads() {
  return request<{ threads: ChatThreadItem[] }>({ url: '/ai/threads/', method: 'GET', timeout: 20000 })
}

/** 单个会话的消息历史（进入历史会话时回显） */
export function getChatThread(threadId: string) {
  return request<{ thread: ChatThreadItem; messages: ChatHistoryMessage[] }>({
    url: `/ai/threads/${threadId}/`,
    method: 'GET',
    timeout: 30000
  })
}

/** 删除会话（连同其全部对话记忆数据，不可恢复） */
export function deleteChatThread(threadId: string) {
  return request<{ ok: boolean }>({
    url: `/ai/threads/${threadId}/`,
    method: 'DELETE',
    timeout: 20000
  })
}
