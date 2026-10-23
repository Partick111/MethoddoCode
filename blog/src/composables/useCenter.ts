import { useCenterStore } from '@/stores/center'

/** 视口中心坐标（对齐蓝本 use-center） */
export function useCenter() {
  return useCenterStore()
}
