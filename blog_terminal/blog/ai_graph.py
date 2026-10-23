# -*- coding: utf-8 -*-
"""LangGraph 问答编排（RAG 知识库 → 联网搜索），带对话记忆

流程（对应需求：RAG 检索不到就先表述「博客没有相应内容」，再联网搜索）：
1. retrieve   ：混合检索博客知识库（BM25 + 向量，RRF 融合）；
2. 命中阈值    ：generate   —— 基于博客文章片段生成回答（sources=博客文章）；
   未命中阈值  ：no_content —— 先表述「博客中没有找到相应内容」；
                web_search —— Bing 联网搜索；
                web_answer —— 结合搜索结果生成回答（sources=网页）。

对话记忆（LangGraph Checkpointer + Django ORM，见 checkpointer.py）：
- 图状态中的 messages（对话消息列表）按 thread_id 持久化到数据库；
- 同一 thread 多轮对话自动携带历史上下文，跨请求、跨连接有效；
- 会话元数据（标题 / 归属用户）在 ChatThread 表，消息本体由 checkpoint 双表存储。
"""

import logging
import re
import uuid
from typing import Annotated, TypedDict

import requests
from asgiref.sync import sync_to_async
from django.conf import settings
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    AnyMessage,
    HumanMessage,
    SystemMessage,
)
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from lxml import html as lxml_html

from . import ai_rag
from .checkpointer import get_checkpointer
from .models import AIConfig, ChatThread

logger = logging.getLogger(__name__)

# Bing 网页搜索（免 key，国内可直连；duckduckgo 系在当前网络环境不可达）
BING_SEARCH_URL = "https://www.bing.com/search"
WEB_MAX_RESULTS = 5
_BING_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 对话历史注入条数上限（不含系统提示）
HISTORY_LIMIT = 6

RAG_SYSTEM = """你是这个博客网站的 AI 助手。请基于下方检索到的博客文章片段回答访客的问题。
要求：
1. 只依据片段内容作答，不要编造片段之外的信息；
2. 用简体中文回答，简洁清晰，常规问题控制在 300 字内，可用分点列表；
3. 如果片段只覆盖了问题的一部分，就回答已有部分，并说明其余内容博客中暂时没有；
4. 回答中必须用《标题》形式提及你真正参考了的文章（如《RAG 检索增强入门笔记》）；
5. 片段中与问题无关的内容请完全忽略，不要强行关联。"""

WEB_SYSTEM = """你是这个博客网站的 AI 助手。访客的问题在博客中没有找到相关内容，你已通过联网搜索获得一批结果，请基于搜索结果回答访客问题。
要求：
1. 用简体中文回答，简洁清晰，控制在 400 字内；
2. 仅依据搜索结果作答，不确定的信息要说明「搜索结果中未明确」；
3. 回答自然流畅，不要逐条罗列原始链接（参考链接由界面单独展示）。"""


class QAState(TypedDict, total=False):
    """问答图状态

    messages 是对话记忆的载体：每轮 invoke 传入 [HumanMessage(本轮问题)]，
    add_messages 归并到历史之后；生成节点同步追加 AIMessage（其
    additional_kwargs 携带 sources / used_web，供历史回看恢复来源）。
    """

    messages: Annotated[list[AnyMessage], add_messages]
    docs: list
    has_context: bool
    notice: str
    web_results: list
    answer: str
    sources: list
    used_web: bool


def make_llm(base_url: str, model: str, api_key: str, timeout: int = 60) -> ChatOpenAI:
    """构建 OpenAI 兼容对话模型客户端（供问答图与设置页连通性测试复用）"""
    if not model or not base_url or not api_key:
        raise ai_rag.RAGConfigError(
            "你还没有配置大模型（模型 / 接口地址 / API Key），请点 AI 助手弹窗右上角的「设置」按钮填写"
        )
    try:
        return ChatOpenAI(
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.3,
            timeout=timeout,
            max_retries=1,
        )
    except Exception as e:  # noqa: BLE001
        raise ai_rag.RAGError(f"大模型初始化失败：{e}") from e


# ---------------- 联网搜索（Bing 网页解析） ----------------

def bing_search(query: str, max_results: int = WEB_MAX_RESULTS) -> list[dict]:
    """Bing 网页搜索：解析 b_algo 结果块 → [{title, url, snippet}]"""
    resp = requests.get(
        BING_SEARCH_URL,
        params={"q": query, "setlang": "zh-hans", "mkt": "zh-CN"},
        headers=_BING_HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    tree = lxml_html.fromstring(resp.text)
    results: list[dict] = []
    for node in tree.xpath('//li[contains(@class,"b_algo")]'):
        if len(results) >= max_results:
            break
        link = node.xpath(".//h2/a")
        if not link:
            continue
        snippet = node.xpath(".//p")
        results.append(
            {
                "title": link[0].text_content().strip(),
                "url": link[0].get("href") or "",
                "snippet": snippet[0].text_content().strip() if snippet else "",
            }
        )
    return results


# ---------------- 工具函数 ----------------

def _content_text(message) -> str:
    """从模型返回消息提取纯文本（兼容 content 为字符串或分块列表）"""
    content = getattr(message, "content", message)
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(str(item))
        return "".join(parts).strip()
    return str(content or "").strip()


def _chunk_text(chunk) -> str:
    """流式增量文本提取（不可 strip！token 前导空格承载分词间隔，去除后拼接会丢空格）"""
    content = getattr(chunk, "content", chunk)
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)
    return str(content or "")


def _current_question(state: QAState) -> str:
    """取本轮用户提问（messages 中最后一条 HumanMessage）"""
    for msg in reversed(list(state.get("messages") or [])):
        if isinstance(msg, HumanMessage):
            return _content_text(msg)
    return ""


def _dialog_messages(state: QAState) -> list:
    """取对话历史（剔除末尾本轮提问），仅保留最近 HISTORY_LIMIT 条"""
    msgs = list(state.get("messages") or [])
    if msgs and isinstance(msgs[-1], HumanMessage):
        msgs = msgs[:-1]
    return msgs[-HISTORY_LIMIT:]


def _normalize_text(text: str) -> str:
    """标题匹配归一化：去除空白与常见包裹符号，便于「回答提及了哪篇」的包含判断"""
    return re.sub(r"[\s《》「」『』【】\"'*`#\-_·]", "", text or "")


def _pick_sources(answer: str, docs: list) -> list[dict]:
    """从检索片段中挑出「回答真正提及的文章」作为来源

    默认只展示回答中以标题形式引用过的文章，避免无关片段混入来源链接；
    一篇都没提及时兜底取向量相似度最高的片段所属文章（保证答案有出处可查）。
    """
    norm_answer = _normalize_text(answer)
    picked: list[dict] = []
    seen: set[str] = set()
    for d in docs:
        slug = str(d.get("slug"))
        if slug in seen:
            continue
        title = str(d.get("title") or slug)
        norm_title = _normalize_text(title)
        if norm_title and norm_title in norm_answer:
            seen.add(slug)
            picked.append({"type": "blog", "title": title, "slug": slug})
    if not picked and docs:
        top = max(docs, key=lambda d: float(d.get("vector_sim") or 0.0))
        picked.append(
            {"type": "blog", "title": top.get("title") or str(top.get("slug")), "slug": str(top.get("slug"))}
        )
    return picked


# ---------------- 图节点 ----------------

def _retrieve_node(state: QAState) -> dict:
    res = ai_rag.hybrid_search(_current_question(state))
    return {"docs": res.get("docs") or [], "has_context": bool(res.get("has_content"))}


def _route(state: QAState) -> str:
    return "generate" if state.get("has_context") else "no_content"


def _generate_node(llm: ChatOpenAI):
    """基于博客片段生成回答（sources=博客文章）"""

    def generate(state: QAState) -> dict:
        question = _current_question(state)
        docs = state.get("docs") or []
        context = "\n\n".join(
            f"[片段{i}]《{d.get('title')}》（slug: {d.get('slug')}）\n{d.get('text')}"
            for i, d in enumerate(docs, 1)
        )
        messages = [
            SystemMessage(content=RAG_SYSTEM),
            *_dialog_messages(state),
            HumanMessage(
                content=f"博客中检索到的内容片段如下：\n\n{context}\n\n访客的问题：{question}"
            ),
        ]
        reply = llm.invoke(messages)
        answer = _content_text(reply)

        sources = _pick_sources(answer, docs)
        return {
            "answer": answer,
            "sources": sources,
            "used_web": False,
            "messages": [
                AIMessage(content=answer, additional_kwargs={"sources": sources, "used_web": False})
            ],
        }

    return generate


def _no_content_node(state: QAState) -> dict:
    """先表述「博客没有相应内容」（最终回答的前缀）"""
    return {"notice": f"关于「{_current_question(state)}」，博客中没有找到相应内容。"}


def _web_search_node(state: QAState) -> dict:
    try:
        results = bing_search(_current_question(state))
    except Exception as e:  # noqa: BLE001
        logger.warning("Bing 联网搜索失败：%s", e)
        results = []
    return {"web_results": results}


def _web_answer_node(llm: ChatOpenAI):
    """结合联网搜索结果生成回答（sources=网页；回答以「博客没有相应内容」表述开头）"""

    def web_answer(state: QAState) -> dict:
        question = _current_question(state)
        notice = state.get("notice") or "博客中没有找到相应内容。"
        results = state.get("web_results") or []
        if not results:
            answer = f"{notice}联网搜索也暂时没有找到有效信息，你可以换个说法再问我一次。"
            return {
                "answer": answer,
                "sources": [],
                "used_web": True,
                "messages": [
                    AIMessage(content=answer, additional_kwargs={"sources": [], "used_web": True})
                ],
            }
        context = "\n\n".join(
            f"[{i}] {r.get('title')}\n{r.get('snippet')}\n来源：{r.get('url')}"
            for i, r in enumerate(results, 1)
        )
        messages = [
            SystemMessage(content=WEB_SYSTEM),
            *_dialog_messages(state),
            HumanMessage(
                content=f"联网搜索结果如下：\n\n{context}\n\n访客的问题：{question}"
            ),
        ]
        summary = _content_text(llm.invoke(messages))
        answer = f"{notice}于是我联网搜索了一下，以下信息供你参考：\n\n{summary}"
        sources = [
            {"type": "web", "title": r.get("title") or r.get("url"), "url": r.get("url")}
            for r in results
        ]
        return {
            "answer": answer,
            "sources": sources,
            "used_web": True,
            "messages": [
                AIMessage(content=answer, additional_kwargs={"sources": sources, "used_web": True})
            ],
        }

    return web_answer


# ---------------- 图构建与入口 ----------------

def build_graph(llm: ChatOpenAI, checkpointer=None):
    """组装问答图：retrieve →（命中）generate /（未命中）no_content → web_search → web_answer

    传入 checkpointer 时启用对话记忆（按 thread_id 跨调用恢复 messages 历史）。
    """
    graph = StateGraph(QAState)
    graph.add_node("retrieve", _retrieve_node)
    graph.add_node("generate", _generate_node(llm))
    graph.add_node("no_content", _no_content_node)
    graph.add_node("web_search", _web_search_node)
    graph.add_node("web_answer", _web_answer_node(llm))
    graph.add_edge(START, "retrieve")
    graph.add_conditional_edges(
        "retrieve", _route, {"generate": "generate", "no_content": "no_content"}
    )
    graph.add_edge("generate", END)
    graph.add_edge("no_content", "web_search")
    graph.add_edge("web_search", "web_answer")
    graph.add_edge("web_answer", END)
    return graph.compile(checkpointer=checkpointer)

def _thread_config(thread_id) -> dict:
    return {"configurable": {"thread_id": str(thread_id)}}


def run_qa(question: str, user=None, thread_id=None) -> dict:
    """同步执行问答（REST /ai/chat/ 兜底路径），返回 {reply, sources, used_web}

    - thread_id 为空：单轮无记忆模式（不写 checkpoint）；
    - thread_id 提供：启用对话记忆，先恢复历史状态再执行本轮。
    大模型配置按调用用户（user）隔离：每个登录用户使用自己的 API Key。
    """
    cfg = AIConfig.load(user)
    llm = make_llm(cfg.llm_base_url, cfg.llm_model, cfg.llm_api_key)
    app = build_graph(llm, checkpointer=get_checkpointer() if thread_id else None)
    config = _thread_config(thread_id) if thread_id else None
    state = app.invoke({"messages": [HumanMessage(content=(question or "").strip())]}, config)
    return {
        "reply": str(state.get("answer") or ""),
        "sources": state.get("sources") or [],
        "used_web": bool(state.get("used_web")),
    }


async def astream_qa(question: str, user, thread_id):
    """异步流式执行问答（WebSocket 用），逐段产出：
    ("token", 增量文本) ... → ("done", {reply, sources, used_web})

    图全程带 checkpointer：执行结束后本轮问答已持久化，
    同一 thread_id 的下一轮自动携带历史上下文（对话记忆）。
    """
    cfg = await sync_to_async(AIConfig.load)(user)
    llm = make_llm(cfg.llm_base_url, cfg.llm_model, cfg.llm_api_key)
    app = build_graph(llm, checkpointer=get_checkpointer())
    async for mode, chunk in app.astream(
        {"messages": [HumanMessage(content=(question or "").strip())]},
        _thread_config(thread_id),
        stream_mode=["messages", "updates"],
    ):
        if mode == "messages":
            msg, meta = chunk
            # 仅转发生成节点的流式增量（AIMessageChunk）；节点完成后产出的完整
            # AIMessage 也会出现在同一流中（内容与增量重复），必须排除
            if (
                meta.get("langgraph_node") in ("generate", "web_answer")
                and isinstance(msg, AIMessageChunk)
            ):
                text = _chunk_text(msg)
                if text:
                    yield ("token", text)
        elif mode == "updates":
            for node, out in (chunk or {}).items():
                if (
                    node in ("generate", "web_answer")
                    and isinstance(out, dict)
                    and out.get("answer")
                ):
                    yield (
                        "done",
                        {
                            "reply": str(out.get("answer") or ""),
                            "sources": out.get("sources") or [],
                            "used_web": bool(out.get("used_web")),
                        },
                    )


def load_thread_messages(thread_id) -> list[dict]:
    """读取会话最新状态中的消息列表（历史记录回看 / 恢复显示）"""
    tup = get_checkpointer().get_tuple(_thread_config(thread_id))
    if not tup:
        return []
    messages = (tup.checkpoint.get("channel_values") or {}).get("messages") or []
    out: list[dict] = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            out.append({"role": "user", "content": _content_text(msg)})
        elif isinstance(msg, AIMessage):
            out.append(
                {
                    "role": "ai",
                    "content": _content_text(msg),
                    "sources": (msg.additional_kwargs or {}).get("sources") or [],
                }
            )
    return out


def delete_thread_data(user, thread_id) -> bool:
    """删除会话（校验归属用户）：先清 checkpointer 数据，再删 ChatThread 记录"""
    try:
        uuid.UUID(str(thread_id))
    except (ValueError, TypeError):
        return False
    thread = ChatThread.objects.filter(user=user, thread_id=thread_id).first()
    if not thread:
        return False
    get_checkpointer().delete_thread(str(thread_id))
    thread.delete()
    return True
