---
kind: contract
status: current
phase: 3
schema_version: 1
describes: "StateSnapshot 对象规范"
upstream:
  - v7-world-model-contract.md
  - action-execution-contract.md
downstream:
  - transition-contract.md
---

# StateSnapshot 合同：Episode 某时刻的显式状态切片

## §1 定位

`EpisodeEvent` 已经记录：

- 发生了什么

但若系统要真正表达“状态如何演化”，还必须回答：

> **在某一时刻，系统状态是什么？**

`StateSnapshot` 的职责，就是把这个问题对象化。

一句话：

```text
EpisodeEvent   = happened
StateSnapshot  = state at time t
```

它不是：

- `EpisodeEvent`
- `ObservationRecord`
- `Transition`

它是 `Episode` 在某个时刻的状态切片。

---

## §2 关系链

目标关系链：

```text
Episode
  → StateSnapshot
  → Transition
  → StateSnapshot
```

第一轮最小场景：

```text
submitObservation()
  → initial StateSnapshot

executeExperimentDesign()
  → post-action StateSnapshot
```

---

## §3 TypeScript 接口

```typescript
interface StateSnapshot {
  id: string;
  episodeId: string;
  t: number | string;
  values: Record<string, unknown>;
  createdBy: string;
}
```

---

## §4 最小不变量

1. `episodeId` 必须非空  
   没有 Episode 归属的 snapshot 没有意义。

2. `values` 不可为 `null`  
   第一轮允许很小，但不能缺失。

3. `t` 必填  
   第一轮允许数字或字符串，但不能缺失。

---

## §5 与现有对象的边界

### 5.1 与 `EpisodeEvent`

`EpisodeEvent` 记录：

- 发生了什么动作/判断/落盘事件

`StateSnapshot` 记录：

- 那个时刻系统的状态切片

### 5.2 与 `ObservationRecord`

`ObservationRecord` 是观测条目。  
`StateSnapshot` 是状态聚合视图。

第一轮不要求两者一一对应，但允许后续：

- `ObservationRecord`
  → 参与构成
  → `StateSnapshot.values`

### 5.3 与 `Transition`

`Transition` 负责连接两个 `StateSnapshot`。  
`StateSnapshot` 本身不表示变化，只表示状态。

---

## §6 与当前代码的映射

| 目标对象 | 当前最接近对象 | 现状判断 | 升级方向 |
|---|---|---|---|
| `StateSnapshot` | `types.ts` 接口壳 + `state-snapshot.ts/store.ts` | 已实现 | 纳入合同主线 |
| `initial snapshot` | `submitObservation()` runtime 生成 | 已实现 | 纳入治理 |
| `post-action snapshot` | `executeExperimentDesign()` runtime 生成 | 已实现 | 纳入治理 |

---

## §7 当前实现范围

当前已成立：

1. `StateSnapshot` 显式对象存在
2. `StateSnapshotStore` 可持久化
3. `submitObservation()` 自动生成 initial snapshot
4. `executeExperimentDesign()` 生成 post-action snapshot
5. artifact / contract-audit 已接入第一轮治理

当前不宣称：

- `values` 已足够表达世界状态全貌
- `t` 已有严格时序语义
- `StateSnapshot` 与 `ObservationRecord` 已完全对齐

---

## §8 转 current 的条件

- [x] `StateSnapshot` 成为显式对象并可持久化（2026-04-14）
- [x] 至少一个 Episode 在创建时自动生成 initial snapshot（2026-04-14）
- [x] 至少一个 post-action snapshot 样例跑通（2026-04-14）
- [x] contract-audit 能检查基础绑定真值（episode / values）（2026-04-14）

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把已实现的 StateSnapshot 对象与治理条件正式收束为 current 合同 |
