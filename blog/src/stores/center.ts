import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 视口中心坐标（桌面端卡片以中心为锚点做绝对定位，对齐蓝本 use-center）
 */
export const useCenterStore = defineStore('center', () => {
  const x = ref(window.innerWidth / 2)
  const y = ref(Math.max(320, window.innerHeight / 2))

  let timer: number | null = null
  function update() {
    x.value = window.innerWidth / 2
    y.value = Math.max(320, window.innerHeight / 2)
  }
  function initCenter() {
    update()
    window.addEventListener('resize', onResize)
  }
  function onResize() {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => update(), 200)
  }

  return { x, y, initCenter }
})
