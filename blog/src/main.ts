import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useConfigStore } from './stores/config'
import { useThemeStore } from './stores/theme'
import './styles/globals.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 初始注入主题 CSS 变量
useConfigStore(pinia).initTheme()
// 初始化日夜主题（恢复本地偏好）
useThemeStore(pinia).init()

app.mount('#app')
