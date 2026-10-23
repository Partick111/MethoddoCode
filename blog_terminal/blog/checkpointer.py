# -*- coding: utf-8 -*-
"""Django ORM 版 LangGraph Checkpointer（AI 助手对话记忆）

将 LangGraph 图状态（checkpoint + 中间写入 writes）持久化到 Django 数据库
（ThreadCheckpoint / ThreadWrite 表），实现按 thread_id 隔离的对话记忆：
同一 thread 多次 invoke / astream 时自动恢复历史消息，跨请求、跨连接有效。

实现对齐官方 BaseCheckpointSaver 契约（存储结构参考 SqliteSaver）：
- 同步方法直接查库（get_tuple / list / put / put_writes / delete_thread）；
- 异步方法（aget_tuple / alist / aput / aput_writes / adelete_thread）用
  asgiref.sync_to_async 包装——Channels WebSocket 消费器以异步方式运行图，
  LangGraph 会优先调用异步接口，Django ORM 必须回到同步线程执行。
"""

import logging

from asgiref.sync import sync_to_async
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    PendingWrite,
    get_checkpoint_id,
    get_checkpoint_metadata,
)

from .models import ThreadCheckpoint, ThreadWrite

logger = logging.getLogger(__name__)


class DjangoCheckpointer(BaseCheckpointSaver):
    """LangGraph 检查点存储：数据落在 Django ORM（MySQL）"""

    # ---------------- 同步实现 ----------------

    def get_tuple(self, config) -> CheckpointTuple | None:
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = get_checkpoint_id(config)

        qs = ThreadCheckpoint.objects.filter(
            thread_id=thread_id, checkpoint_ns=checkpoint_ns
        )
        row = (
            qs.filter(checkpoint_id=checkpoint_id).first()
            if checkpoint_id
            else qs.order_by("-checkpoint_id").first()
        )
        if row is None:
            return None

        checkpoint = self.serde.loads_typed((row.type, bytes(row.checkpoint)))
        metadata = (
            self.serde.loads_typed((row.type, bytes(row.metadata))) if row.metadata else {}
        )
        pending_writes: list[PendingWrite] = [
            (w.task_id, w.channel, self.serde.loads_typed((w.type, bytes(w.value))))
            for w in ThreadWrite.objects.filter(
                thread_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=row.checkpoint_id,
            ).order_by("task_id", "idx")
        ]
        parent_config = (
            {
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": row.parent_checkpoint_id,
                }
            }
            if row.parent_checkpoint_id
            else None
        )
        return CheckpointTuple(
            config={
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": row.checkpoint_id,
                }
            },
            checkpoint=checkpoint,
            metadata=metadata,
            parent_config=parent_config,
            pending_writes=pending_writes,
        )

    def list(
        self,
        config,
        *,
        filter: dict | None = None,
        before=None,
        limit: int | None = None,
    ):
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        before_id = get_checkpoint_id(before) if before else None

        qs = ThreadCheckpoint.objects.filter(
            thread_id=thread_id, checkpoint_ns=checkpoint_ns
        )
        if before_id:
            qs = qs.filter(checkpoint_id__lt=before_id)
        qs = qs.order_by("-checkpoint_id")
        if limit:
            qs = qs[:limit]

        for row in qs:
            checkpoint = self.serde.loads_typed((row.type, bytes(row.checkpoint)))
            metadata = (
                self.serde.loads_typed((row.type, bytes(row.metadata))) if row.metadata else {}
            )
            # filter：按 metadata 键值筛选（小数据量下直接内存过滤）
            if filter and any(metadata.get(k) != v for k, v in filter.items()):
                continue
            pending_writes: list[PendingWrite] = [
                (w.task_id, w.channel, self.serde.loads_typed((w.type, bytes(w.value))))
                for w in ThreadWrite.objects.filter(
                    thread_id=thread_id,
                    checkpoint_ns=checkpoint_ns,
                    checkpoint_id=row.checkpoint_id,
                ).order_by("task_id", "idx")
            ]
            parent_config = (
                {
                    "configurable": {
                        "thread_id": thread_id,
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": row.parent_checkpoint_id,
                    }
                }
                if row.parent_checkpoint_id
                else None
            )
            yield CheckpointTuple(
                config={
                    "configurable": {
                        "thread_id": thread_id,
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": row.checkpoint_id,
                    }
                },
                checkpoint=checkpoint,
                metadata=metadata,
                parent_config=parent_config,
                pending_writes=pending_writes,
            )

    def put(
        self,
        config,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ):
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        type_, serialized_checkpoint = self.serde.dumps_typed(checkpoint)
        # metadata 与 checkpoint 同为 dict 序列化（json），type 复用；与 SqliteSaver 做法一致
        serialized_metadata = self.serde.dumps_typed(
            get_checkpoint_metadata(config, metadata)
        )[1]
        ThreadCheckpoint.objects.update_or_create(
            thread_id=thread_id,
            checkpoint_ns=checkpoint_ns,
            checkpoint_id=checkpoint["id"],
            defaults={
                "parent_checkpoint_id": config["configurable"].get("checkpoint_id"),
                "type": type_,
                "checkpoint": serialized_checkpoint,
                "metadata": serialized_metadata,
            },
        )
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint["id"],
            }
        }

    def put_writes(
        self,
        config,
        writes,
        task_id: str,
        task_path: str = "",
    ) -> None:
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]
        for idx, (channel, value) in enumerate(writes):
            type_, serialized_value = self.serde.dumps_typed(value)
            ThreadWrite.objects.update_or_create(
                thread_id=thread_id,
                checkpoint_ns=checkpoint_ns,
                checkpoint_id=checkpoint_id,
                task_id=task_id,
                # 特殊写入（中断 / 错误等）使用负数 idx，避免与常规写入冲突
                idx=WRITES_IDX_MAP.get(channel, idx),
                defaults={
                    "task_path": task_path,
                    "channel": channel,
                    "type": type_,
                    "value": serialized_value,
                },
            )

    def delete_thread(self, thread_id: str) -> None:
        ThreadCheckpoint.objects.filter(thread_id=thread_id).delete()
        ThreadWrite.objects.filter(thread_id=thread_id).delete()

    # ---------------- 异步实现（Channels 异步上下文中由 LangGraph 调用） ----------------

    async def aget_tuple(self, config):
        return await sync_to_async(self.get_tuple)(config)

    async def alist(self, config, *, filter=None, before=None, limit=None):
        # 先在线程池中取完整列表，再逐条异步产出（避免跨线程使用惰性查询）
        tuples = await sync_to_async(
            lambda: list(self.list(config, filter=filter, before=before, limit=limit))
        )()
        for item in tuples:
            yield item

    async def aput(self, config, checkpoint, metadata, new_versions):
        return await sync_to_async(self.put)(config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config, writes, task_id, task_path=""):
        await sync_to_async(self.put_writes)(config, writes, task_id, task_path)

    async def adelete_thread(self, thread_id):
        await sync_to_async(self.delete_thread)(thread_id)


_checkpointer: DjangoCheckpointer | None = None


def get_checkpointer() -> DjangoCheckpointer:
    """全局单例（无状态，可跨请求与图编译复用）"""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = DjangoCheckpointer()
    return _checkpointer
