# Zvec Skill（高性能嵌入式向量数据库）

> **zvec** 是阿里巴巴开源的进程内（in-process）向量数据库，基于 Proxima 引擎，支持毫秒级十亿向量搜索。
>
> MCP Server: [zvec-ai/zvec-mcp-server](https://github.com/zvec-ai/zvec-mcp-server)
>
> 官方文档: [zvec.org](https://zvec.org/)

---

## 1. 概览

### 核心能力

- ⚡ **极速**: 子毫秒搜索延迟，支持十亿级向量
- 🧩 **零配置**: `pip install zvec` 即可使用，无须启动服务
- ✨ **混合向量**: 支持 dense + sparse 向量，多向量联合查询
- 🎯 **混合检索**: 语义相似度 + 结构化过滤（标量过滤）
- 📦 **跨平台**: Linux / macOS / Windows，支持 Python / Node.js / C

### 版本

- **zvec**: [v0.3.0](https://github.com/alibaba/zvec/releases/tag/v0.3.0)（2026-04-03）
- **zvec-mcp-server**: [v0.3.0](https://github.com/zvec-ai/zvec-mcp-server/releases/tag/v0.3.0)

### MCP Server 工具（17个）

| 类别 | 工具数 | 工具名 |
|---|---|---|
| Collection 管理 | 4 | `create_and_open_collection`, `open_collection`, `get_collection_info`, `destroy_collection` |
| Document 操作 | 5 | `insert_documents`, `upsert_documents`, `update_documents`, `delete_documents`, `fetch_documents` |
| 向量检索 | 2 | `vector_query`, `multi_vector_query`（支持 WEIGHTED / RRF 重排序） |
| Index 管理 | 3 | `create_index`, `drop_index`, `optimize_collection` |
| AI Embedding | 3 | `generate_dense_embedding`, `embedding_write`, `embedding_search` |

---

## 2. 安装

### MCP Server（Claude Code 集成）

Claude Code 启动时自动加载 `.mcp.json` 中的 zvec-mcp-server 配置（须重启 Claude Code 以加载新配置）。

### Python 包

```bash
pip install zvec
```

### Node.js 包

```bash
npm install @zvec/zvec
```

### 本地 Embedding（TypeScript 原生方案）

> zvec Python SDK 内置 `DefaultLocalDenseEmbedding` 等本地模型，但 causal-learner 是 TypeScript/Node.js 项目，不能直接用 Python 包。\
> 解决方案：使用 **@xenova/transformers**（Transformers.js），在 Node.js 里直接跑 ONNX embedding 模型，完全本地、不需要 API key。

```bash
# causal-learner/mcp-server 已默认依赖（package.json 已声明）
cd causal-learner/mcp-server && npm install
```

**可用模型**：

| 模型 | 维度 | 大小 | 适用场景 |
|------|------|------|---------|
| `all-MiniLM-L6-v2`（默认） | 384 | ~80MB | 快速、英文通用 |
| `all-mpnet-base-v2` | 768 | ~420MB | 高质量、英文 |
| `bge-base-zh-v1.5` | 768 | ~420MB | 中文优化 |

**直接运行示例（完整端到端）**：

```bash
# 直接运行示例文件，有 Python+zvec 环境则演示完整写入+检索流程
cd causal-learner/mcp-server
npx tsx src/core/embedding-example.ts
```

**在 causal-learner 代码中使用**：

```typescript
// 服务器启动时预热（让首次查询更快）
await warmupEmbeddings(['all-MiniLM-L6-v2']);

// 单条 embedding
const emb = await LocalEmbedding.create('all-MiniLM-L6-v2');
const vec = await emb.embed('test failed with AttributeError in test_api');
console.log(vec.length); // 384

// 批量 embedding（Observation facts 批量向量化）
const factTexts = facts.map(f =>
  `pred=${f.pred} ${Object.entries(f.args || {}).map(([k,v]) => `${k}=${v}`).join(' ')}`
);
const vecs = await emb.embedBatch(factTexts);

// zvec Python 子进程写入（见 embedding-example.ts 完整实现）
await zvecUpsert('./evidence_store', vecs.map((v, i) => ({
  id: `ev_${facts[i].obsId}`,
  embedding: v,
  fields: { pred: facts[i].pred, obs_id: facts[i].obsId },
})));
```

**示例文件说明** (`src/core/embedding-example.ts`)：

| 章节 | 内容 |
|------|------|
| 1. 基础用法 | 单条/批量 embed，向量相似度计算 |
| 2. Observation Embedding | 将 SWE-bench fact 文本化后批量生成向量 |
| 3. Embedding + zvec 完整流程 | 写入 zvec → 向量检索 → 返回结果（需 `pip install zvec`） |
| 4. 接入点说明 | `submitObservationTool()` 中的具体接入位置和代码示意 |
| 5. 启动预热 | `warmupEmbeddings()` 服务启动时调用 |

---

## 3. Python 快速上手

```python
import zvec

# 定义 Collection Schema
schema = zvec.CollectionSchema(
    name="evidence_store",
    fields=[
        zvec.FieldSchema(name="obs_id", data_type=zvec.DataType.STRING),
        zvec.FieldSchema(name="pred", data_type=zvec.DataType.STRING),
    ],
    vectors=[
        zvec.VectorSchema(
            name="embedding",
            data_type=zvec.DataType.VECTOR_FP32,
            dimension=768,
            index_param=zvec.HnswIndexParam(metric_type=zvec.MetricType.COSINE),
        ),
    ],
)

# 创建 / 打开 Collection
collection = zvec.create_and_open("./evidence_store", schema)

# 插入文档
collection.upsert(zvec.Doc(
    id="ev_001",
    vectors={"embedding": [0.1] * 768},
    fields={"obs_id": "obs_001", "pred": "test.failed"},
))

# 向量检索
results = collection.query(
    vectors=zvec.VectorQuery(field_name="embedding", vector=[0.1] * 768),
    filter="pred == 'test.failed'",
    topk=10,
)
```

---

## 4. Node.js 快速上手

```typescript
import {
  ZVecCreateAndOpen, ZVecCollectionSchema, ZVecFieldSchema,
  ZVecVectorSchema, ZVecDataType, ZVecHnswIndexParams, ZVecMetricType,
  ZVecVectorQuery
} from "@zvec/zvec";

const schema = new ZVecCollectionSchema({
  name: "evidence_store",
  fields: [
    new ZVecFieldSchema({ name: "obs_id", dataType: ZVecDataType.STRING }),
    new ZVecFieldSchema({ name: "pred", dataType: ZVecDataType.STRING }),
  ],
  vectors: [
    new ZVecVectorSchema({
      name: "embedding",
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: 768,
      indexParams: new ZVecHnswIndexParams({ metricType: ZVecMetricType.COSINE }),
    }),
  ],
});

const collection = ZVecCreateAndOpen("./evidence_store", schema);

// 向量检索
const results = collection.query(
  [
    new ZVecVectorQuery({
      fieldName: "embedding",
      vector: new Float32Array([0.1] * 768),
    }),
  ],
  { topk: 10 }
);
```

---

## 5. MCP 工具详解

### 5.1 Collection 管理

#### `create_and_open_collection`

```json
{
  "path": "./evidence_store",
  "collection_name": "evidence_store",
  "vector_fields": [
    { "name": "embedding", "data_type": "VECTOR_FP32", "dimension": 768 }
  ],
  "scalar_fields": [
    { "name": "obs_id", "data_type": "STRING", "nullable": false }
  ]
}
```

#### `get_collection_info`

获取 Collection 的 schema 和统计信息（文档数量、索引状态等）。

#### `destroy_collection`

永久删除 Collection（不可恢复）。

---

### 5.2 Document 操作

#### `upsert_documents`

插入或更新文档（幂等操作）：

```json
{
  "collection_name": "evidence_store",
  "documents": [
    {
      "id": "ev_001",
      "vectors": { "embedding": [0.1, 0.2, ...] },
      "fields": { "obs_id": "obs_001", "pred": "test.failed" }
    }
  ]
}
```

#### `fetch_documents`

按 ID 批量获取文档：

```json
{
  "collection_name": "evidence_store",
  "ids": ["ev_001", "ev_002"]
}
```

---

### 5.3 向量检索

#### `vector_query`

单向量相似度搜索，支持标量过滤：

```json
{
  "collection_name": "evidence_store",
  "field_name": "embedding",
  "vector": [0.1, 0.2, ...],
  "filter": "pred == 'test.failed'",
  "topk": 10,
  "output_fields": ["obs_id", "pred"]
}
```

#### `multi_vector_query`

多向量联合搜索 + 重排序（适合多模态检索）：

```json
{
  "collection_name": "evidence_store",
  "vectors": [
    { "field_name": "embedding", "vector": [0.1, ...] },
    { "field_name": "code_vec", "vector": [0.2, ...] }
  ],
  "reranker": { "type": "WEIGHTED", "weights": { "embedding": 0.7, "code_vec": 0.3 } },
  "topk": 10
}
```

支持重排序策略：
- `WEIGHTED` — 加权分数融合
- `RRF` — 倒数排序融合（Rank-based Fusion）

---

### 5.4 AI Embedding（需要 `OPENAI_API_KEY`）

#### `embedding_write`

自动将文本转为向量并写入 Collection：

```json
{
  "collection_name": "evidence_store",
  "field_name": "embedding",
  "documents": [
    { "id": "ev_001", "text": "test failed with AttributeError in test_api", "fields": { "pred": "test.failed" } }
  ]
}
```

#### `embedding_search`

自然语言语义搜索（自动 embedding + 向量检索）：

```json
{
  "collection_name": "evidence_store",
  "field_name": "embedding",
  "query_text": "test failures related to attribute errors",
  "topk": 10
}
```

---

## 6. 在 BestQ-A 中的应用场景

> causal-learner/mcp-server 使用 TypeScript，`LocalEmbedding`（Transformers.js）生成向量，zvec（Python via MCP 或直接 import）做向量存储检索。

### 6.1 Evidence 向量存储（TypeScript 端到端）

```typescript
import { LocalEmbedding } from './core/embedding.js';
// zvec Python 包通过子进程调用，或通过 MCP 工具

const emb = await LocalEmbedding.create('all-MiniLM-L6-v2');

// 将 Evidence 的事实描述 embedding 后存储
const factText = `obs=${evidence.obs_id} pred=${evidence.pred} error=${evidence.errorType}`;
const vec = await emb.embed(factText);

// 通过 zvec MCP 工具或直接调用 zvec Python 写入
// collection.upsert({ id: `ev_${evidence.id}`, vectors: { embedding: vec }, fields: { ... } })
```

### 6.2 Regulation 模式相似度检索

```typescript
// 将 Regulation 的 pre/eff pattern 文本化后 embedding
const regulationText = regulation.pre.map(f => f.pred).join(' ∧ ');
const vec = await emb.embed(regulationText);

// 通过 zvec 向量检索找到相似 Regulation
const results = await zvecVectorQuery({
  collection: 'regulations',
  field: 'pattern_embedding',
  vector: vec,
  topk: 5,
  filter: "status == 'confirmed'",
});
```

### 6.3 Story 语义搜索（embedding + zvec 混合检索）

```typescript
// 将 Story 摘要 embedding 后用 zvec 检索
const storyText = story.episodes.map(e => e.description).join(' ');
const vec = await emb.embed(storyText);

const results = await vectorQuery({
  collection: 'stories',
  field: 'summary_embedding',
  vector: vec,
  topk: 10,
});
```

### 6.4 冷启动建议

1. **首次使用**：`warmupEmbeddings(['all-MiniLM-L6-v2'])` 在服务启动时调用，模型下载后缓存在 `~/.cache/huggingface/`（Transformers.js ONNX 格式）
2. **中文场景**：换成 `bge-base-zh-v1.5`，维度 768
3. **zvec 写入**：通过 Python 子进程调用 zvec，或在独立的 Python 脚本里调用 zvec Python API 将向量写入 `.zvec/` 数据文件

---

## 7. 最佳实践

### 索引配置

| 场景 | 推荐索引 | 配置 |
|---|---|---|
| 小数据集（<10k） | `FLAT` | 无需参数 |
| 通用场景 | `HNSW` | `efConstruction=200, m=16` |
| 超大规模（>10M） | `IVF` | `nlist=1024` |

### 距离度量

| 度量 | 适用场景 |
|---|---|
| `COSINE` | 归一化向量，推荐首选 |
| `IP`（内积） | 未归一化的 transformer embedding |
| `L2`（欧氏距离） | 图像向量、几何特征 |

### 标量过滤

zvec 支持在向量检索时附加标量过滤条件（AND/OR 组合），但过滤字段建议建立 `INVERT` 索引以提升性能：

```python
# 创建标量索引
collection.create_index(
    field_name="pred",
    index_type="INVERT",
)
```

---

## 8. 参考链接

- GitHub: [alibaba/zvec](https://github.com/alibaba/zvec)
- MCP Server: [zvec-ai/zvec-mcp-server](https://github.com/zvec-ai/zvec-mcp-server)
- Agent Skills: [zvec-ai/zvec-agent-skills](https://github.com/zvec-ai/zvec-agent-skills)
- 文档: [zvec.org](https://zvec.org/)
- PyPI: [zvec](https://pypi.org/project/zvec/)
- npm: [@zvec/zvec](https://www.npmjs.com/package/@zvec/zvec)
