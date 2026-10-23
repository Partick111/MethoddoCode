# Hello World 与工程起步

记录 Vite + Vue3 + TS + Tailwind v4 工程搭建过程中的关键步骤。

## 创建工程

使用 Vite 创建、手动加入依赖与配置。

> 提示：Tailwind v4 采用 CSS-first 配置，使用 `@theme` 定义设计令牌，`@utility` 定义工具类。

## 目录结构

```
src/
├─ api/          # axios 封装 + 数据接口
├─ components/   # 通用组件
├─ config/       # 站点内容与卡片样式 JSON
├─ composables/  # 组合式函数
├─ mocks/        # 本地 mock 数据
├─ router/       # 路由
├─ stores/       # Pinia 状态
├─ styles/       # 全局样式（globals/theme/article）
├─ types/        # TypeScript 类型
├─ utils/        # 工具函数
└─ views/        # 页面
```

## 双源切换

通过环境变量控制内容来源：

```ts
const SOURCE = import.meta.env.VITE_CONTENT_SOURCE ?? 'local'
```

- `local`：读取 `src/mocks`
- `api`：请求后端 `VITE_API_BASE_URL`

后续对接 Django 时，仅需切换环境变量，业务代码零改动。

## 结尾

这篇作为占位博客，用于测试列表页、详情页与侧边栏 TOC。
