# -*- coding: utf-8 -*-
"""博客 RAG 知识库模块（LangChain 分块/嵌入 + Milvus 向量库 + 混合检索）

职责：
- 文章索引：RecursiveCharacterTextSplitter 分块 → 固定嵌入模型向量化 → 写入 Milvus；
- 文章删除：按 slug 清除该文章的全部分块（删除文章 / 重建知识库时调用）；
- 混合检索：BM25（jieba 中文分词）+ 向量检索（COSINE），RRF 融合后取 top-k；
- 状态查询：供 AI 设置弹窗展示知识库概况。

存储：Milvus 数据库 blogRAG（settings.MILVUS_DB_NAME），集合 blog_chunks（settings.AI_RAG_COLLECTION）。
嵌入模型：全站固定（settings.AI_EMBED_*，openai:text-embedding-3-small，1536 维），用户不可配置。
注意：更换嵌入模型（向量空间变化）时需「重建知识库」（drop + 全量重灌）。
"""

import functools
import logging
import re
import threading
from collections import Counter

import jieba
from django.conf import settings
from langchain.embeddings import init_embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pymilvus import DataType, MilvusClient
from rank_bm25 import BM25Okapi

logger = logging.getLogger(__name__)

# Milvus 单次 query 上限（拉全量分块用于 BM25 语料与状态统计）
_QUERY_LIMIT = 16384
# RRF 融合常数（标准取 60）
_RRF_K = 60
# 向量 / BM25 各自召回条数（融合前）
_RECALL_K = 8
# 同一文章最多保留的片段数（避免单篇文章霸榜占满上下文）
_MAX_PER_SLUG = 2
# slug 白名单：本地文章 slug 由前端生成（字母/数字/中划线/下划线），校验以防 Milvus 表达式注入
_SLUG_RE = re.compile(r"^[A-Za-z0-9_-]+$")
# BM25 停用词（疑问词 / 虚词）：不参与关键词检索，避免「都 / 有 / 哪些」等词命中无关文章，
# 把噪声推到 RRF 融合前列（实测「分块策略都有哪些」靠此类词命中了完全无关的文章）
_BM25_STOPWORDS = frozenset(
    "的 了 是 我 你 他 她 它 这 那 都 有 哪些 哪个 哪里 什么 怎么 为什么 如何 吗 呢 吧 呀 "
    "和 与 或 及 一个 一下 一次 请问 告诉 就是 然后 现在".split()
)


class RAGConfigError(Exception):
    """模型 / RAG 配置不完整（视图转为 400，引导用户到 AI 设置页填写）"""


class RAGError(Exception):
    """Milvus / 嵌入服务等运行时错误（视图转为 502）"""


def _wrap_rag_errors(action: str):
    """把底层异常（Milvus / 嵌入服务等）统一转为 RAGError，避免冒泡成 Django 500 HTML 响应"""

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except (RAGError, RAGConfigError):
                raise
            except Exception as e:  # noqa: BLE001
                raise RAGError(f"{action}失败：{str(e)[:200]}") from e

        return wrapper

    return decorator


# ---------------- 分块（RecursiveCharacterTextSplitter） ----------------

_splitter: RecursiveCharacterTextSplitter | None = None


def _get_splitter() -> RecursiveCharacterTextSplitter:
    global _splitter
    if _splitter is None:
        _splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.AI_RAG_CHUNK_SIZE,
            chunk_overlap=settings.AI_RAG_CHUNK_OVERLAP,
            # 中文分隔符优先：段落 → 句子 → 子句逐级降级切分
            separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
            keep_separator="end",
        )
    return _splitter


def split_text(text: str) -> list[str]:
    """按 RecursiveCharacterTextSplitter 分块并过滤空白块"""
    chunks = [c.strip() for c in _get_splitter().split_text(text or "")]
    return [c for c in chunks if c]


# ---------------- 模型客户端 ----------------

_embedder = None


def make_embedder():
    """构建全站固定嵌入模型（openai:text-embedding-3-small，经 acedata 代理）

    嵌入模型由服务端写死（settings.AI_EMBED_*），所有用户共用，不可在 AI 设置中修改；
    使用 LangChain 的 init_embeddings 按 "openai:model" 形式初始化（返回 OpenAIEmbeddings）。
    """
    global _embedder
    if _embedder is not None:
        return _embedder
    try:
        _embedder = init_embeddings(
            model=settings.AI_EMBED_MODEL,
            api_key=settings.AI_EMBED_API_KEY,
            base_url=settings.AI_EMBED_BASE_URL,
        )
    except Exception as e:  # noqa: BLE001
        raise RAGError(f"嵌入模型初始化失败：{e}") from e
    return _embedder


def _client() -> MilvusClient:
    """连接 Milvus 并切到 blogRAG 库（库不存在时自动创建）"""
    try:
        client = MilvusClient(uri=settings.MILVUS_URI, timeout=10)
        if settings.MILVUS_DB_NAME not in client.list_databases():
            client.create_database(db_name=settings.MILVUS_DB_NAME)
        client.use_database(db_name=settings.MILVUS_DB_NAME)
    except Exception as e:  # noqa: BLE001
        raise RAGError(f"Milvus 向量库连接失败（请确认 Milvus 已启动）：{str(e)[:160]}") from e
    return client


def _safe_slug(slug: str) -> str:
    slug = (slug or "").strip()
    if not slug or not _SLUG_RE.match(slug):
        raise RAGError(f"非法的文章 slug：{slug!r}")
    return slug


# ---------------- 集合管理 ----------------

def _collection_dim(client: MilvusClient) -> int | None:
    """读取现有集合的向量维度（集合不存在返回 None）"""
    if not client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        return None
    info = client.describe_collection(collection_name=settings.AI_RAG_COLLECTION)
    for field in info.get("fields", []) or []:
        if field.get("name") != "vector":
            continue
        params = field.get("params") or {}
        dim = params.get("dim") or field.get("dim")
        return int(dim) if dim else None
    return None


def _ensure_collection(client: MilvusClient, dim: int) -> None:
    """首次索引时按嵌入模型维度创建集合（COSINE + AUTOINDEX）"""
    if client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        return
    schema = MilvusClient.create_schema(auto_id=True, enable_dynamic_field=False)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("slug", DataType.VARCHAR, max_length=200)
    schema.add_field("title", DataType.VARCHAR, max_length=500)
    schema.add_field("chunk_index", DataType.INT64)
    schema.add_field("text", DataType.VARCHAR, max_length=8192)
    schema.add_field("vector", DataType.FLOAT_VECTOR, dim=dim)
    index_params = client.prepare_index_params()
    index_params.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
    client.create_collection(
        collection_name=settings.AI_RAG_COLLECTION, schema=schema, index_params=index_params
    )


def _delete_slug(client: MilvusClient, slug: str) -> None:
    """删除某文章的全部分块（slug 已通过白名单校验）"""
    if not client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        return
    client.delete(collection_name=settings.AI_RAG_COLLECTION, filter=f'slug == "{slug}"')


# ---------------- 索引 / 删除 ----------------

def _cosine(a: list[float], b: list[float]) -> float:
    """两向量余弦相似度（纯 Python 实现，不额外引入 numpy 依赖）"""
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def _embed_chunk_texts(embedder, title: str, chunks: list[str]) -> list[list[float]]:
    """分块文本向量化（标题拼入块首，增强主题相关性召回）

    抽样校验：acedata 偶发整批返回异常向量（与真实结果近乎正交，实测 16 条批量整批异常），
    每次批嵌入后重嵌首条比对（cos > 0.9 视为正常），异常则整批重试；
    仍异常时报错中止，避免坏向量写入知识库。
    """
    inputs = [f"{title}\n{c}" if title else c for c in chunks]
    for attempt in range(3):
        try:
            vectors = embedder.embed_documents(inputs)
        except Exception as e:  # noqa: BLE001
            raise RAGError(f"嵌入模型调用失败：{str(e)[:200]}") from e
        if not vectors:
            return vectors
        try:
            again = embedder.embed_documents([inputs[0]])[0]
        except Exception as e:  # noqa: BLE001
            raise RAGError(f"嵌入模型调用失败：{str(e)[:200]}") from e
        if _cosine(vectors[0], again) > 0.9:
            return vectors
        logger.warning("嵌入抽样校验未通过（第 %d 次），整批重试", attempt + 1)
    raise RAGError("嵌入服务连续返回异常向量（acedata 偶发问题），请稍后重试")


@_wrap_rag_errors("文章索引")
def index_article(slug: str, title: str, content: str) -> int:
    """索引单篇文章（保存 / 编辑文章后调用）

    - 分块 → 嵌入成功之后，才清除该 slug 的旧分块并写入新分块
      （嵌入失败时保留旧数据，避免「编辑失败反而丢索引」）；
    - flush 保证保存后立即可被检索到；
    - 内容为空时仅执行清除，返回 0。
    """
    slug = _safe_slug(slug)
    title = (title or "").strip()
    client = _client()

    chunks = split_text(content)
    if not chunks:
        _delete_slug(client, slug)
        _invalidate_bm25()
        return 0

    embedder = make_embedder()
    dim = _collection_dim(client)
    if dim is None:
        dim = len(embedder.embed_query("维度探测"))
        _ensure_collection(client, dim)

    vectors = _embed_chunk_texts(embedder, title, chunks)
    if vectors and len(vectors[0]) != dim:
        raise RAGError(
            f"当前嵌入模型向量维度（{len(vectors[0])}）与知识库集合（{dim}）不一致，"
            "请点击「重建知识库」后重试"
        )

    # 新向量已就绪：此时才清除旧分块（作为覆盖写入）
    _delete_slug(client, slug)
    rows = [
        {"slug": slug, "title": title or slug, "chunk_index": i, "text": chunk, "vector": vector}
        for i, (chunk, vector) in enumerate(zip(chunks, vectors))
    ]
    client.insert(collection_name=settings.AI_RAG_COLLECTION, data=rows)
    client.flush(collection_name=settings.AI_RAG_COLLECTION)
    _invalidate_bm25()
    logger.info("RAG 索引文章 %s：%d 个分块", slug, len(rows))
    return len(rows)


@_wrap_rag_errors("文章向量删除")
def delete_article(slug: str) -> int:
    """删除文章的全部向量（删除文章后调用）；返回清理的分块数"""
    slug = _safe_slug(slug)
    client = _client()
    count = 0
    if client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        rows = client.query(
            collection_name=settings.AI_RAG_COLLECTION,
            filter=f'slug == "{slug}"',
            output_fields=["chunk_index"],
            limit=_QUERY_LIMIT,
        )
        count = len(rows)
        _delete_slug(client, slug)
        client.flush(collection_name=settings.AI_RAG_COLLECTION)
    _invalidate_bm25()
    logger.info("RAG 删除文章 %s：清理 %d 个分块", slug, count)
    return count


@_wrap_rag_errors("知识库重建")
def rebuild(articles: list[dict]) -> dict:
    """全量重建知识库（原子操作）：先在内存完成全部分块 + 嵌入，全部成功后才替换集合

    - 嵌入失败（API Key 失效 / 网络故障）时不改动现有集合，保证「重建失败不清空」；
    - articles: [{slug, title, content}]（content 为纯文本）
    返回 {indexed, chunks, failed: [{slug, error}]}；failed 非空时 indexed 恒为 0，集合保持原样。
    """
    # ① 真实调用一次嵌入 API 提前验证可用（key 失效时快速失败，不触碰 Milvus）
    embedder = make_embedder()
    try:
        probe_vec = embedder.embed_query("维度探测")
    except Exception as e:  # noqa: BLE001
        raise RAGError(f"嵌入模型当前不可用（现有知识库未改动）：{str(e)[:200]}") from e

    # ② 内存中完成全部文章的分块 + 向量化（此阶段不接触 Milvus）
    prepared: list[tuple[str, str, list[str], list[list[float]]]] = []
    failed: list[dict] = []
    for article in articles or []:
        slug = str(article.get("slug") or "").strip()
        try:
            slug = _safe_slug(slug)
            title = str(article.get("title") or "").strip()
            chunks = split_text(str(article.get("content") or ""))
            if not chunks:
                continue
            vectors = _embed_chunk_texts(embedder, title, chunks)
            prepared.append((slug, title or slug, chunks, vectors))
        except Exception as e:  # noqa: BLE001
            logger.warning("RAG 重建准备文章 %s 失败：%s", slug, e)
            failed.append({"slug": slug, "error": str(e)[:160]})

    # ③ 任一篇失败即中止：旧集合原样保留，避免被清空或写入半新半旧数据
    if failed or not prepared:
        return {"indexed": 0, "chunks": 0, "failed": failed}

    # ④ 全部就绪：此时才替换集合并批量写入
    client = _client()
    if client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        client.drop_collection(collection_name=settings.AI_RAG_COLLECTION)
    _ensure_collection(client, len(probe_vec))

    rows = [
        {"slug": slug, "title": title, "chunk_index": i, "text": chunk, "vector": vector}
        for slug, title, chunks, vectors in prepared
        for i, (chunk, vector) in enumerate(zip(chunks, vectors))
    ]
    client.insert(collection_name=settings.AI_RAG_COLLECTION, data=rows)
    client.flush(collection_name=settings.AI_RAG_COLLECTION)
    _invalidate_bm25()
    logger.info("RAG 知识库重建完成：%d 篇文章 / %d 个分块", len(prepared), len(rows))
    return {"indexed": len(prepared), "chunks": len(rows), "failed": []}


# ---------------- BM25 语料（内存缓存，索引变更后失效） ----------------

_bm25_lock = threading.Lock()
_bm25_state: dict = {"bm25": None, "docs": None}


def _invalidate_bm25() -> None:
    with _bm25_lock:
        _bm25_state["bm25"] = None
        _bm25_state["docs"] = None


def _row_dict(row) -> dict:
    """Milvus query 行 → 普通 dict（兼容不同返回形态）"""
    if isinstance(row, dict):
        return dict(row)
    try:
        return dict(row)
    except Exception:  # noqa: BLE001
        return {}


def _all_chunks(client: MilvusClient) -> list[dict]:
    if not client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        return []
    rows = client.query(
        collection_name=settings.AI_RAG_COLLECTION,
        filter="id >= 0",
        output_fields=["slug", "title", "chunk_index", "text"],
        limit=_QUERY_LIMIT,
    )
    return [_row_dict(r) for r in rows]


def _get_bm25(client: MilvusClient):
    """构建（或复用缓存）BM25 索引：语料 = jieba 分词后的「标题 + 分块文本」"""
    with _bm25_lock:
        if _bm25_state["bm25"] is not None:
            return _bm25_state["bm25"], _bm25_state["docs"]
    docs = _all_chunks(client)
    if not docs:
        return None, []
    corpus = [list(jieba.cut(f"{d.get('title') or ''} {d.get('text') or ''}")) for d in docs]
    bm25 = BM25Okapi(corpus)
    with _bm25_lock:
        _bm25_state["bm25"] = bm25
        _bm25_state["docs"] = docs
    return bm25, docs


# ---------------- 混合检索（BM25 + 向量，RRF 融合） ----------------

def _get_attr(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _hit_to_doc(hit) -> dict:
    """Milvus 检索命中 → {slug,title,text,chunk_index,vector_sim}（兼容不同返回形态）"""
    entity = _get_attr(hit, "entity") or {}
    def pick(key, default=None):
        return _get_attr(entity, key, None) if _get_attr(entity, key, None) is not None else _get_attr(hit, key, default)
    return {
        "slug": pick("slug"),
        "title": pick("title"),
        "text": pick("text"),
        "chunk_index": pick("chunk_index", 0) or 0,
        "vector_sim": float(_get_attr(hit, "distance", 0.0) or 0.0),
    }


def hybrid_search(question: str, top_k: int | None = None) -> dict:
    """混合检索：向量（COSINE）+ BM25（jieba），RRF 融合

    返回 {"docs": [{slug,title,text,score,vector_sim}], "has_content": bool, "best_sim": float}
    has_content 以向量最高相似度与阈值（settings.AI_RAG_SCORE_THRESHOLD）比较判定；
    低于阈值视为「博客没有相应内容」，由问答图转入联网搜索分支。
    """
    question = (question or "").strip()
    top_k = top_k or settings.AI_RAG_TOP_K
    if not question:
        return {"docs": [], "has_content": False, "best_sim": 0.0}

    client = _client()
    if not client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        return {"docs": [], "has_content": False, "best_sim": 0.0}

    embedder = make_embedder()
    try:
        query_vec = embedder.embed_query(question)
    except Exception as e:  # noqa: BLE001
        raise RAGError(f"嵌入模型调用失败：{str(e)[:200]}") from e

    # ① 向量检索（COSINE 相似度，越大越相关；索引写入时已 flush，直接检索可见）
    vec_docs: list[dict] = []
    try:
        raw = client.search(
            collection_name=settings.AI_RAG_COLLECTION,
            data=[query_vec],
            limit=_RECALL_K,
            output_fields=["slug", "title", "text", "chunk_index"],
        )
        first = list(raw[0]) if raw and len(raw) > 0 and raw[0] is not None else []
        vec_docs = [_hit_to_doc(h) for h in first]
    except Exception as e:  # noqa: BLE001
        raise RAGError(f"向量检索失败：{str(e)[:160]}") from e

    # ② BM25 关键词检索（jieba 分词；过滤疑问词/虚词，避免噪声命中无关文章）
    bm25_docs: list[dict] = []
    tokens = [t for t in jieba.cut(question) if t.strip() and t not in _BM25_STOPWORDS]
    corpus_docs: list[dict] = []
    try:
        bm25, corpus_docs = _get_bm25(client)
        if bm25 is not None and tokens:
            scores = bm25.get_scores(tokens)
            order = sorted(range(len(scores)), key=lambda i: float(scores[i]), reverse=True)[:_RECALL_K]
            for idx in order:
                if float(scores[idx]) <= 0:
                    continue
                row = corpus_docs[idx]
                bm25_docs.append(
                    {
                        "slug": row.get("slug"),
                        "title": row.get("title"),
                        "text": row.get("text"),
                        "chunk_index": row.get("chunk_index", 0),
                        "vector_sim": None,
                    }
                )
    except RAGError:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("BM25 检索失败（已跳过关键词通道）：%s", e)

    # ③ 英文/数字专名覆盖检查：查询中的英文/数字词（如软件名 cubase）未出现在知识库
    #    「主题区」（标题 + 块首 80 字）时，直接判「博客没有相应内容」——即使向量偶然相似
    #    （实测 "cubase的基本使用" 与剪映文章相似度 0.47，属音视频工具的笼统相似）；
    #    仅正文深处顺带提及的词不算主题（如 hello-world 正文一句「后续对接 Django」）；
    #    中文词存在同义表达（如「分块」≈「切分」），不做此检查，交给相似度阈值判断。
    ascii_tokens = [t for t in tokens if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]*", t)]
    if ascii_tokens and corpus_docs:
        corpus_head = " ".join(
            f"{d.get('title') or ''} {(d.get('text') or '')[:80]}" for d in corpus_docs
        ).lower()
        if not any(t.lower() in corpus_head for t in ascii_tokens):
            best_sim = max((float(d.get("vector_sim") or 0.0) for d in vec_docs), default=0.0)
            return {"docs": [], "has_content": False, "best_sim": round(best_sim, 4)}

    # ④ RRF 融合（slug + chunk_index 相同视为同一条分块）
    def _key(doc: dict) -> tuple:
        return (str(doc.get("slug")), int(doc.get("chunk_index") or 0))

    fused: dict[tuple, dict] = {}
    for rank, doc in enumerate(vec_docs):
        item = fused.setdefault(_key(doc), {**doc, "score": 0.0})
        item["vector_sim"] = doc.get("vector_sim")
        item["score"] += 1.0 / (_RRF_K + rank + 1)
    for rank, doc in enumerate(bm25_docs):
        item = fused.setdefault(_key(doc), {**doc, "score": 0.0})
        item["score"] += 1.0 / (_RRF_K + rank + 1)

    ranked = sorted(fused.values(), key=lambda d: d["score"], reverse=True)

    # 同一文章最多取 _MAX_PER_SLUG 条，避免单篇霸榜
    picked: list[dict] = []
    per_slug: Counter = Counter()
    for doc in ranked:
        slug_key = str(doc.get("slug"))
        if per_slug[slug_key] >= _MAX_PER_SLUG:
            continue
        per_slug[slug_key] += 1
        picked.append(doc)
        if len(picked) >= top_k:
            break

    best_sim = max((d.get("vector_sim") or 0.0 for d in vec_docs), default=0.0)
    has_content = best_sim >= settings.AI_RAG_SCORE_THRESHOLD
    return {"docs": picked, "has_content": has_content, "best_sim": round(best_sim, 4)}


# ---------------- 状态 ----------------

def get_status() -> dict:
    """知识库状态（供 AI 设置弹窗展示）：文章数 / 分块数 / 已索引 slug 列表"""
    try:
        client = _client()
    except RAGError as e:
        return {
            "milvus_ok": False,
            "collection_exists": False,
            "chunks": 0,
            "articles": 0,
            "slugs": [],
            "detail": str(e),
        }
    if not client.has_collection(collection_name=settings.AI_RAG_COLLECTION):
        return {"milvus_ok": True, "collection_exists": False, "chunks": 0, "articles": 0, "slugs": []}
    try:
        rows = client.query(
            collection_name=settings.AI_RAG_COLLECTION,
            filter="id >= 0",
            output_fields=["slug"],
            limit=_QUERY_LIMIT,
        )
    except Exception as e:  # noqa: BLE001
        return {
            "milvus_ok": False,
            "collection_exists": True,
            "chunks": 0,
            "articles": 0,
            "slugs": [],
            "detail": str(e)[:160],
        }
    counter = Counter(str(_row_dict(r).get("slug")) for r in rows)
    return {
        "milvus_ok": True,
        "collection_exists": True,
        "chunks": len(rows),
        "articles": len(counter),
        "slugs": sorted(counter.keys()),
    }
