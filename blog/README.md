---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 654ba81edf7df9bc5c40d22527f5230c_cf3199e7b1bf11f197a3525400248c00
    ReservedCode1: +YtDoJHSvwoQIGgPWytu1ha+z86h++cLxrR9EHMxbc7q2LUAEu4FJkColg/RpBXbIPqRm8X0n/9idXawZSS0eQfkK8BiipjeN17xu+Cz2/2VEascgG+ZZXmf9FSsvaueYZkxBpGFW5Jdzax9Dnyo8mHH23n7p+DGlRsbVKEAhQoCnGcp/XOpFLLG1eQ=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 654ba81edf7df9bc5c40d22527f5230c_cf3199e7b1bf11f197a3525400248c00
    ReservedCode2: +YtDoJHSvwoQIGgPWytu1ha+z86h++cLxrR9EHMxbc7q2LUAEu4FJkColg/RpBXbIPqRm8X0n/9idXawZSS0eQfkK8BiipjeN17xu+Cz2/2VEascgG+ZZXmf9FSsvaueYZkxBpGFW5Jdzax9Dnyo8mHH23n7p+DGlRsbVKEAhQoCnGcp/XOpFLLG1eQ=
---

# 2025-blog-vue3

个人博客前端项目（Vue 3 + Vite + TypeScript 单页应用）。项目由 Next.js 蓝本重写而来，页面组件、卡片布局与站点主题配置均对齐蓝本效果；文章内容源为仓库内置的本地 mock 数据（后端文章接口已预留），登录/注册等认证已接通 Django 后端（见第 5 节与 `blog_terminal/`）。

本文档面向接手本项目的开发同学，覆盖启动方式、目录职责、内容来源与后端接入点。

---

## 1. 技术栈及版本

版本取自 `package.json`（依赖按 `^` / `~` 声明，实际安装版本以 `package-lock.json` 为准）。

| 类别 | 依赖 | package.json 声明版本 |
| --- | --- | --- |
| 框架 | vue | ^3.5.13 |
| 构建 | vite | ^6.0.5 |
| 构建插件 | @vitejs/plugin-vue | ^5.2.1 |
| 语言 | typescript | ~5.6.3 |
| 类型检查 | vue-tsc | ^2.2.0 |
| 样式 | tailwindcss / @tailwindcss/postcss | ^4.0.0 |
| 状态管理 | pinia | ^2.3.0 |
| 路由 | vue-router | ^4.5.0 |
| HTTP | axios | ^1.7.9 |
| 日期 | dayjs | ^1.11.13 |
| Markdown 渲染 | marked | ^15.0.6 |
| 代码高亮 | shiki | ^1.26.1 |
| 数学公式 | katex | ^0.16.21 |
| HTML 清洗 | dompurify | ^3.2.4 |
| 图标 | lucide-vue-next | ^0.469.0 |
| 富文本编辑器 | tinymce / @tinymce/tinymce-vue | ^7.9.3 / ^6.3.0 |
| 类型定义 | @types/node | ^22.10.2 |

样式方案为 Tailwind CSS v4，通过 `postcss.config.mjs` 中的 `@tailwindcss/postcss` 插件接入（无 `tailwind.config.js`，主题变量在 CSS 内声明并由 JS 动态注入）。

---

## 2. 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | 建议 20 及以上（本项目开发环境实测 v22.17.0） |
| npm | 建议 10 及以上（本项目开发环境实测 11.7.0） |
| 浏览器 | 支持 ES2020、CSS 变量与 `backdrop-filter` 的现代浏览器 |

构建目标为 `ES2020`（见 `tsconfig.json`）。首屏会请求 Google Fonts 加载站点标题字体（`index.html` 中的 `Averia Gruesa Libre`），无外网时会回退到系统字体，不影响功能。

---

## 3. 快速开始

```bash
npm install       # 安装依赖

npm run dev       # 启动开发服务器：http://localhost:2025
npm run build     # 类型检查 + 生产构建：vue-tsc -b && vite build，产物输出到 dist/
npm run preview   # 本地预览 dist/ 构建产物
```

开发服务器固定端口 `2025`，并开启了 `host: true`（同网段设备可通过本机 IP 访问），不自动打开浏览器，配置见 `vite.config.ts`；开发期 `/api` 请求会代理到后端 `http://127.0.0.1:8080`（`server.proxy`），`/ws` 的 WebSocket（AI 流式问答）同样经代理转发（`ws: true`）。

### 启动后端（登录/注册认证所需）

认证接口位于同级目录 `blog_terminal/`（Django + DRF + SimpleJWT + django-cors-headers），数据库为 **MySQL**：

```bash
cd ../blog_terminal
pip install -r requirements.txt   # 安装后端依赖（含 mysqlclient 驱动、channels/daphne ASGI 服务）
# 前提：本地 MySQL 已启动，且已创建数据库 blog_vue_django（utf8mb4）
python manage.py migrate          # 首次运行：在 MySQL 中建表
python manage.py runserver 127.0.0.1:8080
```

后端已切换为 ASGI（Django Channels + daphne）：`runserver` 实际由 daphne 接管，同一端口同时提供 REST 与 WebSocket（AI 助手流式问答，见 5.8 节）。

数据库连接参数默认值为 `root:root@127.0.0.1:3306/blog_vue_django`；可通过环境变量或 `blog_terminal/.env`（存在时自动加载）覆盖：`MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_HOST` / `MYSQL_PORT`（配置见 `blog_terminal/blog_terminal/settings.py`）。

前端开发服务器会把 `/api` 前缀的请求转发到该后端；文章数据仍走本地 mock，不依赖后端也能浏览全站。

### 启动 Milvus（AI 助手 RAG 知识库所需）

AI 助手使用 Milvus 作为向量数据库（独立数据库 `blogRAG`）。本地开发用 Docker 启动 standalone 版即可：

```bash
docker compose -f <milvus-standalone-docker-compose.yml 所在目录>/milvus-standalone-docker-compose.yml up -d
```

默认连接 `http://127.0.0.1:19530`（可用环境变量 `MILVUS_URI` 覆盖，见 `blog_terminal/blog_terminal/settings.py`）。未启动 Milvus 时浏览文章与登录不受影响，仅 AI 助手与知识库管理不可用。

前端项目当前没有 `.env` 文件，也无需配置任何环境变量即可直接启动（原因见第 5 节）；后端未提供 `.env` 时使用上述默认连接参数。

---

## 4. 目录结构

```
2025-blog-vue3/
├── index.html                    # 入口 HTML：字体预连接、favicon 三行 link
├── package.json                  # 依赖与脚本
├── postcss.config.mjs            # Tailwind v4 的 PostCSS 接入
├── vite.config.ts                # 别名 @ -> src、开发端口 2025、/api 代理到 Django 后端
├── tsconfig.json                 # 应用侧 TS 配置（含 vite.config.ts，引用 tsconfig.node.json）
├── tsconfig.node.json            # Node 侧 TS 配置（composite: true）
├── public/
│   ├── favicon.ico               # 站点图标（由 images/avatar.jpg 生成）
│   ├── favicon-32x32.png         # 32×32 图标（同上来源）
│   ├── apple-touch-icon.png      # 180×180 图标（同上来源）
│   ├── images/                   # avatar.jpg、cute.gif（AI 入口动图）、art/ 三张美术图
│   ├── music/                    # 音乐播放器音频文件夹（自动扫描生成歌单，见目录内 README.txt）
│   └── tinymce/                  # TinyMCE 7 自托管资源（207 个文件）
├── src/
│   ├── main.ts                   # 应用入口：Pinia、Router、主题变量与日夜主题初始化
│   ├── App.vue                   # 根组件：AppLayout + 路由过渡动画
│   ├── consts.ts                 # 全局常量（卡片间距、动画延迟、localStorage 前缀）
│   ├── api/                      # 数据访问层（内容源切换、统一接口、文章统计 stats.ts、AI 助手 ai.ts）
│   ├── components/               # 通用组件（AI 入口、音乐歌单、弹窗等）+ cards/ 首页卡片 + icons/
│   ├── composables/              # useCenter / useSize 响应式视口封装、useAiChat（AI 流式对话 + 会话管理）
│   ├── config/                   # site-content.json 站点配置、card-styles.json 卡片布局、ai-models.ts 模型预设、mock-share / mock-projects / mock-life 数据
│   ├── layout/AppLayout.vue      # 全站布局：背景、导航卡、日夜切换、音乐入口、回到顶部
│   ├── mocks/                    # 本地 mock 内容（文章索引、分类、关于页、posts/*.md 正文）
│   ├── router/index.ts           # 路由表与标题设置
│   ├── stores/                   # Pinia stores（config / theme / size / center / auth / local-articles / read-articles / music / share-links / life-records / projects）
│   ├── styles/                   # globals.css 全局样式、article.css 正文排版、theme.css 主题
│   ├── types/blog.ts             # 全站 TS 类型定义
│   ├── utils/                    # markdown 渲染、主题注入、认证存储/事件、Tinymce 配置、cn、噪点背景
│   └── views/                    # 页面：HomeView / BlogListView / BlogDetailView / BlogEditView / AboutView / ProjectListView / LifeView / ShareView
└── dist/                         # 构建产物（可重新生成，不参与交接）
```

各目录职责要点：

| 路径 | 说明 |
| --- | --- |
| `src/api/blog.ts` | 内容源切换与对外统一接口：`getBlogIndex` / `getBlogDetail` / `getCategories` / `getAbout`，页面组件不感知数据来源差异 |
| `src/api/stats.ts` | 文章统计接口（始终走 Django 后端，与内容源开关无关）：单篇统计 / 浏览量 +1 / 点赞（一人一赞）/ 列表批量统计 |
| `src/api/client.ts` | axios 实例封装：`baseURL` 与超时、JWT 注入（请求拦截器）、401 自动登出与弹窗引导（响应拦截器） |
| `src/config/site-content.json` | 站点文案、主题色、背景色、美术图、社交按钮、备案信息等 |
| `src/config/card-styles.json` | 首页卡片宽高、偏移与入场顺序 |
| `src/mocks/posts/*.md` | 15 篇示例正文，经 `import.meta.glob` 以原始文本打包 |
| `src/utils/markdown.ts` | Markdown 渲染链路：marked 解析 + shiki 代码高亮（含复制按钮）+ KaTeX 公式 + DOMPurify 清洗 + 标题锚点/TOC 收集；另提供 `enhanceHtmlContent` 增强富文本 HTML（编辑保存的文章同样高亮 / 公式 / 锚点） |
| `src/utils/tinymce.ts` | TinyMCE 自托管初始化配置（`makeTinyMceInit`），写文章弹窗、文章编辑页与关于页编辑共用 |
| `src/stores/` | 主题、视口、内容配置、登录态、本地文章、已读记录等状态 |
| `src/stores/auth.ts` | 登录态（Pinia + localStorage）：真实后端认证、启动时 token 预检与 `/auth/me` 校验（同步 `is_superuser` 博主身份）、401 同步登出 |
| `src/stores/local-articles.ts` | 本地文章记录：写文章发布、数据源文章编辑覆盖、删除/隐藏，均 Pinia + localStorage 持久化 |
| `src/stores/music.ts` | 全局音乐播放器：歌单动态读取 `public/music/`（ID3 / 文件名自动解析）、博主上传歌曲、audio 单例、单曲循环 / 列表循环、进度与错误提示（左下角入口 / 歌单弹窗 / 首页音乐卡共享） |
| `src/stores/share-links.ts` | 推荐分享链接：默认数据 + 博主添加/删除（localStorage 持久化），首页随机推荐卡与分享页共用 |
| `src/stores/life-records.ts` | 生活记录：默认数据 + 博主新增/编辑（覆盖）/删除（隐藏），localStorage 持久化，时间线页与编辑弹窗共用 |
| `src/stores/projects.ts` | 我的项目：默认数据 + 博主新增/编辑（覆盖）/删除（隐藏），localStorage 持久化，项目页与编辑弹窗共用 |
| `src/config/mock-projects.ts`、`mock-life.ts` | 我的项目 / 生活记录页面默认数据（博主增删改经 projects / life-records store 本地持久化） |
| `public/music/` | 音乐播放器音频目录：放入音频文件自动出现在歌单（歌名 / 作者解析 ID3 标签或「作者 - 歌名」文件名），博主可在歌单弹窗点 + 上传 |
| `src/styles/globals.css` | Tailwind 引入、CSS 变量、`.card` 等公共类、`html.night` 夜间样式 |

---

## 5. 数据源与后端接入说明

### 5.1 内容来源开关

`src/api/blog.ts` 顶部定义：

```ts
const SOURCE: 'local' | 'api' =
  (import.meta.env.VITE_CONTENT_SOURCE as 'local' | 'api') ?? 'local'
```

- 取值 `api`：走后端 REST 接口（为 Django/Djongo 预留）。
- 取值 `local`：走仓库内置 mock 数据。
- **当前目录下不存在 `.env` 文件**，`VITE_CONTENT_SOURCE` 未定义，因此 `?? 'local'` 生效，项目恒走本地 mock，无需任何配置即可运行。

如需切到后端，新建 `.env` 并写入：

```
VITE_CONTENT_SOURCE=api
VITE_API_BASE_URL=/api
```

### 5.2 local 模式的数据来源

| 数据 | 文件 |
| --- | --- |
| 文章索引（slug / 标题 / 日期 / 摘要 / 封面 / 分类） | `src/mocks/blog-index.json` |
| 文章正文 | `src/mocks/posts/*.md`（15 篇，与索引 slug 一一对应） |
| 分类 | `src/mocks/categories.json`（fullstack 全栈 / videoclip 视频剪辑 / ai，各 5 篇） |
| 关于页 | `src/mocks/about.json` |
| 站点配置、卡片布局 | `src/config/site-content.json`、`src/config/card-styles.json` |

索引读取后按 `date` 倒序排序；正文按 slug 匹配 md 文件，渲染为 HTML 并生成目录。

### 5.3 api 模式（后端就绪后启用）

`src/api/client.ts` 中 axios 实例的 `baseURL` 取自 `VITE_API_BASE_URL`，默认 `/api`，超时 15 秒。`src/api/blog.ts` 中已实现、但默认不启用的请求如下，后端需按相同路径与响应结构实现：

| 用途 | 请求 | 期望响应 |
| --- | --- | --- |
| 文章列表 | `GET /blogs/` | 文章索引数组（含 slug、title、date、summary、categories 等） |
| 文章配置 | `GET /blogs/{slug}/config.json` | 文章元信息对象（title、date、summary、tags、cover 等） |
| 文章正文 | `GET /blogs/{slug}/index.md` | Markdown 文本（`responseType: 'text'`） |
| 分类列表 | `GET /categories/` | 分类数组（slug、name、count） |
| 关于页 | `GET /about/list.json` | 关于页对象（title、list 分组） |

### 5.4 本地文章记录与数据源的合并

`src/stores/local-articles.ts` 使用 Pinia + localStorage 管理两类本地记录：博主“写文章”发布的文章，以及博主编辑数据源（mock）文章产生的覆盖记录。列表合并规则（`mergeWithLocalArticles`）：

- 按 `date` 倒序；日期相同时，后发布的本地文章排在前面（按 `createdAt` 时间戳）。
- 同 slug 存在本地覆盖记录（数据源文章被编辑过）时，列表以覆盖记录的标题/摘要/分类展示；已删除（隐藏）的文章从列表剔除。
- 详情页命中本地记录时优先走本地分支（markdown 覆盖记录走完整渲染管线；富文本 HTML 经 `enhanceHtmlContent` 增强：shiki 代码高亮 + 复制按钮、KaTeX 公式、标题锚点，与 markdown 文章渲染效果一致），不去请求数据源。
- 删除操作：本地记录直接移除；数据源（mock）文章为打包静态文件无法物理删除，写入隐藏记录（键 `yysuni_blog_hidden_articles`），清除浏览器 localStorage 即可恢复演示数据。

后端接通后，该 store 中 `addArticle` / `saveArticle` 的持久化逻辑可替换为对应 API 请求。

### 5.5 后端接入预留开关与接口常量清单

以下常量均存在于当前代码中，默认关闭；后端就绪后改开关 + 确认地址即可，无需改动调用方。

| 文件 | 常量 | 当前值 | 说明 |
| --- | --- | --- | --- |
| `src/api/blog.ts` | `SOURCE` | 由 `VITE_CONTENT_SOURCE` 决定，默认 `'local'` | 内容源切换（local / api） |
| `src/api/client.ts` | `API_BASE` | `VITE_API_BASE_URL`，默认 `'/api'` | axios 实例 baseURL |
| `src/stores/auth.ts` | `ENABLE_REMOTE_AUTH` | `true` | 登录/注册走真实后端；改为 `false` 可回退本地占位逻辑（无后端请求） |
| `src/stores/auth.ts` | `AUTH_LOGIN_ENDPOINT` 等 | `'/auth/login/'` 等 | 相对 `API_BASE=/api`；登录/注册 `POST { username, password }` → `{ token, refresh, user }`，`/auth/me/` 受保护、`/auth/logout/` 登出 |
| `src/components/AIChatEntry.vue` | — | — | AI 助手面板：WebSocket 流式问答（左上角图标菜单：新建对话 / 历史记录；历史会话可进入继续聊 / 删除 / 返回）、回答来源展示、标题栏「设置」按钮（仅登录可见，打开 AISettingsModal） |
| `src/composables/useAiChat.ts` | — | — | AI 流式对话 composable：WS 连接与重连、token 流式渲染（done 以完整回复覆盖）、会话（thread_id）管理、4401 凭证过期引导重新登录 |
| `src/api/ai.ts` | — | — | AI 助手接口封装：问答（REST 兜底）、模型配置（读 / 存 / 测试）、知识库（索引 / 删除 / 重建 / 状态）、会话历史（列表 / 详情 / 删除），已全部接入真实后端 |
| `src/config/ai-models.ts` | — | — | 大模型预设清单：厂商 → 接口地址（选择后自动填充）+ 常见模型列表（嵌入模型全站固定，不参与配置） |

认证与 AI 请求统一走 `src/api/client.ts` 的 axios 实例：请求自动携带 `Authorization: Bearer <token>`，响应 401 时清除本地登录态并弹登录窗引导重新登录（事件机制见 `src/utils/auth-events.ts`）。开发期 `/api` 请求与 `/ws` WebSocket 均由 `vite.config.ts` 的 `server.proxy` 转发到 `http://127.0.0.1:8080`。

登录/注册/当前用户/登出接口，以及文章统计接口（浏览量 / 点赞）已由 Django 后端实现（`blog_terminal/`，路由见其 `blog/urls.py`，统一错误格式 `{ "detail": "..." }`）；AI 助手（流式 RAG 问答 / 对话记忆 / 历史记录 / 模型配置 / 知识库管理）已完整实现，见 5.8 节。

### 5.6 文章统计接口（浏览量 / 点赞）

统计接口始终走 Django 后端（`src/api/stats.ts`），与内容源开关无关：文章内容可以是本地 mock，互动数据以服务端为准（存 MySQL，模型见 `blog_terminal/blog/models.py` 的 `ArticleStats` / `ArticleLike`）。

| 用途 | 请求 | 说明 |
| --- | --- | --- |
| 单篇统计 | `GET /articles/{slug}/stats/` | 返回 `{ slug, views, likes, liked }`；游客可访问，登录时 `liked` 反映当前用户是否已点赞（点赞按钮还原状态） |
| 浏览量 +1 | `POST /articles/{slug}/view/` | 游客可访问；进入文章详情页时调用，返回自增后的最新统计 |
| 点赞 | `POST /articles/{slug}/like/` | **需登录**（未登录 401）；数据库「用户 + slug」唯一约束保证**一个用户只能赞一次**，重复请求幂等返回、不重复计数 |
| 批量统计 | `GET /articles/stats/?slugs=a,b,c` | 列表页用；按请求顺序返回 `[{ slug, views, likes }]`，未统计过的文章补零，单次最多 200 篇 |

前端使用：列表页 `/blog` 每篇文章行显示浏览量 / 点赞数（批量接口，失败时静默降级不展示）；详情页进入时浏览量自动 +1，文章最下方展示浏览量 / 点赞数统计行；点赞按钮（详情页侧栏与关于页）登录后才能点赞，未登录点击会弹登录窗、登录成功后自动完成本次点赞，已点赞再点仅提示「每人只能点赞一次哦」。数据可在 Django Admin（`/admin/`）中查看。

### 5.7 音乐目录自动歌单（vite music-dir 插件）

`vite.config.ts` 内联 music-dir 插件，实现歌单与 `public/music/` 目录的自动同步（无需手动维护歌单配置），前端由 `src/stores/music.ts` 消费：

| 时机 | 行为 |
| --- | --- |
| dev | `GET /music/index.json` 实时扫描目录返回歌单（文件名 + ID3 元信息解析，不落盘） |
| dev | `POST /__music/upload` 上传音频（`x-file-name` 头传文件名；扩展名白名单 mp3 / m4a / aac / ogg / oga / wav / flac；重名自动追加序号 `(1)`；上限 100MB） |
| build | `closeBundle` 生成 `dist/music/index.json`（`public/music/` 会被原样复制进 `dist/`） |

歌名与作者解析优先级：ID3v2（TIT2 / TPE1）> ID3v1 尾标签 > 「作者 - 歌名」文件名 > 「未知艺术家」。上传接口由 Vite dev 中间件实现、无服务端鉴权（本地开发场景；界面入口仅博主可见），生产环境需另行实现上传接口。

### 5.8 AI 助手：RAG 问答系统（LangChain + LangGraph + Milvus + Channels）

AI 助手已从「前端模拟回复」升级为完整 RAG 问答系统（流式输出 + 对话记忆），入口仍为首页右下角猫咪按钮（需登录）。技术链路的后端实现位于 `blog_terminal/blog/ai_rag.py`（检索）、`ai_graph.py`（问答编排）、`checkpointer.py`（对话记忆持久化）与 `consumers.py`（WebSocket 流式）；**嵌入模型全站固定**（`openai:text-embedding-3-small`，1536 维，服务端 `settings.AI_EMBED_*` 统一维护，用户不可配置），**大模型按用户隔离**（每个登录用户配置自己的 API Key，对话消耗各自额度）：

| 环节 | 实现 |
| --- | --- |
| 向量数据库 | Milvus（Docker standalone），独立数据库 `blogRAG`，集合 `blog_chunks`（字段：slug / title / chunk_index / text / vector，COSINE 相似度 + AUTOINDEX） |
| 文档分块 | LangChain `RecursiveCharacterTextSplitter`（chunk_size 500 / overlap 80，中文分隔符含换行、句号、问号等） |
| 混合检索 | BM25（`rank_bm25` + jieba 中文分词，过滤疑问词 / 虚词）与向量检索各取 Top 8，RRF 融合（k=60）后按 slug 去重（每篇最多 2 条）取 Top 4；最高相似度低于阈值（默认 0.35）视为未命中，另对英文 / 数字专名做主题区检查 |
| 问答编排 | LangGraph 状态图：检索 → 命中则基于博客片段生成回答（来源仅展示回答实际引用的文章）；未命中先表述「博客中没有找到相应内容」，再通过 Bing 网页搜索联网补充（附网页来源） |
| 会话历史 | 全量消息由 checkpointer 按会话持久化（存 MySQL）；生成时将最近 6 条注入上下文（本轮提问自动去重） |

**流式输出与对话记忆（WebSocket）**

- 实时流式：Django Channels + daphne（ASGI），`ws://host/ws/ai/chat/?token=<JWT>`（浏览器 WebSocket 无法自定义请求头，token 经查询参数传递，握手时验签；凭证无效以 4401 关闭，前端清除登录态并引导重新登录）；服务端按 `start` / `token` / `done` / `error` 帧下发，前端打字机式逐段渲染（打字光标），`done` 帧携带完整回复覆盖增量并附来源。开发期由 Vite `/ws` 代理转发（`ws: true`）；
- 对话记忆：自研 Django ORM checkpointer（`blog_terminal/blog/checkpointer.py`，实现 LangGraph `BaseCheckpointSaver` 全部同步 + 异步接口），图状态（消息序列）按 thread_id 持久化到 MySQL（`ChatThread` / `ThreadCheckpoint` / `ThreadWrite` 三表）；同一会话多轮提问自动携带历史上下文，跨刷新 / 换设备有效；删除会话时记忆数据一并清除；
- 会话管理：面板左上角动态图标点击弹出菜单——「新建对话」（清空上下文重新开始）、「历史记录」（切换为历史会话列表视图）；历史列表支持点击进入继续聊、行内删除（二次确认）、加载失败重试，顶部返回按钮回到对话视图。

后端接口（路由见 `blog_terminal/blog/urls.py`，REST 均经 `/api` 前缀由 Vite 代理，WebSocket 经 `/ws` 代理）：

| 用途 | 请求 | 权限与说明 |
| --- | --- | --- |
| 流式对话 | `WS /ws/ai/chat/` | 登录（`?token=` JWT）；发送 `{type:"chat", message, thread_id?}` → `start` / `token`* / `done` / `error` 帧；thread_id 为空自动新建会话并回传 |
| 对话（兜底） | `POST /ai/chat/` | 登录；`{ message }` → `{ reply, sources, used_web }`（一次性返回，无记忆） |
| 读取配置 | `GET /ai/config/` | 登录，读取自己的配置（API Key 打码返回） |
| 保存配置 | `PUT /ai/config/` | 登录即可；**按用户隔离**保存自己的大模型配置，`api_key` 传空或原打码值表示不修改 |
| 测试连通性 | `POST /ai/config/test/` | 登录即可；`{ model, base_url, api_key }` → `{ ok, detail }`（测试自己的配置；传 `kind: 'embed'` 可测固定嵌入模型） |
| 索引文章 | `POST /ai/rag/index/` | 仅博主；`{ slug, title, content }`（保存 / 编辑文章后自动调用） |
| 删除向量 | `POST /ai/rag/delete/` | 仅博主；`{ slug }`（删除文章后自动调用） |
| 重建知识库 | `POST /ai/rag/rebuild/` | 仅博主；`{ articles: [{ slug, title, content }] }`（清空后全量重索引） |
| 知识库状态 | `GET /ai/rag/status/` | 登录；Milvus 连接 / 文章数 / 分块数 |
| 会话列表 | `GET /ai/threads/` | 登录；`{ threads: [{ id, title, updated_at }] }`（按最近活跃排序，最多 50 条） |
| 会话详情 | `GET /ai/threads/<id>/` | 登录（校验归属）；会话信息 + 全量消息（从 checkpointer 最新状态回读，含来源） |
| 删除会话 | `DELETE /ai/threads/<id>/` | 登录（校验归属）；连同 checkpointer 记忆数据一并删除 |

**配置与使用**

1. 启动 Milvus（见第 3 节）与后端；后端依赖新增 langchain / langgraph / langchain-openai / langchain-text-splitters / pymilvus / rank_bm25 / jieba / lxml（已写入 `requirements.txt`）。
2. 任意登录用户 → 打开 AI 助手面板 → 点标题栏「设置」（关闭按钮左侧）→ 配置**自己的大模型**（选择厂商后接口地址自动生成，也可选「自定义」手动填写；填入 API Key 后可点「测试连通性」验证）。嵌入模型全站固定，无需也不能配置。
3. 存量文章：博主账号在设置弹窗「知识库」区块点「重建知识库」做一次全量收录（Markdown / 富文本正文自动转为纯文本）。
4. 此后：发布 / 编辑文章会自动分块并入向量库（同 slug 覆盖旧向量）；删除文章自动清理对应向量；AI 面板提问即走「知识库检索 → 未命中联网搜索」流程，回答逐字流式渲染、下方展示来源（博客文章可点击跳转，网页为新窗口外链）；点击面板左上角图标可新建对话或查看历史记录（历史会话由 checkpointer 持久化，支持进入继续聊与删除）。

**说明与约束**

- 嵌入模型全站固定（`openai:text-embedding-3-small`，1536 维，服务端 `settings.AI_EMBED_*`）；如需更换，修改服务端配置并重建知识库（向量空间会变化；acedata 的 ada-002 实测语义区分失效，请勿换回）。
- 所有模型接口走 OpenAI 兼容协议（`langchain-openai` 直连），预设含 DeepSeek / 阿里云百炼 / 智谱 / Kimi / 硅基流动 / OpenAI / 本地 Ollama 与自定义。
- 联网搜索使用 Bing 网页搜索（免 Key），结果仅在知识库未命中时使用。
- **配置权限**：所有登录用户都可以在设置弹窗配置自己的大模型（对话消耗各自账号的额度，互不影响）；知识库全量重建仅博主（`is_superuser`）可操作（嵌入额度由站点统一承担）。API Key 仅保存在后端数据库（按用户隔离），前端不回显明文。
- **WebSocket 依赖**：后端以 ASGI（daphne）方式启动（`channels` / `daphne` 已加入 `requirements.txt`，`daphne` 置于 `INSTALLED_APPS` 首位后 `runserver` 自动接管）；生产部署需由反向代理（Nginx 等）将 `/ws/` 转发到 ASGI 服务（保留 Upgrade 头），`/api` 同理转发。

---

## 6. 富文本编辑器自托管资源

“写文章”弹窗、文章编辑页与关于页编辑使用 TinyMCE 7，编辑器资源以自托管方式放在 `public/tinymce/`（共 207 个文件，为完整发行包），不依赖 CDN 与云服务，离线开发可用。

`src/utils/tinymce.ts`（写文章弹窗、文章编辑页与关于页编辑共用 `makeTinyMceInit(height, placeholder)`）中的关键配置：

```ts
{
  license_key: 'gpl',
  base_url: '/tinymce',
  suffix: '.min',
  plugins: 'lists link code table image preview',
  skin: 'oxide'
  // 组件上另有 tinymce-script-src="/tinymce/tinymce.min.js"
}
```

说明与约束：

- 初始化配置另含 `promotion: false`、`branding: false`、`menubar: false`、`height: 340`（文章编辑页 480、关于页 320），以及工具栏项（撤销/重做、段落、加粗/斜体/下划线、有序/无序列表、链接、图片、表格、源码、预览）。
- 编辑器界面文案随发行包自带，切换语言需另行引入对应语言包。
- 升级 TinyMCE 时，直接用新版本发行包替换 `public/tinymce/` 目录，并同步 `package.json` 中 `tinymce` 与 `@tinymce/tinymce-vue` 的版本。
- `license_key: 'gpl'` 对应 GPL 授权，用于避免未注册域名的授权提示；如需商业授权，请替换为自有 Key。

---

## 7. 已实现功能清单

**站点框架**

- 路由：首页 `/`、文章列表 `/blog`、文章详情 `/blog/:slug`、文章编辑 `/blog/:slug/edit`（requiresAuth + 页面内校验 is_superuser，仅博主）、关于 `/about`、我的项目 `/projects`、生活记录 `/life`、推荐分享 `/share`，未匹配路径重定向到首页；按路由 `meta.title` 设置 `document.title`，格式为「页面名 - YYsuni」。
- 滚动行为：带锚点跳转时平滑滚动并预留 90px 顶部间距，浏览器前进/后退时恢复原滚动位置。
- 布局：彩色气泡背景（`BlurredBubblesBackground`）、导航卡、回到顶部按钮（移动端显示）、路由切换淡入淡出过渡。
- 导航卡两种形态：首页为左侧竖排完整卡（头像 + 站点名 + 5 个导航项 + 悬停高亮罩），其他页面为左上角横向图标胶囊，移动端强制图标形态。
- 响应式：以 640px 为断点（`stores/size.ts`），移动端卡片改为纵向流式布局。

**首页卡片**

- 美术图卡（点击新窗口打开原图）、问候卡、实时时钟卡、日历卡、音乐卡（播放/暂停控制，与左下角歌单入口共享同一播放器）、最新文章卡（取列表首条）、社交按钮卡、分享卡（从分享链接合并列表随机取一条）、备案卡、写文章入口按钮。
- 卡片尺寸、偏移与入场顺序由 `src/config/card-styles.json` 统一配置，桌面端以视口中心为锚点绝对定位（`useCenter` + `HomeDraggableLayer`），并按 `order` 依次播放入场动画。
- 右下角常驻 AI 聊天入口（猫咪动图按钮）；左下角常驻音乐入口按钮（打开歌单弹窗，播放中图标高亮）。

**文章模块**

- 列表页：关键词搜索（匹配标题 / 摘要 / slug，点击按钮或回车触发），按分类分为全栈、视频剪辑、AI 三块展示，各块篇数实时统计，内容区固定高度内部滚动；已读文章有标记（`stores/read-articles.ts` 持久化已读 slug 列表）；每篇文章行显示浏览量 / 点赞数（后端统计接口，见 5.6 节）。
- 详情页：Markdown 渲染（代码高亮 + 代码块复制按钮、KaTeX 公式、标题锚点）、目录 TOC 侧栏（移动端底部目录入口）、封面与摘要展示、点赞按钮（计数来自后端，登录后一人一赞；未登录点击弹登录窗，登录成功后自动完成本次点赞）；进入页面浏览量自动 +1，文章卡片最下方展示浏览量 / 点赞数统计行；博主操作区（仅 `is_superuser` 可见）：“编辑本页内容”（进入编辑页）与“删除文章”（二次确认后删除并回列表，同时静默清理 AI 知识库中该文章的向量），游客与普通读者不渲染该区域。
- 关于页：分组卡片展示（数据源）或富文本卡片展示（博主编辑后）；博主本地编辑模式使用 TinyMCE 富文本（标题 + 正文，保存到 localStorage 并即时生效，旧版简本文数据自动迁移）；「编辑本页内容」入口位于页面内容下方、仅博主（`is_superuser`）可见，与正文以分隔线区隔。

**内容页与音乐**

- 我的项目页 `/projects`：项目卡片列表（名称 / 描述 / 技术栈标签 / 可选访问链接）；博主可添加项目（弹窗：名称 / 链接（自动补 https://）/ 标签（逗号分隔）/ 描述）、编辑与删除（内联二次确认），增改存 localStorage（`stores/projects.ts`），新增项目展示在列表最前。
- 生活记录页 `/life`：时间线布局（左侧日期 + 节点圆点 + 右侧卡片，支持心情 emoji 与配图；移动端日期移至卡片内）；博主可添加动态、编辑每条记录与删除（内联二次确认），增改存 localStorage（`stores/life-records.ts`）。
- 推荐分享页 `/share`：分享链接列表（标题与「访问」按钮均可点击跳转新窗口）；博主可添加链接（弹窗表单，自动补全 https://）与删除链接（内联二次确认），添加内容存 localStorage，删除默认链接记入隐藏列表；首页随机推荐卡从同一数据源取数。
- 音乐播放器：左下角入口按钮打开歌单弹窗，点击歌单行切歌；支持上一曲 / 下一曲 / 播放暂停与单曲循环（Repeat1）/ 列表循环（Repeat）切换，可点击进度条跳转；播放状态由 `stores/music.ts` 全局管理，切换页面不中断；歌单动态读取 `public/music/` 目录（dev 由 vite music-dir 插件实时扫描，构建产物为 `dist/music/index.json`），歌名 / 作者优先解析 ID3 标签、无标签时按「作者 - 歌名」文件名解析；博主可在歌单弹窗点右上角 + 上传本地音频，文件写入 `public/music/` 后歌单自动刷新，形成上传 → 歌单闭环；文件缺失时弹窗内提示。

**内容发布**

- “写文章”弹窗：仅博主（`is_superuser`）可见首页写文章入口；TinyMCE 富文本编辑，标题（最多 80 字）、分类下拉（取自 `categories.json`）、正文必填，三项校验均通过后才可发布；支持 Esc 或点击遮罩关闭，提交过程中禁止关闭；提交时再次校验博主身份（防越权）。
- slug 由标题推导（非中文部分转为连字符，纯中文标题退化为 `post-<时间戳>`），与数据源或已发布文章的 slug 冲突时自动追加序号（`-2`、`-3`…）。
- 摘要由正文纯文本自动截取（约 60 字），发布日期取发布当天；写入 Pinia + localStorage 后立即出现在列表页与首页“最新文章”中，localStorage 写入失败（容量超限）时回滚内存状态并抛出错误提示。发布成功后自动同步该文章进 AI 知识库（同 slug 覆盖旧向量，同步失败仅提示、不影响发布结果），提示 1.5 秒后弹窗自动关闭。
- 文章编辑页 `/blog/:slug/edit`：入口仅博主可见（游客由路由守卫拦截并弹登录窗，登录的非博主显示“无权限”提示）；统一 TinyMCE 富文本编辑——数据源（mock）文章载入时由 Markdown 轻量转为 HTML 进编辑器，保存为本地 html 覆盖记录（旧版 markdown 覆盖记录自动转换升级）；富文本保存后详情页经 `enhanceHtmlContent` 增强（shiki 高亮 + 复制按钮、KaTeX 公式、标题锚点），与 Markdown 文章渲染样式一致（历史已保存的富文本记录同样自动生效）；保存后自动同步 AI 知识库（同 slug 覆盖旧向量）并返回详情页。

**主题与视觉**

- 日夜主题切换：右上角常驻按钮，夜间在 `<html>` 挂 `.night` 类并持久化偏好（`localStorage` 键 `yysuni_night_mode`）；切换时背景/卡片/文字以 500ms 渐变过渡（`.theme-transition` 过渡窗口 + 常驻背景/星点图层 opacity 渐变，无闪烁），刷新时由 `index.html` 内联脚本在首屏渲染前恢复夜间主题。
- 主题色由 `site-content.json` 的 `theme` 字段注入为 CSS 变量，全站卡片、按钮、正文同步变化。
- 站点图标（`favicon.ico` 多尺寸 / `favicon-32x32.png` / `apple-touch-icon.png`）由 `public/images/avatar.jpg` 生成，`index.html` 中以三行 `link` 引用。

**登录与 AI**

- 登录/注册弹窗（`AuthModal`）：用户名 3-20 字符、密码至少 6 位，前端与后端双重校验；已接通 Django 真实认证，注册即自动登录并签发 7 天有效期 JWT，**无任何预置测试账号**，注册仅创建普通读者用户；博主身份由后端 `is_superuser`（超级管理员）决定（数据库开通，前端据此控制写文章 / 编辑 / 删除入口）。
- 登录态持久化在 localStorage（键 `blog-auth-user`），刷新后由 `/api/auth/me` 校验 token；启动时若本地 token 已过期则直接清理不弹窗，服务端返回 401 时自动登出并弹登录窗引导重新登录。
- 游客可浏览全部站点内容；点赞需登录（未登录点击点赞按钮会弹出登录/注册弹窗，登录成功后自动完成本次点赞；一个用户只能赞一次，重复点击仅提示）；点击 AI 入口会先弹出登录/注册弹窗，登录成功后自动打开 AI 面板。
- AI 面板为 WebSocket 流式 RAG 问答（LangChain + LangGraph + Milvus 混合检索，未命中联网搜索），回答逐字流式渲染、下方展示来源（博客文章可点击跳转 / 网页新窗口外链）；对话记忆按会话持久化于服务端，左上角图标菜单支持「新建对话」与「历史记录」（历史会话可进入继续聊 / 删除，返回按钮回到对话）；标题栏另提供「设置」（打开模型 / 知识库配置弹窗）与「退出登录」（确认弹窗 `LogoutConfirmModal`，确认后清除登录态并关闭面板）入口，核心链路见 5.8 节。
- 路由已提供 `requiresAuth` 前置守卫（未登录回首页并弹登录窗），当前用于文章编辑页 `/blog/:slug/edit`；页面内再校验 `is_superuser`，登录的非博主访问时显示无权限提示。

---

## 8. 常见问题

**Q1：构建后根目录为什么会出现 `vite.config.js`、`vite.config.d.ts`、`tsconfig.tsbuildinfo`、`tsconfig.node.tsbuildinfo`？**

这 4 个文件是 `npm run build` 中 `vue-tsc -b` 的执行副产物，不是手写源码，可以删除。成因是 `tsconfig.node.json` 设置了 `composite: true` 且 `include` 了 `vite.config.ts`，被 `tsconfig.json` 以 `references` 引用，增量构建时会把该配置编译输出到源目录并写入构建信息文件；下次构建会重新生成，属预期行为。

需要注意：一旦根目录同时存在 `vite.config.js` 与 `vite.config.ts`，Vite 加载配置时 `.js` 的优先级高于 `.ts`，若修改了 `vite.config.ts` 却不删除旧的 `vite.config.js`，改动不会生效。建议将这两个编译产物加入 `.gitignore` 或在提交前一并删除。

**Q2：为什么项目里没有 `.env` 文件？**

默认内容源就是本地 mock，无需环境变量。仅当要切到后端接口时才需要新建 `.env` 并设置 `VITE_CONTENT_SOURCE` 与 `VITE_API_BASE_URL`（见第 5.1 节）。

**Q3：开发服务器为什么固定在 2025 端口？改端口要动哪里？**

端口写在 `vite.config.ts` 的 `server.port`，修改该值即可；`server.host: true` 使局域网内其他设备可通过本机 IP 访问。

**Q4：文章内容在哪里改？**

演示数据在 `src/mocks/`：列表信息改 `blog-index.json`，正文改 `posts/*.md`（文件名即 slug，需与索引一一对应），分类改 `categories.json`。通过页面“写文章”发布的文章不入库、不落盘，只存在浏览器 localStorage 中；博主对数据源文章的编辑/删除同样以本地记录（覆盖/隐藏）保存，不修改打包的 md 文件。

**Q5：通过“写文章”发布的文章换台电脑就看不到了？**

对。本地文章保存在浏览器 localStorage（键 `yysuni_blog_local_articles`），不随代码分发，清除浏览器数据或更换浏览器/设备后即丢失。后端接通后可改为写入服务端。博主删除数据源（mock）文章写入隐藏记录（键 `yysuni_blog_hidden_articles`），清除该键或整个 localStorage 可恢复演示数据。

**Q6：TinyMCE 会请求外部 CDN 或需要配置 API Key 吗？**

不需要。编辑器脚本、皮肤、插件全部从 `public/tinymce/` 加载，`license_key: 'gpl'`，无外部依赖。

**Q7：部署后直接刷新 `/blog/xxx` 出现 404 怎么办？**

路由使用 history 模式，Web 服务器需将未匹配到静态资源的请求回退到 `index.html`（Nginx 用 `try_files $uri $uri/ /index.html;`，其他平台同理）。`dist/` 中的构建产物本身不包含该回退逻辑。

**Q8：本项目在 localStorage 中使用了哪些键？**

| 键 | 用途 |
| --- | --- |
| `yysuni_night_mode` | 日夜主题偏好（`1` 为夜间） |
| `yysuni_blog_local_articles` | “写文章”发布的本地文章与数据源文章的编辑覆盖记录 |
| `yysuni_blog_hidden_articles` | 已删除（隐藏）的演示文章 slug 列表 |
| `yysuni_blog_read_articles` | 已读文章 slug 列表 |
| `yysuni_about_edit` | 关于页本地编辑内容（`{ title, html }` 富文本结构，旧简本文结构载入时自动迁移） |
| `yysuni_share_links` | 推荐分享页博主添加的链接 |
| `yysuni_share_removed` | 被删除的默认分享链接 url 列表 |
| `yysuni_life_added` / `yysuni_life_overrides` / `yysuni_life_removed` | 生活记录：博主新增的动态 / 对默认记录的编辑覆盖（id → 记录）/ 被删除的默认记录 id 列表 |
| `yysuni_projects_added` / `yysuni_projects_overrides` / `yysuni_projects_removed` | 我的项目：博主新增项目 / 编辑覆盖（id → 项目）/ 被删除的默认项目 id 列表 |
| `blog-auth-user` | 当前登录用户（用户名、JWT token/refresh、登录时间），后端认证凭据 |
| `blog-auth-accounts` | 本地占位账号表（仅 `ENABLE_REMOTE_AUTH=false` 时使用，默认不再写入） |
| `yysuni_blog_` | 前两处前缀常量（`BLOG_SLUG_KEY`），非独立键 |

**Q9：`dist/` 和 `node_modules/` 需要一起交接吗？**

不需要。`dist/` 可用 `npm run build` 重新生成，`node_modules/` 可用 `npm install` 重新安装。另外，当前项目目录不是 git 仓库（无 `.git`），如需版本管理请在接手后自行 `git init` 并先补一份 `.gitignore`（至少忽略 `node_modules/`、`dist/`、`tsconfig*.tsbuildinfo`、`vite.config.js`、`vite.config.d.ts`）。

---

## 9. 已知限制

- 文章内容与文章发布/编辑/删除（localStorage 持久化）仍为前端实现；后端已提供认证接口（注册/登录/me/登出）、文章统计接口（浏览量 / 点赞，存 MySQL）与 AI 助手全套接口（RAG 问答 / 模型配置 / 知识库管理，见 5.8 节）。存量文章需由博主在「AI 设置 → 重建知识库」做一次全量收录（嵌入模型已固定，无需配置），此后发布 / 编辑 / 删除自动同步。
- 博主的编辑/删除能力基于浏览器本地记录（覆盖与隐藏），仅对当前浏览器生效，不修改打包文件、跨设备不同步；写文章/编辑/删除入口均由前端根据 `is_superuser` 控制显隐，后端文章 CRUD 接口就绪后应改为服务端侧权限校验。
- 音乐播放器的音频文件不随项目分发（`public/music/` 内仅说明文件），需自行放入音频文件或由博主在歌单弹窗上传（上传接口 `POST /__music/upload` 由 dev 环境 Vite 插件提供、无服务端鉴权，生产环境需另行实现）；推荐分享、生活记录、我的项目、关于页的增删改同样为本地记录，仅当前浏览器生效。
- 文章列表搜索为纯前端过滤，数据量大时需改为后端检索。
- `index.html` 中的 `<title>` 与 `description` 仍为占位文案（“XXX - 个人博客”），正式上线前需替换；站点名、主题色与文案主要在 `src/config/site-content.json` 与 `src/router/index.ts` 中维护。
- 项目未配置 ESLint / Prettier 等代码规范工具，`package.json` 中仅有 `dev` / `build` / `preview` 三个脚本。
*（内容由AI生成，仅供参考）*
