---
kind: contract
status: current
verified: 2026-04-17
phase: 10
schema_version: 1
describes: "文明记忆层对象规范"
upstream:
  - participatory-world-contract.md
  - ontology-federation-contract.md
downstream:
  - v11-world-model-contract.md
---

# CivilizationMemory Contract — v11

**状态**: current  
**版本**: v11.0  
**依赖**: v10 participatory-world-contract, v9 ontology-federation-contract

---

## 1. 动机

v10 引入了观察者和制度，但缺乏对"文明积累的失败知识"的建模。v11 引入文明记忆层：

- **FailureBoundaryArchive**：记录已知失败案例的边界条件，防止同一错误重复发生
- **CounterexampleCommons**：公共反例知识库，记录对已有理论的反驳证据

两者都是 append-only 的知识结构，体现"求真积累"的文明演化范式。

---

## 2. 核心对象

### 2.1 FailureBoundaryArchive

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`FBA_<hex>`） |
| `records` | `FailureRecord[]` | 失败记录（**append-only**，不可 null） |

**FailureRecord 不变量**

- **FR-I1**: `costs` 非空（至少一项代价）
- **FR-I2**: `boundaryConditions` 非空（至少一项边界条件）

**操作**

| 函数 | 说明 |
|------|------|
| `appendFailureRecord(archive, input)` | append-only 追加（返回新档案对象） |
| `queryRecordsByCostKind(archive, kind)` | 按代价类型过滤 |
| `queryRecordsByVariable(archive, varRef)` | 按边界条件变量过滤 |
| `checkBoundaryViolation(archive, varRef, value)` | 检查当前值是否触及已知边界 |

### 2.2 CounterexampleCommons

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`CC_<hex>`） |
| `entries` | `CounterexampleEntry[]` | 反例条目（**append-only**） |

**CounterexampleEntry 不变量**

- **CE-I1**: `evidenceRefs` 非空（至少一条证据）

**操作**

| 函数 | 说明 |
|------|------|
| `appendCounterexample(commons, input)` | append-only 追加 |
| `markCounterexampleAbsorbed(commons, id, note)` | 标记反例已被理论吸收 |
| `searchActiveCounterexamples(commons, claimRef)` | 搜索未被吸收的反例 |
| `searchBySeverity(commons, severity)` | 按严重程度过滤 |

---

## 3. 存储

| 对象 | Store 类 | 表名 |
|------|----------|------|
| FailureBoundaryArchive | `FailureBoundaryArchiveStore` | `failure_boundary_archives` |
| CounterexampleCommons | 内存（暂无持久化） | — |

---

## 4. 设计决策

- **Append-only 语义**：失败记录和反例条目一经写入不可修改。`appendFailureRecord` 和 `appendCounterexample` 均返回新对象（immutable update），原档案对象不变。
- **吸收（absorption）而非删除**：反例被新理论解释后不删除，而是标记 `absorbed: true`，保留知识积累轨迹。
- **边界违规检查**：`checkBoundaryViolation` 是实时预防工具，当新观测值触及历史失败边界时发出预警。
- **CounterexampleCommons 暂无持久化**：首轮以内存持有，v11.1 再引入 store。
