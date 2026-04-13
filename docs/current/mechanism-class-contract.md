---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "MechanismClass 动力学模板"
upstream:
  - v7-world-model-contract.md
  - pattern-template.ts
downstream:
  - mechanism-instance-contract.md
  - reconstruction-contract.md
---

# MechanismClass 动力学模板合约

## §1 定位

MechanismClass 是 Ontology Layer 的核心对象，描述世界中**某类现象如何在时间上展开**。

与 PatternTemplate（结构模式匹配）的关键区别：

| 维度 | PatternTemplate | MechanismClass |
|------|----------------|---------------|
| 层 | Relation Law Layer（结构图） | Ontology Layer（动力学） |
| 用途 | 检测图中是否存在某种连接模式 | 描述现象如何分阶段展开 |
| 核心字段 | slots, arrows, invariantChecks | phases, observableSignatures, interventionPoints |
| 实例化产物 | PatternInstance（图中的绑定） | MechanismInstance（Episode 中的绑定） |
| 回放能力 | 无（静态匹配） | 有（按 phases 回放 Episode.timeline） |

> **原则**：PatternTemplate 回答"图里有没有这个结构"；MechanismClass 回答"这次 Episode 里这个机制发生了吗"。

## §2 TypeScript 接口

```typescript
interface MechanismClass {
  id: string;
  name: string;
  description: string;

  // ---- 输入绑定 ----
  /** 与哪些 EntityClass / StateVarClass 绑定（slot 名 → 类 ID） */
  inputSlots: Record<string, string>;

  // ---- 过程骨架（replay 的依据） ----
  /** 有序过程分期，每期有名称和预期持续特征 */
  phases: MechanismPhase[];

  /** 触发前提（对应 Episode 开始时 StateSnapshot 的断言） */
  preconditions: string[];

  /** 应当出现的可观测特征（ObservationRecord.payload 中可检验的 key） */
  observableSignatures: string[];

  /** 可被动作打断/修正的阶段名称 */
  interventionPoints: string[];

  /** 可能的终局（success / failure / partial 等） */
  outcomes: string[];

  // ---- 晋升元数据 ----
  /** 支持该机制类的 Episode ID 列表（多 Episode 门控） */
  supportingEpisodeIds: string[];

  /** 编译状态 */
  compilationStatus: 'candidate' | 'compiled' | 'deprecated';

  createdAt: string;
  createdBy: string;
}

interface MechanismPhase {
  /** 阶段名称（如 latent / trigger / propagation / observation / outcome） */
  name: string;
  /** 该阶段预期的 StateVarClass 变化 */
  expectedStateChanges: string[];
  /** 该阶段预期出现的 ObservationRecord 特征（observableSignatures 的子集） */
  expectedObservations: string[];
}
```

## §3 与现有对象的关系

```
PatternTemplate (结构层)
      ↓  promote（≥ compileThreshold 次成功实例化）
MechanismClass (本体层)
      ↓  bind to Episode
MechanismInstance (经历层)
      ↓  select best
AcceptedReconstruction (推理层)
```

PatternTemplate 可以晋升为 MechanismClass，但不是必须路径。MechanismClass 也可以由 Ontology Review Agent 直接定义。

## §4 晋升门槛

MechanismClass 从 `candidate` 升为 `compiled` 必须满足：

1. `supportingEpisodeIds.length >= 2`（多 Episode 支持）
2. 至少两个 MechanismInstance 的 replayError < 0.3
3. 无强反例 Episode（没有 status='rejected' 的 MechanismInstance 覆盖率 > 0.7）
4. `phases` 非空，每个 phase 至少有一个 `expectedObservations`

## §5 replayError 计算基础

给定 `MechanismInstance`（bindings 已确定），replayError 计算：

```
replayError = 1 - (matched_observations / required_observations)
```

其中：
- `required_observations` = 所有 phases 的 `expectedObservations` 去重后的并集大小
- `matched_observations` = 在 Episode.timeline 中实际找到的匹配特征数

replayError 替代现有 `FidelityScore.score`（key_node_coverage）成为更精确的重建保真度指标。

## §6 不变量

1. `phases` 非空（`phases.length >= 1`）
2. `observableSignatures` 是所有 `phase.expectedObservations` 的超集
3. `interventionPoints` 中的每个名称必须对应 `phases` 中某个 phase.name
4. `compilationStatus = 'compiled'` 时 `supportingEpisodeIds.length >= 2`
5. MechanismClass ID 格式：`MC_<名称slug>_<hex4>`

## §7 与 v7 §2.2 的对应

本合约实现 `v7-world-model-contract.md` §2 本体层中 MechanismClass 的过程骨架要求，补充字段：`phases`, `observableSignatures`, `interventionPoints`, `outcomes`。

v7 合约中的精简接口（`inputs[]`, `preconditions[]` 等字符串数组）在本合约中细化为强类型字段。
