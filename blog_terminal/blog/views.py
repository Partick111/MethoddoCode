"""博客后端接口视图

范围：
- 认证：注册 / 登录 / 当前用户（受保护）/ 登出
- 文章统计：浏览量（游客可计数）+ 点赞（登录后一人一赞）
- AI 助手（RAG 问答）：对话（LangGraph 编排）、模型配置、知识库索引 / 删除 / 重建 / 状态

统一约定：
- 成功响应：注册/登录返回 { token, refresh, user: { id, username, is_superuser } }
- 错误响应：统一 { "detail": "..." }（由 blog/exceptions.py 全局处理）
"""

import logging
import uuid

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.db.models import Count, F, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from . import ai_graph, ai_rag
from .ai_graph import make_llm, run_qa
from .models import AIConfig, ArticleLike, ArticleStats, ChatThread
from .serializers import RegisterSerializer, UserSerializer

logger = logging.getLogger(__name__)


def auth_payload(user: User) -> dict:
    """签发 JWT：access 作为业务 token 返回，refresh 一并返回供后续静默续期预留"""
    refresh = RefreshToken.for_user(user)
    return {
        "token": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    }


class RegisterView(APIView):
    """POST /api/auth/register/ 注册（仅普通读者账号，博主由后台开通）"""

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.create_user(
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        return Response(auth_payload(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """POST /api/auth/login/ 登录（用户名大小写不敏感）"""

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        if not username or not password:
            return Response({"detail": "请输入用户名与密码"}, status=status.HTTP_400_BAD_REQUEST)

        # authenticate 对 username 精确匹配，先按 iexact 取回真实用户名以支持大小写不敏感登录
        matched = User.objects.filter(Q(username__iexact=username)).first()
        user = authenticate(request, username=matched.username, password=password) if matched else None
        if user is None:
            return Response({"detail": "用户名或密码错误"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(auth_payload(user))


class MeView(APIView):
    """GET /api/auth/me/ 当前登录用户（受保护：token 缺失/失效返回 401）"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    """POST /api/auth/logout/ 登出预留

    JWT 无状态，前端清除本地 token 即完成登出；
    本接口不校验登录态（token 已过期时登出也应成功），供后续吊销/审计扩展。
    """

    def post(self, request):
        return Response({"detail": "ok"})


class AIChatView(APIView):
    """POST /api/ai/chat/ AI 对话（RAG 问答，登录后可用；同步单轮兜底路径）

    由 LangGraph 编排：博客知识库混合检索（BM25+向量）命中 → 基于博客内容回答；
    未命中 → 先表述「博客中没有相应内容」，再 Bing 联网搜索后回答。
    说明：前端对话已改用 WebSocket（/ws/ai/chat/，流式输出 + 对话记忆），
    本接口为同步单轮兜底（不写对话记忆）。
    请求：{ message }
    响应：{ reply, sources: [{ type: 'blog' | 'web', title, slug?, url? }], used_web }
    """

    permission_classes = [IsAuthenticated]
    MAX_MESSAGE_LEN = 2000

    def post(self, request):
        message = str(request.data.get("message", "")).strip()
        if not message:
            return Response({"detail": "消息不能为空"}, status=status.HTTP_400_BAD_REQUEST)
        if len(message) > self.MAX_MESSAGE_LEN:
            return Response(
                {"detail": f"消息过长（最多 {self.MAX_MESSAGE_LEN} 字）"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = run_qa(message, request.user)
        except ai_rag.RAGConfigError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:  # noqa: BLE001
            logger.exception("AI 对话失败")
            return Response(
                {"detail": f"AI 服务暂时不可用：{str(e)[:200]}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(result)


def _require_superuser(request) -> Response | None:
    """博主（超级管理员）权限校验；无权限时返回 403 响应"""
    if not request.user.is_superuser:
        return Response({"detail": "仅博主可操作"}, status=status.HTTP_403_FORBIDDEN)
    return None


class AIConfigView(APIView):
    """GET/PUT /api/ai/config/ AI 助手大模型配置（按用户隔离）

    GET：登录用户读取自己的配置（api_key 打码返回）；
    PUT：登录用户保存自己的配置；提交空值 / 原样回传的打码值表示「Key 保持不变」。
    说明：嵌入模型全站固定（settings.AI_EMBED_*），不在此接口配置。
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _group(cfg: AIConfig) -> dict:
        return {
            "provider": cfg.llm_provider,
            "model": cfg.llm_model,
            "base_url": cfg.llm_base_url,
            "api_key": AIConfig.mask_key(cfg.llm_api_key),
            "configured": bool(cfg.llm_model and cfg.llm_base_url and cfg.llm_api_key),
        }

    def _payload(self, cfg: AIConfig) -> dict:
        return {"llm": self._group(cfg), "can_edit": True}

    def get(self, request):
        return Response(self._payload(AIConfig.load(request.user)))

    def put(self, request):
        cfg = AIConfig.load(request.user)
        data = request.data or {}
        group = data.get("llm")
        if group is not None:
            if not isinstance(group, dict):
                return Response(
                    {"detail": "大模型配置格式错误"}, status=status.HTTP_400_BAD_REQUEST
                )
            base_url = str(group.get("base_url") or "").strip()[:300]
            if base_url and not base_url.startswith(("http://", "https://")):
                return Response(
                    {"detail": "大模型接口地址需以 http:// 或 https:// 开头"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cfg.llm_provider = str(group.get("provider") or "").strip()[:50]
            cfg.llm_model = str(group.get("model") or "").strip()[:100]
            cfg.llm_base_url = base_url
            key_in = str(group.get("api_key") or "").strip()
            # 空值 / 原样回传的打码值 → 视为未修改，保留原 Key
            if key_in and key_in != AIConfig.mask_key(cfg.llm_api_key):
                cfg.llm_api_key = key_in[:300]
        cfg.save()
        return Response(self._payload(cfg))


class AIConfigTestView(APIView):
    """POST /api/ai/config/test/ 测试模型连通性（登录即可）

    请求：{ kind: 'llm' | 'embed', model, base_url, api_key }
    kind=llm：测试当前用户已保存（或本次提交）的大模型配置；
    kind=embed：测试全站固定嵌入模型（请求参数忽略）；
    （api_key 为空或为打码值时使用已保存的 Key，便于先保存再测试）
    响应：{ ok, detail }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        kind = str(request.data.get("kind") or "llm")
        if kind == "embed":
            try:
                embedder = ai_rag.make_embedder()
                vector = embedder.embed_query("连接测试")
                return Response(
                    {"ok": True, "detail": f"固定嵌入模型连接成功，向量维度 {len(vector)}"}
                )
            except Exception as e:  # noqa: BLE001
                return Response({"ok": False, "detail": f"{type(e).__name__}: {str(e)[:300]}"})

        cfg = AIConfig.load(request.user)
        model = str(request.data.get("model") or "").strip()[:100]
        base_url = str(request.data.get("base_url") or "").strip()[:300]
        key_in = str(request.data.get("api_key") or "").strip()
        api_key = cfg.llm_api_key if (not key_in or key_in == AIConfig.mask_key(cfg.llm_api_key)) else key_in
        if not model or not base_url or not api_key:
            return Response({"ok": False, "detail": "模型 / 接口地址 / API Key 未填写完整"})

        try:
            llm = make_llm(base_url, model, api_key, timeout=20)
            reply = llm.invoke("请只回复四个字：连接成功")
            return Response(
                {"ok": True, "detail": f"连接成功，模型回复：{str(reply.content)[:60]}"}
            )
        except Exception as e:  # noqa: BLE001
            return Response({"ok": False, "detail": f"{type(e).__name__}: {str(e)[:300]}"})


class AIRagIndexView(APIView):
    """POST /api/ai/rag/index/ 索引单篇文章（仅博主；文章保存 / 编辑后由前端调用）

    请求：{ slug, title, content }（content 为纯文本）
    响应：{ ok, chunks }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _require_superuser(request)
        if denied:
            return denied
        slug = str(request.data.get("slug") or "").strip()
        title = str(request.data.get("title") or "").strip()
        content = str(request.data.get("content") or "")
        try:
            chunks = ai_rag.index_article(slug, title, content)
        except ai_rag.RAGConfigError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ai_rag.RAGError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"ok": True, "chunks": chunks})


class AIRagDeleteView(APIView):
    """POST /api/ai/rag/delete/ 删除文章向量（仅博主；文章删除后由前端调用）

    请求：{ slug }；响应：{ ok, removed }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _require_superuser(request)
        if denied:
            return denied
        slug = str(request.data.get("slug") or "").strip()
        try:
            removed = ai_rag.delete_article(slug)
        except ai_rag.RAGError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"ok": True, "removed": removed})


class AIRagRebuildView(APIView):
    """POST /api/ai/rag/rebuild/ 全量重建知识库（仅博主）

    请求：{ articles: [{ slug, title, content }] }（content 为纯文本）
    响应：{ ok, indexed, chunks, failed: [{ slug, error }] }
    """

    permission_classes = [IsAuthenticated]
    MAX_ARTICLES = 500

    def post(self, request):
        denied = _require_superuser(request)
        if denied:
            return denied
        articles = request.data.get("articles")
        if not isinstance(articles, list) or not articles:
            return Response({"detail": "articles 不能为空"}, status=status.HTTP_400_BAD_REQUEST)
        if len(articles) > self.MAX_ARTICLES:
            return Response(
                {"detail": f"单次最多 {self.MAX_ARTICLES} 篇"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            stats = ai_rag.rebuild(articles)
        except ai_rag.RAGConfigError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ai_rag.RAGError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"ok": True, **stats})


class AIRagStatusView(APIView):
    """GET /api/ai/rag/status/ 知识库状态（登录用户可读，设置弹窗展示）"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ai_rag.get_status())


class ChatThreadListView(APIView):
    """GET /api/ai/threads/ 当前用户的 AI 会话列表（历史记录，按最近活跃排序）"""

    permission_classes = [IsAuthenticated]
    MAX_THREADS = 50

    def get(self, request):
        qs = ChatThread.objects.filter(user=request.user).order_by("-updated_at")[
            : self.MAX_THREADS
        ]
        return Response(
            {
                "threads": [
                    {
                        "id": str(t.thread_id),
                        "title": t.title,
                        "updated_at": t.updated_at.isoformat(),
                    }
                    for t in qs
                ]
            }
        )


class ChatThreadDetailView(APIView):
    """GET/DELETE /api/ai/threads/<thread_id>/ 会话详情

    GET：该会话的消息列表（从 checkpointer 最新状态读取，含来源）；
    DELETE：删除会话（校验归属 → 清 checkpointer 数据 + 会话记录）。
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _get_thread(user, thread_id):
        try:
            uuid.UUID(str(thread_id))
        except (ValueError, TypeError):
            return None
        return ChatThread.objects.filter(user=user, thread_id=thread_id).first()

    def get(self, request, thread_id):
        thread = self._get_thread(request.user, thread_id)
        if thread is None:
            return Response({"detail": "会话不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "thread": {
                    "id": str(thread.thread_id),
                    "title": thread.title,
                    "updated_at": thread.updated_at.isoformat(),
                },
                "messages": ai_graph.load_thread_messages(str(thread.thread_id)),
            }
        )

    def delete(self, request, thread_id):
        if not ai_graph.delete_thread_data(request.user, thread_id):
            return Response({"detail": "会话不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"ok": True})


def article_stats_payload(slug: str, user) -> dict:
    """组装单篇文章统计：浏览量 + 点赞数 + 当前用户是否已点赞（游客恒为 False）"""
    stats = ArticleStats.objects.filter(slug=slug).first()
    liked = bool(
        user is not None
        and user.is_authenticated
        and ArticleLike.objects.filter(user=user, slug=slug).exists()
    )
    return {
        "slug": slug,
        "views": stats.views if stats else 0,
        "likes": ArticleLike.objects.filter(slug=slug).count(),
        "liked": liked,
    }


class ArticleStatsView(APIView):
    """GET /api/articles/<slug>/stats/ 单篇文章统计（游客可访问）

    登录访问时附加 liked 字段（当前用户是否已点赞），供点赞按钮还原状态；
    未统计过的文章返回全 0（不建记录，浏览量只在 POST view 时产生）。
    """

    def get(self, request, slug):
        return Response(article_stats_payload(slug, request.user))


class ArticleViewCountView(APIView):
    """POST /api/articles/<slug>/view/ 浏览量 +1（游客可访问，进入详情页时调用）"""

    def post(self, request, slug):
        ArticleStats.objects.get_or_create(slug=slug)
        # F 表达式原子自增，避免并发读改写丢失计数
        ArticleStats.objects.filter(slug=slug).update(views=F("views") + 1)
        return Response(article_stats_payload(slug, request.user))


class ArticleLikeView(APIView):
    """POST /api/articles/<slug>/like/ 点赞（登录后一人一赞）

    - 未登录：401（前端在点击前拦截并弹登录窗）；
    - 已点赞再次请求：幂等处理，不报错、不重复计数，直接返回当前统计；
    - 唯一约束（user + slug）兜底并发重复点赞。
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        try:
            ArticleLike.objects.get_or_create(user=request.user, slug=slug)
        except IntegrityError:
            # 并发下 get_or_create 可能撞唯一约束，视同已点过赞，幂等返回
            pass
        return Response(article_stats_payload(slug, request.user))


class ArticleStatsBatchView(APIView):
    """GET /api/articles/stats/?slugs=a,b,c 批量统计（列表页用，游客可访问）

    按请求顺序返回 [{ slug, views, likes }]；未统计过的文章补零。
    单次最多 200 篇，避免超长 URL。
    """

    MAX_SLUGS = 200

    def get(self, request):
        raw = str(request.query_params.get("slugs", ""))
        slugs = [s.strip() for s in raw.split(",") if s.strip()][: self.MAX_SLUGS]

        view_map = {
            slug: views
            for slug, views in ArticleStats.objects.filter(slug__in=slugs).values_list(
                "slug", "views"
            )
        }
        like_map = {
            row["slug"]: row["count"]
            for row in ArticleLike.objects.filter(slug__in=slugs)
            .values("slug")
            .annotate(count=Count("id"))
        }
        return Response(
            [
                {
                    "slug": slug,
                    "views": view_map.get(slug, 0),
                    "likes": like_map.get(slug, 0),
                }
                for slug in slugs
            ]
        )
