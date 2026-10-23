import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { emitAuthRequired } from '@/utils/auth-events'

// 路由 meta 类型（title：页面标题；requiresAuth：需登录后访问，如后续 /ai 对话页）
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: '首页' }
    },
    {
      path: '/blog',
      name: 'blog-list',
      component: () => import('@/views/BlogListView.vue'),
      meta: { title: '文章' }
    },
    {
      path: '/blog/:slug',
      name: 'blog-detail',
      component: () => import('@/views/BlogDetailView.vue'),
      meta: { title: '文章详情' }
    },
    {
      // 文章编辑页（博主专属：requiresAuth 拦截游客，页面内再校验 is_superuser）
      path: '/blog/:slug/edit',
      name: 'blog-edit',
      component: () => import('@/views/BlogEditView.vue'),
      meta: { title: '编辑文章', requiresAuth: true }
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
      meta: { title: '关于' }
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/views/ProjectListView.vue'),
      meta: { title: '我的项目' }
    },
    {
      path: '/life',
      name: 'life',
      component: () => import('@/views/LifeView.vue'),
      meta: { title: '生活记录' }
    },
    {
      path: '/share',
      name: 'share',
      component: () => import('@/views/ShareView.vue'),
      meta: { title: '推荐分享' }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth', top: 90 }
    }
    return { top: 0 }
  }
})

// 全局前置守卫：requiresAuth 路由（如文章编辑页）未登录时回首页并弹登录窗
router.beforeEach(to => {
  if (!to.meta.requiresAuth) return true
  const auth = useAuthStore()
  if (auth.isLoggedIn) return true
  emitAuthRequired('请先登录后再继续操作')
  return { path: '/', query: { redirect: to.fullPath } }
})

router.afterEach(to => {
  const siteTitle = 'YYsuni'
  const pageTitle = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = pageTitle ? `${pageTitle} - ${siteTitle}` : siteTitle
})

export default router
