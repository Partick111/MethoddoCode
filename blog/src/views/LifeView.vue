<script setup lang="ts">
/**
 * LifeView.vue —— 「生活记录」页面
 *
 * 时间线形式展示生活点滴：左侧日期列 + 节点圆点 + 右侧内容卡片。
 * 数据来自 life-records store（默认 mock-life + 博主新增/编辑，localStorage 持久化）；
 * 博主（超级管理员）可添加动态、编辑每条记录、删除（内联二次确认）；
 * 移动端隐藏日期列（日期移至卡片内）。
 */
import { ref } from 'vue'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import LifeRecordModal from '@/components/LifeRecordModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useLifeRecordsStore, type LifeRecord } from '@/stores/life-records'

const auth = useAuthStore()
const store = useLifeRecordsStore()

const showModal = ref(false)
/** 编辑目标：null 表示新增 */
const editing = ref<LifeRecord | null>(null)
/** 正在确认删除的记录 id（内联二次确认） */
const confirmingId = ref('')
const deleteError = ref('')

function openAdd() {
  editing.value = null
  showModal.value = true
}

function openEdit(record: LifeRecord) {
  editing.value = record
  showModal.value = true
}

function toggleConfirm(record: LifeRecord) {
  deleteError.value = ''
  confirmingId.value = confirmingId.value === record.id ? '' : record.id
}

function doRemove(record: LifeRecord) {
  if (!store.removeRecord(record)) {
    deleteError.value = '删除失败（本地存储不可用）'
  }
  confirmingId.value = ''
}
</script>

<template>
  <div
    class="relative mx-auto flex w-full max-w-[840px] flex-col items-center gap-6 px-6 pt-32 pb-16"
  >
    <!-- 页头 -->
    <div class="mb-8 w-full text-center">
      <h1 class="text-4xl font-bold">生活记录</h1>
      <p class="text-secondary mt-3 text-sm">一些细碎的日常与瞬间</p>
    </div>

    <!-- 博主操作：添加动态（仅超级管理员可见） -->
    <div v-if="auth.isSuperuser" class="-mt-4 flex w-full justify-end">
      <button
        type="button"
        class="brand-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white"
        @click="openAdd"
      >
        <Plus :size="15" />
        添加动态
      </button>
    </div>

    <p v-if="deleteError" class="w-full text-xs" style="color: #e5484d">{{ deleteError }}</p>

    <!-- 时间线：整列竖线 + 每条记录的节点圆点与内容卡片 -->
    <div class="relative flex w-full flex-col gap-6">
      <!-- 竖线：桌面在节点列中心（96px 日期列 + 16px 间距 + 8px 半列宽），移动端在 8px -->
      <span
        class="absolute top-3 bottom-3 left-[120px] w-px max-sm:left-[7px]"
        style="background-color: var(--color-border)"
        aria-hidden="true"
      />

      <article v-for="item in store.items" :key="item.id" class="relative flex gap-4">
        <!-- 日期列（桌面显示） -->
        <div class="text-secondary w-24 shrink-0 pt-1.5 text-right text-xs max-sm:hidden">
          {{ item.date }}
        </div>

        <!-- 节点列 -->
        <div class="relative w-4 shrink-0">
          <span
            class="bg-brand absolute top-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2"
            style="border-color: var(--color-border)"
            aria-hidden="true"
          />
        </div>

        <!-- 记录卡片 -->
        <section class="card relative min-w-0 flex-1 !p-5">
          <!-- 移动端日期（桌面端在左侧列显示） -->
          <p class="text-secondary mb-2 text-xs sm:hidden">{{ item.date }}</p>

          <div class="flex items-start justify-between gap-3">
            <h2 class="text-primary text-base font-medium">
              {{ item.title }}
              <span v-if="item.mood" class="ml-1 text-sm">{{ item.mood }}</span>
            </h2>

            <!-- 博主操作：编辑 / 删除（仅博主） -->
            <div v-if="auth.isSuperuser" class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="text-secondary flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-brand"
                :title="`编辑「${item.title}」`"
                aria-label="编辑动态"
                @click="openEdit(item)"
              >
                <Pencil :size="14" />
              </button>
              <button
                type="button"
                class="text-secondary flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                style="color: #e5484d"
                :title="`删除「${item.title}」`"
                aria-label="删除动态"
                @click="toggleConfirm(item)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>

          <p class="text-secondary mt-2 text-sm leading-relaxed">{{ item.content }}</p>

          <!-- 配图 -->
          <div v-if="item.images?.length" class="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <img
              v-for="(img, i) in item.images"
              :key="i"
              :src="img"
              :alt="item.title"
              loading="lazy"
              class="h-40 w-full rounded-2xl border object-cover"
              style="border-color: var(--color-border)"
            />
          </div>

          <!-- 删除内联二次确认（仅博主） -->
          <div
            v-if="auth.isSuperuser && confirmingId === item.id"
            class="mt-3 flex flex-wrap items-center gap-3 border-t pt-3"
            :style="{ borderColor: 'var(--color-border)' }"
          >
            <span class="text-secondary text-xs">确认删除「{{ item.title }}」？</span>
            <button
              type="button"
              class="rounded-lg px-3 py-1 text-xs text-white transition-opacity hover:opacity-90"
              style="background-color: #e5484d"
              @click="doRemove(item)"
            >
              确认删除
            </button>
            <button
              type="button"
              class="text-secondary rounded-lg border px-3 py-1 text-xs transition-colors hover:text-brand"
              :style="{ borderColor: 'var(--color-border)' }"
              @click="confirmingId = ''"
            >
              取消
            </button>
          </div>
        </section>
      </article>

      <!-- 空状态 -->
      <div v-if="!store.items.length" class="card relative px-6 py-3 text-secondary text-sm">
        暂无记录
      </div>
    </div>

    <!-- 新增 / 编辑弹窗（仅博主入口可见） -->
    <LifeRecordModal v-model:open="showModal" :record="editing" @saved="editing = null" />
  </div>
</template>
