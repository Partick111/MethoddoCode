# 个人博客项目文档（Vue 3 前端 + Django 后端 + RAG AI 助手）

本仓库为个人博客全栈项目，由两个子项目组成：

| 子项目 | 目录 | 职责 |
| --- | --- | --- |
| 前端 | `blog/` | Vue 3 + Vite + TypeScript 单页应用：首页卡片、文章列表 / 详情 / 编辑、关于页、我的项目、生活记录、推荐分享、音乐播放器、AI 助手面板（WebSocket 流式对话） |
| 后端 | `blog_terminal/` | Django 6 + DRF + Channels：JWT 认证、文章统计（浏览量 / 点赞）、AI 助手（RAG 知识库检索 + 联网搜索 + 流式问答 + 对话记忆 + 模型配置） |

> 说明：前端页面级细节（卡片布局、组件、localStorage 键等）另见 `blog/README.md`；本文档覆盖全栈架构、环境搭建、后端接口与 AI 系统实现，配置项以 `blog_terminal/blog_terminal/settings.py` 当前代码为准。

---

## 1. 整体架构

```
浏览器（Vue 3 SPA）
  │  http://localhost:2025（Vite dev server，host: true 允许局域网访问）
  ├── /api/** ──────代理──────▶ Django / daphne（127.0.0.1:8080）
  └── /ws/ai/chat/ ─代理(WS)──▶ Django Channels（WebSocket 流式问答）
                                    │
                                    ├── MySQL：认证 / 统计 / AI 配置 / 对话记忆
                                    ├── Milvus（127.0.0.1:19530）：向量知识库 blogRAG
                                    ├── acedata：全站固定嵌入模型 text-embedding-3-small
                                    ├── 用户自配大模型：OpenAI 兼容接口（对话生成）
                                    └── Bing 网页搜索：知识库未命中时联网补充
```

### 端口与地址

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 前端开发服务器 | `http://localhost:2025` | Vite；`/api`、`/ws` 代理到后端 8080 |
| 后端 | `http://127.0.0.1:8080` | daphne 接管 runserver，同一端口提供 REST 与 WebSocket |
| MySQL | `127.0.0.1:3306` | 默认库 `blog_vue_django`（utf8mb4） |
| Milvus | `http://127.0.0.1:19530` | Docker standalone；库 `blogRAG` / 集合 `blog_chunks` |

---

## 2. 技术栈

### 前端（blog/）

| 类别 | 技术 |
| --- | --- |
| 框架 / 构建 | Vue 3.5、Vite 6、TypeScript 5.6（`vue-tsc -b` 类型检查） |
| 状态 / 路由 | Pinia、Vue Router 4（history 模式，8 条路由 + requiresAuth 守卫） |
| 样式 | Tailwind CSS v4（PostCSS 接入，无 tailwind.config，主题变量在 CSS 内声明） |
| 内容渲染 | marked（Markdown）+ shiki（代码高亮 / 复制按钮）+ KaTeX（公式）+ DOMPurify（清洗） |
| 富文本编辑 | TinyMCE 7 自托管（`public/tinymce/`，GPL 许可，无 CDN 依赖） |
| 其它 | axios（统一封装 + JWT 注入）、dayjs、lucide-vue-next |

### 后端（blog_terminal/）

| 类别 | 技术 |
| --- | --- |
| 框架 | Django 6.0、Django REST Framework、SimpleJWT |
| ASGI / 实时 | Django Channels 4 + daphne（`daphne` 置于 INSTALLED_APPS 首位，runserver 自动接管） |
| 数据库 | MySQL（mysqlclient；django-environ 支持 `.env` 覆盖连接参数） |
| 向量库 | Milvus standalone（pymilvus 3.x；AUTOINDEX + COSINE） |
| AI 编排 | LangChain + LangGraph（固定问答状态图 + 自研 Django ORM Checkpointer） |
| 检索 | rank_bm25 + jieba（BM25 关键词通道）、向量通道、RRF 融合 |
| 联网搜索 | requests + lxml 解析 Bing 结果页（免 Key 直爬） |
| 嵌入模型 | 全站固定 `openai:text-embedding-3-small`（1536 维，经 acedata 代理），用户不可配置 |

---

## 3. 目录结构

```
blog/                          # 工作区根目录
├── blog/                      # 前端（详细说明见 blog/README.md）
│   ├── src/
│   │   ├── api/               # blog（内容源开关）/ stats（统计）/ ai（AI 接口）/ client（axios 实例）
│   │   ├── components/        # 约 30 个组件：AI 面板、认证弹窗、音乐面板、cards/ 首页卡片等
│   │   ├── composables/       # useAiChat（WS 流式对话）、useCenter、useSize
│   │   ├── config/            # site-content.json、card-styles.json、ai-models.ts（模型预设）、mock 数据
│   │   ├── layout/            # AppLayout.vue（背景、导航、日夜切换、音乐入口、回到顶部）
│   │   ├── mocks/             # 15 篇示例文章（blog-index.json + posts/*.md）、分类、关于页
│   │   ├── router/            # 路由表与标题设置
│   │   ├── stores/            # Pinia 11 个：auth / local-articles / music / theme / size 等
│   │   ├── styles/            # globals.css、article.css、theme.css
│   │   ├── types/             # 全站 TS 类型
│   │   ├── utils/             # markdown 渲染、认证存储 / 事件、TinyMCE 配置、cn、噪声背景
│   │   └── views/             # Home / BlogList / BlogDetail / BlogEdit / About / ProjectList / Life / Share
│   ├── public/                # images/、music/（自动歌单）、tinymce/（自托管编辑器）
│   ├── vite.config.ts         # 端口 2025、/api 与 /ws 代理、music-dir 插件（歌单扫描 / 上传）
│   └── README.md              # 前端交接文档
└── blog_terminal/             # 后端
    ├── blog_terminal/
    │   ├── settings.py        # 全部后端配置（数据库 / JWT / CORS / AI_* 见第 5.1 节）
    │   ├── urls.py            # 根路由：/admin/ 与 /api/
    │   └── asgi.py            # ASGI 入口：HTTP + WebSocket（AllowedHostsOriginValidator）
    ├── blog/
    │   ├── models.py          # 6 张表（第 5.2 节）
    │   ├── views.py           # 全部 REST 接口视图
    │   ├── urls.py            # 应用路由（挂载于 /api/）
    │   ├── serializers.py     # 注册校验（3-20 用户名 / ≥6 密码）与用户序列化
    │   ├── exceptions.py      # 统一错误格式 { "detail": "..." }
    │   ├── middleware.py      # WebSocket JWT 查询参数认证（?token=）
    │   ├── routing.py         # WebSocket 路由（ws/ai/chat/）
    │   ├── consumers.py       # AI 对话消费器（start/token/done/error 帧协议）
    │   ├── ai_rag.py          # RAG 知识库：分块 / 嵌入 / Milvus / 混合检索
    │   ├── ai_graph.py        # LangGraph 问答编排 + Bing 联网搜索
    │   ├── checkpointer.py    # Django ORM 版 LangGraph Checkpointer（对话记忆）
    │   └── admin.py           # Admin：文章统计 / 点赞记录
    └── requirements.txt       # 后端依赖
```

---

## 4. 快速开始

### 4.1 环境要求

| 项 | 要求 |
| --- | --- |
| Python | 3.13（后端） |
| Node.js | 建议 20+（前端） |
| MySQL | 已启动，并创建数据库 `blog_vue_django`（utf8mb4） |
| Milvus | 仅 AI 助手需要（Docker 启动 standalone 版即可） |
| Docker | 可选（运行 Milvus） |

### 4.2 启动后端

```bash
cd blog_terminal
pip install -r requirements.txt
python manage.py migrate            # 首次运行建表
python manage.py runserver 127.0.0.1:8080
```

数据库连接默认 `root:root@127.0.0.1:3306/blog_vue_django`，可用环境变量或 `blog_terminal/.env`（存在时自动加载）覆盖：`MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_HOST` / `MYSQL_PORT`。

博主账号由后台开通：`python manage.py createsuperuser`（前端以 `is_superuser` 判定博主身份，控制写文章 / 编辑 / 删除入口）。

### 4.3 启动 Milvus（AI 助手所需，可选）

```bash
docker compose -f <milvus-standalone-docker-compose.yml 所在目录>/milvus-standalone-docker-compose.yml up -d
```

默认连接 `http://127.0.0.1:19530`（可用环境变量 `MILVUS_URI` 覆盖）。未启动时浏览文章与登录不受影响，仅 AI 助手与知识库管理不可用。

### 4.4 启动前端

```bash
cd blog
npm install
npm run dev        # http://localhost:2025
npm run build      # 类型检查 + 生产构建（产物在 dist/）
npm run preview    # 本地预览构建产物
```

前端无需 `.env` 即可运行：内容源默认本地 mock（`VITE_CONTENT_SOURCE` 未定义时走 `local`），登录 / 统计 / AI 走 Vite 代理到后端。

### 4.5 首次使用 AI 助手

1. 注册账号（普通读者）或使用博主账号登录；
2. 打开 AI 助手面板 → 标题栏「设置」→ 填写**自己的大模型**（选择厂商自动填接口地址，OpenAI 兼容协议）+ API Key → 点「测试连通性」；
3. 博主账号在设置弹窗「知识库」区块点「重建知识库」做一次全量收录；此后发布 / 编辑 / 删除文章自动同步向量库；
4. 面板提问即走「知识库检索 → 未命中联网搜索」，回答逐字流式渲染、下方展示来源。

---

## 5. 后端设计

### 5.1 配置速查（settings.py）

| 配置项 | 当前值 | 说明 |
| --- | --- | --- |
| `DEBUG` | `True` | 开发用，生产须关闭 |
| `ALLOWED_HOSTS` | `["127.0.0.1", "localhost"]` | 同时用于 WebSocket 握手的 Origin 校验（见 FAQ Q1），局域网 IP 访问需追加 |
| `ASGI_APPLICATION` / `CHANNEL_LAYERS` | daphne / InMemoryChannelLayer | 单进程开发层；多进程部署需换 channels-redis 等共享层 |
| `DATABASES` | MySQL `blog_vue_django` | 连接参数可经环境变量 / `.env` 覆盖 |
| `SIMPLE_JWT` | access 7 天 / refresh 30 天 / Bearer | 个人站点减少重登频率 |
| `CORS_ALLOWED_ORIGIN_REGEXES` | localhost / 127.0.0.1 任意端口 | 前端经 Vite 代理时同源，不受跨域影响；直连 8080 时才需要 |
| `MILVUS_URI` / `MILVUS_DB_NAME` / `AI_RAG_COLLECTION` | `127.0.0.1:19530` / `blogRAG` / `blog_chunks` | 向量库连接与集合名 |
| `AI_RAG_SCORE_THRESHOLD` | `0.35` | 命中判定阈值（3-small 实测：高度相关 0.55+、中等 0.35-0.5、无关 <0.3） |
| `AI_RAG_CHUNK_SIZE` / `AI_RAG_CHUNK_OVERLAP` | `500` / `80` | 分块参数 |
| `AI_RAG_TOP_K` | `4` | 混合检索融合后取前 N 条作为上下文 |
| `AI_EMBED_MODEL` | `openai:text-embedding-3-small` | **全站固定**，用户不可配置（见 5.5 注意事项） |
| `AI_EMBED_API_KEY` / `AI_EMBED_BASE_URL` | acedata 代理 | base_url 只填根地址 `https://api.acedata.cloud/openai` |

### 5.2 数据模型（6 张表）

| 表 | 职责 | 关键字段与约束 |
| --- | --- | --- |
| `ArticleStats` | 文章浏览量统计 | `slug`（唯一）、`views`；浏览量自增用 `F()` 原子更新防并发丢失 |
| `ArticleLike` | 点赞记录 | `(user, slug)` 数据库唯一约束保证一人一赞；并发重复请求幂等 |
| `AIConfig` | 用户大模型配置（一人一条） | `llm_provider / llm_model / llm_base_url / llm_api_key`；Key 明文存本地库，读接口打码返回 |
| `ChatThread` | AI 会话元数据 | `thread_id`（UUID，唯一）、`title`（首条消息截断 30 字）、归属用户 |
| `ThreadCheckpoint` | LangGraph 检查点 | 二进制序列化状态；`(thread_id, checkpoint_ns, checkpoint_id)` 唯一 |
| `ThreadWrite` | LangGraph 中间写入 | 与 checkpoint 配套；`(thread_id, ns, checkpoint_id, task_id, idx)` 唯一 |

### 5.3 REST API 一览（均挂载于 `/api/`）

**认证**

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `POST /api/auth/register/` | 公开 | 注册普通读者（用户名 3-20、密码 ≥6、大小写不敏感查重），201 返回 `{ token, refresh, user }` |
| `POST /api/auth/login/` | 公开 | 登录（用户名大小写不敏感） |
| `GET /api/auth/me/` | 登录 | 当前用户 `{ id, username, is_superuser }` |
| `POST /api/auth/logout/` | 公开 | 无状态登出（前端清除本地 token 即完成） |

**文章统计**

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `GET /api/articles/stats/?slugs=a,b,c` | 游客 | 批量统计（≤200 篇，按请求顺序返回，未统计补零） |
| `GET /api/articles/{slug}/stats/` | 游客 | `{ slug, views, likes, liked }`；登录时 `liked` 反映当前用户是否已赞 |
| `POST /api/articles/{slug}/view/` | 游客 | 浏览量 +1（进入详情页调用） |
| `POST /api/articles/{slug}/like/` | 登录 | 一人一赞；重复请求幂等返回，不重复计数 |

**AI 助手**

| 接口 | 权限 | 说明 |
| --- | --- | --- |
| `POST /api/ai/chat/` | 登录 | 同步单轮兜底问答（无记忆）；`{ message }` → `{ reply, sources, used_web }` |
| `GET / PUT /api/ai/config/` | 登录 | 读 / 存**自己的**大模型配置（按用户隔离；Key 打码返回，提交空值或原打码值视为不修改） |
| `POST /api/ai/config/test/` | 登录 | 连通性测试：`{ kind: 'llm' \| 'embed', ... }` → `{ ok, detail }`（embed 测试全站固定嵌入模型） |
| `POST /api/ai/rag/index/` | 博主 | `{ slug, title, content }` 索引 / 覆盖单篇（保存 / 编辑文章后自动调用） |
| `POST /api/ai/rag/delete/` | 博主 | `{ slug }` 删除该文章向量（删除文章后自动调用） |
| `POST /api/ai/rag/rebuild/` | 博主 | `{ articles: [...] }`（≤500 篇）全量重建（原子操作，失败不清空） |
| `GET /api/ai/rag/status/` | 登录 | 知识库状态（`milvus_ok / chunks / articles / slugs`） |
| `GET /api/ai/threads/` | 登录 | 会话列表（≤50 条，按最近活跃排序） |
| `GET /api/ai/threads/{id}/` | 登录（归属校验） | 会话信息 + 全量消息（从 checkpointer 最新状态回读，含来源） |
| `DELETE /api/ai/threads/{id}/` | 登录（归属校验） | 删除会话（连同对话记忆数据一并清除） |

### 5.4 WebSocket 流式对话协议

- 地址：`ws://<host>/ws/ai/chat/?token=<JWT>`（浏览器 WebSocket 无法自定义请求头，token 经查询参数传递，握手时验签）
- 鉴权：凭证缺失 / 失效时**先 accept 再以 4401 关闭**（若 accept 前直接 close，daphne 会转成 HTTP 403，前端无法区分「未登录」与「服务异常」）；前端收到 4401 清除登录态并引导重新登录
- 连接内**串行处理**：上一条消息处理中再次发送会收到 `error` 帧提示稍候

| 方向 | 帧 | 说明 |
| --- | --- | --- |
| 客户端 → 服务端 | `{ "type": "chat", "message": "...", "thread_id": "..." }` | `message` ≤ 2000 字；`thread_id` 可空——首条消息自动新建会话 |
| 服务端 → 客户端 | `{ "type": "start", "thread_id": "..." }` | 会话就绪（新建时回传新 id） |
| 服务端 → 客户端 | `{ "type": "token", "content": "增量文本" }` | 流式片段（多次） |
| 服务端 → 客户端 | `{ "type": "done", "reply", "sources", "used_web" }` | 本轮完成；`reply` 为完整文本，前端用它覆盖增量 |
| 服务端 → 客户端 | `{ "type": "error", "detail": "..." }` | 失败原因（配置缺失 / 服务异常等） |

### 5.5 AI 助手：RAG 问答系统（核心）

整体链路：`提问 → 混合检索（向量 + BM25）→ 命中判定 → 命中：基于文章片段生成回答；未命中：先声明「博客中没有找到相应内容」→ Bing 联网搜索 → 基于搜索结果生成回答`。全程流式输出，回答附来源。

#### ① 知识库索引管线（ai_rag.py）

| 环节 | 实现 |
| --- | --- |
| 分块 | `RecursiveCharacterTextSplitter`：chunk 500 / overlap 80，中文分隔符降级链（段落 → 换行 → 。！？；，→ 空格） |
| 嵌入 | 固定模型 text-embedding-3-small；标题拼入块首，增强主题相关性召回 |
| 写入 | Milvus 集合 `blog_chunks`（AUTOINDEX + COSINE）；**先嵌入成功 → 再删旧分块 → 写新分块 → flush**（嵌入失败保留旧数据） |
| 覆盖语义 | 同 slug 重索引即覆盖；内容为空时仅执行清理 |
| 全量重建 | 原子操作：探活嵌入 → 内存中完成全部分块 + 嵌入 → 任一篇失败即中止（旧集合原样保留）→ 全部就绪才 drop 重建并写入 |
| 安全 | slug 白名单校验（`^[A-Za-z0-9_-]+$`），防 Milvus 表达式注入 |

**嵌入服务（acedata）注意事项**（踩坑记录）：

- **不要换回 ada-002**：实测其语义区分失效——任意两段文本相似度 ≈0.7 平铺（「苹果手机发布」vs「苹果树修剪」给出 0.78），向量排序失去意义；
- **批量偶发坏向量**：曾实测 16 条批量整批返回正交向量（与真实结果 cos≈-0.01）；已加防御——每次批嵌入后重嵌首条抽样校验（cos > 0.9 视为正常），异常整批重试（≤3 次），仍异常则中止、不写入知识库；
- **base_url 只填根地址** `https://api.acedata.cloud/openai`（SDK 自动追加 `/embeddings`；填完整端点会请求 `.../embeddings/embeddings` 导致 404）。

#### ② 混合检索与命中判定（hybrid_search）

- 向量通道：问题向量化 → COSINE Top 8；
- BM25 通道：jieba 中文分词（**过滤「都 / 有 / 哪些」等疑问词、虚词**，避免噪声命中无关文章）→ Top 8；语料 = 标题 + 分块文本，内存缓存（索引变更即失效，线程锁保护）；
- RRF 融合（k=60）：同一 slug + 块号合并计分；每篇最多 2 条（避免单篇霸榜）；取 Top 4 作为生成上下文；
- 命中判定（两道关）：
  1. 向量最高相似度 ≥ `AI_RAG_SCORE_THRESHOLD`（0.35）；
  2. **英文 / 数字专名主题区检查**：查询中的英文 / 数字词（如软件名 cubase）必须出现在某篇文章的「标题 + 块首 80 字」内，否则直接判定「博客没有相应内容」——防止笼统语义相似误召回（实测 "cubase的基本使用" 与剪映文章相似度 0.47；中文同义词如「分块」≈「切分」不做此检查，交给阈值判断）。

#### ③ 问答编排图（ai_graph.py，LangGraph 固定状态图）

```
START → retrieve ──(命中)──▶ generate ──▶ END
             └──(未命中)──▶ no_content ──▶ web_search ──▶ web_answer ──▶ END
```

- `generate`：RAG_SYSTEM 提示词——只依据片段作答、用《标题》形式提及真正参考的文章、忽略无关片段；
- `no_content`：生成「关于「×」，博客中没有找到相应内容。」前缀；`web_answer` 以该前缀开篇（搜索无结果时返回「联网搜索也暂时没有找到有效信息，你可以换个说法再问我一次。」）；
- 设计取舍：保留固定状态图（而非 create_agent + tools 的自主 Agent），流程可控、行为可测，便于针对检索 / 生成环节分别调优。

#### ④ 来源展示规则（_pick_sources）

`sources` 只包含回答中以《标题》形式**实际引用过**的文章（标题归一化后做子串匹配），避免无关检索片段混入来源链接；回答一篇都没提及时，兜底取向量相似度最高片段所属文章（保证答案有出处可查）。联网分支的来源为 Bing 搜索结果（标题 + 链接）。

#### ⑤ 联网搜索

Bing 网页搜索免 Key 直爬（ddgs 系列在当前网络不可达，故选型 Bing + lxml 解析 `b_algo` 结果块），最多 5 条；仅在知识库未命中时触发，搜索结果仅在本次回答中使用。

#### ⑥ 对话记忆（checkpointer.py）

- 自研 `DjangoCheckpointer` 实现 LangGraph `BaseCheckpointSaver` 全部同步 + 异步接口（异步经 `sync_to_async` 回同步线程——WebSocket 消费器以异步方式运行图）；
- 图状态（消息序列）按 `thread_id` 持久化到 MySQL（ThreadCheckpoint / ThreadWrite 两表），跨请求、跨连接、跨设备有效；
- 生成时注入最近 6 条对话历史（不含系统提示与本轮提问）；
- 删除会话：校验归属 → 清 checkpointer 数据 → 删 ChatThread 记录；
- 历史回读：从最新 checkpoint 还原消息（含 `sources` / `used_web`，供前端历史面板展示）。

#### ⑦ 流式输出（consumers.py + astream_qa）

LangGraph `astream`（`stream_mode=["messages","updates"]`）：仅转发 generate / web_answer 节点的 `AIMessageChunk` 增量（排除节点完成时重复产出的完整消息）；`done` 帧携带完整 `reply` 与 `sources` 覆盖增量，与持久化文本完全一致。

### 5.6 权限模型

| 角色 | 判定 | 能力 |
| --- | --- | --- |
| 游客 | 未登录 | 浏览全部站点内容、统计读取、浏览量计数 |
| 登录用户 | 任意账号 | 点赞（一人一赞）、AI 对话（消耗**自己**配置的大模型额度）、配置自己的模型、会话管理、知识库状态查看 |
| 博主 | `is_superuser` | 上方全部 + 知识库索引 / 删除 / 重建（写文章、编辑、删除入口前端据此控制显隐） |

注册仅创建普通读者；博主由后台 `createsuperuser` 开通。AI 配置按用户隔离（互不影响）；嵌入模型全站固定，其调用额度由站点统一承担。

### 5.7 错误处理约定

- 所有非 2xx 响应统一为 `{ "detail": "可读提示" }`（`blog/exceptions.py` 全局处理，校验 / 鉴权错误拍平）；
- 状态码约定：`400` 参数 / 配置错误（如未配置大模型）、`401` 未认证或登录过期、`403` 非博主操作知识库、`502` 嵌入 / Milvus / 大模型运行时错误；
- 前端 axios 响应拦截器读取 `detail` 展示；`401` 自动清除登录态并弹登录窗（WebSocket 的 4401 同义处理）。

---

## 6. 前端设计要点

- **内容源开关**：`src/api/blog.ts` 的 `SOURCE` 由 `VITE_CONTENT_SOURCE` 决定（默认 `local`，走仓库内置 mock；`api` 模式接口已预留）。认证 / 统计 / AI 始终走后端，与内容源无关。
- **数据合并**：博主「写文章」发布的文章、对 mock 文章的编辑覆盖 / 删除隐藏均存 localStorage，列表按 `mergeWithLocalArticles` 规则合并（同 slug 以本地覆盖为准；删除写入隐藏记录）。
- **认证**：登录态存 localStorage（键 `blog-auth-user`）；启动时 token 预检 + `/auth/me` 校验（同步 `is_superuser`）；401 / WS 4401 自动登出并弹登录窗；未登录点赞 / 打开 AI 会先弹登录窗，登录成功后自动续做原操作。
- **AI 面板**（`AIChatEntry.vue` + `useAiChat.ts`）：WebSocket 地址动态取当前页面地址（`ws://<location.host>/ws/ai/chat/`）；打字机式流式渲染（done 帧覆盖）；左上角菜单「新建对话 / 历史记录」（历史会话可继续聊、删除）；标题栏「设置」（AISettingsModal：大模型配置 + 测试 + 知识库状态 / 重建，仅登录可见）与「退出登录」。
- **主题与视觉**：日夜主题通过 `<html>.night` 类 + localStorage（`yysuni_night_mode`），index.html 内联脚本在首屏渲染前恢复，避免闪烁；主题色由 `site-content.json` 注入 CSS 变量。
- **音乐**：歌单由 Vite music-dir 插件实时扫描 `public/music/`（ID3 / 文件名解析歌名作者），dev 支持上传（`POST /__music/upload`）；播放器全局单例，切页不中断。
- **富文本**：写文章弹窗、文章编辑页、关于页编辑共用自托管 TinyMCE 7；富文本正文经 `enhanceHtmlContent` 增强（代码高亮 / 公式 / 锚点），与 Markdown 文章渲染效果一致。

常用 localStorage 键：

| 键 | 用途 |
| --- | --- |
| `blog-auth-user` | 当前登录用户（用户名、JWT token / refresh） |
| `yysuni_night_mode` | 日夜主题偏好 |
| `yysuni_blog_local_articles` | 本地发布文章与 mock 文章的编辑覆盖记录 |
| `yysuni_blog_hidden_articles` | 已隐藏（删除）的 mock 文章 slug |
| `yysuni_blog_read_articles` | 已读文章标记 |
| `yysuni_about_edit` / `yysuni_share_*` / `yysuni_life_*` / `yysuni_projects_*` | 关于页编辑、分享链接、生活记录、我的项目的本地增删改记录 |

---

## 7. 常见问题（FAQ）

**Q1：用局域网 IP（如 `http://172.30.0.1:2026/`）打开页面后，AI 助手发不出去，提示「连接已中断，请重试」「无法连接到 AI 服务，请稍后重试」？**

AI 对话走 WebSocket，握手时浏览器会携带 `Origin = 页面地址`；后端 `asgi.py` 的 `AllowedHostsOriginValidator` 会用 `ALLOWED_HOSTS` 校验 Origin，不在清单中的地址直接被拒绝（握手阶段返回 HTTP 403）。解决：把访问用到的 IP / 域名加入 `ALLOWED_HOSTS`（当前为 `["127.0.0.1", "localhost"]`），重启后端即可。注意 HTTP 接口经 Vite 代理时 Host 已被改写成 `127.0.0.1:8080`，不受影响——所以表现为「只有 AI 坏、其他功能正常」。验证：F12 → Network → WS，修复前握手 403，修复后 101。

**Q2：`npm run build` 后根目录出现 `vite.config.js`、`vite.config.d.ts`、`tsconfig*.tsbuildinfo`？**

`vue-tsc -b` 增量构建的副产物。注意一旦 `vite.config.js` 与 `vite.config.ts` 同时存在，Vite 优先加载 `.js`，会导致对 `.ts` 的修改不生效——提交前删除这些产物或加入 `.gitignore`。

**Q3：模型接口报 404（`API does not exist`）？**

OpenAI 兼容 SDK 的 `base_url` 只填根地址（如 `https://api.deepseek.com/v1`），SDK 自动追加 `/chat/completions`、`/embeddings`；填完整端点会拼出重复路径导致 404。acedata 嵌入服务同理。

**Q4：为什么 AI 回答下方只有一两篇来源？为什么有时提示「博客中没有找到相应内容」？**

来源只展示回答中**实际引用过**的文章（避免无关片段混入），一篇未提时兜底展示相似度最高的一篇——这是设计行为。提示「没有找到相应内容」说明检索两道判定（相似度阈值 0.35 + 英文专名主题区检查）均未通过，随后会自动联网搜索补充。

**Q5：Milvus 没启动会怎样？**

浏览文章、登录、点赞全部正常；AI 助手对话与知识库管理会报「Milvus 向量库连接失败（请确认 Milvus 已启动）」。

**Q6：为什么项目里没有 `.env`？**

前端默认本地 mock、后端默认连接参数即可运行，无需环境变量；需要时再建（前端 `.env` 设 `VITE_CONTENT_SOURCE` / `VITE_API_BASE_URL`，后端 `blog_terminal/.env` 覆盖 `MYSQL_*` / `MILVUS_*` 等）。

**Q7：文章内容在哪里改？写文章发布的内容会丢失吗？**

演示数据在 `blog/src/mocks/`（索引 `blog-index.json`、正文 `posts/*.md`）；页面「写文章」与编辑/删除为前端本地记录（localStorage），换设备 / 清浏览器数据即丢失，后端暂不存文章内容。

**Q8：生产部署要点？**

1. 前端 `npm run build` 后用 Nginx 托管 `dist/`，history 路由需 `try_files $uri $uri/ /index.html;`；
2. 反向代理 `/api` 与 `/ws` 到 ASGI 服务（WS 需保留 `Upgrade` / `Connection` 头）；
3. 后端关闭 `DEBUG`、更换 `SECRET_KEY`、收紧 `ALLOWED_HOSTS` 与 CORS，改用多进程 ASGI 时把 `CHANNEL_LAYERS` 换成共享层（如 channels-redis）。

---

## 8. 已知限制与后续方向

- 文章内容与文章发布 / 编辑 / 删除仍为前端实现（localStorage 持久化）；后端已具备认证、统计与 AI 全套接口，文章 CRUD 入库后可改为服务端存储与权限校验；
- 博主的编辑 / 删除基于浏览器本地记录（覆盖与隐藏），仅当前浏览器生效、跨设备不同步；
- 音乐上传接口由 Vite dev 插件提供（无服务端鉴权），生产环境需另行实现；
- 文章列表搜索为纯前端过滤，数据量大时应改为后端检索；
- 对话通道层为单进程内存实现（InMemoryChannelLayer），多进程部署需替换；
- `index.html` 的 `<title>` / `description` 仍为占位文案，上线前需替换；
- 项目未配置 ESLint / Prettier 等代码规范工具。
