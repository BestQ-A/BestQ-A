---
status: draft
phase: 2
---

# Knowledge Source 合同：composites frontmatter 与 ingest 管线

> 本文档定义 `docs/knowledge_base/composites/**/*.md` 的结构化头、两段式 ingest 管线、增量缓存规则与写入边界。
> 这份合同把"被扫描的 Markdown"升级为"被编译的知识资产"，是 BestQA 摆脱关键词匹配原型的前置条件。
> 代码位置（计划）：`causal-learner/mcp-server/src/core/knowledge-ingest.ts + knowledge-index.ts`
> 上游依赖：[metamodel.md](metamodel.md)、[compile-promotion-contract.md](compile-promotion-contract.md)
> 相关设计：[../bestqa_benchmark_design.md](../bestqa_benchmark_design.md)、[../mcp_implementation_plan.md](../mcp_implementation_plan.md)

---

## 1. Frontmatter 强制字段

```yaml
---
id: kb-composite-0001
problem_class: null_pointer_in_swe
intent: "修复因属性未初始化导致的空引用错误"
signals:
  keywords: [AttributeError, NoneType, null]
  preconditions:
    - pred: exception.type
      value: AttributeError
desc: "空引用错误的标准诊断与修复流程"
tree_version: 1
sources:
  - type: swe_bench
    ref: django__django-11099
  - type: doc
    ref: ../../../docs/predicate-evolution-philosophy.md
created: 2026-04-13
updated: 2026-04-13
---
```

### 字段规则

| 字段 | 类型 | 约束 |
|------|------|------|
| `id` | string | 格式 `kb-composite-NNNN`，一经发布**不得修改**；迁移用 `deprecated_by` |
| `problem_class` | string | 机器匹配粗类，与 regulation pre 的谓词命名体系保持一致 |
| `intent` | string | 一句话人读目的，最多 120 字 |
| `signals.keywords` | list | 至少 3 个，≤ 10 个 |
| `signals.preconditions` | list | 可空，但若存在必须是合法谓词（与 AtomGraph 的 Atom 类型对齐） |
| `desc` | string | 扫描器展示用的摘要 |
| `tree_version` | int | 修改正文必须 +1，与 `updated` 同步 |
| `sources` | list | 至少 1 条；**`ref` 指向 `external/` 目录的条目拒绝编译** |
| `created` / `updated` | date | ISO 8601 |

**SSOT 约束**：`sources[].ref` 不得指向 `external/`，受 [../external-integration.md](../external-integration.md) 硬约束——外部仓库只产草稿，最终产物必须在 BestQ-A 仓内。

---

## 2. Ingest Pipeline

```
[source .md]
   ↓ Stage A: analyze
[{id, hash, frontmatter, summary, extracted_signals}]  ← 缓存命中判断
   ↓ Stage B: compile
[{id, index_entries, tree_ast, vector_optional}]
   ↓
[knowledge-index (sqlite, 表前缀 kb_*)]
```

### Stage A：分析

- 输入：单个 `.md` 源文件
- 输出：`{id, content_hash, frontmatter, summary, extracted_signals}`
- 缓存：以 `content_hash` 为 key，hash 未变则跳过 Stage B
- 失败：frontmatter schema 违反时直接报错，不进 Stage B

### Stage B：编译

- 输入：Stage A 的分析结果
- 输出：
  - `kb_nodes` 表（id、problem_class、tree_ast、source_refs）
  - `kb_signals` 表（id、signal_type、signal_value）
  - 可选 `kb_vectors` 表（id、embedding）
- 写入：**与 regulation/event 同库不同表**，表名前缀 `kb_`
- 禁止：写入 SimpleMem（SimpleMem 只存原始自然语言，不存编译产物，见 [../external-integration.md](../external-integration.md)）

---

## 3. 不变量

| 不变量 | 说明 |
|--------|------|
| 增量性 | 修改单文件只重编译该文件，其它节点不受影响 |
| 来源可追溯 | 任一 `kb_nodes` 行都可通过 `sources` 反查到原始 `.md` |
| 幂等 | 同一 `content_hash` 重复 ingest 不产生新行 |
| 表隔离 | `kb_*` 表变更不得破坏 `regulations` / `events` 表 schema |

---

## 4. 检索约束

检索调用由 [memory-layer-contract.md](memory-layer-contract.md) 的 **Retrieval Order** 规定的第 3 步调用本索引。

- 输入：`signals`（由 caller 提供）
- 返回：`kb_nodes[]`，按匹配分降序
- 必须返回 `source_refs` 以供上层做来源展示
- **禁止**跳过本合同约定的 signals 结构，强行用裸文本 fuzzy match（那是旧 Lite 原型的做法）

---

## 5. 变更流程

- 新增字段：先改本合同 → 再改代码 → 再改现有 composites 补字段
- 表结构变更：同步更新 [compile-promotion-contract.md](compile-promotion-contract.md) 的"写入路径"章节
- Schema 冻结：Phase 2 结束前必须冻结 frontmatter 字段集，冻结后 Phase 3 才能开工
