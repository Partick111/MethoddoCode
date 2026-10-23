import { defineStore } from 'pinia'
import { ref, onMounted, onUnmounted } from 'vue'

const SM_BREAKPOINT = 640

export const useSizeStore = defineStore('size', () => {
  const maxSM = ref(false)
  const init = ref(false)
  let ro: ResizeObserver | null = null

  function update() {
    maxSM.value = window.innerWidth < SM_BREAKPOINT
  }

  function initSize() {
    if (typeof window === 'undefined') return
    update()
    init.value = true
    ro = new ResizeObserver(() => update())
    ro.observe(document.body)
  }

  return { maxSM, init, initSize }
})
