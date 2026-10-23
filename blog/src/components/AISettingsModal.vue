<script setup lang="ts">
/**
 * AISettingsModal.vue —— AI 助手设置弹窗（所有登录用户可配置自己的大模型）
 *
 * 入口：AI 助手面板标题栏「设置」按钮（关闭按钮左侧）。
 * 区块：
 * 1. 大模型：厂商 → 模型 → 接口地址（选择厂商/模型后自动生成，仍可手动修改）→ API Key；
 *    配置按用户隔离保存，对话消耗各自账号的额度；
 * 2. 知识库管理：Milvus 状态（文章数 / 分块数）+ 全量重建（仅博主可操作）。
 *
 * 说明：
 * - 嵌入模型全站固定（openai:text-embedding-3-small），用户不可配置；
 * - API Key 留空表示不修改（后端保留已保存的 Key；已配置时 placeholder 展示打码值）；
 * - 保存调用 PUT /api/ai/config/（登录即可，按用户隔离）；测试连通性可先测后存；
 * - 保存 / 编辑 / 删除文章时对应接口会自动同步知识库，此处「重建」用于全量兜底
 *   （如收录历史文章、更换固定嵌入模型后需要重新向量化）。
 *
 * 交互与视觉：对齐 ShareLinkModal（Teleport + Esc / 遮罩关闭、玻璃质感弹窗），
 * 遮罩 z-[80] / 面板 z-[85]，高于 AI 面板（z-60）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  X
} from 'lucide-vue-next'
import { LLM_PROVIDERS, findProvider, type AIModelOption } from '@/config/ai-models'
import {
  getAIConfig,
  getRagStatus,
  ragRebuild,
  saveAIConfig,
  testAIModel,
  type AIConfigPayload,
  type AIGroupConfig,
  type RagArticleInput,
  type RagStatus
} from '@/api/ai'
import { getBlogDetail, getBlogIndex } from '@/api/blog'
import { useAuthStore } from '@/stores/auth'
import { htmlToPlainText, markdownToPlainText } from '@/stores/local-articles'

/** 由父组件控制显隐：<AISettingsModal v-model:open="show" /> */
const visible = defineModel<boolean>('open', { default: false })

/** 大模型表单 */
interface LlmForm {
  provider: string
  model: string
  baseUrl: string
  /** 本次输入的新 Key（留空 = 不修改） */
  apiKey: string
  /** 已保存 Key 的打码值（placeholder 提示用） */
  savedKey: string
  /** 后端是否已保存完整配置（model + base_url + api_key） */
  configured: boolean
}

interface TestState {
  testing: boolean
  ok: boolean | null
  detail: string
}

function emptyForm(): LlmForm {
  return { provider: 'custom', model: '', baseUrl: '', apiKey: '', savedKey: '', configured: false }
}

function emptyTest(): TestState {
  return { testing: false, ok: null, detail: '' }
}

const auth = useAuthStore()
const llmForm = ref<LlmForm>(emptyForm())
const llmTest = ref<TestState>(emptyTest())

const loading = ref(false)
const saving = ref(false)
const saveMsg = ref('')
const saveOk = ref(true)

const rag = ref<RagStatus | null>(null)
const ragLoading = ref(false)
const ragMsg = ref('')
const rebuilding = ref(false)
const rebuildProgress = ref({ done: 0, total: 0 })
const rebuildConfirm = ref(false)

/** 统一提取错误文案（后端错误统一 { detail }） */
function errText(e: unknown): string {
  if (isAxiosError(e)) return e.response?.data?.detail || e.message || '请求失败'
  return e instanceof Error ? e.message : String(e)
}

/**
 * 厂商切换：自动填入接口地址并选中该厂商首个模型
 * （满足「选择模型后模型地址自动生成」，同时允许手动修改）。
 */
function onProviderChange() {
  const preset = findProvider(LLM_PROVIDERS, llmForm.value.provider)
  if (!preset) return
  if (preset.baseUrl) llmForm.value.baseUrl = preset.baseUrl
  if (preset.models.length && !preset.models.some(m => m.value === llmForm.value.model)) {
    llmForm.value.model = preset.models[0].value
  }
}

/** 当前厂商的模型下拉项；已保存模型不在预设清单时补一项（避免显示为空） */
function modelOptions(): AIModelOption[] {
  const preset = findProvider(LLM_PROVIDERS, llmForm.value.provider)
  const base = preset?.models ?? []
  if (llmForm.value.model && !base.some(m => m.value === llmForm.value.model)) {
    return [...base, { label: `${llmForm.value.model}（当前值）`, value: llmForm.value.model }]
  }
  return base
}

/** 后端配置 → 表单；provider 不在预设清单时归入「自定义」（保留地址与模型供修改） */
function toForm(group: AIGroupConfig): LlmForm {
  const provider = findProvider(LLM_PROVIDERS, group.provider) ? group.provider : 'custom'
  return {
    provider,
    model: group.model,
    baseUrl: group.base_url,
    apiKey: '',
    savedKey: group.api_key,
    configured: group.configured
  }
}

function applyPayload(payload: AIConfigPayload) {
  llmForm.value = toForm(payload.llm)
  llmTest.value = emptyTest()
}

async function loadConfig() {
  loading.value = true
  saveMsg.value = ''
  try {
    applyPayload(await getAIConfig())
  } catch (e) {
    saveOk.value = false
    saveMsg.value = `配置读取失败：${errText(e)}`
  } finally {
    loading.value = false
  }
}

async function loadRag() {
  ragLoading.value = true
  ragMsg.value = ''
  try {
    rag.value = await getRagStatus()
  } catch (e) {
    rag.value = null
    ragMsg.value = `知识库状态读取失败：${errText(e)}`
  } finally {
    ragLoading.value = false
  }
}

async function runTest() {
  const form = llmForm.value
  if (!form.model.trim() || !form.baseUrl.trim()) {
    llmTest.value = { testing: false, ok: false, detail: '请先选择模型并填写接口地址' }
    return
  }
  llmTest.value = { testing: true, ok: null, detail: '' }
  try {
    const res = await testAIModel({
      kind: 'llm',
      model: form.model.trim(),
      base_url: form.baseUrl.trim(),
      api_key: form.apiKey.trim()
    })
    llmTest.value = { testing: false, ok: res.ok, detail: res.detail }
  } catch (e) {
    llmTest.value = { testing: false, ok: false, detail: errText(e) }
  }
}

async function save() {
  if (saving.value) return
  saveMsg.value = ''

  const form = llmForm.value
  if (form.model.trim() && !form.baseUrl.trim()) {
    saveOk.value = false
    saveMsg.value = '请填写接口地址'
    return
  }
  if (form.baseUrl.trim() && !/^https?:\/\//i.test(form.baseUrl.trim())) {
    saveOk.value = false
    saveMsg.value = '接口地址需以 http:// 或 https:// 开头'
    return
  }

  saving.value = true
  try {
    const payload = await saveAIConfig({
      llm: {
        provider: form.provider,
        model: form.model.trim(),
        base_url: form.baseUrl.trim(),
        api_key: form.apiKey.trim()
      }
    })
    // 回显：清空输入框并更新打码值 / 已配置状态
    applyPayload(payload)
    saveOk.value = true
    saveMsg.value = '已保存'
  } catch (e) {
    saveOk.value = false
    saveMsg.value = `保存失败：${errText(e)}`
  } finally {
    saving.value = false
  }
}

/**
 * 全量重建知识库（仅博主）：
 * 1. 拉取全站文章（含本地发布 / 编辑覆盖的版本，与列表页数据一致）；
 * 2. Markdown 正文剥离标记、富文本正文剥离标签后，交给后端逐个重新分块 + 向量化。
 */
async function doRebuild() {
  if (rebuilding.value || !auth.isSuperuser) return
  rebuildConfirm.value = false
  rebuilding.value = true
  ragMsg.value = ''
  rebuildProgress.value = { done: 0, total: 0 }
  try {
    const index = await getBlogIndex()
    rebuildProgress.value.total = index.length
    const articles: RagArticleInput[] = []
    for (const item of index) {
      try {
        const post = await getBlogDetail(item.slug)
        const content = post.raw
          ? markdownToPlainText(post.raw)
          : htmlToPlainText(post.html)
        if (content.trim()) {
          articles.push({ slug: item.slug, title: item.title || post.config?.title || item.slug, content })
        }
      } catch {
        // 单篇拉取失败（如不可读的文章）跳过，不中断整体重建
      }
      rebuildProgress.value.done++
    }
    if (!articles.length) throw new Error('没有可索引的文章')
    const res = await ragRebuild(articles)
    if (!res.indexed && res.failed.length) {
      // 全部失败：后端原子重建已中止，现有知识库保持原样；展示首个错误便于排查
      const first = res.failed[0]?.error || '未知原因'
      ragMsg.value = `重建已中止（原知识库未改动）：${res.failed.length} 篇文章处理失败，首个错误：${first}`
    } else {
      const failed = res.failed.length ? `，${res.failed.length} 篇失败` : ''
      ragMsg.value = `重建完成：${res.indexed} 篇文章 / ${res.chunks} 个分块${failed}`
    }
    await loadRag()
  } catch (e) {
    ragMsg.value = `重建失败：${errText(e)}`
  } finally {
    rebuilding.value = false
  }
}

function close() {
  visible.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !visible.value) return
  // 重建确认行的 Esc 先收起确认行，不关闭整个弹窗
  if (rebuildConfirm.value) {
    rebuildConfirm.value = false
    return
  }
  if (!rebuilding.value) close()
}

/** 每次打开：载入配置 + 刷新知识库状态 */
watch(visible, v => {
  if (v) {
    rebuildConfirm.value = false
    void loadConfig()
    void loadRag()
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点击关闭（重建中禁止误触关闭） -->
    <Transition name="aiset-mask">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="!rebuilding && close()"
      />
    </Transition>

    <!-- 设置面板：居中显示，超高时内部滚动 -->
    <Transition name="aiset-modal">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center p-4"
      >
        <section
          class="card nice-scrollbar pointer-events-auto relative max-h-[86vh] w-[600px] max-w-full overflow-y-auto !rounded-[28px] !p-6"
          role="dialog"
          aria-modal="true"
          aria-label="AI 助手设置"
        >
          <!-- 标题栏 -->
          <header class="flex items-start gap-3">
            <span
              class="text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
            >
              <Settings :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-medium">AI 助手设置</h2>
              <p class="text-secondary mt-0.5 text-xs">
                配置你自己的大模型 API Key（对话消耗自己的账号额度；接口地址按厂商自动生成，仍可手动修改）
              </p>
            </div>
            <button
              type="button"
              class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
              :title="rebuilding ? '重建中，暂不可关闭' : '关闭（Esc）'"
              aria-label="关闭"
              :disabled="rebuilding"
              @click="close"
            >
              <X :size="16" />
            </button>
          </header>

          <!-- 载入中 -->
          <div v-if="loading" class="text-secondary flex items-center justify-center gap-2 py-12 text-sm">
            <Loader2 :size="16" class="animate-spin" />
            正在读取配置…
          </div>

          <template v-else>
            <!-- ① 大模型（按用户隔离：各自配置各自的 Key） -->
            <section
              class="mt-5 rounded-2xl border p-4"
              :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }"
            >
              <header class="flex items-center gap-2">
                <Sparkles :size="15" class="text-brand shrink-0" />
                <h3 class="text-sm font-medium">我的大模型（对话生成）</h3>
                <span
                  v-if="llmForm.configured"
                  class="text-secondary ml-auto shrink-0 rounded-full border px-2 py-[1px] text-[10px] leading-4"
                  :style="{ borderColor: 'var(--color-border)' }"
                >
                  已配置
                </span>
              </header>
              <p class="text-secondary mt-1 text-[10px] leading-relaxed">
                每个用户各存一份自己的配置，对话消耗你本人的 API Key 额度，与其他用户互不影响。
              </p>

              <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <span class="text-secondary mb-1 block text-xs">厂商</span>
                  <select
                    v-model="llmForm.provider"
                    class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                    style="background-color: var(--color-card)"
                    @change="onProviderChange"
                  >
                    <option v-for="p in LLM_PROVIDERS" :key="p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </div>
                <div>
                  <span class="text-secondary mb-1 block text-xs">模型</span>
                  <select
                    v-if="modelOptions().length"
                    v-model="llmForm.model"
                    class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                    style="background-color: var(--color-card)"
                  >
                    <option v-for="m in modelOptions()" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <input
                    v-else
                    v-model="llmForm.model"
                    type="text"
                    maxlength="100"
                    placeholder="请输入模型名称，如 qwen-plus"
                    class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                    style="background-color: var(--color-card)"
                  />
                </div>
              </div>

              <div class="mt-3">
                <span class="text-secondary mb-1 block text-xs">接口地址（Base URL，选择厂商后自动生成）</span>
                <input
                  v-model="llmForm.baseUrl"
                  type="url"
                  maxlength="300"
                  placeholder="https://api.deepseek.com/v1"
                  class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                  style="background-color: var(--color-card)"
                />
              </div>

              <div class="mt-3">
                <span class="text-secondary mb-1 block text-xs">API Key</span>
                <input
                  v-model="llmForm.apiKey"
                  type="password"
                  maxlength="300"
                  autocomplete="new-password"
                  :placeholder="
                    llmForm.configured
                      ? `已配置 ${llmForm.savedKey}，留空表示不修改`
                      : '请输入 API Key（如 sk-...）'
                  "
                  class="text-primary w-full rounded-2xl border px-3 py-2 text-sm outline-none"
                  style="background-color: var(--color-card)"
                />
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  class="text-secondary rounded-xl border px-3 py-1.5 text-xs transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="llmTest.testing"
                  @click="runTest"
                >
                  <span class="flex items-center gap-1.5">
                    <Loader2 v-if="llmTest.testing" :size="12" class="animate-spin" />
                    测试连通性
                  </span>
                </button>
                <p
                  v-if="llmTest.detail"
                  class="flex min-w-0 flex-1 items-center gap-1 text-xs"
                  :style="{ color: llmTest.ok ? '#46a758' : '#e5484d' }"
                >
                  <CheckCircle2 v-if="llmTest.ok" :size="12" class="shrink-0" />
                  <AlertCircle v-else :size="12" class="shrink-0" />
                  <span class="min-w-0 break-words">{{ llmTest.detail }}</span>
                </p>
              </div>
            </section>

            <!-- ② 知识库管理（嵌入模型固定；重建仅博主可操作） -->
            <section
              class="mt-4 rounded-2xl border p-4"
              :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }"
            >
              <header class="flex items-center gap-2">
                <Database :size="15" class="text-brand shrink-0" />
                <h3 class="text-sm font-medium">知识库（Milvus · blogRAG）</h3>
                <button
                  type="button"
                  class="text-secondary ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:text-brand disabled:opacity-50"
                  title="刷新状态"
                  :disabled="ragLoading || rebuilding"
                  @click="loadRag"
                >
                  <RefreshCw :size="12" :class="ragLoading ? 'animate-spin' : ''" />
                </button>
              </header>

              <div class="mt-2 text-xs leading-relaxed">
                <template v-if="rag">
                  <p class="flex items-center gap-1.5">
                    <span
                      class="inline-block h-2 w-2 shrink-0 rounded-full"
                      :style="{ backgroundColor: rag.milvus_ok ? '#46a758' : '#e5484d' }"
                    />
                    <span class="text-secondary">
                      Milvus {{ rag.milvus_ok ? '已连接' : `未连接${rag.detail ? `：${rag.detail}` : ''}` }}
                    </span>
                  </p>
                  <p v-if="rag.milvus_ok" class="text-secondary mt-1">
                    <template v-if="rag.collection_exists">
                      已收录 <span class="text-primary font-medium">{{ rag.articles }}</span> 篇文章 /
                      <span class="text-primary font-medium">{{ rag.chunks }}</span> 个分块
                    </template>
                    <template v-else>知识库集合尚未建立（保存 / 编辑文章或重建后自动创建）</template>
                  </p>
                </template>
                <p v-else class="text-secondary">{{ ragLoading ? '正在读取状态…' : '状态不可用' }}</p>
                <p class="text-secondary mt-1 text-[10px]">
                  嵌入模型固定为 openai:text-embedding-ada-002（全站统一，无需配置）。
                  保存 / 编辑文章会自动分块并写入知识库，删除文章会移除对应向量；下方重建用于全量兜底。
                </p>
              </div>

              <!-- 重建操作区（仅博主） -->
              <div class="mt-3">
                <template v-if="rebuilding">
                  <p class="text-secondary flex items-center gap-2 text-xs">
                    <Loader2 :size="12" class="animate-spin shrink-0" />
                    <span v-if="rebuildProgress.total > 0 && rebuildProgress.done < rebuildProgress.total">
                      正在拉取文章：{{ rebuildProgress.done }}/{{ rebuildProgress.total }}…
                    </span>
                    <span v-else>正在向量化全部文章，请稍候（可能需几分钟）…</span>
                  </p>
                </template>
                <template v-else-if="rebuildConfirm">
                  <div class="flex flex-wrap items-center gap-3">
                    <p class="text-xs" style="color: #e5484d">将重新索引全部文章：全部成功后才替换现有向量，失败会自动中止且原知识库保持不变。确认重建？</p>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="brand-btn rounded-xl px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        @click="doRebuild"
                      >
                        确认重建
                      </button>
                      <button
                        type="button"
                        class="text-secondary rounded-xl border px-3 py-1.5 text-xs transition-colors hover:text-brand"
                        @click="rebuildConfirm = false"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <button
                    v-if="auth.isSuperuser"
                    type="button"
                    class="text-secondary flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-colors hover:text-brand disabled:opacity-50"
                    @click="rebuildConfirm = true"
                  >
                    <RefreshCw :size="12" />
                    重建知识库
                  </button>
                  <p v-else class="text-secondary text-[10px] leading-relaxed">
                    全量重建消耗嵌入额度，仅博主可操作；日常保存 / 编辑文章会自动同步，无需手动重建。
                  </p>
                </template>
                <p
                  v-if="ragMsg"
                  class="mt-2 text-xs leading-relaxed break-words"
                  :style="{ color: ragMsg.startsWith('重建完成') ? '#46a758' : '#e5484d' }"
                >
                  {{ ragMsg }}
                </p>
              </div>
            </section>

            <!-- 底部操作 -->
            <footer class="mt-5 flex items-center justify-end gap-3">
              <p
                v-if="saveMsg"
                class="mr-auto max-w-[60%] text-xs break-words"
                :style="{ color: saveMsg === '已保存' ? '#46a758' : '#e5484d' }"
              >
                {{ saveMsg }}
              </p>
              <button
                type="button"
                class="text-secondary rounded-xl border px-4 py-2 text-sm transition-colors hover:text-brand disabled:opacity-50"
                :disabled="saving"
                @click="close"
              >
                关闭
              </button>
              <button
                type="button"
                class="brand-btn flex items-center gap-2 rounded-xl px-5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="saving"
                @click="save"
              >
                <Loader2 v-if="saving" :size="14" class="animate-spin" />
                保存
              </button>
            </footer>
          </template>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.aiset-mask-enter-active,
.aiset-mask-leave-active {
  transition: opacity 0.24s ease;
}
.aiset-mask-enter-from,
.aiset-mask-leave-to {
  opacity: 0;
}

.aiset-modal-enter-active,
.aiset-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.aiset-modal-enter-from,
.aiset-modal-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .aiset-mask-enter-active,
  .aiset-mask-leave-active,
  .aiset-modal-enter-active,
  .aiset-modal-leave-active {
    transition: none;
  }
}
</style>
