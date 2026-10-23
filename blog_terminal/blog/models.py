"""博客内容统计模型：浏览量 + 点赞（一人一赞）

说明：
- 文章内容本身由前端本地/mock 提供（本期未入库），此处仅按 slug 聚合互动数据；
- 点赞以「用户 + slug」唯一约束保证「一个用户只能赞一次」，重复请求幂等返回；
- 浏览量存于 ArticleStats.views，进入详情页（GET 之外的 POST view）时 +1。
"""

import uuid

from django.contrib.auth.models import User
from django.db import models


class ArticleStats(models.Model):
    """文章浏览量统计（按 slug 唯一；点赞数由 ArticleLike 聚合）"""

    slug = models.CharField("文章标识", max_length=200, unique=True)
    views = models.PositiveIntegerField("浏览量", default=0)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "文章统计"
        verbose_name_plural = "文章统计"
        ordering = ["-views"]

    def __str__(self) -> str:
        return f"{self.slug} (views={self.views})"


class AIConfig(models.Model):
    """AI 助手配置（按用户隔离，一人一条）

    大模型（LLM）：每个登录用户配置自己的 API Key，对话消耗各自额度；
    嵌入模型：全站固定（settings.AI_EMBED_*，openai:text-embedding-3-small），不在此表配置；
    接口地址（base_url）由前端按所选模型自动生成，也支持手动覆盖；
    api_key 明文存于本地开发库，读接口（GET）一律打码返回。
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_config",
        verbose_name="用户",
    )
    llm_provider = models.CharField("大模型厂商", max_length=50, blank=True, default="")
    llm_model = models.CharField("大模型名称", max_length=100, blank=True, default="")
    llm_base_url = models.CharField("大模型接口地址", max_length=300, blank=True, default="")
    llm_api_key = models.CharField("大模型 API Key", max_length=300, blank=True, default="")
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "AI 助手配置"
        verbose_name_plural = "AI 助手配置"

    def __str__(self) -> str:
        return f"用户#{self.user_id} 的 AI 配置（LLM={self.llm_model or '未配置'}）"

    @classmethod
    def load(cls, user) -> "AIConfig":
        """读取指定用户的配置（不存在时创建空记录）"""
        obj, _ = cls.objects.get_or_create(user=user)
        return obj

    @staticmethod
    def mask_key(key: str) -> str:
        """API Key 打码：保留首尾各 4 位供前端展示；前端原样回传时视为「未修改」"""
        if not key:
            return ""
        if len(key) <= 10:
            return "******"
        return f"{key[:4]}******{key[-4:]}"


class ArticleLike(models.Model):
    """文章点赞记录：同一用户对同一文章仅能点赞一次（数据库唯一约束保证）"""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="article_likes",
        verbose_name="用户",
    )
    slug = models.CharField("文章标识", max_length=200, db_index=True)
    created_at = models.DateTimeField("点赞时间", auto_now_add=True)

    class Meta:
        verbose_name = "点赞记录"
        verbose_name_plural = "点赞记录"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "slug"], name="uniq_article_like_user_slug"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user.username} → {self.slug}"


class ChatThread(models.Model):
    """AI 对话会话（历史记录列表的基本单位）

    - thread_id：UUID，同时作为 LangGraph checkpointer 的 thread_id（对话记忆按此隔离）；
    - title：取首条用户消息截断生成；
    - 消息内容本身由 checkpointer（ThreadCheckpoint / ThreadWrite）持久化，不在本表。
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="ai_threads",
        verbose_name="用户",
    )
    thread_id = models.UUIDField("会话标识", default=uuid.uuid4, unique=True, editable=False)
    title = models.CharField("标题", max_length=120, default="新对话")
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "AI 会话"
        verbose_name_plural = "AI 会话"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"用户#{self.user_id}：{self.title}"


class ThreadCheckpoint(models.Model):
    """LangGraph checkpoint 存储（Django ORM 版 Checkpointer 的核心表）

    与官方 SqliteSaver 表结构对齐：checkpoint / metadata 存 serde.dumps_typed()
    产生的二进制序列化数据（JsonPlusSerializer，支持 LangChain 消息对象）。
    """

    thread_id = models.CharField("线程标识", max_length=64)
    checkpoint_ns = models.CharField("命名空间", max_length=255, default="", blank=True)
    checkpoint_id = models.CharField("检查点标识", max_length=64)
    parent_checkpoint_id = models.CharField("父检查点", max_length=64, null=True, blank=True)
    type = models.CharField("序列化类型", max_length=32)
    checkpoint = models.BinaryField("检查点数据")
    metadata = models.BinaryField("元数据", null=True, blank=True)
    created_at = models.DateTimeField("创建时间", auto_now_add=True)

    class Meta:
        verbose_name = "AI 检查点"
        verbose_name_plural = "AI 检查点"
        constraints = [
            models.UniqueConstraint(
                fields=["thread_id", "checkpoint_ns", "checkpoint_id"],
                name="uniq_thread_checkpoint",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.thread_id}/{self.checkpoint_id}"


class ThreadWrite(models.Model):
    """LangGraph 中间写入（task 级别的 channel 写入，与 checkpoint 配套）"""

    thread_id = models.CharField("线程标识", max_length=64)
    checkpoint_ns = models.CharField("命名空间", max_length=255, default="", blank=True)
    checkpoint_id = models.CharField("检查点标识", max_length=64)
    task_id = models.CharField("任务标识", max_length=64)
    task_path = models.CharField("任务路径", max_length=255, default="", blank=True)
    idx = models.IntegerField("序号")
    channel = models.CharField("通道", max_length=100)
    type = models.CharField("序列化类型", max_length=32)
    value = models.BinaryField("写入数据")

    class Meta:
        verbose_name = "AI 写入记录"
        verbose_name_plural = "AI 写入记录"
        constraints = [
            models.UniqueConstraint(
                fields=["thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx"],
                name="uniq_thread_write",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.thread_id}/{self.task_id}#{self.idx}"
