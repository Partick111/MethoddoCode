# -*- coding: utf-8 -*-
"""Channels WebSocket 认证中间件（JWT 查询参数）

浏览器 WebSocket API 无法自定义请求头，因此 JWT 通过连接地址传递：
    ws://host/ws/ai/chat/?token=<access_token>
token 缺失 / 过期 / 伪造时注入 AnonymousUser，由消费器拒绝连接（4401）。
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser, User
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def _get_user(user_id):
    return User.objects.filter(id=user_id, is_active=True).first() or AnonymousUser()


class JWTQueryAuthMiddleware(BaseMiddleware):
    """从 ?token= 解析 JWT，校验通过后向 scope 注入 user"""

    async def __call__(self, scope, receive, send):
        scope["user"] = await self._resolve_user(scope)
        return await super().__call__(scope, receive, send)

    @staticmethod
    async def _resolve_user(scope):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = (query.get("token") or [""])[0]
        if not token:
            return AnonymousUser()
        try:
            validated = AccessToken(token)  # 验签 + 过期检查（纯计算，无数据库访问）
            return await _get_user(validated["user_id"])
        except Exception:  # noqa: BLE001  # 无效凭证一律视为游客
            return AnonymousUser()
