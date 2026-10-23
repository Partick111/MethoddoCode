/**
 * 全局音乐播放器（Pinia store）。
 *
 * - 歌单动态读取 public/music/ 目录（dev 由 vite music-dir 插件实时扫描；
 *   构建产物为 dist/music/index.json），歌名/艺术家自动解析（ID3 标签 > 文件名）
 * - 博主可通过 uploadSongs() 上传本地音频到 public/music/，形成上传 → 歌单闭环
 * - 模块级 audio 单例：跨路由切换保持播放，全站唯一音源
 * - 播放模式：'one' 单曲循环 / 'all' 列表循环
 * - 使用方：左下角入口按钮 MusicButton、歌单弹窗 MusicPanel、首页卡片 MusicCard
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type PlayMode = 'one' | 'all'

/** 单曲信息（由 /music/index.json 返回） */
export interface MusicTrack {
  /** 文件名（public/music/ 下，唯一标识） */
  file: string
  /** 访问路径（/music/文件名） */
  url: string
  title: string
  artist: string
}

/** 空歌单占位（保证模板 music.current.title 安全访问） */
const EMPTY_TRACK: MusicTrack = { file: '', url: '', title: '暂无歌曲', artist: '—' }

/** 模块级 audio 单例（浏览器环境；跨组件共享同一播放状态） */
let audioEl: HTMLAudioElement | null = null

/** 校验单曲形状，过滤损坏项 */
function sanitizeTrack(input: unknown): MusicTrack | null {
  if (!input || typeof input !== 'object') return null
  const item = input as Partial<MusicTrack>
  if (typeof item.file !== 'string' || typeof item.url !== 'string') return null
  return {
    file: item.file,
    url: item.url,
    title: typeof item.title === 'string' && item.title ? item.title : item.file,
    artist: typeof item.artist === 'string' && item.artist ? item.artist : '未知艺术家'
  }
}

export const useMusicStore = defineStore('music', () => {
  /** 歌单（动态加载） */
  const tracks = ref<MusicTrack[]>([])
  const loading = ref(false)
  /** 歌单加载错误（目录接口不可用等） */
  const loadError = ref('')
  const currentIndex = ref(0)
  const playing = ref(false)
  /** 播放模式：单曲循环 / 列表循环（默认列表循环） */
  const mode = ref<PlayMode>('all')
  /** 当前曲目进度 0-100 */
  const progress = ref(0)
  /** 播放错误信息（如音频文件缺失） */
  const error = ref('')

  const current = computed(() => tracks.value[currentIndex.value] ?? tracks.value[0] ?? EMPTY_TRACK)

  /** 拉取歌单（dev 实时扫描 public/music/；构建后读 dist/music/index.json） */
  async function loadTracks() {
    loading.value = true
    loadError.value = ''
    try {
      const res = await fetch('/music/index.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: unknown = await res.json()
      const next = Array.isArray(data)
        ? data.map(sanitizeTrack).filter((t): t is MusicTrack => t !== null)
        : []
      tracks.value = next
      if (currentIndex.value >= next.length) currentIndex.value = 0
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : '歌单加载失败'
      tracks.value = []
    } finally {
      loading.value = false
    }
  }

  /** 上传音频到 public/music/（先写入目录再刷新歌单，形成闭环） */
  async function uploadSongs(files: File[]): Promise<{ uploaded: number; failed: string[] }> {
    const failed: string[] = []
    let uploaded = 0
    for (const file of files) {
      try {
        const res = await fetch('/__music/upload', {
          method: 'POST',
          headers: { 'x-file-name': encodeURIComponent(file.name) },
          body: file
        })
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (res.ok && data?.ok) {
          uploaded++
        } else {
          failed.push(`${file.name}：${data?.error ?? `HTTP ${res.status}`}`)
        }
      } catch (e) {
        failed.push(`${file.name}：${e instanceof Error ? e.message : '上传失败'}`)
      }
    }
    if (uploaded > 0) await loadTracks()
    return { uploaded, failed }
  }

  function ensureAudio(): HTMLAudioElement {
    if (audioEl) return audioEl
    const el = new Audio()
    el.preload = 'metadata'
    el.addEventListener('timeupdate', () => {
      progress.value = el.duration ? (el.currentTime / el.duration) * 100 : 0
    })
    el.addEventListener('ended', () => {
      if (mode.value === 'one') {
        // 单曲循环：回到起点重播
        el.currentTime = 0
        void el.play().catch(() => undefined)
      } else {
        // 列表循环：下一曲（末尾回到第一首）
        next()
      }
    })
    el.addEventListener('error', () => {
      playing.value = false
      progress.value = 0
      const t = tracks.value[currentIndex.value]
      const fileName = t?.file ?? ''
      error.value = `无法播放「${t?.title ?? ''}」：请确认音频文件 ${fileName} 存在于 public/music/ 目录`
    })
    audioEl = el
    return el
  }

  /** 播放指定曲目（点击歌单行 / 上一曲 / 下一曲均走此处） */
  function playAt(index: number) {
    const el = ensureAudio()
    error.value = ''
    if (tracks.value.length === 0) return
    currentIndex.value = ((index % tracks.value.length) + tracks.value.length) % tracks.value.length
    const t = tracks.value[currentIndex.value]
    el.src = t.url
    el.currentTime = 0
    progress.value = 0
    playing.value = true
    el.play().catch(() => undefined) // 失败由 error 事件统一提示
  }

  /** 播放 / 暂停（未选择过曲目时从头开始） */
  function toggle() {
    const el = ensureAudio()
    if (!el.src) {
      playAt(currentIndex.value)
      return
    }
    if (playing.value) {
      el.pause()
      playing.value = false
    } else {
      error.value = ''
      playing.value = true
      el.play().catch(() => undefined)
    }
  }

  function next() {
    playAt(currentIndex.value + 1)
  }

  function prev() {
    playAt(currentIndex.value - 1)
  }

  /** 切换播放模式：单曲循环 <-> 列表循环 */
  function toggleMode() {
    mode.value = mode.value === 'one' ? 'all' : 'one'
  }

  /** 跳转进度（percent：0-100） */
  function seek(percent: number) {
    const el = ensureAudio()
    if (!el.duration || !Number.isFinite(el.duration)) return
    el.currentTime = (Math.min(100, Math.max(0, percent)) / 100) * el.duration
  }

  /** 首次创建时拉取歌单 */
  void loadTracks()

  return {
    tracks,
    loading,
    loadError,
    currentIndex,
    playing,
    mode,
    progress,
    error,
    current,
    loadTracks,
    uploadSongs,
    playAt,
    toggle,
    next,
    prev,
    toggleMode,
    seek
  }
})
