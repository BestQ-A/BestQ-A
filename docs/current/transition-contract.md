---
kind: contract
status: current
phase: 3
schema_version: 1
describes: "Transition 对象规范"
upstream:
  - state-snapshot-contract.md
  - action-execution-contract.md
  - v7-world-model-contract.md
downstream:
  - none
---

# Transition 合同：连接两个 StateSnapshot 的显式状态转移边

## §1 定位

`StateSnapshot` 已经回答：

- 某一时刻系统状态是什么

但若系统要表达演化，还必须回答：

> **状态是如何从一个切片变到下一个切片的？**

`Transition` 的职责，就是把这个变化对象化。

一句话：

```text
StateSnapshot = state
Transition    = change
```

它不是：

- `StateSnapshot`
- `ActionExecution`
- `MechanismInstance`

它是状态切片之间的连接边。

---

## §2 关系链

目标关系链：

```text
StateSnapshot
  → Transition
  → StateSnapshot
```

第一轮最小场景：

```text
source snapshot
  → transition(causedByActionId)
  → target snapshot
```

---

## §3 TypeScript 接口

```typescript
interface Transition {
  id: string;
  episodeId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  causedByActionId?: string;
  candidateMechanismIds: string[];
  createdBy: string;
}
```

---

## §4 最小不变量

1. `episodeId` 必须非空
2. `fromSnapshotId !== toSnapshotId`
3. `candidateMechanismIds` 可为空数组，但不可为 `null`

---

## §5 与现有对象的边界

### 5.1 与 `StateSnapshot`

`StateSnapshot` 是节点。  
`Transition` 是边。

### 5.2 与 `ActionExecution`

第一轮里：

- `causedByActionId` 允许引用 `ActionExecution.id`

但 `Transition` 不等于动作本身。  
动作是触发原因，转移是状态变化记录。

### 5.3 与 `MechanismProgram`

第一轮不要求 `candidateMechanismIds` 已完成真实机制归因。  
它们当前可以为空数组。

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `Transition` | `types.ts` 接口壳 + `transition.ts/store.ts` | 已实现 | 纳入合同主线 |
| `causedByActionId` | `executeExperimentDesign()` runtime 写入 | 已实现 | 纳入治理 |
| `candidateMechanismIds` | 最小空数组 | 部分实现 | 后续再接机制归因 |

---

## §7 当前实现范围

当前已成立：

1. `Transition` 显式对象存在
2. `TransitionStore` 可持久化
3. `executeExperimentDesign()` 生成最小 transition
4. `transition.causedByActionId === actionExecution.id`
5. artifact / contract-audit 已接入第一轮治理

当前不宣称：

- `candidateMechanismIds` 已完成真实机制归因
- `fromSnapshotId` 与 `toSnapshotId` 的时间语义已完全校正
- transition 已可用于 replay 级状态演化

---

## §8 转 current 的条件

- [x] `Transition` 成为显式对象并可持久化（2026-04-14）
- [x] 至少一条 `source snapshot → transition → target snapshot` 样例跑通（2026-04-14）
- [x] `causedByActionId === actionExecution.id` 的最小绑定成立（2026-04-14）
- [x] contract-audit 能检查基础绑定真值（episode / snapshots / action）（2026-04-14）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把已实现的 Transition 对象与治理条件正式收束为 current 合同 |
