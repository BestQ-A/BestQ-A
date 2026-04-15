---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "机制程序对象规范"
upstream:
  - v8_generative_ontology.md
  - mechanism-class-contract.md
downstream:
  - mechanism-instance-contract.md
  - reconstruction-contract.md
---

# MechanismProgram 合同：从动力学模板到可执行状态转移程序

## §1 定位

`MechanismClass` 已经把机制从“静态关系模板”推进到了“带阶段的动力学骨架”。  
但若想让未来的 `CounterfactualScenario / ExperimentDesign` 不空转，机制还必须再前进一步：

> **从“可描述的骨架”升级为“可执行的状态转移程序”。**

因此：

- `MechanismClass` 负责：定义一种机制的结构身份
- `MechanismProgram` 负责：定义这种机制如何在时间上改变状态、发射观测、响应干预

一句话：

```text
MechanismClass = 机制是什么
MechanismProgram = 机制如何运行
```

---

## §2 与现有对象的关系

目标关系链：

```text
MechanismClass
  → MechanismProgram
  → MechanismInstance
  → AcceptedReconstruction
```

### 2.1 它不是什么

- 不是 `PatternTemplate`
- 不是 `MechanismInstance`
- 不是 `DerivationTrace`
- 不是 `CounterfactualScenario`

### 2.2 它回答什么问题

给定一个具体 Episode，系统应该能问：

1. 这个机制如果被触发，会经历哪些 phase？
2. 每个 phase 预期改变哪些状态？
3. 每个 phase 预期发出哪些 observation？
4. 哪些 phase 可被 intervention 改写？
5. 在什么边界外，这个程序不应再被认为有效？

---

## §3 TypeScript 接口草案

```typescript
interface MechanismProgram {
  id: string;
  mechanismClassRef: string;         // 指向 MechanismClass
  name: string;
  description: string;

  // ---- 输入 ----
  inputStateRefs: string[];          // StateVarClass / LatentStateClass refs
  contextInputRefs: string[];        // ConstraintClass refs
  preconditions: string[];           // 触发前提

  // ---- 核心程序 ----
  phases: MechanismProgramPhase[];

  // ---- 输出 ----
  emittedObservationSignals: string[]; // ObservationModel.outputSignals.key 对齐
  outcomes: string[];

  // ---- 可干预点 ----
  interventionPoints: string[];      // phase names / point ids

  // ---- 有效域 ----
  validityEnvelope: string[];        // 适用上下文 / 范围
  failsWhen: string[];               // 失效条件

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

interface MechanismProgramPhase {
  name: string;
  expectedStateChanges: string[];    // 本 phase 预期造成的状态变化
  expectedObservations: string[];    // 本 phase 预期发出的 observation keys
  thresholdTriggers?: string[];      // 阈值触发条件
}
```

---

## §4 最小不变量

1. `phases` 非空  
   没有 phase 的 MechanismProgram 不能称为程序。

2. `emittedObservationSignals` 必须覆盖所有 `phases.expectedObservations` 的并集  
   否则 phase 和程序头部定义不一致。

3. `interventionPoints` 中的每个名称必须能在 `phases` 中找到对应位置  
   否则“可干预点”只是注释。

4. `status = current` 时至少有一个 `MechanismInstance` 使用过它  
   否则它仍只是孤立草案。

5. `failsWhen` 可为空数组，但不可为 null  
   失效面可以暂时未知，但结构不能缺失。

---

## §5 与现有合同的精确关系

### 5.1 与 `MechanismClass` 的关系

`MechanismClass` 继续保留它的职责：

- 机制的类身份
- 机制的命名与语义边界
- 机制的晋升 / 退役语义

`MechanismProgram` 则补充：

- phase 顺序
- 状态变化
- 观测发射
- intervention 响应
- 失效条件

所以关系应当是：

```text
一个 MechanismClass
  可以有 0..N 个 MechanismProgram 版本
```

### 5.2 与 `ObservationModel` 的关系

`MechanismProgram` 不能直接定义“世界看起来怎样”，它只能定义：

- 哪些观测信号应该被发射

这些信号最终如何投影成 `ObservationRecord.payload`，由 `ObservationModel` 决定。

也就是说：

```text
MechanismProgram 发射 signal
ObservationModel 投影 signal
ObservationRecord 承载 signal
```

### 5.3 与 `MechanismInstance` 的关系

`MechanismInstance` 是某个程序在某次 Episode 中的具体绑定。

终局方向应是：

```text
MechanismProgram
  → bind into Episode
  → MechanismInstance
```

### 5.4 与 `AcceptedReconstruction` 的关系

未来 `AcceptedReconstruction` 不能只靠：

- path proxy
- atom sequence

它应逐步改为：

- 回放某个或某组 `MechanismProgram`
- 比较回放结果与 Episode 轨迹

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `MechanismProgram` | `mechanism-class-contract.md` 中的 phase / observable / intervention 骨架 | 尚未显式对象化 | 新增 `core/mechanism-program.ts` / store |
| `phases` | `MechanismClass.phases` | 已有概念草案 | 可复用并提升为程序对象 |
| `emittedObservationSignals` | `MechanismClass.observableSignatures` | 已有概念草案 | 与 `ObservationModel.outputSignals.key` 对齐 |
| `failsWhen` | `MechanismClass` 尚未结构化收口 | 缺口 | 明确写入程序对象 |

---

## §7 第一轮实现建议

本合同当前仍是 `draft`，第一轮不要求完整执行引擎。

建议最小实现：

1. 新增 `mechanism-program.ts`
2. 新增 `mechanism-program-store.ts`
3. 给 `MechanismClass` 预留 `mechanismProgramId` 或等价关联位置
4. 至少支持一个默认 / demo 级 `MechanismProgram`

不要求：

- 真正的 phase 执行器
- replay engine 重写
- CounterfactualScenario
- ExperimentDesign

---

## §8 转 current 的条件

- [ ] `MechanismProgram` 成为显式对象并可持久化
- [ ] 至少一个 `MechanismInstance` 可回指到 `MechanismProgram`
- [ ] `AcceptedReconstruction` 至少有一条路径开始从程序对象派生，而不只是 path proxy
- [ ] `MechanismProgram.emittedObservationSignals` 能与 `ObservationModel` 对齐

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 v8 中“机制是程序”的思想收束为当前主线可吸收的中层合同 |
