import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/* ============================================================
 * music-dir 插件：public/music/ 目录自动歌单
 *
 * - dev：GET /music/index.json 实时扫描目录（文件名 + ID3 元信息解析）
 *        POST /__music/upload 上传音频（x-file-name 头传文件名）
 * - build：closeBundle 时生成 dist/music/index.json（public/music 被原样复制进 dist）
 * - 前端由 stores/music.ts 消费，形成「上传 → 目录 → 歌单」闭环
 * ============================================================ */

const MUSIC_DIR = fileURLToPath(new URL('./public/music', import.meta.url))
/** 允许的音频扩展名 */
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.flac'])
/** 上传大小上限 100MB */
const UPLOAD_LIMIT = 100 * 1024 * 1024

interface MusicTrackInfo {
  file: string
  url: string
  title: string
  artist: string
}

/* -------------------- ID3 元信息解析（零依赖精简版） -------------------- */

function syncsafe(buf: Buffer, offset: number): number {
  return (
    ((buf[offset] & 0x7f) << 21) |
    ((buf[offset + 1] & 0x7f) << 14) |
    ((buf[offset + 2] & 0x7f) << 7) |
    (buf[offset + 3] & 0x7f)
  )
}

/** ID3v2 文本帧解码（首字节编码：0=latin1 1=utf16(BOM) 2=utf16be 3=utf8） */
function decodeId3Text(buf: Buffer): string {
  if (buf.length < 2) return ''
  const encoding = buf[0]
  const body = buf.subarray(1)
  let text: string
  if (encoding === 0) {
    text = body.toString('latin1')
  } else if (encoding === 1) {
    if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) {
      text = Buffer.from(body).swap16().toString('utf16le')
    } else {
      text = body.toString('utf16le')
    }
  } else if (encoding === 2) {
    text = Buffer.from(body).swap16().toString('utf16le')
  } else {
    text = body.toString('utf8')
  }
  return text.replace(/^\uFEFF/, '').replace(/\0[\s\S]*$/, '').trim()
}

/** 解析 ID3v2 头（TIT2 标题 / TPE1 艺术家） */
function parseId3v2(buf: Buffer): { title?: string; artist?: string } {
  const result: { title?: string; artist?: string } = {}
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return result
  const major = buf[3]
  const flags = buf[5]
  const size = syncsafe(buf, 6)
  let pos = 10

  // 扩展头（跳过）
  if (flags & 0x40 && pos + 4 <= buf.length) {
    if (major >= 4) {
      pos += syncsafe(buf, pos)
    } else {
      const extSize = buf.readUInt32BE(pos)
      pos += 4 + extSize
    }
  }

  const end = Math.min(10 + size, buf.length)
  while (pos + 10 <= end) {
    const frameId = buf.toString('latin1', pos, pos + 4)
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break
    const frameSize = major >= 4 ? syncsafe(buf, pos + 4) : buf.readUInt32BE(pos + 4)
    const frameStart = pos + 10
    if (frameSize <= 0 || frameStart + frameSize > end) break
    if (frameId === 'TIT2' || frameId === 'TPE1') {
      const text = decodeId3Text(buf.subarray(frameStart, frameStart + frameSize))
      if (text) {
        if (frameId === 'TIT2') result.title = text
        else result.artist = text
      }
    }
    pos = frameStart + frameSize
  }
  return result
}

/** 解析 ID3v1 尾标签（最后 128 字节，"TAG" 开头） */
function parseId3v1(tag: Buffer): { title?: string; artist?: string } {
  const result: { title?: string; artist?: string } = {}
  if (tag.length < 128 || tag.toString('latin1', 0, 3) !== 'TAG') return result
  const clean = (s: string) => s.replace(/\0[\s\S]*$/, '').trim()
  const title = clean(tag.toString('latin1', 3, 33))
  const artist = clean(tag.toString('latin1', 33, 63))
  if (title) result.title = title
  if (artist) result.artist = artist
  return result
}

/** 文件名兜底解析："Artist - Title.ext" → artist/title */
function fromFileName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, '')
  const m = base.match(/^(.+?)\s+-\s+(.+)$/)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { title: base.trim(), artist: '' }
}

/** 读取单个音频文件的标题 / 艺术家（ID3v2 > ID3v1 > 文件名） */
function readMeta(filePath: string): { title: string; artist: string } {
  const fallback = fromFileName(path.basename(filePath))
  let id3: { title?: string; artist?: string } = {}
  try {
    const stat = fs.statSync(filePath)
    const fd = fs.openSync(filePath, 'r')
    try {
      const headSize = Math.min(stat.size, 256 * 1024)
      const head = Buffer.alloc(headSize)
      fs.readSync(fd, head, 0, headSize, 0)
      const v2 = parseId3v2(head)
      let v1: { title?: string; artist?: string } = {}
      if (stat.size > 128) {
        const tail = Buffer.alloc(128)
        fs.readSync(fd, tail, 0, 128, stat.size - 128)
        v1 = parseId3v1(tail)
      }
      id3 = { title: v2.title || v1.title, artist: v2.artist || v1.artist }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    /* 解析失败时仅用文件名 */
  }
  return {
    title: id3.title || fallback.title || path.basename(filePath),
    artist: id3.artist || fallback.artist || '未知艺术家'
  }
}

/** 扫描 music 目录生成歌单 */
function buildTrackList(): MusicTrackInfo[] {
  if (!fs.existsSync(MUSIC_DIR)) return []
  return fs
    .readdirSync(MUSIC_DIR)
    .filter(name => AUDIO_EXTS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map(file => ({
      file,
      url: `/music/${encodeURIComponent(file)}`,
      ...readMeta(path.join(MUSIC_DIR, file))
    }))
}

/* -------------------- 上传处理 -------------------- */

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** 重名时追加序号：song.mp3 → song (1).mp3 */
function uniqueName(fileName: string): string {
  const ext = path.extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)
  let candidate = fileName
  let n = 1
  while (fs.existsSync(path.join(MUSIC_DIR, candidate))) {
    candidate = `${base} (${n})${ext}`
    n++
  }
  return candidate
}

function handleUpload(req: IncomingMessage, res: ServerResponse) {
  const rawName = String(req.headers['x-file-name'] ?? '')
  let decoded = rawName
  try {
    decoded = decodeURIComponent(rawName)
  } catch {
    /* 保持原值 */
  }
  // basename 防路径穿越；仅允许白名单扩展名
  const fileName = path.basename(decoded).trim()
  const ext = path.extname(fileName).toLowerCase()
  if (!fileName || !AUDIO_EXTS.has(ext)) {
    sendJson(res, 400, { ok: false, error: '仅支持音频文件（mp3 / m4a / aac / ogg / wav / flac）' })
    return
  }

  const chunks: Buffer[] = []
  let size = 0
  let aborted = false
  req.on('data', chunk => {
    if (aborted) return
    size += chunk.length
    if (size > UPLOAD_LIMIT) {
      aborted = true
      sendJson(res, 413, { ok: false, error: '文件过大（上限 100MB）' })
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (aborted || res.writableEnded) return
    try {
      fs.mkdirSync(MUSIC_DIR, { recursive: true })
      const finalName = uniqueName(fileName)
      fs.writeFileSync(path.join(MUSIC_DIR, finalName), Buffer.concat(chunks))
      sendJson(res, 200, { ok: true, file: finalName })
    } catch (e) {
      sendJson(res, 500, { ok: false, error: `写入失败：${e instanceof Error ? e.message : e}` })
    }
  })
}

/* -------------------- 插件 -------------------- */

function musicDirPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'music-dir',
    configResolved(config) {
      outDir = config.build.outDir
    },
    configureServer(server) {
      // 直接 use：先于静态资源中间件，实时响应（不落盘）
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (req.method === 'GET' && url === '/music/index.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(buildTrackList()))
          return
        }
        if (req.method === 'POST' && url === '/__music/upload') {
          handleUpload(req, res)
          return
        }
        next()
      })
    },
    closeBundle() {
      // 构建完成后生成 dist/music/index.json（dev 下不会触发）
      try {
        const target = path.resolve(outDir, 'music')
        fs.mkdirSync(target, { recursive: true })
        fs.writeFileSync(
          path.join(target, 'index.json'),
          JSON.stringify(buildTrackList(), null, 2)
        )
      } catch {
        /* 忽略：非构建环境 */
      }
    }
  }
}

export default defineConfig({
  plugins: [vue(), musicDirPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 2026,
    host: true,
    open: false,
    // 开发期将 /api 请求代理到 Django 后端（blog_terminal/，默认 127.0.0.1:8080）
    // /ws 为 AI 助手流式问答的 WebSocket（Django Channels/daphne，ASGI 服务）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
