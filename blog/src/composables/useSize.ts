import { useSizeStore } from '@/stores/size'

/** 响应式视口尺寸（对齐蓝本 use-size） */
export function useSize() {
  const store = useSizeStore()
  return store
}
