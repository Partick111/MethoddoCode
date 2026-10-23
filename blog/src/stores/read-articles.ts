import { defineStore } from 'pinia'
import { ref } from 'vue'
import { BLOG_SLUG_KEY } from '@/consts'

const STORAGE_KEY = BLOG_SLUG_KEY + 'read_articles'

export const useReadArticlesStore = defineStore('read-articles', () => {
  const slugs = ref<string[]>([])

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) slugs.value = JSON.parse(raw)
    } catch {
      slugs.value = []
    }
  }

  function isRead(slug: string) {
    return slugs.value.includes(slug)
  }

  function markRead(slug: string) {
    if (!isRead(slug)) {
      slugs.value.push(slug)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs.value))
      } catch {
        /* ignore */
      }
    }
  }

  return { slugs, load, isRead, markRead }
})
