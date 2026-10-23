"""blog 应用路由（挂载于根 urls 的 /api/ 前缀下）"""

from django.urls import path

from . import views

urlpatterns = [
    # 认证
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    # 文章统计（浏览量 / 点赞）
    path("articles/stats/", views.ArticleStatsBatchView.as_view(), name="article-stats-batch"),
    path("articles/<str:slug>/stats/", views.ArticleStatsView.as_view(), name="article-stats"),
    path("articles/<str:slug>/view/", views.ArticleViewCountView.as_view(), name="article-view"),
    path("articles/<str:slug>/like/", views.ArticleLikeView.as_view(), name="article-like"),
    # AI（RAG 问答 + 模型配置 + 知识库管理 + 会话历史）
    path("ai/chat/", views.AIChatView.as_view(), name="ai-chat"),
    path("ai/threads/", views.ChatThreadListView.as_view(), name="ai-threads"),
    path("ai/threads/<str:thread_id>/", views.ChatThreadDetailView.as_view(), name="ai-thread-detail"),
    path("ai/config/", views.AIConfigView.as_view(), name="ai-config"),
    path("ai/config/test/", views.AIConfigTestView.as_view(), name="ai-config-test"),
    path("ai/rag/index/", views.AIRagIndexView.as_view(), name="ai-rag-index"),
    path("ai/rag/delete/", views.AIRagDeleteView.as_view(), name="ai-rag-delete"),
    path("ai/rag/rebuild/", views.AIRagRebuildView.as_view(), name="ai-rag-rebuild"),
    path("ai/rag/status/", views.AIRagStatusView.as_view(), name="ai-rag-status"),
]
