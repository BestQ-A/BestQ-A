# 意图一致性审计报告

生成时间: 2026-04-15T10:21:15.749Z
扫描 commit 数: 20
扫描代码文件数: 已扫描

## 执行摘要

| 维度 | 结果 |
|------|------|
| 合同总数 | 51 |
| 宣称对齐但未完成 (模式 1) | 0 |
| 完全沉默的缺口 (模式 5) | 48 |
| metrics 僵尸声明 (模式 3) | 0 |
| v8-v11 未来意图代码信号 | 435 处 |

---

## 1. 意图-实现矩阵

| 意图来源 | 合同状态 | 代码声称实现 | 对齐 commit | 实现状态 | 漂移信号 |
|----------|----------|--------------|-------------|----------|----------|
| action-execution-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| architecture-overview.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| artifact-contract.md | draft | scripts/capture-baseline.mjs<br>scripts/eval.mjs<br>scripts/export-v7-artifacts.mjs | - | claimed_with_known_transition | - |
| civilization-memory-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| compile-promotion-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| contract-audit-contract.md | current | scripts/contract-audit.mjs | - | claimed_with_known_transition | - |
| counterfactual-scenario-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| coverage-matrix-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| derivation-chain-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| episode-event-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| epistemic-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| experiment-design-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| file-taxonomy-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| hypothesis-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| intent-alignment-audit-contract.md | draft | scripts/intent-alignment-audit.mjs | - | claimed_implemented | - |
| intent-alignment-report-template.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| knowledge-source-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| legacy-scaffolds-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| mechanism-class-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| mechanism-instance-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| mechanism-program-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| memory-layer-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| memory-layer-current.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| memory-layer-target.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| metamodel.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| metrics-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| observation-model-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| ontology-delta-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| ontology-federation-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| outcome-record-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| participatory-world-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| pipeline-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| plugin-surface-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| prediction-error-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| program-revision-proposal-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| reconstruction-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| ref-algebra-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| reporting-workflow-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| review-decision-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| run-summary-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| state-snapshot-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| stats-snapshot-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| summary-markdown-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| support-link-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| template-invariant-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| testing-strategy-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| transition-contract.md | current | (无) | - | no_code_claim | mode5_silent_gap |
| v11-world-model-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| v6-world-model-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| v7-world-model-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |
| validity-envelope-contract.md | draft | (无) | - | no_code_claim | mode5_silent_gap |

---

## 2. 矛盾与建议详表

### C3: 24 份 current 合同无任何代码文件认领 implements

- **矛盾点**：这些合同被标记为 `status: current`（已冻结），但没有代码文件通过 `implements` 声明与它们建立关联。
- **意图侧**：current 合同应该代表已经稳定、正在被执行的意图。
- **实现侧**：代码层缺少对 current 合同的显式认领，导致意图-实现的追溯链断裂。
- **改善建议**：
  1. 对 24 份 silent current 合同进行分类：有些是纯元文档（如 `file-taxonomy-contract.md`），不需要被代码实现，建议将其 `status` 改为 `reference`；
  2. 有些合同（如 `ref-algebra-contract.md`、`pipeline-contract.md`、`compile-promotion-contract.md`）的核心逻辑确实存在于代码中，建议给对应的 `.ts` 文件补一个 `// implements:` frontmatter，建立显式链接。
- **优先级**: P1

### C5: mechanism-class 合同承诺"可回放"，但核心代码仍依赖 proxy 过渡态

- **矛盾点**：`mechanism-class-contract.md` §2 定义 `MechanismClass` 是可回放的动力学模板，但 `pipeline.ts:558-561` 生成 `proxy:hyp_xxx` / `proxy:episode_xxx` 作为 `mechanism_class_ref`。
- **意图侧**：合同要求 MechanismClass 具备 `phases` 和 `replayError` 计算，能够按 phases 回放 Episode timeline。
- **实现侧**：由于真实的 `MechanismClass` 晋升路径尚未打通（多 Episode 门控、replay 一致性检查），`recordFix()` 仍然用 proxy 前缀来桥接。
- **改善建议**：
  1. 在 `mechanism-class-contract.md` 中新增 "proxy 前缀退役计划" 章节，明确三个条件：(a) MechanismInstanceStore 中 accepted 状态 ≥2 个独立 episode；(b) replayError < 0.3；(c) 通过 counterexample 检查。
  2. 当条件满足时，触发一个自动化提醒（或 CI check），提示可以开始移除 proxy 前缀。
- **优先级**: P1

---

## 3. 精选发现（对话式）

### 发现 #2: 沉默的缺口（模式 5）

**意图来源**: `docs/current/action-execution-contract.md`
**合同状态**: current
**代码声称实现**: (无)
> **问题**: 这份合同有明确的 current/draft 状态，但没有任何代码文件通过 `implements` 声称实现它。如果它确实不重要，建议将其降级为 reference；如果它应该被实现，建议至少创建一个占位符代码文件并添加 `implements` 声明。

**意图来源**: `docs/current/architecture-overview.md`
**合同状态**: current
**代码声称实现**: (无)
> **问题**: 这份合同有明确的 current/draft 状态，但没有任何代码文件通过 `implements` 声称实现它。如果它确实不重要，建议将其降级为 reference；如果它应该被实现，建议至少创建一个占位符代码文件并添加 `implements` 声明。

**意图来源**: `docs/current/civilization-memory-contract.md`
**合同状态**: draft
**代码声称实现**: (无)
> **问题**: 这份合同有明确的 current/draft 状态，但没有任何代码文件通过 `implements` 声称实现它。如果它确实不重要，建议将其降级为 reference；如果它应该被实现，建议至少创建一个占位符代码文件并添加 `implements` 声明。

---

## 3. 代码信号清单

### future-intent (435 处)
- `causal-learner/mcp-server/src/core/conflict-set.ts:51` /** 本次冲突分析关联的 TranslationFunctor ID */
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:2` * ConstitutionalLayer — v11 宪法层（基本求真约束规则集）
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:5` * ConstitutionalLayer 定义最基本的认识论约束：
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:12` import type { ProofLineage } from './proof-lineage.js';
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:36` /** 检查函数：接受 DerivationTrace 或 ProofLineage，返回 {passed, evidence} */
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:37` check: (subject: DerivationTrace | ProofLineage) => { passed: boolean; evidence:...
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:41` export interface ConstitutionalLayer {
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:55` subjectKind: 'DerivationTrace' | 'ProofLineage';
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:70` export interface CreateConstitutionalLayerInput {
- `causal-learner/mcp-server/src/core/constitutional-layer.ts:76` status?: ConstitutionalLayer['status'];
- ... 还有 425 处

### todo (15 处)
- `causal-learner/mcp-server/src/core/experiment-design-store.ts:6` * listByCounterfactual() 第一轮做内存过滤（过渡态），待后续加专用索引。
- `causal-learner/mcp-server/src/core/experiment-design-store.ts:99` * 过渡态：内存过滤（basedOnCounterfactualIds 在 JSON blob 中），待后续加专用索引
- `causal-learner/mcp-server/src/core/mechanism-instance.ts:19` | 'path_projection'  // 来自 AtomGraph 路径投影（过渡态，不得作为最终 current 语义）
- `causal-learner/mcp-server/src/core/mechanism-instance.ts:34` /** 指向 MechanismClass（允许 proxy:* 前缀表示过渡态） */
- `causal-learner/mcp-server/src/core/mechanism-program.ts:258` description:      '通过 AtomGraph 路径投影触发的默认机制程序（第一轮过渡模型）。不携带真实 phase 语义，占位用。',
- `causal-learner/mcp-server/src/core/pipeline.ts:726` // source_kind='path_projection'：当前为过渡态，路径 Atom 作为 slot 绑定代理
- `scripts/capture-baseline.mjs:40` * TODO(2026-04-13): stats-snapshot-contract.md / run-summary-contract.md 由并行 age...
- `scripts/contract-audit.mjs:136` if (/§\s*2b|目标|target|future|待建|计划/.test(s)) mode = 'draft';
- `scripts/eval.mjs:9` // TODO(2026-04-13): stats-snapshot-contract.md / run-summary-contract.md 由并行 ag...
- `scripts/eval.mjs:18` *   3. 运行 Phase 1 占位 workload：causal-learner/mcp-server/tests/test-basic.mjs
- ... 还有 5 处

### proxy (5 处)
- `causal-learner/mcp-server/src/core/mechanism-instance.ts:34` /** 指向 MechanismClass（允许 proxy:* 前缀表示过渡态） */
- `causal-learner/mcp-server/src/tests/pipeline-recordfix.test.ts:185` mechanism_class_ref: 'proxy:episode_ep_test',
- `causal-learner/mcp-server/src/tests/pipeline-recordfix.test.ts:222` mechanism_class_ref: 'proxy:test_class',
- `causal-learner/mcp-server/src/tests/pipeline-recordfix.test.ts:236` const base = { episode_id: 'ep_sm', mechanism_class_ref: 'proxy:ep_sm', bindings...
- `causal-learner/mcp-server/src/tests/pipeline-recordfix.test.ts:291` mechanism_class_ref: 'proxy:ep_clean',

---

## 4. 下一步行动建议

1. **修正 metrics-contract.md**：同步 `eval.mjs` 中已经正确的字段来源。
2. **为 proxy 前缀建立退役计划**：消除 mechanism-instance 层的模式 1 漂移。
3. **评估 v8-v11 占位符**：确认 v9-v11 实现文件是否已全面覆盖设计意图。
4. **检查沉默的合同**：确认 `mode5_silent_gap` 列表中的合同是否真的不需要代码实现。
