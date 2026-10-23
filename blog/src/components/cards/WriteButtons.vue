<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import HomeDraggableLayer from '@/components/HomeDraggableLayer.vue'
import WriteArticleModal from '@/components/WriteArticleModal.vue'
import { useCenter } from '@/composables/useCenter'
import { useSize } from '@/composables/useSize'
import { useConfigStore } from '@/stores/config'
import { useAuthStore } from '@/stores/auth'
import { CARD_SPACING } from '@/consts'
import type { LocalArticle } from '@/types/blog'

const center = useCenter()
const { maxSM } = useSize()
const config = useConfigStore()
const auth = useAuthStore()
const cs = computed(() => config.cardStyles)

/* ---- 写文章弹窗 ---- */
const showWrite = ref(false)
const publishedTip = ref('')
let tipTimer: number | null = null

const styles = computed(() => cs.value.writeButtons)
const hi = computed(() => cs.value.hiCard)
const clock = computed(() => cs.value.clockCard)

const x = computed(() => center.x + CARD_SPACING + (hi.value.width ?? 0) / 2)
const y = computed(
  () =>
    center.y -
    (clock.value.offset ?? 0) -
    (styles.value.height ?? 0) -
    CARD_SPACING / 2 -
    (clock.value.height ?? 0)
)

function goWrite() {
  showWrite.value = true
}

function onPublished(article: LocalArticle) {
  const name = article.title.length > 10 ? `${article.title.slice(0, 10)}…` : article.title
  publishedTip.value = `已发布《${name}》`
  if (tipTimer !== null) window.clearTimeout(tipTimer)
  tipTimer = window.setTimeout(() => {
    publishedTip.value = ''
    tipTimer = null
  }, 4000)
}

onBeforeUnmount(() => {
  if (tipTimer !== null) window.clearTimeout(tipTimer)
})
</script>

<template>
  <!-- 写文章入口仅博主（is_superuser 超级管理员）可见，游客与普通读者不渲染该卡片 -->
  <HomeDraggableLayer
    v-if="styles?.enabled !== false && auth.isSuperuser"
    card-key="writeButtons"
    :x="x"
    :y="y"
    :width="styles.width"
    :height="styles.height"
    :order="styles.order"
  >
    <div class="relative flex h-full w-full items-center rounded-xl p-3">
      <button
        class="brand-btn font-averia flex items-center gap-2 text-lg text-white transition-transform hover:scale-105"
        @click="goWrite"
      >
        写文章
      </button>
      <span
        v-if="publishedTip"
        class="text-secondary absolute top-full left-3 mt-1 text-xs whitespace-nowrap"
      >
        {{ publishedTip }}
      </span>
    </div>
  </HomeDraggableLayer>

  <WriteArticleModal v-model="showWrite" @published="onPublished" />
</template>
