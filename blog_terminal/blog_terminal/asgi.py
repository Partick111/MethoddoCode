"""
ASGI config for blog_terminal project.

HTTP：Django 常规请求（REST API / 静态资源等）；
WebSocket：Django Channels —— AI 对话流式接口
  ws://host/ws/ai/chat/?token=<JWT>（JWTQueryAuthMiddleware 认证）

开发环境由 daphne 接管 runserver（install daphne 后自动生效）；
生产环境可用 daphne / uvicorn 启动本 application。
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "blog_terminal.settings")

# 先初始化 Django（路由 / 消费器 import 依赖 apps 就绪）
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from blog.middleware import JWTQueryAuthMiddleware  # noqa: E402
from blog.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            JWTQueryAuthMiddleware(URLRouter(websocket_urlpatterns))
        ),
    }
)
