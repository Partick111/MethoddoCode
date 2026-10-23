from django.contrib import admin

from .models import ArticleLike, ArticleStats


@admin.register(ArticleStats)
class ArticleStatsAdmin(admin.ModelAdmin):
    """文章浏览量统计（列表页可按浏览量排序，快速查看热门文章）"""

    list_display = ("slug", "views", "updated_at")
    search_fields = ("slug",)
    ordering = ("-views",)


@admin.register(ArticleLike)
class ArticleLikeAdmin(admin.ModelAdmin):
    """文章点赞记录（一人一赞；可按用户 / 文章筛选）"""

    list_display = ("user", "slug", "created_at")
    list_filter = ("user",)
    search_fields = ("slug", "user__username")
