import { Marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'
import type { TocItem } from '@/types/blog'

/** 生成稳定的锚点 id */
function slugify(text: string): string {
  const trimmed = text.trim().toLowerCase()
  const latin = trimmed
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
  return latin || `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** marked 实例（一次性初始化） */
const marked = new Marked({
  gfm: true,
  breaks: false
})

/** TOC 收集器（每次渲染前重置） */
let tocCollector: TocItem[] = []

/**
 * 渲染 Markdown -> sanitized HTML
 * - 代码块走 shiki 高亮（含复制按钮 wrapper）
 * - 数学公式走 KaTeX（$$ 块级 / $ 行内）
 * - 收集标题生成目录 TOC
 */
export async function renderMarkdown(markdown: string): Promise<{ html: string; toc: TocItem[] }> {
  tocCollector = []

  // ---- 第一步：提取 KaTeX 公式，替换为占位符（避免与 marked 转义冲突） ----
  const mathBuf: { raw: string; display: boolean }[] = []
  let source = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => {
    const idx = mathBuf.length
    mathBuf.push({ raw: inner.trim(), display: true })
    return `<span class="katex-ph" data-ph="${idx}"></span>`
  })
  source = source.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_m, pre: string, inner: string) => {
    const idx = mathBuf.length
    mathBuf.push({ raw: inner.trim(), display: false })
    return `${pre}<span class="katex-ph" data-ph="${idx}"></span>`
  })

  // ---- 第二步：提取围栏代码块（marked 15 异步 renderer 不再 await Promise，
  //      为避免 [object Promise]，所有代码块预处理为占位符，渲染后统一异步高亮） ----
  const codeBuf: { code: string; lang: string }[] = []
  source = source.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_m: string, lang: string, code: string) => {
    const idx = codeBuf.length
    codeBuf.push({ code, lang: (lang || 'text').trim().toLowerCase() })
    return `<pre data-code-ph="${idx}"></pre>`
  })

  const renderer = {
    code({ text, lang }: { text: string; lang?: string }) {
      const idx = codeBuf.length
      codeBuf.push({ code: text, lang: (lang || 'text').toLowerCase() })
      return `<pre data-code-ph="${idx}"></pre>`
    },
    heading(this: import('marked').Renderer, { tokens, depth }: { tokens: import('marked').Token[]; depth: number }) {
      const rawText = tokens.map(t => ('tokens' in t && t.tokens ? renderText(t.tokens) : (t as import('marked').Tokens.Text).text ?? '')).join('')
      const text = stripHtml(rawText)
      const id = slugify(text)
      tocCollector.push({ id, level: depth, text: text.trim() })
      return `<h${depth} id="${id}">${this.parser!.parseInline(tokens)}</h${depth}>`
    }
  } as unknown as Partial<import('marked').RendererObject>

  marked.use({ renderer })

  // 同步解析（高亮在渲染后完成，避免 marked 15 异步 renderer 的 Promise 序列化问题）
  let html = marked.parse(source, { async: false }) as string

  // ---- 第三步：逐个替换代码块（串行 await shiki 高亮） ----
  for (let i = 0; i < codeBuf.length; i++) {
    const ph = new RegExp(`<pre data-code-ph="${i}"></pre>`)
    const highlighted = await highlightCode(codeBuf[i].code, codeBuf[i].lang)
    html = html.replace(ph, highlighted)
  }

  // ---- 第四步：替换 KaTeX 占位符 ----
  html = html.replace(/<span class="katex-ph" data-ph="(\d+)"><\/span>/g, (_m, idx: string) => {
    const item = mathBuf[Number(idx)]
    if (!item) return ''
    try {
      return katex.renderToString(item.raw, {
        throwOnError: false,
        displayMode: item.display,
        output: 'htmlAndMathml'
      })
    } catch {
      return `<code>${escapeHtml(item.raw)}</code>`
    }
  })

  // ---- 第五步：DOMPurify 清洗 ----
  const safeHtml = DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    ADD_TAGS: ['input']
  })

  return { html: safeHtml, toc: [...tocCollector] }
}

function renderText(tokens: import('marked').Token[]): string {
  return tokens
    .map(t => {
      if ('tokens' in t && t.tokens) return renderText(t.tokens)
      return 'text' in t ? (t as import('marked').Tokens.Text).text : ''
    })
    .join('')
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ==================== 轻量转换（编辑页专用） ==================== */

/** 轻量转换用 marked 实例：与渲染管线实例隔离，避免 TOC / 代码块占位符等副作用 */
const basicMarked = new Marked({ gfm: true, breaks: false })

/**
 * 轻量 Markdown → HTML（文章编辑页载入数据源文章时使用）
 * 仅做基础 GFM 转换，转换结果直接进入 TinyMCE 富文本编辑；输出经 DOMPurify 清洗
 */
export async function markdownToBasicHtml(markdown: string): Promise<string> {
  const html = (await basicMarked.parse(markdown)) as string
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

/* ==================== shiki 高亮 ==================== */

let highlighterPromise: ReturnType<typeof createHighlighterCached> | null = null

async function createHighlighterCached() {
  const { createHighlighter } = await import('shiki')
  const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript')
  return createHighlighter({
    themes: ['one-light'],
    langs: ['js', 'ts', 'vue', 'html', 'css', 'json', 'bash', 'shell', 'python', 'java', 'sql', 'markdown', 'md', 'jsx', 'tsx', 'yaml', 'diff', 'txt', 'text', 'plaintext'],
    engine: createJavaScriptRegexEngine()
  })
}

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCached().catch(err => {
      highlighterPromise = null
      throw err
    })
  }
  return highlighterPromise
}

async function highlightCode(code: string, lang: string): Promise<string> {
  const escaped = escapeHtml(code)
  try {
    const highlighter = await getHighlighter()
    // 语言不存在时回退为纯文本
    const normalized = lang.toLowerCase()
    const html =
      highlighter.getLoadedLanguages().includes(normalized)
        ? highlighter.codeToHtml(code, { lang: normalized as never, theme: 'one-light' })
        : `<pre class="shiki" style="background-color:#f6f8fa;color:#24292e"><code>${escaped}</code></pre>`
    // 复制内容传原始代码（escaped 仅用于回退渲染）
    return wrapCodeBlock(html, code)
  } catch {
    return wrapCodeBlock(`<pre class="shiki" style="background-color:#f6f8fa;color:#24292e"><code>${escaped}</code></pre>`, code)
  }
}

function wrapCodeBlock(highlightedHtml: string, plainText: string): string {
  return `<div class="code-block-wrapper"><button type="button" class="code-block-copy-btn" title="复制代码" data-copy-code="${encodeURIComponent(
    plainText
  )}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>${highlightedHtml}</div>`
}

/* ==================== 富文本 HTML 增强（编辑保存的文章） ==================== */

/** 匹配 $...$ / $$...$$（前缀捕获组保留原字符，转义 \$ 不匹配） */
const MATH_TEXT_RE = /\$\$([\s\S]+?)\$\$|(^|[^\\$])\$([^$\n]+?)\$/g

/**
 * 文本节点内的 $...$ / $$...$$ → KaTeX 片段（无公式时返回 null）
 * 与 renderMarkdown 的公式规则保持一致；无法渲染的公式保留原文
 */
function renderMathInText(raw: string): DocumentFragment | null {
  let fragment: DocumentFragment | null = null
  let last = 0
  let match: RegExpExecArray | null
  MATH_TEXT_RE.lastIndex = 0
  while ((match = MATH_TEXT_RE.exec(raw))) {
    const display = match[1] !== undefined
    const formula = (display ? match[1] : match[3]).trim()
    if (!formula) continue
    const prefix = display ? '' : (match[2] ?? '')
    const start = match.index + prefix.length
    if (!fragment) fragment = document.createDocumentFragment()
    if (start > last) fragment.appendChild(document.createTextNode(raw.slice(last, start)))
    const span = document.createElement('span')
    try {
      span.innerHTML = katex.renderToString(formula, {
        throwOnError: false,
        displayMode: display,
        output: 'htmlAndMathml'
      })
    } catch {
      span.textContent = match[0]
    }
    fragment.appendChild(span)
    last = match.index + match[0].length
  }
  if (fragment && last < raw.length) fragment.appendChild(document.createTextNode(raw.slice(last)))
  return fragment
}

/**
 * 富文本 HTML 增强（TinyMCE 编辑保存后的文章渲染）
 * - 标题补锚点 + 生成 TOC（id 前缀 local-，避免与数据源文章锚点冲突）
 * - pre > code 走 shiki 高亮（含复制按钮 wrapper，与 renderMarkdown 输出一致）
 * - 正文文本节点中的 $...$ / $$...$$ 渲染为 KaTeX 公式
 * - 输出经 DOMPurify 清洗
 */
export async function enhanceHtmlContent(
  content: string
): Promise<{ html: string; toc: TocItem[] }> {
  const holder = document.createElement('div')
  holder.innerHTML = content || ''

  // ---- 标题锚点 + TOC ----
  const toc: TocItem[] = []
  let headingIndex = 0
  holder.querySelectorAll('h1, h2, h3, h4').forEach(node => {
    const el = node as HTMLElement
    const text = (el.textContent || '').trim()
    if (!text) return
    const id = `local-${headingIndex++}-${slugify(text)}`
    el.id = id
    toc.push({ id, level: Number(el.tagName.slice(1)), text })
  })

  // ---- 代码块 shiki 高亮（串行，与 renderMarkdown 输出结构一致） ----
  const codePres = Array.from(holder.querySelectorAll('pre'))
  for (const pre of codePres) {
    const codeEl = pre.querySelector('code')
    const code = (codeEl ? codeEl.textContent : pre.textContent) || ''
    if (!code.trim()) continue
    const langMatch = `${codeEl?.className ?? ''} ${pre.className}`.match(
      /(?:language|lang)-([\w+-]+)/
    )
    const lang = langMatch ? langMatch[1].toLowerCase() : 'text'
    const highlighted = await highlightCode(code, lang)
    const wrapper = document.createElement('div')
    wrapper.innerHTML = highlighted
    const newNode = wrapper.firstElementChild
    if (newNode) pre.replaceWith(newNode)
  }

  // ---- 正文文本节点中的公式 → KaTeX（跳过代码块等区域） ----
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('pre, code, script, style, textarea, .katex, .code-block-wrapper')) {
        return NodeFilter.FILTER_REJECT
      }
      const value = node.nodeValue
      return value && value.includes('$') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })
  const mathTargets: Text[] = []
  let current = walker.nextNode()
  while (current) {
    mathTargets.push(current as Text)
    current = walker.nextNode()
  }
  for (const textNode of mathTargets) {
    const fragment = renderMathInText(textNode.nodeValue || '')
    if (fragment) textNode.replaceWith(fragment)
  }

  // ---- DOMPurify 清洗（与 renderMarkdown 一致） ----
  const safeHtml = DOMPurify.sanitize(holder.innerHTML, {
    ADD_ATTR: ['target'],
    ADD_TAGS: ['input']
  })
  return { html: safeHtml, toc }
}
