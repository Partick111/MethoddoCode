<script setup lang="ts">
/**
 * ShareView.vue —— 「推荐分享」页面
 *
 * 展示分享链接列表（默认来自 mock-share.ts，博主添加的存 localStorage）；
 * 链接可直接点击跳转；博主（超级管理员）可添加 / 删除链接；
 * 删除为内联二次确认（默认链接记入隐藏列表，本地添加的物理删除）。
 */
import { ref } from 'vue'
import { ExternalLink, Plus, Trash2 } from 'lucide-vue-next'
import ShareLinkModal from '@/components/ShareLinkModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useShareLinksStore, type ShareLink } from '@/stores/share-links'

const auth = useAuthStore()
const store = useShareLinksStore()

const showAdd = ref(false)
/** 正在确认删除的链接 url（内联二次确认） */
const confirmingUrl = ref('')
const deleteError = ref('')

function toggleConfirm(link: ShareLink) {
  deleteError.value = ''
  confirmingUrl.value = confirmingUrl.value === link.url ? '' : link.url
}

function doRemove(link: ShareLink) {
  if (!store.removeLink(link)) {
    deleteError.value = '删除失败（本地存储不可用）'
  }
  confirmingUrl.value = ''
}
</script>

<template>
  <div
    class="relative mx-auto flex w-full max-w-[840px] flex-col items-center gap-6 px-6 pt-32 pb-16"
  >
    <!-- 页头 -->
    <div class="mb-8 w-full text-center">
      <h1 class="text-4xl font-bold">推荐分享</h1>
      <p class="text-secondary mt-3 text-sm">收集的好用工具与有趣站点，点击即可访问</p>
    </div>

    <!-- 博主操作：添加链接（仅超级管理员可见） -->
    <div v-if="auth.isSuperuser" class="flex w-full justify-end">
      <button
        type="button"
        class="brand-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white"
        @click="showAdd = true"
      >
        <Plus :size="15" />
        添加链接
      </button>
    </div>

    <p v-if="deleteError" class="w-full text-xs" style="color: #e5484d">{{ deleteError }}</p>

    <!-- 分享列表 -->
    <div class="flex w-full flex-col gap-6">
      <section
        v-for="link in store.links"
        :key="link.url"
        class="card relative w-full !p-5"
      >
        <div class="flex items-start gap-4">
          <!-- 图标块：首字符占位（与首页随机推荐卡一致） -->
          <div
            class="bg-brand-secondary/30 text-brand grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-lg font-bold"
            style="border-color: var(--color-border)"
          >
            {{ link.name.charAt(0) }}
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <!-- 链接标题：可点击跳转 -->
              <a
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary hover:text-brand min-w-0 truncate text-base font-medium transition-colors"
                :title="link.url"
              >
                {{ link.name }}
              </a>

              <div class="flex shrink-0 items-center gap-1">
                <!-- 访问按钮 -->
                <a
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn-rounded text-secondary flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors hover:text-brand"
                  :style="{ borderColor: 'var(--color-border)' }"
                  :title="`访问 ${link.name}`"
                >
                  <ExternalLink :size="13" />
                  访问
                </a>
                <!-- 删除按钮（仅博主） -->
                <button
                  v-if="auth.isSuperuser"
                  type="button"
                  class="text-secondary flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-brand"
                  style="color: #e5484d"
                  :title="`删除 ${link.name}`"
                  aria-label="删除链接"
                  @click="toggleConfirm(link)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>

            <p v-if="link.description" class="text-secondary mt-2 text-sm leading-relaxed">
              {{ link.description }}
            </p>
            <p class="text-secondary mt-1 truncate text-xs opacity-70">{{ link.url }}</p>

            <!-- 删除内联二次确认（仅博主） -->
            <div
              v-if="auth.isSuperuser && confirmingUrl === link.url"
              class="mt-3 flex flex-wrap items-center gap-3 border-t pt-3"
              :style="{ borderColor: 'var(--color-border)' }"
            >
              <span class="text-secondary text-xs">确认删除「{{ link.name }}」？</span>
              <button
                type="button"
                class="rounded-lg px-3 py-1 text-xs text-white transition-opacity hover:opacity-90"
                style="background-color: #e5484d"
                @click="doRemove(link)"
              >
                确认删除
              </button>
              <button
                type="button"
                class="text-secondary rounded-lg border px-3 py-1 text-xs transition-colors hover:text-brand"
                :style="{ borderColor: 'var(--color-border)' }"
                @click="confirmingUrl = ''"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 空状态 -->
      <div v-if="!store.links.length" class="card relative px-6 py-3 text-secondary text-sm">
        暂无分享内容
      </div>
    </div>

    <!-- 添加链接弹窗（仅博主入口可见） -->
    <ShareLinkModal v-model:open="showAdd" />
  </div>
</template>
