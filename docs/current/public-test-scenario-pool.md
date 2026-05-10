---
kind: contract
status: draft
phase: 1
schema_version: 1
describes: "公开测试场景池"
---

# 公开测试场景池：BestQ-A 的外部验收样本来源

> 本文档定义一组可直接用于 BestQ-A 验收、回归与阶段演进的公开测试场景。
> 选择标准只有四条：有外部真值、有证据链、有失败语义、能映射到当前 pipeline 或其后续扩展。
> 上游依赖：[pipeline-contract.md](pipeline-contract.md)、[metrics-contract.md](metrics-contract.md)、[testing-roadmap-v7-to-v11.md](testing-roadmap-v7-to-v11.md)

---

## 1. 选择原则

- 优先选**真实世界闭环**，不优先选静态答题集。
- 优先选**有外部真值**的场景，例如真实 patch、可执行测试、人工标注证据、仿真器轨迹。
- 优先选**可审计失败**的场景，即失败后能明确回答是分类错、搜索错、编译错、证据错还是翻译错。
- 优先选**能沉淀为产物**的场景，即运行后可以写出 `Story`、`Reconstruction`、`Evidence`、`OntologyDelta`、`ConflictSet` 等对象。

---

## 2. 场景池总表

| 场景族 | 公开来源 | 外部真值 | 主要验证能力 | CI 可行性 | 优先级 |
|------|----------|----------|--------------|-----------|--------|
| `SWE-bench Lite / Verified` | GitHub issue + patch 数据集 | 测试通过 / patch 结果 / issue 语义 | `submitObservation -> search -> recordFix` 主闭环，软件问题解释与修复沉淀 | 高 | P0 |
| `BugsInPy` | Python 开源项目真实 bug/fix | failing/passing tests + fix commit | 跨仓泛化、回归风险、失败边界记录 | 高 | P0 |
| `Defects4J` | Java 真实 bug/fix | failing/passing tests + patch | 跨语言验证当前 pipeline 是否过度依赖 Python 语料 | 中 | P1 |
| `FEVER / SciFact` | 公开 claim-evidence 数据集 | claim label + evidence set | `Evidence` 层的 support / contradict 显式记录，避免静默编造 | 高 | P0 |
| `MiniGrid` | 开源离散仿真环境 | 可复现 state transition 与 reward | v8 反事实、实验设计、信息增益选择 | 中 | P1 |
| `AI2-THOR / VirtualHome` | 开源交互仿真环境 | 轨迹、状态、动作后果 | 观察盲区、阶段程序执行、感知与真实状态分离 | 低到中 | P2 |
| `Wikidata ↔ DBpedia / Schema.org` | 公开知识图谱 | 对齐关系、schema、实体映射 | v9 本体翻译、loss/conflict 显式保留 | 中 | P1 |
| `OpenTelemetry Demo` | 开源微服务演示系统 | 指标、trace、部署前后行为差异 | v10 部署漂移、观测与真实因果分离 | 中 | P2 |
| `DeathStarBench` | 开源微服务基准 | 延迟、错误率、资源变化 | 复杂服务链路下的 deployment shift 与压力退化 | 低 | P2 |

---

## 3. 当前项目最匹配的首批场景

### 3.1 `SWE-bench Lite / Verified`

**为什么最匹配**：
- 仓内已经存在 `SWE-bench` 资产和 `causal-learner` 集成痕迹。
- 当前系统最强的链路正是软件问题的观测、候选解释、修复回写与产物审计。

**建议用途**：
- 作为 `P0` 主验收集。
- 作为每次 pipeline / MCP 改动后的回归基线。

**建议首批规模**：
- `20-50` 个人工筛过的 Lite 样本。
- 优先选描述清楚、修复单点、测试稳定的 issue。

**重点检查**：
- `submitObservation` 是否稳定创建 `Story`。
- `search` 是否返回可解释候选而不是空白结果。
- `recordFix` 后是否稳定写出 `Reconstruction`、`OntologyDelta`、`Evidence`。
- 运行产物是否通过 contract audit。

### 3.2 `BugsInPy`

**为什么值得加**：
- 与 `SWE-bench` 同属真实 bug/fix，但数据组织方式不同。
- 能补足“同类软件问题，不同仓库结构”的泛化验证。

**建议用途**：
- 作为 `P0` 第二验收集。
- 用于验证当前系统是否只对 GitHub issue 风格文本有效。

**建议首批规模**：
- `10-20` 个 bug。
- 优先选单测试失败、修复范围小、可明确定位失败边界的样本。

**重点检查**：
- 同一 symptom 是否被错误压缩成同一机制。
- 修复后是否有明显回归漏记。
- 失败边界是否能沉淀到 `FailureBoundaryArchive` 风格产物。

### 3.3 `FEVER / SciFact`

**为什么必须补**：
- 当前项目不只是“修 bug”，还强调“证据为什么成立”。
- 这类数据集适合单独验证 `Evidence` 层，而不是把一切都绑在 patch 成功上。

**建议用途**：
- 作为 `P0` 证据层验收集。
- 用于验证 support / contradict 能否并存并被显式保留。

**建议首批规模**：
- `50-100` 个 claim-evidence 对。
- 优先选证据明确、冲突关系清楚的样本。

**重点检查**：
- `support` 与 `contradict` 是否都被正确写入。
- 缺证据时是否返回“不足以确认”，而不是默认强结论。
- 是否能保留被拒绝的替代解释，而不是静默覆盖。

---

## 4. 分阶段映射

| 阶段 | 推荐场景 | 作用 |
|------|----------|------|
| v7 主闭环 | `SWE-bench Lite / Verified`、`BugsInPy`、`FEVER / SciFact` | 验证 observation / fix / evidence / reconstruction 主链 |
| v8 反事实与实验设计 | `MiniGrid` | 验证 `CounterfactualScenario`、`ExperimentDesign`、信息增益选择 |
| v9 本体联邦 | `Wikidata ↔ DBpedia / Schema.org` | 验证 `OntologyModel`、`TranslationFunctor`、`ConflictSet` |
| v10 部署漂移 | `OpenTelemetry Demo`、`DeathStarBench` | 验证 deployment-induced change 不被误记为世界规律 |
| v11 红队与长期演化 | 上述场景叠加对抗输入与长周期回放 | 验证宪法层、反例保留、灾难降级 |

---

## 5. 当前推荐落地顺序

1. `SWE-bench Lite / Verified`
2. `BugsInPy`
3. `FEVER / SciFact`
4. `MiniGrid`
5. `Wikidata ↔ DBpedia / Schema.org`
6. `OpenTelemetry Demo`

理由：前 3 类与当前仓库已经落地的 pipeline、合同审计、MCP 路由最贴合，且对 CI 最友好。

---

## 6. 不建议优先使用的公开基准

| 基准 | 不建议作为主验收集的原因 |
|------|--------------------------|
| `MMLU` | 静态问答，不验证证据闭环与修复沉淀 |
| `GSM8K` | 测的是算术推理，不测观察、反事实、审计产物 |
| `HumanEval` | 偏代码生成，不测世界建模与证据结构 |
| `ARC-AGI` | 偏抽象图形推理，与当前 pipeline 交集过小 |

这些基准可以作为补充参考，但不应充当 BestQ-A 的主验收门。

---

## 7. 首批验收包建议

### P0 验收包

- `SWE-bench Lite / Verified`：`20-50` 例
- `BugsInPy`：`10-20` 例
- `FEVER / SciFact`：`50-100` 例

**通过条件**：
- 自动化测试全绿。
- `contract-audit` 无 error。
- 抽样场景的关键产物可落盘、可回指、可审计。

### P1 扩展包

- `MiniGrid`
- `Wikidata ↔ DBpedia / Schema.org`

**通过条件**：
- 能稳定重跑。
- 反事实 / 翻译 / conflict 不再只是类型壳，而是有真实外部真值对照。

### P2 重场景包

- `OpenTelemetry Demo`
- `DeathStarBench`
- `AI2-THOR / VirtualHome`

**通过条件**：
- 至少支持夜间运行或独立 runner。
- 失败时能清楚区分性能退化、部署漂移、观测盲区、翻译丢失。

---

## 8. 结论

BestQ-A 当前最适合的公开测试场景，不是通用答题 benchmark，而是：

- 真实 bug/fix 数据集
- 证据标注数据集
- 可复现实验世界
- 公开知识图谱
- 开源可观测系统

如果只能先落一批，默认顺序是：`SWE-bench Lite / Verified` -> `BugsInPy` -> `FEVER / SciFact`。
