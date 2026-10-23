# -*- coding: utf-8 -*-
"""AI 助手 WebSocket 消费器（Django Channels）：流式问答 + 对话记忆

协议（JSON 文本帧）：
- 连接：ws://host/ws/ai/chat/?token=<JWT>（凭证无效以 4401 关闭连接）
- 客户端 → 服务端：
    {"type": "chat", "message": "...", "thread_id": "..."}   thread_id 可空：首条消息自动建会话
- 服务端 → 客户端：
    {"type": "start", "thread_id": "..."}                    会话就绪（新建时回传新 id）
    {"type": "token", "content": "增量文本"}                  流式回答片段（多次）
    {"type": "done",  "reply", "sources", "used_web"}        本轮回答完成（reply 为完整文本）
    {"type": "error", "detail": "..."}                       失败原因（配置缺失 / 服务异常等）

记忆链路：astream_qa 内部带 Django ORM checkpointer，按 thread_id 持久化/恢复
图状态中的 messages——同一会话多轮对话自动携带历史上下文。
"""

import logging
import uuid

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from . import ai_graph, ai_rag
from .models import ChatThread

logger = logging.getLogger(__name__)

# 会话标题长度（取自首条用户消息）
THREAD_TITLE_MAX = 30


class AIChatConsumer(AsyncJsonWebsocketConsumer):
    """AI 对话消费器（单连接内串行处理，防止并发图执行互相干扰）"""

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            # 先完成握手再以自定义码关闭：accept 前 close 会被 ASGI 服务端
            # 转成 HTTP 403，前端拿不到 4401（无法区分「未登录」与「服务异常」）
            await self.accept()
            await self.close(code=4401)
            return
        self._busy = False
        await self.accept()

    async def receive_json(self, content, **kwargs):
        if content.get("type") != "chat":
            return
        if self._busy:
            await self.send_json({"type": "error", "detail": "上一条消息还在处理中，请稍候"})
            return

        message = str(content.get("message") or "").strip()
        if not message:
            await self.send_json({"type": "error", "detail": "消息不能为空"})
            return
        if len(message) > 2000:
            await self.send_json({"type": "error", "detail": "消息过长（最多 2000 字）"})
            return

        thread = await self._resolve_thread(content.get("thread_id"), message)
        if thread is None:
            await self.send_json({"type": "error", "detail": "会话不存在或不属于当前用户"})
            return

        thread_id = str(thread.thread_id)
        await self.send_json({"type": "start", "thread_id": thread_id})

        self._busy = True
        try:
            async for kind, payload in ai_graph.astream_qa(message, self.scope["user"], thread_id):
                if kind == "token":
                    await self.send_json({"type": "token", "content": payload})
                elif kind == "done":
                    await self.send_json({"type": "done", **payload})
            await self._touch_thread(thread_id)
        except ai_rag.RAGConfigError as e:
            await self.send_json({"type": "error", "detail": str(e)})
        except Exception as e:  # noqa: BLE001
            logger.exception("AI 流式对话失败")
            await self.send_json(
                {"type": "error", "detail": f"AI 服务暂时不可用：{str(e)[:200]}"}
            )
        finally:
            self._busy = False

    # ---------------- 数据库操作（异步安全包装） ----------------

    @database_sync_to_async
    def _resolve_thread(self, thread_id, message):
        """校验会话归属；thread_id 为空时新建会话（标题取首条消息截断）"""
        user = self.scope["user"]
        if thread_id:
            try:
                uuid.UUID(str(thread_id))
            except (ValueError, TypeError):
                return None
            return ChatThread.objects.filter(user=user, thread_id=thread_id).first()
        title = message[:THREAD_TITLE_MAX] + ("…" if len(message) > THREAD_TITLE_MAX else "")
        return ChatThread.objects.create(user=user, title=title)

    @database_sync_to_async
    def _touch_thread(self, thread_id):
        """刷新会话 updated_at（历史列表按最近活跃排序；auto_now 需走 save）"""
        thread = ChatThread.objects.filter(thread_id=thread_id).first()
        if thread:
            thread.save(update_fields=["updated_at"])
