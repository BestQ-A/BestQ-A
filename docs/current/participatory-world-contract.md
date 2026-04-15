# ParticipativeWorld Contract — v10

**状态**: draft  
**版本**: v10.0  
**依赖**: v9 ontology-federation-contract, v8 mechanism-program-contract

---

## 1. 动机

v9 引入多本体并存，但仍假设观察者是"透明的"——任何 Agent 都能无偏差地观测一切。v10 引入参与式反射引擎：

- **ObserverModel**：每个观察者有位置、仪器偏差和盲区；其 ObservationRecord 受盲区约束
- **InstitutionModel**：参与者所处的制度规定哪些动作合法、哪些角色有权执行

---

## 2. 核心对象

### 2.1 ObserverModel

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`OBS_<hex>`） |
| `position` | string | 观察者位置（物理/角色/层级描述） |
| `instrumentBiases` | `InstrumentBias[]` | 仪器偏差列表 |
| `blindZoneSignalKeys` | string[] | 盲区信号 key（**不变量 I1：不可为 null**） |
| `ontologyId` | string? | 所属本体（v9 联邦） |

**不变量**

- **OBS-I1**: `blindZoneSignalKeys` 不为 null（可为空数组）

**操作**

| 函数 | 说明 |
|------|------|
| `filterObservations(observer, signals)` | 从信号 map 中移除盲区 key，返回 FilteredObservation |
| `applyInstrumentBias(observer, signals)` | 对数值型信号应用 systematic/threshold 偏差 |

### 2.2 InstitutionModel

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`IM_<hex>`） |
| `rules` | `InstitutionRule[]` | 制度规则（**不变量 I1：至少一条**） |
| `roleAssignments` | `RoleAssignment[]` | 角色分配（可为空） |
| `ontologyId` | string? | 所属本体 |

**不变量**

- **IM-I1**: `rules` 非空

**权限检查语义** (`checkRolePermission`)

1. 从 `roleAssignments` 找 agentRef 对应角色
2. 过滤 `constrainedActionKind === actionKind` 的规则，priority 降序
3. 遇到 `forbiddenRoles` 命中 → 拒绝
4. 遇到 `allowedRoles` 命中（或为空） → 允许
5. 无匹配规则 → 默认允许（开放世界假设）

---

## 3. 存储

| 对象 | Store 类 | 表名 |
|------|----------|------|
| ObserverModel | `ObserverModelStore` | `observer_models` |
| InstitutionModel | 内存（暂无持久化） | — |

---

## 4. 设计决策

- **ObserverModel 影响 ObservationRecord**：`filterObservations` 是纯函数，不修改原信号 map。
- **InstitutionModel 暂无 store**：制度模型是轻量配置，v10.1 再引入持久化。
- **开放世界假设**：无匹配制度规则时默认允许，避免过度限制探索阶段的 Agent 行为。
- **盲区与偏差分离**：盲区（blindZoneSignalKeys）完全过滤信号；偏差（instrumentBiases）修改信号值。两者可叠加使用。
