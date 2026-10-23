<script setup lang="ts">
/**
 * MusicPanel.vue —— 音乐歌单弹窗
 *
 * 由左下角 MusicButton 打开；歌单动态读取 public/music/ 目录
 *（dev 由 vite music-dir 插件实时扫描，歌名/作者自动解析 ID3 标签与文件名）。
 * 博主（超级管理员）可用右上角 + 上传本地音频，上传后自动刷新歌单；
 * 交互：点击歌单行切歌播放；底部控制 上一曲 / 播放暂停 / 下一曲 与
 * 播放模式切换（单曲循环 Repeat1 ↔ 列表循环 Repeat）；Esc / 点击遮罩关闭，关闭不停止播放。
 * 视觉与 LogoutConfirmModal / AuthModal 一致的玻璃质感弹窗。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  X
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useMusicStore } from '@/stores/music'

/** 由父组件控制显隐：<MusicPanel v-model:open="show" /> */
const visible = defineModel<boolean>('open', { default: false })

const auth = useAuthStore()
const music = useMusicStore()

/* ---- 上传歌曲（仅博主） ---- */
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadTip = ref('')
const uploadError = ref('')

function pickFiles() {
  fileInput.value?.click()
}

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  uploading.value = true
  uploadTip.value = ''
  uploadError.value = ''
  try {
    const { uploaded, failed } = await music.uploadSongs(files)
    if (uploaded > 0) uploadTip.value = `已添加 ${uploaded} 首歌`
    if (failed.length) uploadError.value = `失败 ${failed.length} 首：${failed.join('；')}`
  } finally {
    uploading.value = false
  }
}

/** 打开面板时刷新歌单（目录可能被手动改动或刚上传过） */
watch(visible, v => {
  if (v) {
    uploadTip.value = ''
    uploadError.value = ''
    void music.loadTracks()
  }
})

function close() {
  visible.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

/** 点击进度条跳转（按点击位置占比换算） */
function onSeekClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  music.seek(((e.clientX - rect.left) / rect.width) * 100)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点击关闭；z-index 高于 AI 面板（60） -->
    <Transition name="music-mask">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- 歌单面板：居中显示 -->
    <Transition name="music-modal">
      <div
        v-if="visible"
        class="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center p-4"
      >
        <section
          class="card music-panel pointer-events-auto relative flex w-[400px] max-w-full flex-col !rounded-[28px] !p-5"
          role="dialog"
          aria-modal="true"
          aria-label="音乐歌单"
        >
          <header class="flex items-center gap-3">
            <span
              class="text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
              :style="{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }"
            >
              <Music :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-medium">音乐</h2>
              <p class="text-secondary mt-0.5 truncate text-xs">
                {{ music.playing ? '正在播放' : '歌单' }} ·
                {{ music.current.title }} — {{ music.current.artist }}
              </p>
            </div>
            <button
              v-if="auth.isSuperuser"
              type="button"
              class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
              :disabled="uploading"
              title="添加歌曲（上传本地音频到 public/music/）"
              aria-label="添加歌曲"
              @click="pickFiles"
            >
              <Loader2 v-if="uploading" :size="16" class="animate-spin" />
              <Plus v-else :size="16" />
            </button>
            <button
              type="button"
              class="text-secondary flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/60 hover:text-brand"
              title="关闭（Esc）"
              aria-label="关闭"
              @click="close"
            >
              <X :size="16" />
            </button>
          </header>

          <!-- 上传入口（仅博主入口可见；文件选择后逐首上传到 public/music/） -->
          <input
            ref="fileInput"
            type="file"
            multiple
            accept=".mp3,.m4a,.aac,.ogg,.oga,.wav,.flac,audio/*"
            class="hidden"
            @change="onFilesPicked"
          />

          <!-- 歌单列表 -->
          <ul class="nice-scrollbar mt-4 max-h-[260px] space-y-1 overflow-y-auto pr-1">
            <li
              v-if="!music.tracks.length"
              class="text-secondary py-6 text-center text-xs leading-relaxed"
            >
              <template v-if="music.loading">正在读取歌单…</template>
              <template v-else-if="music.loadError">歌单读取失败：{{ music.loadError }}</template>
              <template v-else>
                暂无歌曲<br />
                把音频文件放进 public/music/ 目录即可自动识别
              </template>
            </li>
            <li v-for="(track, i) in music.tracks" :key="track.file">
              <button
                type="button"
                class="group flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors"
                :class="
                  i === music.currentIndex
                    ? 'border-transparent'
                    : 'border-transparent hover:border-[var(--color-border)]'
                "
                :style="
                  i === music.currentIndex
                    ? { backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }
                    : undefined
                "
                @click="music.playAt(i)"
              >
                <span class="flex h-6 w-6 shrink-0 items-center justify-center">
                  <Pause
                    v-if="i === music.currentIndex && music.playing"
                    :size="14"
                    class="text-brand"
                  />
                  <Play v-else :size="14" class="text-secondary group-hover:text-brand" />
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm"
                    :class="i === music.currentIndex ? 'text-brand font-medium' : 'text-primary'"
                  >
                    {{ track.title }}
                  </span>
                  <span class="text-secondary block truncate text-xs">{{ track.artist }}</span>
                </span>
              </button>
            </li>
          </ul>

          <!-- 进度条：点击跳转 -->
          <div
            class="mt-4 h-2 cursor-pointer rounded-full bg-white/60"
            title="点击跳转进度"
            @click="onSeekClick"
          >
            <div
              class="bg-linear h-full rounded-full transition-all duration-300"
              :style="{ width: `${music.progress}%` }"
            />
          </div>

          <!-- 播放控制：上一曲 / 播放暂停 / 下一曲 / 模式切换 -->
          <footer class="mt-3 flex items-center justify-between">
            <button
              type="button"
              class="text-secondary flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:text-brand"
              :title="music.mode === 'one' ? '当前：单曲循环（点击切换列表循环）' : '当前：列表循环（点击切换单曲循环）'"
              :aria-label="music.mode === 'one' ? '单曲循环' : '列表循环'"
              @click="music.toggleMode()"
            >
              <Repeat1 v-if="music.mode === 'one'" :size="16" class="text-brand" />
              <Repeat v-else :size="16" />
            </button>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="text-secondary flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:text-brand"
                title="上一曲"
                aria-label="上一曲"
                @click="music.prev()"
              >
                <SkipBack :size="18" />
              </button>
              <button
                type="button"
                class="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm transition-transform hover:scale-105"
                :title="music.playing ? '暂停' : '播放'"
                :aria-label="music.playing ? '暂停' : '播放'"
                @click="music.toggle()"
              >
                <Pause v-if="music.playing" class="text-brand h-5 w-5" />
                <Play v-else class="text-brand ml-0.5 h-5 w-5" />
              </button>
              <button
                type="button"
                class="text-secondary flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:text-brand"
                title="下一曲"
                aria-label="下一曲"
                @click="music.next()"
              >
                <SkipForward :size="18" />
              </button>
            </div>

            <!-- 占位：与左侧模式按钮对称，保持中间控制组居中 -->
            <span class="h-9 w-9" aria-hidden="true" />
          </footer>

          <p v-if="music.error" class="mt-3 text-xs leading-relaxed" style="color: #e5484d">
            {{ music.error }}
          </p>
          <p v-if="uploadError" class="mt-3 text-xs leading-relaxed" style="color: #e5484d">
            {{ uploadError }}
          </p>
          <p v-if="uploadTip" class="mt-3 text-xs leading-relaxed" style="color: #2da44e">
            {{ uploadTip }}
          </p>
          <p
            v-if="!music.error && !uploadError && !uploadTip"
            class="text-secondary mt-3 text-[10px] leading-relaxed"
          >
            歌单自动读取 <code>public/music/</code> 目录：歌名与作者优先取自音频 ID3
            标签，无标签时按「作者 - 歌名」文件名解析。
            <template v-if="auth.isSuperuser">点击右上角 + 可上传本地歌曲。</template>
          </p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.music-mask-enter-active,
.music-mask-leave-active {
  transition: opacity 0.24s ease;
}
.music-mask-enter-from,
.music-mask-leave-to {
  opacity: 0;
}

.music-modal-enter-active,
.music-modal-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.music-modal-enter-from,
.music-modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .music-mask-enter-active,
  .music-mask-leave-active,
  .music-modal-enter-active,
  .music-modal-leave-active {
    transition: none;
  }
}
</style>
