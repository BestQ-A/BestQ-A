---
kind: contract
status: draft
phase: 1
schema_version: 1
describes: "意图一致性审计报告输出模板规范"
---

# 意图一致性审计报告模板合同

> 本文档定义 `scripts/intent-alignment-audit.mjs` 及其衍生审计报告的**输出结构规范**。
> 目标：让测试 agent 的输出从"信息堆砌"升级为"结构化对话"，使代码编写 agent 能在 3 分钟内定位关键矛盾、在 10 分钟内决定下一步行动。
> 上游依赖：[intent-alignment-audit-contract.md](./intent-alignment-audit-contract.md)

---

## 1. 报告总体结构（七段式）

每份意图一致性审计报告必须包含以下七个章节，顺序不可颠倒，缺失章节视为格式不完整。

```
# 意图一致性审计报告

## 0. 执行摘要（Executive Summary）
## 1. 审计范围声明（Scope）
## 2. 意图-实现矩阵（Intent-Implementation Matrix）
## 3. 矛盾与建议详表（Contradictions & Recommendations） ← 核心章节
## 4. 对话式发现（Narrative Findings）
## 5. 过程文档信号清单（Process Signals）
## 6. 下一步行动建议（Action Items）
```

**长度建议**：
- 整体报告：500–3000 行 markdown（取决于审计范围）
- 核心章节（§3）应占全文 30%–50% 的篇幅
- 任何单一条目不得超过 40 行，超过必须拆分

---

## 2. 各章节内容规范

### §0 执行摘要（Executive Summary）

**目的**：让忙碌的代码编写者在 30 秒内了解"这次审计最值得关注的 3 件事"。

**必填内容**：
- 生成时间
- 扫描范围（commit 数、合同数、代码文件数）
- 5 个关键指标的表格

**表格格式**（严格固定）：

```markdown
| 维度 | 结果 | 趋势 |
|------|------|------|
| 合同总数 | N | vs 上次 ±n |
| 宣称对齐但未完成 (模式 1) | N | vs 上次 ±n |
| 完全沉默的缺口 (模式 5) | N | vs 上次 ±n |
| 合同-代码直接矛盾 | N | vs 上次 ±n |
| 最高优先级行动 | 一句话 | - |
```

**约束**：
- 不允许在此章节展开细节
- 趋势列必须与前一次审计报告做对比（首次审计可写 "baseline"）

---

### §1 审计范围声明（Scope）

**目的**：让读者明白"这次审计看了什么、没看什么"。

**必填内容**：
- 时间范围（commit hash 起止）
- 焦点合同列表（若有 `--focus-contract` 参数）
- 扫描的目录范围
- **显式排除项**（如 "未审计外部依赖"、"未审计可视化层"）

**格式示例**：

```markdown
- **Commit 范围**: `abc1234` .. `def5678`（共 20 个 commit）
- **焦点合同**: `v7-world-model-contract.md`、`metrics-contract.md`
- **扫描代码**: `causal-learner/mcp-server/src/core/*.ts`、`scripts/*.mjs`
- **显式排除**: `external/`、`visualization/`、`.github/workflows/`（仅在 CI 审计中扫描）
```

---

### §2 意图-实现矩阵（Intent-Implementation Matrix）

**目的**：提供一张可快速检索的"全景地图"。

**表格格式**（严格固定 6 列）：

```markdown
| 意图来源 | 合同状态 | 代码声称实现 | 对齐 commit | 实现状态 | 漂移信号 |
|----------|----------|--------------|-------------|----------|----------|
```

**列定义**：
1. **意图来源**：合同文件名（只显示 basename，完整路径在链接中）
2. **合同状态**：`current` / `draft` / `mixed` / `reference`
3. **代码声称实现**：通过 `implements` frontmatter 关联的代码文件列表，或 `(无)`
4. **对齐 commit**：commit subject 中包含 "对齐/收束/修正" 等关键词的 commit 数量
5. **实现状态**：
   - `claimed_implemented` — 代码声称实现且无过渡态信号
   - `partial_with_proxy` — 声称实现但仍有 proxy 过渡态
   - `partial_with_todo` — 声称实现但仍有 TODO/HACK
   - `no_code_claim` — 无任何代码文件认领
   - `unknown` — 无法判断
6. **漂移信号**：
   - `-` — 无漂移
   - `mode1_claimed_but_incomplete` — 宣称对齐但未完成
   - `mode2_intent_vs_compromise` — 高级意图 vs 低级妥协
   - `mode3_contract_tension` — 合同间张力，代码已偷偷修正
   - `mode4_over_implemented` — 过度实现某部分，忽略关键缺口
   - `mode5_silent_gap` — 完全沉默的缺口

**约束**：
- 每行必须能在不换行的情况下完整显示
- 若"代码声称实现"列文件数 > 2，只显示前 2 个并加注 "+N more"

---

### §3 矛盾与建议详表（Contradictions & Recommendations）

**目的**：这是报告的核心章节。不是罗列发现，而是**结构化地呈现矛盾，并给出改善项目的具体建议**。

**格式**：采用编号条目 `C1`, `C2`, `C3`... 每个条目必须包含以下 5 个固定字段：

```markdown
### C{n}: 标题（不超过 20 字）

- **矛盾点**：
  一句话概括冲突的本质。禁止只说"不一致"，必须说出"什么 vs 什么"不一致。
  
- **意图侧**：
  合同/设计文档宣称的目标。必须引用具体的文件和章节。
  
- **实现侧**：
  代码/过程文档实际呈现的状态。必须引用具体的文件和行号（若有）。
  
- **改善建议**：
  1. 第一条建议（最紧急或最有价值的行动）
  2. 第二条建议（若适用）
  3. 可选的第三条建议
  
- **优先级**：P0 / P1 / P2 / P3
```

**优先级定义**：
- **P0**：会误导未来的实现者，或导致数据/逻辑错误。建议 24 小时内处理。
- **P1**：意图-实现链断裂，影响可审计性和可传承性。建议本周内处理。
- **P2**：已知妥协或过渡态，但需要更清晰的文档化。建议两周内处理。
- **P3**：前瞻性、预防性的建议。可排入 backlog。

**条目筛选规则**：
- 最多展示 8 条 C 级条目，超过时按优先级排序，同优先级按影响范围排序
- 不得将多个无关的矛盾合并为一条
- 不得在没有具体文件/行号引用的情况下写 "代码中存在" 这类模糊表述

**改善建议的质量标准**：
- ❌ 差建议："修正代码"、"更新文档"
- ✅ 好建议："在 `metrics-contract.md` §2 的'采集方式'列增加 `get_dual_stats` 来源注释，并删除对 `get_stats` 的引用"、"给 `pipeline.ts` 头部添加 `// implements: docs/current/pipeline-contract.md` frontmatter"

---

### §4 对话式发现（Narrative Findings）

**目的**：为需要更多上下文的读者提供"为什么这个矛盾重要"的叙事。

**格式**：采用 `### 发现 #{n}: 漂移模式名称` 作为小标题。

每个发现必须包含：
- **意图来源**：具体文件
- **代码声称实现**：具体文件
- **对齐 commit**：若有
- **信号证据**：具体的代码信号（如 `proxy:` 前缀在某行）
- **问题**：以 `> **问题**:` 引用的blockquote，包含 1–3 个结构化问题

**约束**：
- 此章节的内容必须是 §3 矛盾详表的**补充说明**，不能包含 §3 中未提及的新矛盾
- 若某条矛盾在 §3 中已经写得很清楚，§4 只需写 `> 详见 **C{n}: xxx**`。

---

### §5 过程文档信号清单（Process Signals）

**目的**：展示代码中的"自我理解痕迹"——TODO、proxy、alignment-claim 等。

**格式**：按信号类型分组，每组一个三级标题。

```markdown
### todo (N 处)
- `file:line` 内容摘要
...

### proxy (N 处)
- `file:line` 内容摘要
...
```

**约束**：
- 每组最多显示 10 条，超过时写 "... 还有 N 处"
- 内容摘要不得超过 80 字符
- 必须包含精确的 `file:line` 引用

---

### §6 下一步行动建议（Action Items）

**目的**：将前面的所有发现压缩为可执行的待办清单。

**格式**：编号列表，每条必须包含动宾结构、负责者（agent 类型）、验证标准。

```markdown
1. **[P0] 修正 metrics-contract.md 的字段来源声明**
   - 负责者：文档维护 agent
   - 行动：将 §2 中 `regulations_confirmed` 的采集方式从 `get_stats` 改为 `get_dual_stats`
   - 验证：运行 `node scripts/contract-audit.mjs` 不再报 B1 blocker
```

**约束**：
- 最多列出 6 条行动建议
- 必须按优先级排序
- 每条行动必须有明确的"验证标准"（如何判断这条行动已完成）

---

## 3. 输出产物的元数据要求

每次审计必须同时产出两份文件：

1. **`artifacts/intent-alignment-audit-latest.md`**
   - 人类可读报告（遵循本模板）
   - 用于代码编写 agent 快速审阅和决策

2. **`artifacts/intent-alignment-audit-latest.json`**
   - 机器可读结构化数据
   - 必须包含以下顶层字段：
     ```json
     {
       "timestamp": "ISO 8601",
       "commits_scanned": 20,
       "contracts_scanned": 35,
       "designs_scanned": 12,
       "code_files_with_frontmatter": 5,
       "code_signals": 21,
       "matrix": [...],
       "contradictions": [
         {
           "id": "C1",
           "title": "...",
           "priority": "P1",
           "intent_source": "...",
           "implementation_source": "..."
         }
       ],
       "action_items": [...]
     }
     ```

---

## 4. 与前身格式的对比

| 维度 | 旧格式（contract-vs-impl-audit.md 式） | 新模板（本合同） |
|------|----------------------------------------|------------------|
| 核心结构 | 表格清单（偏差 #1-#N） | 七段式报告 |
| 矛盾呈现 | 简短一句话 | 意图侧 vs 实现侧的完整对照 |
| 建议质量 | "改契约"、"标记为 0%" | 精确到文件、行号、时间窗的行动 |
| 可读性 | 适合审计者自己看 | 适合编写 agent 快速决策 |
| 自动化 | 手工撰写 | 脚本自动生成 80%，人工润色 20% |

---

## 5. 附录：快速检查清单（Checklist）

发布一份意图一致性审计报告前，确认：

- [ ] §0 执行摘要包含 5 个固定指标
- [ ] §1 审计范围明确列出了"显式排除项"
- [ ] §2 意图-实现矩阵的 6 列标题完全匹配规范
- [ ] §3 至少包含 1 条、不超过 8 条 C 级矛盾条目
- [ ] §3 的每条矛盾都有 "矛盾点 / 意图侧 / 实现侧 / 改善建议 / 优先级" 五个字段
- [ ] §4 没有引入 §3 中未提及的新矛盾
- [ ] §5 的信号清单按类型分组，每组最多 10 条
- [ ] §6 的行动建议不超过 6 条，且都有验证标准
- [ ] JSON 产物包含 `contradictions` 和 `action_items` 数组
- [ ] 全文没有 "bug"、"错误"、"不对" 等审判性词汇

---

## 6. 模板示例（完整片段）

```markdown
# 意图一致性审计报告

生成时间: 2026-04-14T03:57:05.479Z
扫描 commit 数: 30
扫描代码文件数: 已扫描

## 0. 执行摘要

| 维度 | 结果 | 趋势 |
|------|------|------|
| 合同总数 | 35 | baseline |
| 宣称对齐但未完成 (模式 1) | 2 | baseline |
| 完全沉默的缺口 (模式 5) | 32 | baseline |
| 合同-代码直接矛盾 | 4 | baseline |
| 最高优先级行动 | 修正 metrics-contract.md 的僵尸声明 | - |

---

## 1. 审计范围声明

- **Commit 范围**: `fee1d33` .. `ff82b76`（共 30 个 commit）
- **焦点合同**: `metrics-contract.md`、`mechanism-class-contract.md`
- **扫描代码**: `causal-learner/mcp-server/src/core/*.ts`、`scripts/*.mjs`
- **显式排除**: `external/`、`visualization/`、`.github/workflows/`

---

## 2. 意图-实现矩阵

| 意图来源 | 合同状态 | 代码声称实现 | 对齐 commit | 实现状态 | 漂移信号 |
|----------|----------|--------------|-------------|----------|----------|
| artifact-contract.md | draft | eval.mjs, export-v7-artifacts.mjs | - | partial_with_proxy | mode1_claimed_but_incomplete |
| metrics-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |

---

## 3. 矛盾与建议详表

### C1: metrics 合同采集来源与 eval.mjs 行为矛盾

- **矛盾点**：
  合同声称 `regulations_confirmed` 来自 `get_stats`，但 `eval.mjs` 已正确将其映射到 `get_dual_stats().regulationsByStatus.confirmed`。
  
- **意图侧**：
  `metrics-contract.md` §2 是 metrics 字段的"唯一真相源"。
  
- **实现侧**：
  `scripts/eval.mjs:175-228` 的 `buildMetrics()` 函数实际从 `statsAfter.dualStats.regulationsByStatus.confirmed` 取值。
  
- **改善建议**：
  1. 立即修正 `metrics-contract.md` §2 的"采集方式"列，按真实工具拆分来源。
  2. 建立规则：当 `contract-vs-impl-audit.md` 标记 blocker 且代码已修正时，24 小时内同步修正合同。
  
- **优先级**：P0

---

## 4. 对话式发现

### 发现 #1: metrics 合同的僵尸声明（模式 3）

> 详见 **C1: metrics 合同采集来源与 eval.mjs 行为矛盾**。

---

## 5. 过程文档信号清单

### todo (14 处)
- `mechanism-instance.ts:19` | 'path_projection' // 过渡态...
...

---

## 6. 下一步行动建议

1. **[P0] 修正 metrics-contract.md**
   - 负责者：文档维护 agent
   - 行动：修正 §2 字段来源声明
   - 验证：`contract-audit.mjs` 不再报 B1 blocker
```

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。定义七段式报告结构、C 级矛盾条目格式、输出产物规范。 |
