"""统一 API 错误响应格式：{ "detail": "错误信息" }

前端（blog/src/api/client.ts）按 data.detail 读取提示文案，
因此所有非 2xx 响应必须保证携带 detail 字段。
"""

from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, ValidationError
from rest_framework.views import exception_handler as drf_exception_handler


def _flatten_validation_error(exc: ValidationError) -> str:
    """取校验错误中的第一条文案（接口只返回一条可读提示）"""
    detail = exc.detail
    if isinstance(detail, dict):
        for value in detail.values():
            if isinstance(value, (list, tuple)) and value:
                return str(value[0])
            return str(value)
    if isinstance(detail, (list, tuple)) and detail:
        return str(detail[0])
    return str(detail)


def api_exception_handler(exc, context):
    """DRF 全局异常处理：把校验错误与鉴权错误拍平为 { "detail": "..." }"""
    response = drf_exception_handler(exc, context)
    if response is None:
        # 非 DRF 异常，交给 Django 默认的 500 处理
        return None

    if isinstance(exc, ValidationError):
        response.status_code = status.HTTP_400_BAD_REQUEST
        response.data = {"detail": _flatten_validation_error(exc)}
    elif isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        response.data = {"detail": "未认证或登录已过期"}
    elif not (isinstance(response.data, dict) and "detail" in response.data):
        # 其他异常同样保证 detail 字段
        response.data = {"detail": response.data}
    return response
