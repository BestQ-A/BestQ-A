# BestQ-A 知识源选型策略

> 回答"WordNet / ConceptNet 等词库是否适配 BestQ-A，以及当代技术下怎么补知识深度"的研究备忘。
> 不是稳定合同，属于 upstream 思考，若结论落地需更新 [current/knowledge-source-contract.md](current/knowledge-source-contract.md)。
> 生成日期：2026-04-13

---

## 1. 结论先行

- **词库类资源（WordNet / ConceptNet / CSKG / BabelNet）都不是 BestQ-A 的主知识源**，它们在解"词与词的关系"，而项目要的是"报错现场 → 因 → 解"的程序行为层面知识。两者正交，堆词库补不上深度。
- **若二选一**：ConceptNet 优于 WordNet。理由是 ConceptNet 的 `Causes` / `HasPrerequisite` / `HasSubevent` 关系与 regulation 图（precondition → effect）在结构范式上同构；WordNet 的 synset/hypernym 与因果链完全正交。
- **真正的解法**：当代"薄词库 + 厚语料挖掘 + LLM 作为插值器"的混合栈。详见 §3、§4。

---

## 2. WordNet vs ConceptNet

| 维度 | WordNet | ConceptNet | 对 BestQ-A 的意义 |
|---|---|---|---|
| 范式 | 词汇语义网（synset + hypernym / hyponym / meronym） | 常识关系图（~34 种关系，含 Causes / UsedFor / HasPrerequisite） | ConceptNet 胜——与 regulation 因果语义同构 |
| 规模 | ~15.5 万词 / ~11.7 万 synset | ~800 万节点 / ~2100 万边 | ConceptNet 覆盖面更广 |
| 多语言 | 英文为主，OMW 补丁弱 | 原生 83 种语言，中英文对齐好 | ConceptNet 胜——项目中文语料多 |
| 噪声 | 低（语言学家手编） | 高（众包 + 异构来源） | WordNet 更干净，但 ConceptNet 可过滤 |
| 域匹配（代码 / 调试） | 完全不匹配 | 弱匹配（有 `python` → `programming language` 这类边，但无 stack trace 级知识） | 都不解决核心痛点 |
| 接入成本 | NLTK 一行装好，本地 ~30 MB | 本地 dump ~10 GB，或走 HTTP API | WordNet 轻得多 |

**结论**：ConceptNet 可作为 retrieval order 最外圈的辅助召回层，做 NL query 同义扩展。WordNet 放弃。

---

## 3. 真正带来深度的第一层：语料 + 挖掘

这些才是码级知识的母体，优先级远高于任何词典：

| 资源 | 价值 | 接入方式 |
|---|---|---|
| **Stack Overflow Data Dump**（XML, ~100 GB） | 2000 万问答 + accepted answer + tag，世界上最大的"报错 → 解"语料 | 离线导入 → embedding + BM25 混合索引 |
| **GitHub bug-fix pairs**（BugSwarm / ManySStuBs4J / CoCoNuT / MegaDiff） | 真实 commit 级 "before → after" 对，已经是因果结构 | 作为 SWE-bench 补丁的上游训练 / 蒸馏语料 |
| **SWE-bench Verified / Lite / Full** | 项目主 benchmark，2300+ 真实 issue-PR 对 | 已在 [bestqa-roadmap.md](bestqa-roadmap.md) Phase 0 |
| **Sentry / Rollbar 公开 error catalog** | 生产级错误栈 → 根因映射 | 参考其 grouping 算法，不必自建 |
| **CWE / CAPEC / OWASP** | 安全缺陷的官方因果本体（Parent / Child / CanPrecede 关系） | 下载 XML → 导入 atom-graph |
| **typeshed / Python docs / MDN / cppreference** | 语言级 API 契约、异常类型、副作用 | 结构化抽取 → atom 节点 |
| **CodeQL / Semgrep / ErrorProne 规则库** | 人工编写的"代码模式 ⇒ 缺陷"规则，等于免费的 regulation 种子集 | rule metadata 映射成 atom + regulation |
| **Linux man pages + POSIX** | 系统调用副作用的权威定义 | 仅在涉及系统编程 composite 时按需导入 |

---

## 4. 真正让深度可用的第二层：当代 RAG / 图检索技术

光有语料没用，得让它可检索、可组合。这是 2024–2026 的主流答案：

| 技术 | 用处 | 对 BestQ-A 的位置 |
|---|---|---|
| **Hybrid Retrieval**（BM25 + Dense） | 关键词精准 + 语义召回并存 | Phase 2 的 `kb_*` 检索层，替代 Lite 关键词匹配 |
| **Reranker**（`bge-reranker-v2`, Cohere Rerank, Jina Reranker） | 把 top-50 压到 top-5，质量决定性提升 | retrieval order 最后一关 |
| **Code Embedding**（`jina-embeddings-v2-code`, `voyage-code-3`, `nomic-embed-code`, `CodeT5+`） | 专门训过代码的 embedding，对错误栈 / 代码片段远强于通用模型 | composite 索引、solution tree 检索 |
| **GraphRAG**（Microsoft） | 社区发现 + 层级摘要，回答跨多节点的宏观问题 | composites 编译成因果社区，对接 [current/compile-promotion-contract.md](current/compile-promotion-contract.md) |
| **HippoRAG** | 用 Personalized PageRank 在知识图上走位，模拟海马体记忆 | 天然适配 atom-graph + regulation 结构，值得 PoC |
| **LightRAG** | 实体-关系双层检索，轻量版 GraphRAG | 备选方案 |
| **LLM as Relation Extractor** | 用 Claude / GPT 从 SO / GitHub 文本中自动抽 precondition / effect | 把语料变成 regulation 的关键管道 |
| **LLM-as-Judge / Self-RAG** | 检索后自我评估是否足够 | 作为 hypothesis 门控的一环 |

---

## 5. 若仍要词库，推荐优先级

仅作辅助召回，不进入 `kb_*` 表：

1. **ATOMIC 2020 / ATOMIC-10X**（AllenAI）—— 87 万条 "if-then" 常识，所有词库里**唯一在因果范式上同构**于 regulation 的。适合 NL query → 因果线索扩展。
2. **CSKG**（Commonsense Knowledge Graph）—— 整合 ConceptNet + ATOMIC + WordNet + Wikidata + Roget，统一 schema，一次装完。
3. **Wikidata**（SPARQL endpoint）—— 把 atom 里的概念（语言、库、框架名）规范化到全球 ID，避免"Python / python / CPython"碎片化。
4. **BabelNet**（商用友好的多语 WordNet + Wikipedia）—— 仅当做中文 ↔ 英文概念对齐时才值得。
5. **ConceptNet** —— 降级为 NL query expansion 辅助。
6. **WordNet** —— 放弃。

---

## 6. 对 BestQ-A 路线图的具体落位

结合 [bestqa-roadmap.md](bestqa-roadmap.md) Phase 0–5：

### Phase 2 知识编译（当前）

- 主检索层上 **hybrid retrieval (BM25 + code-embedding)** + **bge-reranker-v2**，绕过纯关键词
- [knowledge_base/composites/](knowledge_base/composites/) 保持 SSOT，embedding 和 BM25 都是派生索引
- 词库层只接 **CSKG 的 ConceptNet + ATOMIC 子集**，放 retrieval order 最外圈做 query expansion

### Phase 2.5（新增建议）：语料挖掘管道

- 离线任务：从 **Stack Overflow dump + GitHub bug-fix pairs + SWE-bench traces** 用 LLM 抽取 `{precondition, cause, effect, fix}` 四元组
- 抽出的候选先进 composites 草稿区，经人 / 自动门控后晋升为 regulation
- 这一步是把 BestQ-A 从"被动 ingest 手写知识"升级为"**主动从语料合成知识**"的关键拐点

### Phase 3 案例记忆

- case_memory 用 code-embedding 做相似案例检索（`voyage-code-3` 或 `jina-code-v2`）
- 用 **HippoRAG 风格**的 PageRank 在 atom-graph 上游走，天然复用现有 regulation 图

### Phase 3.5 code-index

- 即 GraphRAG / Aider repo map 路线，**建议结论为"接入"**
- 用 tree-sitter + LSP 建代码语义图，作为第六类存储（需扩 [current/memory-layer-contract.md](current/memory-layer-contract.md)）

### Phase 4 HITL

- GraphRAG 的社区摘要可直接喂给 dashboard 做知识云图可视化

---

## 7. 一句话

**别花力气选哪本词典，花力气把 Stack Overflow + GitHub bug-fix 语料蒸馏成 BestQ-A 自己的 regulation**。这是当前时代、也是现有架构唯一能吃得下深度的路径。词库只是管道最外圈做同义扩展，CSKG + ATOMIC 一次装完即可。

---

## 8. 未决问题

- Stack Overflow dump 的版权条款允许离线再分发吗？需核对 CC BY-SA 4.0 对派生 regulation 的影响
- LLM 关系抽取的 false positive 阈值怎么定？需要一个评估集
- HippoRAG 与现有 regulation 图的集成成本还未 PoC 验证
- code-index 第六类存储是否真的纳入 Phase 4，取决于 Phase 3.5 调研结论

---

## 9. 与既有文档的关系

| 文档 | 关系 |
|---|---|
| [bestqa-roadmap.md](bestqa-roadmap.md) | 本策略是 Phase 2 / 2.5 / 3 / 3.5 的知识源层具体化 |
| [current/knowledge-source-contract.md](current/knowledge-source-contract.md) | 若本策略的 Phase 2.5 / code-index 决定落地，需同步更新该合同 |
| [current/memory-layer-contract.md](current/memory-layer-contract.md) | code-index 接入会把五类存储扩为六类，需改此合同 |
| [external-integration.md](external-integration.md) | 语料挖掘引入的任何新 external 仓库必须先登记 SSOT |
