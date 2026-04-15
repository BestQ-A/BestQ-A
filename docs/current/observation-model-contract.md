---
kind: contract
status: current
phase: 2
schema_version: 1
describes: "观测投影对象规范"
upstream:
  - v8_generative_ontology.md
  - v11_reflexive_civilization_engine.md
downstream:
  - support-link-contract.md
  - v7-world-model-contract.md
verified: 2026-04-14
---

# ObservationModel 合同：从世界状态到 ObservationRecord 的投影模型

## §1 定位

`ObservationRecord` 已经是一等对象，但它还不能被误认为"世界事实本身"。

`ObservationModel` 的职责，是定义：

- 世界中的哪些状态 / 变量可以被观测
- 观测输出会以什么信号形式出现
- 噪声、偏差、盲区从哪里来
- 一条 `ObservationRecord` 到底是通过什么投影机制生成的

一句话：

```text
世界状态 ≠ ObservationRecord
ObservationModel = 从状态到观测的投影规则
```

它的作用不是替代 `ObservationRecord`，而是给 `ObservationRecord` 一个上游来源。

---

## §2 与现有对象的关系

目标关系链：

```text
EntityClass / StateVarClass / LatentStateClass
  → ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
```

### 2.1 它不是什么

- 不是 `ObservationRecord` 的副本
- 不是 `SupportLink`
- 不是 `MechanismClass`
- 不是 `InstrumentModel` 的全部替代

### 2.2 它回答什么问题

给定一条 ObservationRecord，系统应该能回答：

1. 这是通过哪个 ObservationModel 生成的？
2. 这个模型看见了什么？
3. 这个模型看不见什么？
4. 这个模型在哪些情况下可能有噪声或偏差？

---

## §3 TypeScript 接口草案

```typescript
interface ObservationModel {
  id: string;
  name: string;
  description: string;

  // ---- 输入端：世界中哪些状态可进入观测 ----
  observedStateRefs: string[];        // StateVarClass / LatentStateClass / EntityClass refs

  // ---- 输出端：会发射哪些观测信号 ----
  outputSignals: ObservationSignalSpec[];

  // ---- 观测限制 ----
  blindSpots: string[];               // 看不见的变量 / 结构
  noiseModel: string[];               // 噪声来源
  biasModel: string[];                // 偏差来源

  // ---- 运行上下文 ----
  observerModelRef?: string;          // 谁在看（可选，后续接 Perspective / Observer）
  instrumentModelRef?: string;        // 用什么看（可选，后续接 Instrument）
  validityEnvelope?: string[];        // 在哪些上下文下可信

  createdAt: string;
  createdBy: string;
  status: 'draft' | 'current' | 'deprecated';
}

interface ObservationSignalSpec {
  key: string;                        // ObservationRecord.payload 中的 key
  valueType: 'number' | 'boolean' | 'enum' | 'text' | 'vector';
  semantics: string;                 // 该信号的含义
  optional?: boolean;                // 是否可缺失
}
```

---

## §4 最小不变量

1. `outputSignals` 非空  
   没有输出信号的 ObservationModel 没有存在意义。

2. `blindSpots`、`noiseModel`、`biasModel` 允许为空数组，但不可为 `null`  
   这样可以区分“当前未声明”和“结构缺失”。

3. `outputSignals[].key` 必须唯一  
   一个 ObservationModel 不能在同一 payload key 上表达两个不同语义。

4. ObservationModel 不能直接产出 Claim  
   它只描述“如何观察”，不描述“该相信什么”。

5. `status = current` 时，至少应有一个真实 `ObservationRecord` 通过它生成  
   否则它只是孤立草案。

---

## §5 与 ObservationRecord 的绑定目标

终局目标：

```typescript
interface ObservationRecord {
  id: string;
  episodeId: string;
  observationModelId: string;   // 新增
  t: number | string;
  source: string;
  payload: Record<string, unknown>;
}
```

### 5.1 当前语义

当前主线下：

- 新生成的 `ObservationRecord` 必须带 `observationModelId`
- `SupportLink` 必须能沿 `ObservationRecord -> ObservationModel` 回溯
- `contract-audit` 已能检查这条基础绑定真值

### 5.2 为什么必须加这个字段

否则后面系统永远无法回答：

- 这条 ObservationRecord 的噪声假设是什么？
- 这条 ObservationRecord 是否来自某个带偏差的观测通道？
- 这条 ObservationRecord 和另一个 ObservationRecord 是否真的可比？

---

## §6 与 SupportLink 的关系

`SupportLink` 不是"从世界状态到 Claim"的边，而是：

```text
ObservationRecord → Claim
```

所以：

- ObservationModel 决定 ObservationRecord 的观测语义
- SupportLink 决定 ObservationRecord 相对于 Claim 的证据语义

两者不能混层。

---

## §7 与 v8 / v11 的关系

### 7.1 为什么它来自 v8

`v8` 的真正增量不是“更多对象”，而是第一次把：

- 潜在状态
- 观测投影
- 机制程序

明确区分开。

ObservationModel 是其中最适合当前主线优先吸收的部分。

### 7.2 为什么它还没到 v11

`v11` 会进一步引入：

- ObserverModel
- InstrumentModel
- BlindSpots / Bias / Deployment Effects

但当前主线还不需要把整个 observer/instrument 层一次性压进来。

ObservationModel 是一个更轻、更稳的中间站。

---

## §8 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `ObservationModel` | `core/observation-model.ts` + store | ✅ 已实现（2026-04-14） | 后续接 Observer / Instrument 层 |
| `ObservationRecord.observationModelId` | `types.ts` + `submitObservation()` | ✅ 已实现（2026-04-14） | 后续进入更深层治理 |
| `SupportLink` | 已有类型与 store | ✅ 已能回溯 ObservationRecord → ObservationModel | 后续进入 audit 第二轮深检 |
| `ObservationRecord` | 已有类型 / 已持久化 | ✅ 已从 atom-derived record 升级为 model-anchored record | 后续补更强 schema |

---

## §9 下一步边界

本合同已进入 `current`，意味着以下基础链已成立：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
```

后续仍未完成、但**不阻止本合同转 current** 的内容：

- ObserverModel
- InstrumentModel
- 噪声函数
- 偏差校正算法

---

## §10 转 current 的条件

- [ ] `ObservationModel` 具备显式类型与持久化层
- [ ] `ObservationRecord.observationModelId` 已落地
- [ ] 至少一条 SupportLink 能回溯到 `ObservationRecord -> ObservationModel`
- [ ] contract-audit 能检查 ObservationRecord 与 ObservationModel 的基础绑定真值

---

## §11 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把 v8 中“观测是投影而不是事实本身”的思想，收束为 ObservationModel 专项合同 |
| 2 | 2026-04-14 | 升级为 `current`：ObservationModel/Store、ObservationRecord.observationModelId、SupportLink→ObservationRecord→ObservationModel 回溯链、contract-audit 第一轮检查均已落地 |
