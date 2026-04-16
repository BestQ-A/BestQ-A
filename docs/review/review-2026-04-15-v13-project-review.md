---
kind: record
event: "2026-04-15 v13 project review"
recorded_at: 2026-04-15
immutable: true
---

# 基于 v13 的当前项目评审（2026-04-15）

> 目的：以 `docs/design_history/v13_historical_generative_ontology.md` 为参照，判断 BestQ-A 当前主线距离“历史生成本体引擎”还有多远，并明确哪些能力已具备、哪些仍只是设计史或 draft。

---

## Findings

### HIGH 1. 当前项目的语义中心仍不是 v13 的 lineage-centered 主线

当前正式语义底座仍然是五模块并列：

```text
ProblemClass / Strategy / Skill / Story / Atom-Ref-Shortcut
```

证据：

- `docs/current/metamodel.md:17` 明确写的是“五个并列模块”
- `docs/current/metamodel.md:13` 明确说明当前语义底座“不是 v6，而是 v1-v5 的收束”
- `docs/current/metamodel.md:375` 明确当前关键运行路径是
  `classify -> contextualize -> constrain subgraph -> explore`

这套中心是：

- 问题归类
- 子图约束
- 路径搜索
- Skill 执行
- Story 驱动 compile

它并不是 v13 所要求的：

- `PresentSlice`
- `ProvenanceLineage`
- `near / mid / deep cause`
- `minimalityJustification`
- `pruned branch refs`
- `branch point governance`

结论：

> 当前项目已经不是“普通检索系统”，但也还不是 v13 所定义的“把当前状态当作历史压缩态来治理”的系统。

### HIGH 1b. v13 所需对象在运行层已实现，但 current 合同仍停在 draft 阶段说明

目前 `CounterfactualScenario` 与 `ExperimentDesign` 已从“缺失”变成“可运行对象 + 可持久化 + 主线闭环”，但当前合同仍写作“无显式对象 / 未实现”。

证据：

- `causal-learner/mcp-server/src/core/counterfactual-scenario.ts:36-59` 定义了 `CounterfactualScenario`，`66-77` 有构造输入不变量，`91-175` 有推演入口 `inferCounterfactual`。
- `causal-learner/mcp-server/src/core/experiment-design.ts:15-42` 定义了 `ExperimentDesign`，`143-194` 包含构造器与闭环计算。
- `causal-learner/mcp-server/src/core/counterfactual-scenario-store.ts:66-106` 与 `causal-learner/mcp-server/src/core/experiment-design-store.ts:66-106` 提供持久化能力。
- `causal-learner/mcp-server/src/core/pipeline.ts:66-69,149-152,417-419,1062-1138` 将二者接入 pipeline 并实现 `executeExperimentDesign`（Scenario→Design→Execution）。
- 对应合同却仍是旧判断：`docs/current/counterfactual-scenario-contract.md:186-190`、`docs/current/experiment-design-contract.md:163-170`。

结论：

> 这是实现进度与合同基线不一致的高风险点：决策层可能继续把已落地功能当作“未做”，误判优先级与治理范围。

---

### HIGH 2. 当前 compile 仍以路径强化为中心，不是最小充分追溯

`compile` 的当前合同仍然是：

- 对 `correctPath` 强化
- 对 `failedPath` 削弱
- 对 compiled ref 追加 Evidence
- 视情况创建 Shortcut

证据：

- `docs/current/compile-promotion-contract.md:37` 开始定义的是“对 correctPath 强化”
- `docs/current/compile-promotion-contract.md:42` 明确 `weight = min(1.0, weight + 0.1)`
- `docs/current/compile-promotion-contract.md:104` 开始强调的是 Evidence 追加顺序

与此同时，当前“重建”的核心对象仍是 `AcceptedReconstruction`，其硬要求是：

- 必须有 `reconstructed_timeline`
- 必须有 `fidelity`

证据：

- `docs/current/reconstruction-contract.md:13` 明确“没有 AcceptedReconstruction，系统只有 retrieval，没有过程重建”
- `docs/current/reconstruction-contract.md:35` 明确“只有 ID 列表没有过程链的输出不是 Reconstruction”
- `docs/current/reconstruction-contract.md:42` 起定义 `AcceptedReconstruction`

这说明项目目前能做的是：

- 过程重建
- 机制链校验
- fidelity 审计

但还不能稳定表达 v13 所要求的：

- 为什么这条 lineage 已经“足够”
- 为什么无需继续深挖
- unresolved gaps 在哪里
- 这个 present slice 压缩了哪些失败边界与历史分支

结论：

> 当前系统已经进入“过程重建”阶段，但还没有进入“最小充分来源追溯”阶段。

### MEDIUM 6. compile 与 v13 的分叉治理闭环仍不对齐

`compile` 目前主要是对 correctPath 的权重与 mode 调整（含 failedPath 削弱），并未形成 v13 要求的 `LineageCompileProposal`、`pruned branch` 及分叉治理绑定。

证据：

- `causal-learner/mcp-server/src/core/atom-graph.ts:981-981` 的 compile 实现只在 `correctPath` 与 `failedPath` 上做权重/模式更新，未产出 lineage proposal 对象。
- `causal-learner/mcp-server/src/core/pipeline.ts:670-717` 里 compile 通过 Hypothesis 门控后直接进行支持证据补强与机制实例/重建创建。
- `docs/design_history/v13_historical_generative_ontology.md:520-563` 要求 `LineageCompileProposal`、`PrunedBranchRecord`、`HistoricalCompressionRecord`，但当前仓内未见对应可持久对象类型。

结论：

> 代码在 v13 的最小充分追溯字段上有进展，但编译闭环仍停在路径权重优化层，尚未形成分叉治理主线。

### HIGH 4. v13 的 provenance reconstruction 虽能生成，但不是可治理的持久对象

`AcceptedReconstruction` 已具备 v13 过渡字段（`nearCauseSegment/midCauseSegment/deepCauseSegment`、`minimalityJustification`、`unresolvedGaps`），但它现在不是一等、可持久检索的治理对象。

证据：

- `docs/design_history/v13_historical_generative_ontology.md:318-359` 定义了 `PresentSlice` 与 `ProvenanceLineage`，要求先验解释必须由 `provenance` 对象承载。
- `causal-learner/mcp-server/src/core/reconstruction.ts:79-110` 在 `AcceptedReconstruction` 中实现了 v13 字段雏形。
- `causal-learner/mcp-server/src/core/pipeline.ts:799-891`、`1002` 仅在 `recordFix` 里创建对象并将 `acceptedReconstructionId` 写入 `Episode`，没有 `save` 到任何 reconstruction store。
- `rg -n "AcceptedReconstructionStore|reconstruction store|ReconstructionStore" causal-learner/mcp-server/src` 仅命中 `pipeline.ts:1002` 与 `story.ts:114`，说明缺少持久化对象仓。
- `causal-learner/mcp-server/src/core/derivation-trace-store.ts` 保存的是 `reconstruction_id` 的索引和 trace 本体，但没有反查本体的 `AcceptedReconstruction` 内容。

结论：

> 当前只建立了“可返回的重建快照”，未建立 compile council 可直接 audit 的 lineage archive（对象可被查询、对比、复用）。  

### MEDIUM 7. 未来规划未形成 branch-point 治理对象链

v13 要求未来预测要回指 `BranchPoint` 并输出 `FutureBranch` 及风险治理，但执行环路仍是单步动作闭环，缺少分叉对象。

证据：

- `docs/design_history/v13_historical_generative_ontology.md:391-415` 明确 `BranchPoint` 与 `FutureBranch` 的契约接口与分叉治理目标。
- `causal-learner/mcp-server/src/core/pipeline.ts:1094-1214` 的 `executeExperimentDesign` 仍是 `ExperimentDesign.recommendedAction -> ActionExecution -> new Episode`。
- `causal-learner/mcp-server/src/core/pipeline.ts:1251-1264` 的返回值仅有 `design / execution / outcomeRecord / predictionError / programRevisionProposal`，无 branch point / branch governance 字段。
- `rg -n "branchPoint|FutureBranch|branchGovernance|informationGain" causal-learner/mcp-server/src` 无命中任何实现对象。

结论：

> 该路径可以落地“执行建议”，但不能支持“在哪个分支点激活、哪条 future branch 保留、何时剪枝回退”的治理语义。

---

### HIGH 3. v13 的 failure / pruned-branch / historical compression 资产还不存在于当前主线上

当前真实存在的记忆层，在 Phase 1 里只有 `regulation_store`。

证据：

- `docs/current/memory-layer-current.md:12` 明确写“唯一落地的存储层 regulation_store”
- `docs/current/memory-layer-current.md:22` 明确 `regulation_store` 的职责是因果规则状态机
- `docs/current/memory-layer-current.md:26` 明确禁止在 Phase 1 代码里引用 `case_memory / lesson_ledger / knowledge_index / SimpleMem`

而 v13 要求的重要上层资产，例如：

- `FailureBoundaryArchive`
- `CounterexampleCommons`
- `HistoricalCompressionRecord`
- `PrunedBranchRecord`

在当前仓内并未进入 current 主线。

证据：

- `docs/current/civilization-memory-contract.md:3` 是 `status: draft`
- `docs/current/civilization-memory-contract.md:26` 开始定义 `FailureBoundaryArchive / CounterexampleCommons`
- `docs/design_history/current-boundary-map.md:18` 仍把 v11 视为 horizon layer
- `docs/design_history/current-boundary-map.md:32` 明确 `v9-v11 layers` 仍是 deferred
- `rg -n "PresentSlice|ProvenanceLineage|PrunedBranchRecord|HistoricalCompressionRecord|LineageConvergenceRecord|LineageCompileProposal|BranchPoint|FutureBranch" docs/current causal-learner/mcp-server/src` 未命中上述 v13 关键对象（未落库）。

这意味着：

- 失败边界还不是当前可编译资产
- “被剪掉的真实分支”还没有显式对象
- “这个当下究竟压缩了哪些历史”还没有稳定记忆对象

结论：

> 以 v13 标准看，当前项目的“失败知识”还停留在 draft / 北极星层，没有进入日常运行与 compile 治理。

---

### MEDIUM 4. 当前已经出现制度化修正链，但未来治理仍不是 lineage branch governance

当前项目已经具备一条比较成熟的制度化修正链：

```text
PredictionError
  -> ProgramRevisionProposal
  -> ReviewDecision
  -> OntologyDelta
```

证据：

- `docs/current/program-revision-proposal-contract.md:16` 开始定义 `ProgramRevisionProposal`
- `docs/current/program-revision-proposal-contract.md:46` 明确链条 `PredictionError -> ProgramRevisionProposal`
- `docs/current/review-decision-contract.md:15` 开始定义 `ReviewDecision`
- `docs/current/review-decision-contract.md:47` 明确链条
  `ProgramRevisionProposal -> ReviewDecision -> OntologyDelta`
- `docs/current/review-decision-contract.md:113` 到 `:116` 显示该对象已转 current 且已验证三态

这是当前项目很强的一点，因为它已经不只是“直接改模型”，而是有了 proposal 和审查裁决层。

但从 v13 角度看，这仍然主要是在治理：

- 偏差如何导致模型修正
- 哪条 proposal 被接受/拒绝/取代

还不是在治理：

- 这条 lineage 上的哪个 branch point 值得干预
- 哪个 future branch 应激活
- 哪个 pruned branch 必须持续守住

相关未来对象目前仍未实现：

- `docs/current/counterfactual-scenario-contract.md:191` 明确 `CounterfactualScenario` “无显式对象 / 未实现”
- `docs/current/experiment-design-contract.md:168` 明确 `ExperimentDesign` “无显式对象 / 未实现”

结论：

> 当前项目已经有“制度化修正治理”，但还没有进入 v13 的“基于来源链的未来分叉治理”。

---

### MEDIUM 5. 项目的边界叙述已经部分落后于仓内现实

当前仓内已经有一部分 v10 向主线渗透的事实：

- `ObservationModel` 已把 `observerModelRef / instrumentModelRef` 纳入合同
- 新 ObservationRecord 在当前主线下必须带 `observationModelId`
- 仓内已有 `ObserverModel` 类型、store 和测试

证据：

- `docs/current/observation-model-contract.md:90` 与 `:91` 已出现 `observerModelRef / instrumentModelRef`
- `docs/current/observation-model-contract.md:145` 到 `:149` 明确当前主线下新生成的 `ObservationRecord` 必须带 `observationModelId`
- `causal-learner/mcp-server/src/core/observer-model.ts:28` 已定义 `ObserverModel`
- `causal-learner/mcp-server/src/core/observer-model-store.ts:38` 已创建 `observer_models` 表
- `causal-learner/mcp-server/src/tests/v10-participatory-world.test.ts:120` 已有 `filterObservations` 测试

但与此同时，当前边界描述仍保留“v10 零代码实现”的判断：

- `docs/current/testing-roadmap-v7-to-v11.md:15` 仍写 v10 是“零代码实现”
- `docs/design_history/current-boundary-map.md:17` 仍用该路线图支撑 v10 deferred 判断

这不代表项目已经主线化 v10；更准确的判断应是：

- v10 还没有成为 operating center
- 但它已经不是“零代码”
- 它至少已经以 `ObservationModel + ObserverModel` 的局部形式进入现实边界

结论：

> 当前仓库最大的即时治理问题，不是“是否已经是 v13”，而是“边界地图和真实实现开始出现轻度偏差”。

---

## 总判断

### 一句话结论

**BestQ-A 当前还不能被准确描述为 v13 历史生成本体引擎。**

更准确的表述是：

> 当前主线仍然是  
> `v6 lawful kernel + current metamodel semantic base + v7 reconstruction backbone + selective v8 absorption`，  
> 而不是 `v13 lineage-centered historical generative ontology`。

这与当前 boundary map 的主判断基本一致：

- `docs/design_history/current-boundary-map.md:19`
- `docs/design_history/current-boundary-map.md:21`
- `docs/design_history/current-boundary-map.md:22`

---

## 已有可继承资产

虽然当前不是 v13 主线，但并不是“离得很远、要推倒重来”。相反，仓里已经有几块对 v13 很关键的前置资产：

1. `AcceptedReconstruction + fidelity`
   这是从“检索”进入“过程重建”的硬前置。

2. `ObservationModel + ObserverModel`
   这是从“观测事实”进入“带位置的观测投影”的硬前置。

3. `PredictionError -> ProgramRevisionProposal -> ReviewDecision -> OntologyDelta`
   这是从“发现偏差”进入“制度化更新裁决”的硬前置。

4. `current-boundary-map.md`
   这是当前仓最重要的解释器之一，能防止设计史直接压扁当前主线。

---

## 最小迁移建议

如果要让项目朝 v13 演进，最小值路径不应是直接把 v13 整体主线化，而应先补三个桥接对象：

1. `PresentSlice`
   用来替代当前“Episode/Observation 的局部解释面”。

2. `AcceptedProvenanceReconstruction`
   在 `AcceptedReconstruction` 之上补
   `near/mid/deep cause + minimalityJustification + unresolvedGaps`。

3. `PrunedBranchRecord`
   先把失败边界从“抽象文明资产”下沉成“当前可引用的被剪掉分支记录”。

这三者都比直接引入整套 `Civilization Memory Layer` 更稳，也更符合仓内“先 current，再 horizon”的治理纪律。

---

## Open Questions

1. `AcceptedReconstruction` 是否准备继续扩成 provenance reconstruction，而不是另起一套平行对象？
2. `FailureBoundaryArchive` 是否应先拆成更小的 current 对象，例如 `PrunedBranchRecord`，再逐步汇总成 archive？
3. `current-boundary-map.md` 是否应该修订为“v10 局部吸收已发生，但未成为 operating center”，以避免继续用“零代码”误导下游判断？

---

## Review Basis

本次评审基于：

- `docs/design_history/v13_historical_generative_ontology.md`
- `docs/current/*` 当前合同
- `docs/design_history/current-boundary-map.md`
- `docs/review/review-2026-04-14-v8-v11-positioning.md`
- `causal-learner/mcp-server/src/core/observer-model*.ts`
- `causal-learner/mcp-server/src/tests/v10-participatory-world.test.ts`

本次未重新跑测试；判断依据是合同、边界文档、代码存在性与测试文件存在性的交叉核对。
