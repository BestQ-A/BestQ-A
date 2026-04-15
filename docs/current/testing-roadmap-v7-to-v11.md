---
kind: index
status: draft
---

# 测试路线图：从 v7 实现到 v11 文明引擎

> 文档定位：基于当前代码现实与最终设计目标，制定分版本、分环境、可落地的测试策略。

---

## 0. 现状速览

| 版本 | 实现状态 | 关键对象 |
|------|----------|----------|
| **v6** | 核心代码已固化 | `RefAlgebra`, `PatternTemplate`, `CompositionRule` |
| **v7** | 主链路已跑通 | `CausalPipeline`, `Episode`, `ObservationRecord`, `MechanismInstance`, `DerivationTrace`, `OntologyDelta`, `Reconstruction` |
| **v8** | 类型与存储已落地，但**占位符为主** | `CounterfactualScenario`, `MechanismProgram`, `ObservationModel`（默认实现是 `proxy:default_path_projection` 过渡态） |
| **v9** | **局部吸收已发生，未成为 operating center** | `OntologyModel`（类型 + 存储已存在）, `TranslationFunctor`（类型已存在）, `ConflictSet`（类型 + 存储已存在），测试 `v9-ontology-federation.test.ts` 通过；但 federation 未成为运行中心 |
| **v10** | **局部吸收已发生，未成为 operating center** | `ObserverModel`（类型 + 存储 + 测试已存在）, `InstrumentModel`, `DeploymentShiftModel`, `InstitutionModel`（后三者仍为零代码） |
| **v11** | **六大对象已接入 pipeline，部分运行** | `FailureBoundaryArchive`（Store + pipeline recordFix 写入）, `ReconstructionStore`（持久化 + 审计查询）, `BranchPoint`+`FutureBranch`（Store + 分叉治理 chosen/pruned）, `CounterexampleCommons`（归纳反例计数）, `ProofLineage`（从 DerivationTrace 构建）, `ConstitutionalLayer`（5 条宪法审计 mandatory PASS），测试 `v11-governance-stores.test.ts` + `v11-civilization-memory.test.ts` + `v11-proof-constitutional.test.ts` 通过；尚缺 `docs/current` 合约和 LineageCompileProposal/PresentSlice |

因为底层是 TypeScript + SQLite + MCP SDK，所以测试环境的选择必须兼顾**本地可运行**、**CI 可集成**、**版本可递增**。

---

## 1. 测试分层模型

我们将测试分为 7 层，与 `testing-strategy-contract.md` 对应，但按版本递进：

```text
Layer 1: Static / Formal          → Z3 / TypeScript 类型守卫
Layer 2: Unit / Component         → node:test + 内存 SQLite
Layer 3: Property / Fuzzing       → fast-check + 随机 RefGraph
Layer 4: Integration / Regression → SWE-bench 风格 + 合同审计脚本
Layer 5: Cross-ontology / Multi-agent → 仿真沙盒（Phase 3 起）
Layer 6: Deployment / Shift       → 可逆部署镜像（Phase 4 起）
Layer 7: Civilization / Red Team  → 对抗性审计 + 长期演化实验（Phase 5 起）
```

---

## 2. Phase 1：立即启动（v6/v7 核心硬化）

### 2.1 形式验证：RefAlgebra 的组合律（Z3）

**为什么现在做？**
v6 的关系法律是后续所有版本的逻辑地基。如果 `causes ∘ causes = causes` 或 `indicates ∘ causes = forbidden` 在代码中被破坏，v7-v11 的推导链都会不可信。

**测试环境**：
- **Z3 SMT Solver**（Python 或 WASM 绑定）
- 在 `tests/formal/` 下建立独立目录
- 每个 `RefType` 的 compose rule 生成一个 Z3 断言脚本

**具体测什么**：
1. `compose(causes, causes) == causes`
2. `compose(indicates, causes) == forbidden`
3. 任意两个合法 `RefType` 的组合结果必须落在 `RefType` 闭包内
4. `PatternTemplate` 作为小范畴，其对象（Atom）和态射（Ref）必须满足结合律（associativity）

**验收标准**：
- 所有 v6 已定义的 `RefType.family` 组合通过 Z3 `unsat`（即无反例）
- 每次 `ref-algebra.ts` 变更，CI 自动运行 Z3 验证

### 2.2 单元测试迁移：从 ad-hoc `.mjs` 到 `node:test`

**为什么现在做？**
当前 `tests/` 目录下全是手写 `.mjs` 脚本，无统一 runner、无覆盖率、无断言框架。这是技术债务。

**测试环境**：
- **Node.js 20+ 内置 `node:test`** + `node:assert`
- `c8` 覆盖率报告

**迁移优先级**：
1. `ref-algebra.test.ts` — 组合表、签名匹配、force 推导
2. `mechanism-instance.test.ts` — accept/reject 状态机、invariant 检查
3. `derivation-trace.test.ts` — proof-carrying 链路完整性
4. `pipeline.test.ts` — `submitObservation` → `recordFix` 端到端（内存数据库）

**验收标准**：
- `npm test` 一键运行全部测试
- CI 中覆盖率 ≥ 60%（核心模块）
- 所有现有 `test-*.mjs` 脚本被替换或包装为 `node:test` 用例

### 2.3 合同审计：意图对齐自动化

**测试环境**：
- 已有 `scripts/intent-alignment-audit.mjs`
- 扩展其能力，将 v7 对象的 `implements:`  frontmatter 与 `docs/current/*-contract.md` 自动交叉引用

**验收标准**：
- 每次 PR 触发审计，报告 Mode-1~Mode-5 漂移
- P0/P1 漂移阻塞合并

---

## 3. Phase 2：v8 生成式本体验证（需要仿真环境）

v8 的核心新增是**反事实推演**和**实验设计**。这意味着系统必须能：
- 给定一个 MechanismProgram，预测未执行动作的后果
- 比较预测轨迹与实际观测的偏差
- 选择信息增益最大的下一个实验

这类能力**无法仅靠单元测试验证**，必须在一个**可控、可重置、可观测的仿真世界**中进行。

### 3.1 推荐测试环境 A：离散事件仿真器（DE Simulator）

**技术栈**：TypeScript / JavaScript 自建沙盒

**为什么优先自建？**
- 与现有 TypeScript 代码库无缝集成
- 不需要安装 Python/C++ 依赖
- 可以精确控制状态转移函数，便于断言

**仿真世界设计**：
- 一个极简的因果世界，例如「咖啡机世界」：
  - Entity: `Water`, `CoffeeBean`, `Machine`, `Cup`
  - StateVar: `temperature`, `pressure`, `hasPower`
  - MechanismProgram: `BrewCoffee`（phase: heat → press → extract）
  - ObservationModel: 只观测 `temperature` 和 `cup.fillLevel`（盲区：`pressure`）
- 系统必须能：
  1. 反事实：「如果 `hasPower=false`，BrewCoffee 的 predictedTrajectory 应停在 heat phase」
  2. 实验设计：在 `MC_PumpFailure` 和 `MC_HeaterFailure` 之间，设计最小区分实验

**验收标准**：
- `CounterfactualScenario.predictedTrajectory` 与仿真器实际运行结果一致率 ≥ 90%
- `ExperimentDesign.expectedInformationGain` 在 100 次随机世界中，确实选择了最优区分实验（与暴力搜索对比）

### 3.2 推荐测试环境 B：Gymnasium + MuJoCo（物理因果）

**技术栈**：Python `gymnasium[mujoco]`，通过子进程或 gRPC 与 TypeScript 核心通信

**适用场景**：
- 验证 MechanismProgram 在**连续动力学**世界中的有效性
- 测试 `ObservationModel` 的噪声/偏差建模是否真实

**最小测试场景**：
- `InvertedPendulum-v5`：
  - MechanismClass: `MC_GravityInducedFall`
  - MechanismProgram: 描述 `angle → angular_velocity → position_change`
  - Counterfactual: 「如果初始角度改为 0.5 rad，预测倾倒时间」
  - 实际运行 MuJoCo 100 次，统计预测误差分布

**验收标准**：
- 预测轨迹与 MuJoCo 实际轨迹的 L2 误差在 10% 以内（前 50 步）
- `failsWhen` 条件在真实世界中确实对应系统失效（杆子倒地）

### 3.3 推荐测试环境 C：AI2-THOR（视觉-语义因果）

**技术栈**：Python `ai2thor`，REST API 通信

**适用场景**：
- 验证「观察不是真相」——系统必须区分 `raw_visual_observation` 和 `underlying_causal_state`
- 例如：微波炉里的鸡蛋看起来没变化（视觉盲区），但内部温度已升高（潜在状态）

**验收标准**：
- 系统能正确声明 `blindSpots: ['egg_internal_temperature']`
- 反事实推演不依赖不可观测变量作为前提

---

## 4. Phase 3：v9 本体联邦验证（需要多智能体环境）

v9 的核心是**多个局部本体共存**，以及它们之间的**合法翻译**。测试必须构造多个具有不同感官、目标、语言的智能体，观察它们能否：
- 各自建立局部 `OntologyModel`
- 通过 `TranslationFunctor` 沟通
- 保留不可翻译的 `ConflictSet`

### 4.1 推荐测试环境：Minecraft 多 Agent 沙盒（Mineflayer）

**技术栈**：Node.js `mineflayer` 启动多个 bot

**为什么是 Minecraft？**
- 开放世界，无固定任务脚本
- 不同 bot 可以配置不同传感器（有的只有视觉，有的只有音频，有的能挖掘但看不到天空）
- 天然支持「同一事件，不同观察」：一个 bot 看到僵尸，另一个只听到声音

**测试剧本**：
- Bot-A（视觉型）：本体里有 `Entity:Zombie`, `State:night_time`
- Bot-B（听觉型）：本体里有 `Sound:monster_growl`, `State:low_visibility`
- 事件：夜晚出现僵尸
- 系统必须生成 `TranslationFunctor`：
  - `Zombie` ↔ `monster_growl`（附带 `lossProfile: ['visual_appearance', 'distance']`）
  - `night_time` 无法翻译到 B 的本体（因为 B 没有时间传感器），必须保留为 `ConflictSet` 或 `unknownRegion`

**验收标准**：
- 翻译函子能覆盖 80% 的共享事件
- 不可翻译的部分被显式标记为 `loss` 或 `conflict`，而非静默丢弃
- 不存在「把局部规律提升为全局规律」的误编译（红队测试）

### 4.2 替代环境：ROS2 + Gazebo（多机器人）

如果团队更熟悉机器人栈，可用 ROS2 启动多个 TurtleBot3，每个配置不同传感器（LIDAR-only vs Camera-only）。

**优势**：更接近 v10/v11 的「真实仪器建模」。
**劣势**：部署和 CI 集成成本高。

---

## 5. Phase 4：v10 参与式自反验证（需要可逆部署环境）

v10 新增 `DeploymentShiftModel`：知识一旦部署，就会改变世界。测试必须在一个**真实系统**上验证漂移检测能力。

### 5.1 推荐测试环境：Kubernetes 金丝雀 + 流量镜像

**技术栈**：
- 本地 Kind / minikube 集群
- 一个可观测的 dummy microservice（如 HTTP 计数器服务）
- 系统作为「策略部署者」发布路由规则或负载均衡策略

**测试剧本**：
1. Baseline：服务响应时间 ~100ms
2. 系统编译并部署一条策略：「将 50% 流量路由到新版本」
3. 观测：响应时间变为 ~150ms，错误率上升
4. 系统必须生成 `DeploymentShiftModel`：
   - `inducedBehaviorChanges: ['retry_storm', 'cache_miss_spike']`
   - `invalidatedAssumptions: ['latency_independent_of_load']`
5. 系统触发重新校准（rollback 或 adjust policy）

**验收标准**：
- 部署后 60 秒内检测到显著漂移（p < 0.05）
- `DeploymentShiftModel` 能回指到具体部署动作和假设
- 系统不将漂移误认为是「世界固有规律」的变化

### 5.2 替代环境：LLM 服务 A/B 测试沙盒

如果当前系统面向 LLM 应用：
- 部署不同的 prompt/routing 策略
- 监控用户行为分布、问题类型分布、异常率
- 验证「模型部署改变了用户提问模式」这一 v10 核心假设

---

## 6. Phase 5：v11 文明级验证（需要对抗性和长期实验）

v11 的目标是**文明级自反求真基础设施**。这类系统无法通过传统单元测试「证毕」，而需要：
- **对抗性红队**持续寻找 silent overwrite、反例删除、proof bypass
- **长期演化实验**验证 failure boundary 的跨代保存
- **灾难压力测试**验证极端条件下的宪法约束是否仍然有效

### 6.1 对抗性红队测试（Red Team）

**环境**：纯代码 + 审计脚本

**攻击剧本**：
1. **反例压制攻击**：构造一个看似支持但实为反例的 Episode，尝试让系统将其编译为支持证据
2. **翻译损失隐藏攻击**：构造两个本体，使它们的 `TranslationFunctor` 会静默丢失关键 safety invariant
3. **部署漂移伪装攻击**：诱导系统将 deployment-induced 行为变化解释为「世界自然规律更新」
4. **权限升级攻击**：一个 rogue agent 试图绕过 `InstitutionModel` 的 compile 协议直接写入 shared ontology
5. **历史抹除攻击**：尝试删除或篡改 `FailureBoundaryArchive` 中的记录

**验收标准**：
- 所有攻击均被 `ConstitutionalLayer` 或 `Guardian` agent 拦截
- 每次拦截都留下 `ChallengeHistory` 记录
- 无静默成功写入的案例

### 6.2 长期演化实验（Accelerated Civilization Lab）

**环境**：自定义多 agent 仿真平台（可基于 Phase 3 的 Minecraft/ROS2 扩展）

**实验设计**：
- 初始化 100 个 agent，各自有独立的 `ObserverModel` 和局部 `OntologyModel`
- 运行 10,000 个 Episode（可加速，1 天跑完）
- 期间随机注入：
  - 世界规则变化（例如「重力方向改变」）
  - 传感器故障（某些 instrument 系统性偏差）
  - 恶意 agent（传播错误机制）
- 观测指标：
  - `ProofLineage` 的平均深度和分支数
  - `FailureBoundaryArchive` 的保留率（应接近 100%）
  - `ConflictSet` 的开放率（不应被强制关闭）
  - 编译后知识的「半衰期」：多久后被 challenge/rollback

**验收标准**：
- 99% 的失败边界被保留，而不是被新成功叙事覆盖
- 知识半衰期符合预期：旧假设在新证据下被回滚，而非永久固化
- 系统能识别并隔离恶意 agent 的错误提议

### 6.3 灾难压力测试（Civilization-Level Stress Test）

**测试场景**：
1. **传感器大停电**：90% 的 instrument 同时失效，系统必须进入「高不确定性模式」，禁止强干预编译
2. **本体大冲突**：所有 agent 的局部本体同时出现不可调和矛盾，系统必须保持 `ConflictSet` 开放，不允许虚假统一
3. **计算资源骤降**：只能运行 1% 的 agent，核心 `ConstitutionalLayer` 和 `FailureBoundaryArchive` 必须仍然在线
4. **时间跨度测试**：模拟 10 年（加速）的 ontology drift，验证 proof lineage 不断裂

**验收标准**：
- 宪法层规则在任何灾难场景下不被绕过
- 系统 gracefully degrades，而非 panic 或给出虚假确定性
- 灾难后恢复时，历史记录完整可追溯

---

## 7. 测试环境汇总表

| 版本目标 | 推荐主环境 | 替代环境 | CI 可行性 | 优先级 |
|----------|------------|----------|-----------|--------|
| v6 形式验证 | Z3 SMT Solver | Coq / Lean | ✅ 本地/CI | P0 |
| v7 单元/集成 | `node:test` + 内存 SQLite | Vitest | ✅ 本地/CI | P0 |
| v7 回归 | SWE-bench + 合同审计 | 自定义 benchmark | ✅ CI | P0 |
| v8 反事实/实验 | 自建离散事件仿真器 | MuJoCo / AI2-THOR | ⚠️ 部分 CI | P1 |
| v9 多本体 | Minecraft (Mineflayer) | ROS2 + Gazebo | ❌ 需独立 runner | P2 |
| v10 部署漂移 | Kubernetes (Kind) | LLM A/B 沙盒 | ⚠️ CI 夜间运行 | P2 |
| v11 红队 | 纯代码对抗审计 | — | ✅ CI | P1 |
| v11 长期演化 | 加速多 agent 仿真 | 概念推演 + 小型实验 | ❌ 独立实验室 | P3 |

---

## 8. 下一步行动建议

### 立即做（本周）
1. 在 `causal-learner/mcp-server/tests/` 下创建 `node:test` 入口文件 `index.test.ts`
2. 将 `ref-algebra.ts` 的核心组合律导出为 Z3 Python 脚本，放入 `tests/formal/`
3. 修复 `intent-alignment-audit.mjs` 的 Mode-1 误报，使其对 v7 对象零误报

### 短期做（本月）
4. 为 v8 搭建**离散事件仿真器**（一个极简 TypeScript 因果世界，如「咖啡机世界」或「交通灯世界」）
5. 将 `CounterfactualScenario` 和 `MechanismProgram` 接入仿真器，跑通第一个反事实测试用例
6. 用 Mineflayer 搭建**双 agent Minecraft 沙盒**，验证 `OntologyModel` / `TranslationFunctor` 的雏形

### 中期做（未来季度）
7. 在 Kubernetes 上建立**可逆部署测试床**，验证 `DeploymentShiftModel` 的漂移检测
8. 运行第一次**红队审计**，生成 v11 宪法层的 challenge 记录
9. 设计并运行**加速长期演化实验**（100 agents × 10k episodes），产出第一篇 v11 能力评估报告

---

## 9. 附录：为什么某些热门测试平台不适合我们

| 平台 | 不适合的原因 |
|------|-------------|
| **ARC-AGI** | 测的是人类风格的抽象推理，不是因果发现、反事实实验或本体联邦。与 v7-v11 的目标交集很小。 |
| **MMLU / GSM8K** | 静态问答基准，无法验证「生成假设 → 设计实验 → 观测反馈 → 修正本体」的闭环。 |
| **SWE-bench** | ✅ 适合 v7 的「修复记录 → 编译 → 验证」子链路，但不覆盖 v8+ 的因果发现能力。保留作为 Layer 4 集成测试。 |
| **HumanEval** | 代码生成基准，与系统的核心目标（世界建模与求真）无关。 |
| **MuJoCo 全部环境** | 太重、太黑盒。我们只需要一个最小物理场景（如倒立摆）验证连续动力学预测即可。 |

**结论**：v7 之后，没有现成benchmark能直接测我们的系统。必须**自建仿真世界**，这是由 v8-v11 的设计本质决定的。
