---
kind: contract
status: current
verified: 2026-04-13
schema_version: 1
describes: "外部仓库接入边界与 SSOT 裁决"
---

# External 仓库集成边界

> `external/` 不纳入版本控制（见根 `.gitignore`）。本文件是外部仓库的**唯一接入台账**：来源、职责、接入点、SSOT 边界。任何新增外部依赖必须先在此登记再动代码。

## 硬边界原则

1. **单一 SSOT**：同一能力（记忆 / 多 agent / 知识图谱）只允许一个仓库作为权威实现，其余必须声明"参考"或"停用"。
2. **先画边界再接代码**：禁止在未登记情况下 import 或 require `external/` 内任何模块。
3. **主干拒绝硬依赖**：`causal-learner/`、`docs/knowledge_base/`、`swe-bench-eval/` 的运行时代码**不得** `import` external/ 的包路径。集成一律走 **MCP / CLI / 生成物** 三种通道之一。
4. **数据单向流**：external → BestQ-A 可以，BestQ-A → external 仅允许以"生成输入文件"的形式，不得反向写 external 内部状态。

## 通道定义

| 通道 | 用法 | 允许的副作用 |
|------|------|-------------|
| **MCP** | 作为独立 MCP Server 被 Claude Code 调用 | 读写自身数据库 |
| **CLI** | 我们的脚本 `subprocess` 调用 external 的二进制 | 只读输入，产物写回 BestQ-A 目录 |
| **生成物** | external 产出 Markdown / JSON，人审后入库 | 写入 `docs/knowledge_base/` 或 `docs/` |

## 仓库登记表

| # | 仓库 | 来源 | 角色 | 通道 | 接入点 | SSOT 归属 |
|---|------|------|------|------|--------|-----------|
| 1 | `SimpleMem` | github.com/（记忆 MCP） | 长期记忆 / 语义召回 | MCP | [causal-learner/mcp-server/src/core/storage.ts](../causal-learner/mcp-server/src/core/storage.ts) 旁路写入 `rawRefs` | **记忆 SSOT = SimpleMem**；causal-learner 的 SQLite 只存结构化 facts / events / regulations | <!-- audit-ignore: symbol-drift: SimpleMem -->
| 2 | `AutoResearchClaw` | github.com/aiming-lab/AutoResearchClaw | 知识生产流水线 | CLI | 输入：causal-learner Event Pool 聚类导出的 `problem_class`；输出：`docs/knowledge_base/composites/**.md` 草稿 | **composites SSOT = BestQ-A 仓**；ResearchClaw 只产草稿，需人审 | <!-- audit-ignore: symbol-drift: AutoResearchClaw -->
| 3 | `llm_wiki` | github.com/（LLM 知识库） | 文档图谱可视化 | 生成物 | 输入：`docs/`、`docs/knowledge_base/`；输出：图谱 HTML / 反向链接索引 | **docs SSOT = BestQ-A 仓**；llm_wiki 只生成视图，不改写源文件 |
| 4 | `aiwg` | github.com/jmagly/aiwg | 多 agent 验证模式参考 | **仅参考**（不接入运行时） | 阅读其 stage-gate / ensemble validation 设计，用于指导 causal-learner 的 `candidate → hypothesis → confirmed` reviewer 设计 | **多 agent SSOT = OMC（`/team`、`ultrawork`）**；aiwg 不得部署 |
| 5 | `claude-code` | Anthropic 上游 | CLI 源码参考 | **仅参考** | 读 prompt 行为实现 | N/A |
| 6 | `codex` | OpenAI 上游 | CLI 源码参考 | **仅参考** | 读 harness / prompt 实现 | N/A |
| 7 | `Codex-CLI-Compact` (GrapeRoot) | graperoot.dev | 代码语义图谱 + context 预加载 | **仅参考**（暂不接入） | 对比其 "semantic graph → pack context" 路线与 causal-learner 的 AtomGraph + knowledge_index，用于启发未来的 code-level retrieval 层 | **代码检索 SSOT = causal-learner `kb_*` 表 + 未来的 code-index**；GrapeRoot 不运行，不入 prompt pipeline |
| 8 | `DeepTutor` | github.com/HKUDS/DeepTutor | Agent-native 教学系统（TutorBot / CLI / 文档 RAG） | **仅参考** | 领域（教育）与 BestQA（SWE-bench）正交，只借鉴其"持久化 agent + 对话式 quiz"交互模式，用于启发 Phase 4 HITL | 无 SSOT 冲突；禁止引入其 RAG 栈与 causal-learner 检索链并行 |
| 9 | `lich-skills` | github.com/LichAmnesia/lich-skills | spec-driven-dev + debug-hypothesis 技能集 | **仅参考** | 对比其 6 阶段 spec→plan→build→test→review→ship 与 [bestqa-roadmap.md](bestqa-roadmap.md) 的 Phase 门控，用于启发后者的 step exit criteria | **技能 SSOT = OMC 的 `/oh-my-claudecode:*` + Anthropic skills**；lich-skills 不得 install 到 `~/.claude/skills/` |
| 10 | `multica` | github.com/multica-ai/multica | 开源 managed agents 平台 | **仅参考** | 阅读其"assign task / track progress / compound skills"的管理面模式，对比 OMC `/team` 与 aiwg | **多 agent 运行时 SSOT = OMC**，同冲突 B；multica 不得部署 self-hosting 实例 |
| 11 | `opencode` | github.com/anomalyco/opencode | 开源 AI coding agent（Claude Code 同类）+ **Phase 5 长期集成目标** | **长期集成**（仅参考 → Phase 5 转 MCP+plugin 双通道） | 现阶段：读其 `packages/plugin` 的 plugin API 实现；Phase 5：BestQA 作为 opencode plugin 分发 | 宿主运行时 = opencode（与 Claude Code MCP 并列），BestQA 领域智能为插件载荷 |
| 12 | `skills` (Markdown Viewer Agent Skills) | agentskills.io | Markdown 图表 / 可视化技能包（13 个） | 生成物 | 输入：BestQA artifacts / metrics.json / knowledge graph；输出：Phase 4 dashboard 的 mermaid / 数据图、llm_wiki 视图增强 | 仅用于**生成视图资产**，不得写回 `docs/current/` 契约文档；产出落到 `website/` 或 `artifacts/<run_id>/` |
| 13 | `oh-my-openagent` | github.com/code-yeongyu/oh-my-openagent | opencode 生态的 agent 编排层（"OMC 之于 Claude Code" = "oh-my-opencode 之于 opencode"） | **架构参考** | 研究其 plugin 形态、tool 注册、context 注入 hook、session 生命周期绑定；Phase 5 的 plugin surface 设计以此为模板 | **定位正交**：oh-my-openagent 做 agent 编排，BestQA 做领域智能（因果/案例/解法树），两者共生而非竞争；BestQA 插件可被 oh-my-openagent 生态消费 |
| 14 | `zvec` | github.com/alibaba/zvec (+ `zvec-ai/zvec-mcp-server`) | 高性能嵌入式向量数据库 / 语义召回（Evidence / Regulation embedding 存储与检索） | **MCP** + Python/Node.js 包 | Skill 入口：[skills/zvec/SKILL.md](causal-learner/skills/zvec/SKILL.md)；MCP 注册：`causal-learner/.mcp.json` | **向量存储 SSOT = zvec**（`.zvec/` 数据文件）；结构化 facts SSOT = causal-learner SQLite（不变）；与 SimpleMem（对话压缩记忆）功能正交，无冲突 |

## 冲突裁决

### 冲突 A：记忆系统重叠
- **风险**：SimpleMem（向量 + 压缩）vs causal-learner SQLite（结构化 facts）vs aiwg `.aiwg/` artifacts vs OMC `.omc/state/` 四套"记忆"。
- **裁决**：
  - **长期语义记忆** → SimpleMem（唯一）
  - **因果结构化知识** → causal-learner SQLite（唯一）
  - **会话级工作状态** → OMC `.omc/`（唯一，已在 CLAUDE.md 固化）
  - **aiwg `.aiwg/`** → 禁用，其艺术品树状记忆与上述三者功能重叠且无语义召回
- **落地约束**：`submit_observation` 接入 SimpleMem 时，必须写 `memoryRef` 字段指回 SimpleMem 的记忆 ID，**禁止复制原文到 SQLite**。

### 冲突 B：多 agent 编排重叠
- **风险**：aiwg 188 agents + 50 commands vs **multica** managed agents platform vs OMC（`/team`、`ultrawork`、`ralph`）vs Claude Code 原生 subagent。
- **裁决**：**多 agent 运行时 SSOT = OMC**。aiwg 与 multica 都只作为"模式教材"，用于抽取 stage-gate / task-assign / progress-track 思路并在 OMC 上重写，不部署其 CLI 或 self-hosting 实例。
- **落地约束**：PR 若引入 `aiwg ...` / `multica ...` 命令、`.aiwg/` 目录、或 multica daemon → **直接 revert**。

### 冲突 C：知识图谱 / wiki 重叠
- **风险**：llm_wiki（Louvain 图谱）vs Foam `[[wiki-link]]`（CLAUDE.md 规范） vs `docs/knowledge_base/composites/`（结构化解法树）。
- **裁决**：
  - **源文件组织** → Foam + CLAUDE.md 规范（唯一权威）
  - **图谱视图** → llm_wiki 生成，只读
  - **解法树结构** → `docs/knowledge_base/composites/` frontmatter schema（唯一）
- **落地约束**：llm_wiki 输出只进 `docs/` 之外的目录（建议 `website/` 或 `.omc/views/`），**不得**污染源 Markdown。

### 冲突 D：代码级 context 预加载重叠
- **风险**：**GrapeRoot**（Codex-CLI-Compact）用代码语义图预加载 prompt context vs causal-learner 的 AtomGraph + `kb_*` 表 vs 未来可能的 code-index 层。两条路线都在做"选对文件进 prompt"。
- **裁决**：**代码检索 SSOT = causal-learner `kb_*` + 未来 code-index**。GrapeRoot 不运行时接入、不入 prompt pipeline；仅作为"代码级图谱召回怎么做"的设计对照。
- **落地约束**：
  - 禁止把 GrapeRoot 的 `dgc` 二进制或 daemon 挂进 BestQA 评测 harness
  - 若未来引入 code-index，必须在 [current/memory-layer-contract.md](current/memory-layer-contract.md) 的五类存储表中新增一行并定义写入禁区

### 冲突 E：技能体系重叠
- **风险**：**lich-skills**、Anthropic skills（`/oh-my-claudecode:*`）、**markdown-viewer/skills**、lich 的 spec-driven-dev loop、BestQA 自己的 `docs/knowledge_base/` 解法树——**四套"技能 / 标准动作"并存**。
- **裁决**：
  - **Agent 运行时技能** → OMC + Anthropic 上游 skills（唯一）
  - **BestQA 领域知识** → `docs/knowledge_base/composites/`（唯一）
  - **lich-skills** → 仅作为 Phase 门控 / debug loop 的设计对照，禁止 install
  - **markdown-viewer/skills** → 仅作为"生成物"通道的视图资产生成器，产物落到 `website/` 或 `artifacts/<run_id>/`，**不得**生成 `docs/current/` 下的合同文档
- **落地约束**：
  - PR 若在 `~/.claude/skills/` 安装 `lich-skills` → revert
  - PR 若用 markdown-viewer/skills 生成 `docs/current/*.md` → revert（合同文档必须人写）

### 冲突 F：宿主运行时 / 分发通道重叠
- **风险**：Phase 5 启动后 BestQA 会同时存在 **Claude Code MCP** 通道和 **opencode plugin** 通道，两者可能产生：(1) 工具命名不一致、(2) 状态存储双写冲突、(3) 配置文件格式分叉。
- **裁决**：
  - **核心能力 SSOT = causal-learner TypeScript 源码**（host-agnostic），所有宿主通道都是 thin adapter
  - **MCP 通道** = 现有 `causal-learner/mcp-server/`，不得在 adapter 层放任何业务逻辑
  - **opencode plugin 通道**（Phase 5）= 新增 `packages/bestqa-opencode-plugin/`，同样 thin adapter
  - **持久化** = 所有通道共享同一份 causal-learner SQLite + SimpleMem，禁止 per-host 建独立 db
  - **插件合同** → 待创建的 `docs/current/plugin-surface-contract.md` 唯一裁决双通道 surface
- **落地约束**：
  - 若 adapter 层出现业务逻辑（例如在 MCP tool 里重写 retrieval order）→ 立即 revert，移回核心
  - 工具命名必须对齐：`submit_observation` 在 MCP 和 plugin 里必须是同一个名字、同一个语义
  - 禁止为 opencode 分发另建一份 knowledge_base，composites 永远在 BestQ-A 仓内

## 变更流程

新增或移除 external/ 条目时：

1. 更新本文件的**仓库登记表**（含通道和 SSOT 归属）。
2. 若涉及能力重叠，必须在**冲突裁决**章节追加或更新裁决条目。
3. 更新根 `.gitignore`（通常无需改动，`external/` 已整体忽略）。
4. commit message 前缀：`docs(external): ...`。

## 参考

- 根忽略规则：[.gitignore](../.gitignore)
- causal-learner 设计：[causal-learner-design.md](causal-learner-design.md)
- BestQA SWE-bench 集成：[bestqa_benchmark_design.md](bestqa_benchmark_design.md)
- 文档组织规范：`~/.claude/CLAUDE.md` → "Markdown 文档编写规范"
