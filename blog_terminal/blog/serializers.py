"""认证相关序列化器：注册校验 + 对外用户信息（不含密码）"""

from django.contrib.auth.models import User
from rest_framework import serializers

# 与前端 AuthModal / auth store 保持一致的校验规则
USERNAME_MIN = 3
USERNAME_MAX = 20
PASSWORD_MIN = 6


class UserSerializer(serializers.ModelSerializer):
    """对外暴露的用户信息（绝不包含密码字段）

    权限模型：个人博客仅博主本人管理内容，统一以 is_superuser（超级管理员）判定，
    前端根据该字段控制写文章 / 编辑 / 删除入口显隐。
    """

    class Meta:
        model = User
        fields = ("id", "username", "is_superuser")


class RegisterSerializer(serializers.Serializer):
    """注册入参校验：用户名 3-20 字符、唯一；密码 ≥6 位"""

    username = serializers.CharField(
        min_length=USERNAME_MIN,
        max_length=USERNAME_MAX,
        trim_whitespace=True,
        error_messages={
            "blank": "请输入用户名",
            "required": "请输入用户名",
            "min_length": f"用户名需为 {USERNAME_MIN}-{USERNAME_MAX} 个字符",
            "max_length": f"用户名需为 {USERNAME_MIN}-{USERNAME_MAX} 个字符",
        },
    )
    password = serializers.CharField(
        min_length=PASSWORD_MIN,
        write_only=True,
        error_messages={
            "blank": "请输入密码",
            "required": "请输入密码",
            "min_length": f"密码至少 {PASSWORD_MIN} 位",
        },
    )

    def validate_username(self, value: str) -> str:
        # 大小写不敏感查重，避免 Admin / Abc 被视为两个账号
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("该用户名已被注册")
        return value
