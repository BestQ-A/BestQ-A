---
kind: contract
status: draft
phase: 1
schema_version: 1
describes: "OpenAGI级测试验证体系与运行时信息收集规范"
---

# 测试验证策略合同：为80亿人类服务的OpenAGI项目的质量保证体系

> 本文档定义 BestQ-A 作为文明级求真引擎的质量保证策略。
> 核心信念：**一个为80亿人服务的OpenAGI系统，其测试不是"找bug"，而是建立"错误无法静默进入本体"的制度化防线。**
> 上游依赖：[artifact-contract.md](./artifact-contract.md)、[metrics-contract.md](./metrics-contract.md)、[v7-world-model-contract.md](./v7-world-model-contract.md)

---

## 0. 测试哲学的三条铁律

### 铁律一：测试即宪法

对于普通软件，测试验证功能是否正确。
对于 BestQ-A，测试验证的是 **"法律是否被遵守"**：

- v6 关系法律是否被绕过
- v7 绑定约束是否被违反
- v8 预测先于执行法律是否生效
- v9 翻译法律与宪法层是否被尊重

### 铁律二：任何单点通过都不等于系统安全

```text
单元测试通过  +  集成测试通过  +  合约审计通过
≠ AGI 安全
```

真正的安全需要：
- **对抗性测试**（adversarial agent 专门寻找法律漏洞）
- **规模压力测试**（80亿用户量级的并发与冲突）
- **长周期演化测试**（本体在数月/数年的漂移是否可控）
- **灾难注入测试**（LLM 幻觉、传感器故障、恶意输入下的降级行为）

### 铁律三：运行时收集的信息比离线测试更重要

因为真实世界的复杂性远超任何测试集，所以系统运行时的 **可观测性（observability）** 是测试的延伸。

**核心原则**：如果系统运行时发生了异常，但我们没有收集到足够信息来重建因果链，那这次运行就是"未测试"的。

---

## 1. 七层测试验证体系

```text
Layer 7: 文明级灾难测试 (Civilization Stress Test)
Layer 6: 对抗性与安全测试 (Adversarial & Red Team)
Layer 5: 合约真值与绑定测试 (Contract Truth)
Layer 4: 端到端集成与回归测试 (Integration)
Layer 3: 属性与不变量测试 (Property & Invariant)
Layer 2: 组件单元测试 (Unit)
Layer 1: 静态分析与形式验证 (Static & Formal)
```

从 Layer 1 到 Layer 7，测试成本递增，但覆盖的故障模式也越致命。

---

## 2. Layer 1: 静态分析与形式验证

### 2.1 类型与架构约束（Type & Architecture Guard）

**目标**：在编译前发现接口不匹配、循环依赖、未处理的边界情况。

| 检查项 | 工具 | 频率 | 失败策略 |
|--------|------|------|----------|
| TypeScript 严格类型 | `tsc --noEmit` | 每次 commit | hard stop |
| 导入循环依赖 | `madge --circular` | CI | hard stop |
| 未使用导出/死代码 | `ts-prune` | CI | warn |
| 函数复杂度 > 15 | `eslint complexity` | CI | warn |
| 核心文件行数 > 800 | 自定义脚本 | CI | warn |

**AGI 特殊要求**：
- `core/ref-algebra.ts`、`core/pipeline.ts`、`core/atom-graph.ts` 三大文件的变更，必须触发额外的 **架构影响分析脚本**，检查是否有下游工具签名被破坏。

### 2.2 合约静态审计（Contract Static Audit）

即现有的 `scripts/contract-audit.mjs`，但需扩展为 **三层审计**：

**L1-A: 文档元数据审计**（已实现）
- frontmatter 完整性
- kind/status 合法性
- 引用路径可达性

**L1-B: 代码 ↔ 合约符号漂移审计**（部分实现）
- 合约中反引号内的 symbol 是否真实存在于代码
- 代码中 public API 的变更是否在所有引用合约中被同步

**L1-C: 接口契约审计**（待建）
- 检查 `core/*.ts` 导出的 interface 是否与 `docs/current/*-contract.md` 中的 TypeScript 接口一致
- 检查 `implements` 字段指向的合约，与代码中的 `// implements:` 注释是否双向对齐

### 2.3 关系代数的形式化验证（待建，Phase 2+）

v6 的 `RefAlgebra` 是一个有限状态系统，其复合规则表可以被形式化验证：

```text
目标：证明 "indicates ∘ causes" 永远不能被推导为 allowed=true
方法：将 RefTypeSpec + ComposeRule 编码为 SMT-LIB2，用 Z3 验证
      对所有 (first, second) ∈ RefKind × RefKind，
      若 first.family == 'evidential' 且 second.family == 'explanatory'，
      则 result.allowed == false
```

**为什么重要**：
这是系统的"宪法第一条"。如果这条被形式化证明成立，那么我们可以在数学上保证：**征兆永远不会被系统误当成根因**。

---

## 3. Layer 2: 组件单元测试

### 3.1 当前状态

现有测试采用 ad-hoc `.mjs` 脚本，无统一框架。这是 Phase 1 的合理妥协，但必须尽快迁移到结构化测试框架。

### 3.2 目标测试架构

**测试框架选择**：Node.js 原生 `node:test` + `node:assert`（零依赖，与项目哲学一致）

**目录结构**：

```
causal-learner/mcp-server/tests/
├── unit/
│   ├── algebra/           # v6 RefAlgebra
│   ├── graph/             # AtomGraph
│   ├── pipeline/          # CausalPipeline 子函数
│   ├── storage/           # 各 Store 模块
│   └── federation/        # v9 OntologyModel / TranslationFunctor
├── integration/
│   ├── full-loop/         # 端到端闭环
│   └── swebench/          # SWE-bench 集成
├── property/
│   ├── algebra-fuzz.mjs   # 关系代数模糊测试
│   └── graph-invariant.mjs # 图不变量随机测试
├── adversarial/
│   ├── red-team-ontology.mjs
│   └── red-team-compilation.mjs
├── contract/
│   └── contract-audit.mjs # 从脚本迁移为测试
└── performance/
    ├── concurrency-stress.mjs
    └── large-graph-stress.mjs
```

### 3.3 各核心模块的测试清单

#### RefAlgebra（v6 关系法律内核）

```typescript
// 必须覆盖的测试矩阵
describe('RefAlgebra', () => {
  test('四族分类正确性');
  test('禁止复合表（14条）全部生效');
  test('合法复合表的 evidencePolicy 降级');
  test('force 沿路径只降不升');
  test('mode 降级：direct > inherit > candidate > weak');
  test('proof-carrying: valid path 返回完整 DerivationStep[]');
  test('proof-carrying: invalid path 在失败点截断');
  test('未注册复合默认禁止（闭世界假设）');
});
```

**关键指标**：关系代数测试覆盖率必须 ≥ 95%。这是系统的安全内核。

#### AtomGraph

```typescript
describe('AtomGraph', () => {
  test('canonicalKey 去重精度 > 90%');
  test('删除 Atom 级联删除 Ref');
  test('删除 Ref 联动 Shortcut 失效');
  test('evidential 边不能直接 compiled');
  test('compile 基于 Story/Evidence，不能凭空产生');
  test('Shortcut 不可直接写入真相层');
});
```

#### CausalPipeline

```typescript
describe('CausalPipeline', () => {
  test('submitObservation → 产出 Episode 最小壳');
  test('recordFix → 产出 AcceptedReconstruction');
  test('recordFix → 产出 OntologyDelta（含 kind=none 路径）');
  test('无 chosenPath 时不触发 compile');
  test('canPromote 失败时 compile 被阻塞');
  test('multi-episode 门控：MechanismClass 晋升需 ≥2 episodes');
});
```

---

## 4. Layer 3: 属性与不变量测试

### 4.1 什么是属性测试（Property-Based Testing）

不是写死输入/预期输出，而是定义 **"对任何合法输入都必须成立的性质"**，然后用生成器暴力搜索反例。

### 4.2 BestQ-A 的关键属性

#### P1: RefAlgebra 的代数性质

```text
对任意 refKind a, b, c：
  若 compose(a, b) = allowed 且 compose(b, c) = allowed
  则 compose(result(a,b).kind, c) 的 mode 必须 ≤ min(mode(a,b), mode(b,c))
```

#### P2: Graph 的不变量

```text
对任意时刻的 AtomGraph：
  - 不存在两个 canonicalKey 相同的 Atom
  - 不存在 from=to 的自环 Ref（除非显式允许）
  - 所有 Shortcut 的 viaPath 必须在底层 Ref 中存在
  - 所有 compiled Ref 必须至少有一条 Evidence
```

#### P3: Pipeline 的单调性

```text
对同一 storage 实例：
  - observationCount 只增不减
  - evidence total 只增不减（Evidence 是 append-only）
  - RegulationView 中的 confirmed 数量，在 compile 后只增不减（在 retire 前）
```

#### P4: v7 绑定的引用完整性

```text
对任意 AcceptedReconstruction：
  - 其 mechanism_instance_ids 必须在 MechanismInstanceStore 中存在
  - 其 traceId 必须在 DerivationTraceStore 中存在
  - 其 episodeId 必须在 EpisodeEventStore 中存在
```

### 4.3 模糊测试（Fuzzing）策略

**模糊目标**：
1. `RefAlgebra.validatePathRich()` — 随机生成 1-20 长度的 refKind 序列
2. `AtomGraph.explore()` — 随机生成 1-1000 个 Atom + 随机 Ref 连接
3. `CausalPipeline.recordFix()` — 随机生成 observation + fix 输入组合
4. `PatternEngine.canCompile()` — 随机生成模板 + 绑定组合

**模糊种子**：
- 合法种子：现有测试用例
- 非法种子：故意破坏不变量的输入（如 `indicates→causes` 路径）
- 边界种子：空图、单节点、全连接图、自环图

**模糊运行时长**：
- CI：每次 60 秒快速 fuzz
- Nightly：每次 30 分钟深度 fuzz
- Release：每次 4 小时极端 fuzz

---

## 5. Layer 4: 端到端集成与回归测试

### 5.1 全闭环测试（Golden Path）

**Test E2E-1: 诊断-修复-编译闭环**

```text
Step 1: submitObservation({ facts: [timeout, 500, connection_pool] })
Step 2: 验证 Event 被创建，Story 状态为 open
Step 3: explore / suggest 返回候选路径
Step 4: recordFix({ chosenPathAtomIds: [...], fixDescription: "increase pool" })
Step 5: 验证：
  - Hypothesis 被创建并 validate
  - compile 成功（Ref 被写入）
  - Evidence 被记录
  - Story 状态变为 success
  - RegulationView 包含新规则
  - AcceptedReconstruction 被产出
  - OntologyDelta 被产出（非 none）
Step 6: 再次 submitObservation（相同症状）
  - 验证新观测被已有 Regulation 解释（explained=true）
```

**Test E2E-2: 无路径修复（None 路径）**

```text
Step 1: submitObservation
Step 2: recordFix（不提供 chosenPathAtomIds）
Step 3: 验证：
  - OntologyDelta.kind === 'none'
  - no_update_reason 完整
  - MechanismInstance.status === 'rejected'
  - 无 compile 副作用
```

### 5.2 回归测试矩阵

每个 commit 必须通过以下回归测试：

| 场景 | 输入 | 期望输出 | 回归敏感度 |
|------|------|----------|-----------|
| 重复观测 | 3 次相同的 AttributeError | 1 个 Event，后续被 explain | 高（去重逻辑） |
| 跨 episode 机制晋升 | 2 次独立但同质的 timeout 修复 | MechanismClass 可被提名晋升 | 高（多 episode 门控） |
| Ref 删除级联 | 删除一条被 Shortcut 依赖的 Ref | Shortcut 标记 invalidatedAt | 高（真相层一致性） |
| 大规模图探索 | 1000 atoms，5000 refs | explore 在 1s 内返回 | 中（性能回归） |
| 长期存储切换 | flush_to_longterm 后 | 短期库清空，长期库正确聚合 | 高（存储层） |

### 5.3 SWE-bench 集成测试

虽然 Phase 1 的 `solve_rate` 是 TBD，但集成层必须存在：

```
tests/integration/swebench/
├── smoke-test.mjs        # 验证 harness 能启动、能返回格式正确的结果
├── mini-eval.mjs         # 在 5 个样本上跑通完整流程（每天 CI）
└── full-eval.mjs         # 在完整数据集上跑（每周/发布前）
```

**smoke-test 的最低要求**：
- 能解析 `swebench-test-set.json`
- 能把每个样本转换为 `ObservationInput`
- `pipeline.submitObservation()` 不崩溃
- `recordFix()` 能接受 mock fix（即使 fix 不一定正确）
- 产出符合 `artifact-contract.md` 的 `metrics.json`

---

## 6. Layer 5: 合约真值与绑定测试

### 6.1 现有 contract-audit 的升级路径

当前的 `contract-audit.mjs` 是 L5 的核心，但需要扩展以下检查：

#### L5-A: 代码实现覆盖率检查

对 `docs/current/` 中每个 `kind: contract` 文件，检查：

```text
1. 该 contract 是否至少被一个 code 文件 implements？
2. implements 的代码文件是否在最近 10 个 commit 中有变更？
3. 若 contract 标记为 current，其 implements 代码是否也通过了单元测试？
```

#### L5-B: v7 绑定检查扩展

当前 v7 绑定检查（V7-1 到 V7-5）需要扩展为 V7-10：

| ID | 检查项 | 当前状态 |
|----|--------|----------|
| V7-1 | Reconstruction → MechanismInstance 引用完整性 | ✅ |
| V7-2 | Episode → OntologyDelta 引用完整性 | ✅ |
| V7-3 | Reconstruction ↔ DerivationTrace 双向一致 | ✅ |
| V7-4 | OntologyDelta(kind=none) → no_update_reason | ✅ |
| V7-5 | accepted MI 必须有 claims/support | ✅ |
| V7-6 | Episode 必须具备完整 timeline | ⚠️ 部分（event log 有，snapshot/transition 未实现） |
| V7-7 | ObservationRecord 与 episodeId 显式绑定 | ❌ |
| V7-8 | MechanismClass 脱离 proxy:* 过渡态 | ❌ |
| V7-9 | SupportLink 升级为显式边 | ❌ |
| V7-10 | Conclusion + Reconstruction 必须同时出现在主流程输出 | ✅ |

#### L5-C: v8/v9 前瞻性检查（草案）

```text
V8-1: MechanismProgram 必须包含 ValidityEnvelope
V8-2: ActionExecution 必须关联 PredictionError
V8-3: ObservationRecord 必须关联 ObservationModel
V9-1: TranslationFunctor 必须包含 lossProfile
V9-2: OntologyModel 必须声明 perspectiveId
V9-3: SharedKernelCompileGate 必须记录 ConstitutionLayer 检查痕迹
```

### 6.2 合约漂移告警（Contract Drift Alert）

当以下情况发生时，自动在 CI 中生成 drift report：

- 代码文件被修改，但其 `implements` 的 contract 在 30 天内未更新
- Contract 文件被修改，但没有任何 code 文件在后续 commit 中跟进
- 新增 public API 但未在任何 contract 中被引用

---

## 7. Layer 6: 对抗性与安全测试（Red Team）

### 7.1 对抗性测试的独特重要性

普通测试验证"系统在正常输入下是否工作"。
对抗性测试验证"系统在恶意或异常输入下是否会违反法律"。

对于 BestQ-A，最危险的失败模式不是崩溃，而是 **"静默地写入非法本体"**。

### 7.2 Red Team 测试场景

#### RT-1: 关系法律绕过攻击

**攻击向量**：构造一条看起来合法的路径，试图让 `indicates→causes` 复合通过。

```text
输入：一个 LLM 生成的长路径，中间插入中间节点，
      如 indicates → similar_to → causes
预期：RefAlgebra 必须在 `similar_to→causes` 或更早阶段拒绝
      且不能产生 compiled Ref
```

#### RT-2: 证据污染攻击

**攻击向量**：用大量矛盾的 evidence 淹没某条 Ref，试图改变其置信度。

```text
输入：对同一条 Ref，连续提交 1000 条 contradicts evidence
预期：
  - 系统不能自动删除 evidence（append-only 法律）
  - 该 Ref 应被标记为 high_contradiction，可能触发 review
  - 但 contradiction_rate 指标必须正确反映
```

#### RT-3: 本体膨胀攻击

**攻击向量**：提交海量几乎相同的观测，试图生成无限多个 MechanismClass。

```text
输入：10000 次只有微小上下文差异的相同错误观测
预期：
  - canonicalKey / 去重机制应阻止无限制的 Atom/Ref 增长
  - orphan_atom_rate 不应爆炸
  - 系统应在资源阈值处优雅降级
```

#### RT-4: 编译代理权限提升攻击

**攻击向量**：模拟一个 agent，尝试直接调用底层存储写入 compiled Ref，绕过 pipeline。

```text
方法：直接调用 graph.addRef(mode='compiled') 而不经过 Hypothesis gate
预期：
  - 如果该调用来自非 pipeline 上下文，必须被审计日志标记
  - v9 宪法层应能识别并阻止未经授权的 compiled 写入
```

#### RT-5: 跨本体翻译静默损失攻击

**攻击向量**：构造一个 `TranslationFunctor`，声称 invariant 被保留，但实际上没有。

```text
输入：两个结构相似但语义不同的 OntologyModel，声称它们可以无损翻译
预期：
  - InvariantPreservationCheck 必须发现损失
  - lossProfile 必须非空
  - 无 lossProfile 的 TranslationFunctor 不得进入共享内核
```

### 7.3 Red Team 的运行频率

- **每周自动 Red Team**：脚本自动生成 1000 个攻击向量并运行
- **每月人工 Red Team**：安全专家设计新的攻击场景
- **每次 major release**：聘请外部安全研究员进行 penetration test

---

## 8. Layer 7: 文明级灾难与压力测试

### 8.1 为什么需要 Layer 7

因为这是一个为 80 亿人服务的系统，它必须能承受：

- 全球规模的并发请求
- 长达数十年的持续运行
- 多种文化、语言、科学范式下的知识冲突
- 部分子系统完全失效的情况

### 8.2 灾难测试场景

#### CT-1: 全球并发冲突风暴

**场景**：100 万个 agent 同时向共享内核提交冲突的 `OntologyUpdate`。

**测试目标**：
- `SharedKernelCompileGate` 不会死锁
- 大多数更新被正确排队或拒绝
- 系统不会因为冲突队列过长而崩溃
- ConstitutionLayer 的检查不会被跳过

#### CT-2: 数十年本体演化漂移

**场景**：模拟 10 年的连续运行，每天产生 1000 个新 Episode。

**测试目标**：
- 图的大小增长是否可控
- 旧 Regulation 的退役机制是否有效
- `DeprecationRelation` 是否按预期触发
- 长期存储（longterm）的查询性能是否退化

#### CT-3: 观测通道集体故障

**场景**：主要传感器/数据源全部失效 24 小时，系统只能基于历史信念运行。

**测试目标**：
- 系统能否识别"观测新鲜度不足"
- 是否会基于过时的 `ObservationModel` 做出高风险决策
- 降级模式是否安全（prefer 不动作 over 错误动作）

#### CT-4: 跨文明不可通约危机

**场景**：两个完全不同的智慧体文明（完全不同的 embodiment 和数学基础）尝试与系统交互。

**测试目标**：
- 系统不会强行统一不可通约的本体
- `UnresolvedBoundary` 是否被正确记录
- 共享内核是否保持最小化，不会被局部知识污染

---

## 9. 运行时信息收集规范（Observability）

### 9.1 核心原则

当系统运行时，以下信息必须被收集、落盘、可追溯：

```text
1. 每个决策的完整因果链（why was this conclusion reached?）
2. 每个写入本体的操作的证明痕迹（what law allowed this write?）
3. 每次预测与实际的偏差（what did we get wrong?）
4. 每个 agent 的操作日志（who did what?）
5. 系统资源与性能基线（is the system healthy?）
```

### 9.2 运行时数据模型

#### ExecutionTrace（执行痕迹）

每个 `CausalPipeline` 的调用都必须产生一个 `ExecutionTrace`：

```typescript
interface ExecutionTrace {
  id: string;
  toolName: string;           // 哪个 MCP 工具被调用
  inputHash: string;          // 输入的哈希（保护隐私时可去敏）
  startedAt: string;
  finishedAt: string;
  stageDurations: Record<string, number>; // classify / explore / compile 各阶段耗时
  decisions: DecisionPoint[]; // 关键决策点
  lawsInvoked: string[];      // 本次调用引用了哪些合同/法律
  outcome: 'success' | 'partial' | 'failure' | 'blocked';
  blockReason?: string;       // 若被阻塞，原因是什么
}

interface DecisionPoint {
  stage: string;
  timestamp: string;
  description: string;
  alternatives: string[];     // 被考虑的替代方案
  chosen: string;
  rationale: string;
}
```

#### AgentAuditLog（Agent 审计日志）

对于多 agent 场景：

```typescript
interface AgentAuditLog {
  agentId: string;
  agentType: string;          // candidate_generator / counterexample_searcher / compile_gatekeeper
  action: string;
  targetOntologyId?: string;
  targetRefId?: string;
  lawChecked: string[];       // 该 agent 声称检查了哪些法律
  timestamp: string;
  approvedBy?: string;        // 若为写入操作，谁最终批准
}
```

#### SystemHealthSnapshot（系统健康快照）

每分钟采集一次：

```typescript
interface SystemHealthSnapshot {
  timestamp: string;
  // 性能
  requestLatencyP50: number;
  requestLatencyP99: number;
  exploreLatencyP99: number;
  compileLatencyP99: number;
  // 规模
  atomCount: number;
  refCount: number;
  episodeCount: number;
  pendingOntologyUpdates: number;
  openConflictSets: number;
  // 质量
  contradictionRate: number;       // 同一 Ref 上的矛盾证据比例
  orphanAtomRate: number;          // 孤立 Atom 比例
  compileAcceptanceRate: number;   // 最近 1 小时的 compile 通过率
  predictionErrorRate: number;     // v8+: 预测错误率
  // 安全
  unauthorizedWriteAttempts: number; // 被宪法层阻止的写入尝试数
  blockedTranslations: number;       // 因 invariant 被破坏而阻止的翻译数
}
```

### 9.3 日志等级与保留策略

| 数据类型 | 保留期 | 压缩策略 | 访问控制 |
|----------|--------|----------|----------|
| ExecutionTrace | 7 年 | 1 年后转冷存储 | 只读，审计者可查 |
| AgentAuditLog | 10 年 | 1 年后转冷存储 | 只读，法务/安全团队可查 |
| SystemHealthSnapshot | 2 年 | 30 天后降采样 | 公开仪表盘 |
| PredictionError | 5 年 | 不压缩 | 研究人员可申请 |
| Evidence | 永久 | 不压缩 | 只读，全民可审计 |

**为什么 ExecutionTrace 要保留 7 年？**

因为如果一个 5 年前的决策导致了今天的灾难，我们必须能够重建当时的完整推理链。这是文明级系统的最低要求。

---

## 10. 指标与仪表盘

### 10.1 测试健康度指标

| 指标 | 目标 | 说明 |
|------|------|------|
| `unit_test_coverage` | > 80% | 行覆盖率 |
| `property_test_pass_rate` | 100% | 模糊测试无崩溃 |
| `contract_audit_pass_rate` | 100% | 文档 ↔ 代码一致性 |
| `v7_binding_integrity` | 100% | 跨对象引用完整性 |
| `red_team_block_rate` | > 99% | 对抗性攻击被阻止比例 |
| `e2e_golden_path_pass_rate` | 100% | 核心闭环每次通过 |

### 10.2 运行时安全指标

| 指标 | 警戒线 | 灾难线 |
|------|--------|--------|
| `unauthorized_write_attempts_per_min` | > 1 | > 10 |
| `contradiction_rate` | > 10% | > 30% |
| `orphan_atom_rate` | > 20% | > 50% |
| `prediction_error_rate` | > 15% | > 40% |
| `compile_acceptance_rate` | < 20% | < 5% |
| `shared_kernel_queue_length` | > 100 | > 10000 |

当任何指标触及灾难线时，系统必须：
1. 自动进入 **safe mode**（暂停非只读操作）
2. 通知 on-call 工程师和安全团队
3. 触发自动诊断 agent 分析根因
4. 在 safe mode 解除前，所有 compiled 写入必须由 human-in-the-loop 批准

---

## 11. CI/CD 测试流水线

### 11.1 目标 CI 架构

```yaml
# .github/workflows/ci.yml 目标态
jobs:
  layer-1-static:
    - tsc --noEmit
    - contract-audit.mjs
    - architecture-impact-check.mjs

  layer-2-unit:
    - npm run build
    - node --test tests/unit/**/*.mjs

  layer-3-property:
    - node tests/property/algebra-fuzz.mjs --duration=60
    - node tests/property/graph-invariant.mjs --duration=60

  layer-4-integration:
    - node tests/integration/full-loop/golden-path.mjs
    - node tests/integration/swebench/smoke-test.mjs

  layer-5-contract-truth:
    - node scripts/contract-audit.mjs --strict
    - node scripts/v7-binding-check.mjs

  layer-6-red-team:
    - node tests/adversarial/red-team-ontology.mjs --iterations=1000
    - node tests/adversarial/red-team-compilation.mjs --iterations=1000

  layer-7-disaster:
    - 仅在 nightly / release 触发
    - node tests/performance/concurrency-stress.mjs --agents=10000
    - node tests/performance/large-graph-stress.mjs --atoms=1000000
```

### 11.2 测试通过策略

- **L1-L5 任何失败 = PR 不能合并**（hard gate）
- **L6 失败 = 安全团队 review 后才能合并**
- **L7 失败 = 不阻塞 PR，但必须在 release 前解决或得到豁免**

---

## 12. 测试团队的组织（制度化科学共同体）

### 12.1 测试不是一个人或一个部门的事

BestQ-A 的测试体系由多个专职 agent/团队组成：

| 角色 | 职责 | 对应测试层 |
|------|------|-----------|
| **Static Analysis Agent** | 代码静态检查、合约漂移检测 | L1, L5 |
| **Unit Test Agent** | 维护单元测试、覆盖率监控 | L2 |
| **Fuzzing Agent** | 24/7 运行属性测试与模糊测试 | L3 |
| **Integration Test Agent** | 维护 E2E、SWE-bench 集成 | L4 |
| **Red Team Agent** | 设计对抗场景、寻找法律漏洞 | L6 |
| **Observability Agent** | 运行时指标、告警、根因分析 | 运行时 |
| **Human Safety Board** | 最终裁决灾难测试结果 | L7 |

### 12.2 测试文化的三条原则

1. **"测试先于功能"**：任何新功能在合并前必须有对应的测试和可观测性埋点
2. **"失败是礼物"**：每次 Red Team 找到漏洞都是系统变强的机会，绝不追责
3. **"可审计性是第一优先级"**：如果测试通过了但无法解释为什么安全，那测试就没有通过

---

## 13. 当前缺口与行动计划

### 13.1 已实现的测试基础设施

| 组件 | 状态 | 文件位置 |
|------|------|----------|
| 合约审计脚本 | ✅ | `scripts/contract-audit.mjs` |
| 基础功能测试 | ✅ | `causal-learner/mcp-server/tests/test-*.mjs` |
| v6 代数测试 | ✅ | `tests/test-v6-algebra.mjs` |
| v7 记录修复测试 | ✅ | `tests/test-v7-recordfix.mjs` |
| eval 脚本 | ✅ | `scripts/eval.mjs` |
| CI 基础流水线 | ✅ | `.github/workflows/ci.yml` |

### 13.2 关键缺口（按优先级排序）

| 优先级 | 缺口 | 预计工作量 | 负责人 |
|--------|------|------------|--------|
| P0 | 无统一测试框架，ad-hoc 脚本难以维护 | 2 天 | Unit Test Agent |
| P0 | v7 绑定检查 V7-6 到 V7-9 尚未闭合 | 3 天 | Contract Truth Agent |
| P1 | 缺少属性/模糊测试（Layer 3） | 3 天 | Fuzzing Agent |
| P1 | 缺少 Red Team 测试脚本（Layer 6） | 2 天 | Red Team Agent |
| P1 | `ExecutionTrace` 运行时收集未实现 | 2 天 | Observability Agent |
| P2 | 形式化验证 Z3 集成（RefAlgebra） | 5 天 | Formal Methods Agent |
| P2 | 性能/并发压力测试（Layer 7） | 3 天 | Performance Agent |
| P2 | SWE-bench 集成测试自动化 | 4 天 | Integration Agent |

### 13.3 下一个最有价值的动作

**动作 1（本周）**：将现有 `tests/test-*.mjs` 迁移到 `node:test` 框架，统一断言、覆盖率报告和 CI 集成。

**动作 2（下周）**：实现 `ExecutionTrace` 的 MCP 中间件，让每次 `CausalPipeline` 调用自动产生可追溯的执行痕迹。

**动作 3（下下周）**：编写第一个 Red Team 脚本 `tests/adversarial/red-team-compilation.mjs`，专门测试 "agent 绕过 Hypothesis gate 直接写入 compiled Ref" 的场景。

---

## 14. 最终判断

BestQ-A 的测试体系必须比传统软件测试更激进、更系统、更偏执。

因为我们要验证的不是"功能对不对"，而是 **"这个系统在面对 80 亿人类的复杂需求、海量 agent 的并行探索、以及未知领域的知识冲突时，是否仍然能坚守它的法律，不混淆真理，不静默犯错。"**

这不是一个测试部门能完成的任务。这是一个 **制度化科学共同体** 的任务。

而这份合同，就是这个共同体的宪章。
