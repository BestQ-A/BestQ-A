---
kind: contract
status: draft
phase: 1
schema_version: 1
describes: "意图一致性审计协议"
---

# 意图一致性审计合同：测试工程师作为编写者的对话者

> 本文档定义一种新型测试验证范式：**测试 agent 不是代码的审判者，而是代码编写者的对话者与印证者**。
> 核心任务：通过理解项目的设计意图，对照代码编写者的过程文档，发现"意图漂移"（intention drift），并帮助编写者改善项目。
> 上游依赖：[testing-strategy-contract.md](./testing-strategy-contract.md)、[file-taxonomy-contract.md](./file-taxonomy-contract.md)

---

## 1. 核心哲学：从"找错"到"印证"

传统测试：
```text
输入 → 代码 → 输出 ≠ 预期 → 报 bug
```

意图一致性审计：
```text
设计意图（design_history + contracts + roadmap）
    ↓
代码编写者的自我理解（commit message + code comments + implements）
    ↓
测试 agent 进行对照 → 发现"意图漂移"或"理解空白"
    ↓
不是报 bug，而是提出问题、建议改善方向、帮助编写者校准
```

### 1.1 什么是一次好的意图一致性审计

**不是**：
- "这里少了一个分号"（这是 Linter 的事）
- "这个函数返回了 undefined"（这是单元测试的事）
- "文档写错了"（这是 spell-check 的事）

**而是**：
- "v7 的设计意图是'经历不是聊天记录，而是世界采样'，但代码中的 `ObservationRecord` 仍然缺少 `perspectiveId` 字段，这意味着系统仍然默认了一个中性观察者。这是否是有意的妥协？"
- "v9 的合同要求'统一不是默认，统一是需要被证明的结果'，但 `OntologyModel.sharedKernelContribution` 的默认值为 `false`，且没有配套的验证流程。这是否说明 v9 的联邦层还处于占位状态？"
- "commit message 说'对齐上游合同'，但代码中的 `mechanism_class_ref` 仍然使用 `proxy:*` 前缀，而 `mechanism-class-contract.md` 要求它最终应指向真实的 `MC_*` ID。这是否是一次未完成的对齐？"

### 1.2 测试工程师的新角色

```text
意图考古学家（Intent Archaeologist）
    → 挖掘设计文档中的深层意图

过程文档读者（Process Document Reader）
    → 理解代码编写者认为自己在做什么

对话发起者（Dialogue Initiator）
    → 发现矛盾时不直接下结论，而是提出结构化问题

改善建议者（Improvement Advisor）
    → 给出"如何更好地实现意图"的方向，而非仅指出错误
```

---

## 2. 意图文档层：理解"为什么"

意图一致性审计的第一步是系统性地读取以下文档，提炼出**不可妥协的设计意图**。

### 2.1 设计历史（Design History）

来源：`docs/design_history/v*.md`

读取重点：
- 每个版本的**核心主张**（通常在前3节）
- 上一版本"已经解决了什么"和"还缺什么"
- 版本演化的**口号**和**最终判断**

提取方法：
```text
对每个版本 vN：
  核心主张 = vN 的"一句定义"
  新增层 = vN 相对于 vN-1 新增了什么
  遗留缺口 = vN 承认的"还缺的硬骨头"
```

### 2.2 当前合同（Current Contracts）

来源：`docs/current/*-contract.md`

读取重点：
- `describes` 字段：这份合同管什么
- `status` 字段：current / draft / mixed
- §"硬约束"/"不变量"/"铁律"章节
- TypeScript interface 定义

提取方法：
```text
对每份合同：
  若 status = current → 视为已冻结的意图
  若 status = draft → 视为正在形成的意图，允许代码不完全对齐
  若 status = mixed → 需要按章节区分 current 和 draft 部分
```

### 2.3 路线图（Roadmap）

来源：`docs/bestqa-roadmap.md`

读取重点：
- 当前处于哪个 Phase
- 每个 Phase 的 Exit Criteria
- 哪些功能是"当前 Phase 必须实现的"，哪些是"下游 Phase 才需要的"

### 2.4 元模型（Metamodel）

来源：`docs/current/metamodel.md`

读取重点：
- 五个并列模块的边界
- 系统不变量（图是唯一写模型、Regulation 只是读视图等）
- 写权限与失效规则

---

## 3. 过程文档层：理解"编写者认为自己在做什么"

意图一致性审计的第二步是收集代码编写者留下的"自我理解痕迹"。

### 3.1 Commit Message

来源：`git log`

读取重点：
- commit message 是否引用了合同或设计文档？（如 "v7 §10 条件 5"）
- commit message 的自我描述是否与变更内容一致？
- 是否有 "对齐"、"收紧"、"收束"、"修正" 等信号词，暗示这是一次意图校准？

### 3.2 代码中的伪 Frontmatter（`// ---` 注释）

来源：`.mjs` / `.ts` 文件头部

读取重点：
- `kind: code`
- `implements:` 指向哪个合同
- `also related:` 引用的相关合同

### 3.3 代码内联注释中的 `implements:` / `upstream:` / `downstream:`

来源：代码块上方的 JSDoc / 行内注释

读取重点：
- 该代码块声称实现了哪个合同的哪一节？
- 是否有 "TODO"、"HACK"、"proxy"、"过渡态" 等信号词？

### 3.4 审计记录与偏差盘点

来源：`docs/current/contract-vs-impl-audit.md`

读取重点：
- 哪些是 "blocker"、哪些是 "major"、哪些是 "minor"
- 哪些是 "信息偏差"（契约写了计划但代码不存在），哪些是 "语义偏差"（契约和代码存在但语义不一致）

### 3.5 覆盖率矩阵

来源：`docs/current/coverage-matrix-contract.md`（如果存在）

读取重点：
- 哪些合同有代码实现覆盖？
- 哪些合同的实现覆盖率低于预期？

---

## 4. 对照方法：发现意图漂移的五种模式

### 模式 1：宣称对齐 vs 实际未完成（Claimed Alignment but Incomplete）

**信号**：
- commit message 说 "对齐了 X 合同"，但代码中仍然有 `proxy:*`、TODO、或缺失字段
- 代码的 `implements` 指向了 current contract，但 contract 中的某个关键字段在代码中不存在

**例子**：
```text
commit: "对齐新版 mechanism-instance 合约"
代码: mechanism_class_ref 仍然是 proxy:hyp_xxx
合同: mechanism-instance-contract.md 要求最终指向真实 MC_* ID
→ 漂移：这是一次部分对齐，但 commit message 暗示了完整对齐
```

**测试 agent 的回应**：
> "这次 commit 声称对齐了 mechanism-instance 合约，但我注意到 `mechanism_class_ref` 仍然使用 `proxy:*` 前缀。根据合同 §D3，proxy 是过渡态。请问：
> 1. 这是已知且计划中的过渡态吗？
> 2. 如果是，是否应该在代码注释或某份合同中标注 'proxy 前缀预计在 v7.x 中移除'？
> 3. 如果不是，是否有遗漏的实现步骤？"

### 模式 2：高级意图 vs 低级妥协（High-level Intent vs Low-level Compromise）

**信号**：
- 设计文档/v9 合同要求一个高级特性（如多视角、本体联邦），但代码实现仍然假设单一视角
- 代码没有错误，但与设计意图的方向不一致

**例子**：
```text
v9 合同: "Observation 不是中性的，必须声明 perspectiveId"
代码: ObservationRecord 接口没有 perspectiveId 字段
→ 漂移：代码仍然默认了一个普遍有效的观察者
```

**测试 agent 的回应**：
> "v9 的本体联邦层要求每个 Observation 都绑定一个 `PerspectiveModel`，但当前的 `ObservationRecord` 接口缺少 `perspectiveId`。这意味着系统仍然隐含了一个中性观察者。
> 这是否说明 v9 的联邦层目前还处于占位状态？如果是，我建议：
> 1. 在 `observation-model-contract.md` 中标注 'perspectiveId 为 v9 预留字段，v7/v8 阶段使用默认视角'
> 2. 或者在 `ObservationRecord` 中先加入可选的 `perspectiveId?: string'，并附 TODO 注释"

### 模式 3：合同之间的张力未被代码解决（Unresolved Tension Between Contracts）

**信号**：
- 合同 A 和合同 B 对同一概念有不同定义
- 代码选择实现了其中一个，但没有明确说明另一个被如何处理

**例子**：
```text
metrics-contract.md: regulations_confirmed 来自 get_stats
contract-vs-impl-audit.md: 实际来自 get_dual_stats
代码: eval.mjs 使用了 get_dual_stats 的映射
→ 漂移：metrics 合同本身已经过时，但代码编写者可能已经知道了这一点（因为 eval.mjs 正确使用了 get_dual_stats）
```

**测试 agent 的回应**：
> "我注意到 `eval.mjs` 正确地将 `regulations_confirmed` 映射到了 `get_dual_stats().regulationsByStatus.confirmed`，但 `metrics-contract.md` 仍然声明它来自 `get_stats`。根据 `contract-vs-impl-audit.md` 的 B1，这是一个已知 blocker。
> 既然代码已经'偷偷'修正了这个问题，为什么不把合同也同步更新？否则未来的代码编写者可能会按旧合同错误实现。"

### 模式 4：意图被过度实现（Over-implementation of Intent）

**信号**：
- 代码实现了比当前设计意图更复杂的功能
- 这本身不是错误，但可能消耗了本应用于其他缺口的资源

**例子**：
```text
设计意图: "Episode 必须具备 timeline"
代码: 实现了完整的 EpisodeEventStore + event log + seq 管理
→ 但同时 StateSnapshot / Transition 仍然是未实现状态
→ 漂移：编写者可能过度投资了事件日志，而忽略了状态快照层
```

**测试 agent 的回应**：
> "EpisodeEventStore 的实现非常完整，但 `StateSnapshot` 和 `Transition` 仍然是 `interface` 占位符。如果 v7 的核心意图是'把经历当成带轨迹的采样'，那么没有状态快照的 timeline 更像是一个聊天记录的增强版，而不是世界采样。
> 建议：要么将 StateSnapshot 的实现提升为下一个优先项，要么在合同中重新校准 v7 的目标范围。"

### 模式 5：沉默的缺口（Silent Gap）

**信号**：
- 设计文档明确要求某样东西必须存在
- 但代码中没有任何对应物，也没有任何 TODO、注释、或占位符
- 这是一个"被遗忘的意图"

**例子**：
```text
v8 合同: "ValidityEnvelope 是 MechanismProgram 的必备字段"
代码: MechanismClass 有 thresholds/contextConstraints，但没有 ValidityEnvelope 结构
→ 漂移：v8 的意图在代码中完全不可见
```

**测试 agent 的回应**：
> "v8 的设计文档要求每个 `MechanismProgram` 必须附带 `ValidityEnvelope`，但我在代码中没有找到这个结构的任何痕迹。这不是一个部分实现的问题，而是一个完全缺失的意图。
> 如果 v8 目前还不是开发重点，我建议至少在 `mechanism-class-contract.md` 中加入一个显式的 'v8 前瞻' 章节，把这个意图落盘，防止它被彻底遗忘。"

---

## 5. 审计工作流

### 5.1 单次意图一致性审计的流程

```text
Step 1: 选择审计焦点
  → 通常是一个 recent commit range 或一个 specific contract

Step 2: 读取意图文档
  → design_history 中的相关版本
  → current/ 中的相关合同
  → roadmap 中的 Phase 定位

Step 3: 读取过程文档
  → commit messages in range
  → code frontmatter (implements)
  → inline TODOs / HACKs / proxies
  → existing contract-vs-impl audit findings

Step 4: 构建意图-实现矩阵
  ┌─────────────────┬─────────────────┬─────────────────┬──────────────┐
  │ 意图来源        │ 意图声明        │ 实现状态        │ 漂移评估     │
  ├─────────────────┼─────────────────┼─────────────────┼──────────────┤
  │ v7 §10 条件 1   │ Episode timeline│ event log ✅    │ 部分漂移     │
  │                 │                 │ snapshot ❌     │              │
  ├─────────────────┼─────────────────┼─────────────────┼──────────────┤
  │ mechanism-class │ replay 能力     │ phases 字段 ✅  │ 语义漂移     │
  │ contract        │                 │ 但无实际 replay │              │
  │                 │                 │ 引擎 ❌         │              │
  └─────────────────┴─────────────────┴─────────────────┴──────────────┘

Step 5: 生成对话式发现（Drift Findings）
  → 对每个漂移，不直接报 bug，而是生成一个"问题 + 建议"对

Step 6: 输出审计报告
  → 结构化 markdown，包含：
    - 审计范围
    - 意图-实现矩阵
    - 对话式发现列表
    - 建议的下一步行动（按优先级排序）
```

### 5.2 与代码编写 agent 的交互协议

测试 agent 的输出必须遵循以下格式：

```markdown
## 发现 #{n}: [漂移模式] 标题

**意图来源**: `docs/current/xxx-contract.md` §Y / `design_history/vZ_xxx.md` §W
**过程文档**: commit `abc1234` "..." / `src/core/xxx.ts` frontmatter
**漂移描述**: （客观描述事实，不带情绪）
**问题**: 
1. ...
2. ...
**建议**: 
1. ...
2. ...
**严重度**: info / minor / major / blocker（从项目意图完整性的角度评估）
```

**禁止的输出方式**：
- ❌ "这里有个 bug"
- ❌ "代码错了"
- ❌ "文档写错了"

**推荐的输出方式**：
- ✅ "设计意图 X 要求 Y，但当前实现 Z 似乎是一个已知妥协。是否需要在合同中显式记录这个妥协？"
- ✅ "commit 声称对齐了 A，但 B 仍然使用过渡态前缀。这是否说明对齐是分阶段的？如果是，建议补充分阶段计划。"

---

## 6. 自动化辅助：intent-alignment-audit.mjs

为了降低人工审计的认知负担，项目维护一个自动化脚本 `scripts/intent-alignment-audit.mjs`，它负责：

1. **扫描意图文档**：提取所有合同中的 "硬约束"、"不变量"、"TODO"、"必须" 等关键句
2. **扫描过程文档**：
   - 解析所有 `.mjs` / `.ts` 文件头部的 `// ---` frontmatter
   - 提取所有 git commit message
   - 提取代码中的 `TODO` / `HACK` / `proxy:` / `过渡态` 注释
3. **构建映射**：
   - 哪些合同被哪些代码文件 `implements`
   - 哪些 commit 声称 "对齐"了哪些合同
   - 哪些合同中的关键字段在代码中有/无对应
4. **生成初稿报告**：输出一个带有 "漂移信号" 的 markdown，供测试 agent 进一步审阅和添加对话式发现

**注意**：自动化脚本只能做"信号检测"，不能做"意图理解"。最终的对话式发现必须由测试 agent（人或 AI）基于上下文判断生成。

---

## 7. 当前项目的首次意图一致性审计

### 7.1 审计范围

- **时间范围**：最近 20 个 commit（`ff82b76` 到 `fee1d33`）
- **焦点合同**：`v7-world-model-contract.md`、`mechanism-class-contract.md`、`metrics-contract.md`
- **焦点代码**：`causal-learner/mcp-server/src/core/pipeline.ts`、`mechanism-instance.ts`、`mechanism-class.ts`

### 7.2 意图-实现矩阵（示例）

| 意图来源 | 意图声明 | 实现状态 | 漂移模式 | 评估 |
|---------|---------|---------|---------|------|
| v7 §10 条件 1 | Episode 具备完整 timeline | event log ✅, snapshot/transition ❌ | 模式 4：过度实现 event，缺口 snapshot | major |
| v7 §10 条件 6 | AcceptedReconstruction 显式落盘 | ✅ 已实现 | 无漂移 | - |
| v7 §10 条件 7 | OntologyDelta 必备输出 | ✅ 已实现（含 kind=none） | 无漂移 | - |
| mechanism-class-contract §2 | MechanismClass 是可回放动力学模板 | phases 字段 ✅, 但无真实 replay 引擎 | 模式 1：宣称 vs 实际未完成 | major |
| mechanism-class-contract §5 | replayError 计算 | formula 存在但依赖 episode timeline | 模式 2：高级意图 vs 低级妥协 | minor |
| metrics-contract §2 | `regulations_confirmed` 来源 | 合同中写 `get_stats`，`eval.mjs` 实际用 `get_dual_stats` | 模式 3：合同间张力，代码已偷偷修正 | blocker |
| v8 design | ValidityEnvelope | 代码中完全不存在 | 模式 5：沉默的缺口 | info |
| v9 design | PerspectiveModel | 代码中完全不存在 | 模式 5：沉默的缺口 | info |

### 7.3 对话式发现（精选）

#### 发现 #1: Episode timeline 的"不平衡实现"

**意图来源**: `v7-world-model-contract.md` §10 条件 1 / `episode-event-contract.md`
**过程文档**: commit `f1649b1` "缺口二：Episode 轻量 timeline 持久化（EpisodeEventStore）"
**漂移描述**: `EpisodeEventStore` 实现了完整的 event log（含 seq、kind、ref_id、payload），但 `StateSnapshot` 和 `Transition` 仍然是 `interface` 占位符，没有任何持久化存储。
**问题**: 
1. 如果 timeline 只有事件而没有状态快照，它是否能完整支持 v7 的"世界采样"意图？
2. `EpisodeEvent` 的 payload 是否可以/应该被用来推断 `StateSnapshot`？
**建议**: 
1. 如果 StateSnapshot 的实现被刻意推迟，建议在 `v7-world-model-contract.md` §10 中把条件 1 拆分为 "event log ✅" 和 "snapshot/transition ⏳"，明确标注推迟原因。
2. 或者，将 `StateSnapshotStore` 和 `TransitionStore` 提升为下一个 sprint 的优先项。
**严重度**: major

#### 发现 #2: "对齐" commit 中的过渡态残留

**意图来源**: `mechanism-class-contract.md` §7 / `mechanism-instance-contract.md`
**过程文档**: commits `7ac7777` "对齐新版 mechanism-instance 合约"、`8162bc4` "pipeline.recordFix() 产出 MechanismInstance"
**漂移描述**: 多个 commit 声称 "对齐" 或 "产出" MechanismInstance，但 `mechanism_class_ref` 仍然使用 `proxy:hyp_xxx` 和 `proxy:episode_xxx` 前缀。合同要求这是 D3 过渡态，不应长期存在。
**问题**: 
1. proxy 前缀是否已经被接受为一种长期存在的桥接模式？
2. 如果不是，从 proxy 到真实 `MC_*` ID 的迁移路径是什么？
**建议**: 
1. 在 `mechanism-instance-contract.md` 中新增一个 "过渡态退役计划" 章节，明确 proxy 前缀预计在哪个版本/哪个条件下被移除。
2. 在 `pipeline.ts` 中 `proxy:` 生成的位置添加 TODO 注释，引用该退役计划。
**严重度**: minor（因为它是已知过渡态，但缺乏退役承诺）

#### 发现 #3: metrics 合同的"僵尸声明"

**意图来源**: `metrics-contract.md` §2 字段表
**过程文档**: `eval.mjs` 的字段映射代码（`buildMetrics` 函数）已将 `regulations_confirmed` 映射到 `dualStats.regulationsByStatus.confirmed`
**漂移描述**: `metrics-contract.md` 声称 `regulations_confirmed` 来自 `get_stats`，但代码（`eval.mjs`）已经正确地从 `get_dual_stats` 采集。这意味着代码编写者已经意识到了合同错误并做了隐式修正，但没有更新合同本身。
**问题**: 
1. 如果未来的代码编写者或新加入的 agent 只读 `metrics-contract.md`，他们会错误实现采集逻辑吗？
2. `contract-vs-impl-audit.md` 已经把这个问题标记为 B1 blocker，为什么合同没有被同步修正？
**建议**: 
1. 立即修正 `metrics-contract.md` §2 的"采集方式"列，把所有 `get_stats` 来源的错误字段更正为真实来源。
2. 建立规则：当 `contract-vs-impl-audit.md` 发现一个 blocker 且代码已经做了修正时，必须在同一个 commit 或紧随其后的 commit 中修正合同。
**严重度**: blocker

#### 发现 #4: v8/v9 意图的"完全沉默"

**意图来源**: `design_history/v8_generative_ontology.md`、`design_history/v9_ontology_federation.md`
**过程文档**: 代码中没有任何 `ValidityEnvelope`、`PerspectiveModel`、`TranslationFunctor`、`OntologyModel` 的痕迹。没有任何 TODO 注释提及这些对象。
**漂移描述**: v8 和 v9 的设计文档已经被正式落盘到 `design_history/`，但它们在代码层完全没有占位符或前瞻注释。这意味着这些意图有被遗忘的风险。
**问题**: 
1. v8/v9 目前是否被视为纯粹的"未来愿景"，而不是需要逐步渗透的架构方向？
2. 如果是，为什么它们被写成了正式版本文档而不是 `future-ideas/`？
**建议**: 
1. 在相关的 current contracts（如 `v7-world-model-contract.md`、`mechanism-class-contract.md`）中增加 "v8/v9 前瞻" 附录，说明哪些字段/结构是为 v8/v9 预留的。
2. 或者，在 `causal-learner/mcp-server/src/core/` 中创建占位符类型文件（如 `v8-placeholder.ts`），只 export interface 而不实现逻辑，作为意图的锚点。
**严重度**: info（当前不影响功能，但影响长期架构一致性）

---

## 8. 从审计到改善：建议的下一步行动

### 行动 1（本周）：修正 metrics-contract.md
**原因**: 这是唯一一个 "代码已经修正但合同仍然错误" 的场景，会导致未来实现者被误导。
**执行者**: 任意代码编写 agent
**验证者**: 意图一致性审计 agent（运行 `scripts/intent-alignment-audit.mjs` 验证修正）

### 行动 2（下周）：为 proxy 前缀建立退役计划
**原因**: 消除 "宣称对齐但实际使用过渡态" 的模式 1 漂移。
**执行者**: 负责 mechanism-instance 的编写 agent
**验证者**: 意图一致性审计 agent（检查合同中是否新增了退役章节，代码中是否新增了 TODO）

### 行动 3（下下周）：决定是否将 v8/v9 意图引入代码占位符
**原因**: 防止高级设计意图被遗忘。
**执行者**: 架构师 agent + 意图一致性审计 agent 共同决策
**验证者**: 30 天后复查，检查代码中是否出现了至少一个 v8/v9 的占位符或 TODO

---

## 9. 最终判断

意图一致性审计不是对代码编写 agent 的审判，而是一种**结构化对话**。

它的价值不在于找出多少错误，而在于：
1. **让设计意图保持可见**（防止意图被代码细节淹没）
2. **让妥协变得显式**（防止临时方案变成永久方案）
3. **让编写者的自我理解接受校准**（防止 commit message 的修辞与现实脱节）

当一个测试 agent 能够说出：
> "我理解了你的意图，也理解了你认为自己实现了什么，但这里有一个微妙的漂移——不是 bug，而是方向上的不一致。"

它才真正成为了代码编写者的对话者与改善者。
