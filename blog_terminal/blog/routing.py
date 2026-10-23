# -*- coding: utf-8 -*-
"""WebSocket 路由（Django Channels）"""

from django.urls import re_path

from .consumers import AIChatConsumer

websocket_urlpatterns = [
    # AI 对话流式接口：ws://host/ws/ai/chat/?token=<JWT>
    re_path(r"^ws/ai/chat/$", AIChatConsumer.as_asgi()),
]
