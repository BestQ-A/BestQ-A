---
kind: contract
status: draft
phase: 7
schema_version: 1
describes: "OntologyModel / TranslationFunctor / ConflictSet 本体联邦规范"
upstream:
  - v7-world-model-contract.md
  - mechanism-program-contract.md
downstream:
  - participatory-world-contract.md
---

# OntologyFederation Contract — v9

**状态**: draft  
**版本**: v9.0  
**依赖**: v7 world-model-contract, v8 mechanism-program-contract

---

## 1. 动机

v8 假设世界只有一套本体描述。v9 引入本体联邦：不同 Agent、Observer 或领域可以用不同的概念体系（OntologyModel）描述同一世界。OntologyFederation 提供跨本体翻译和冲突检测机制。

---

## 2. 核心对象

### 2.1 OntologyModel

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`OM_<hex>`） |
| `name` | string | 本体名称 |
| `version` | string | 语义化版本 |
| `concepts` | `OntologyConcept[]` | 概念集合（**不变量 I1：至少一个**） |
| `applicabilityScope` | string[] | 适用范围描述 |
| `isCanonical` | boolean | 是否为权威本体 |

**不变量**

- **OM-I1**: `concepts` 非空
- **OM-I2**: `concepts[].localId` 在同一本体内唯一

### 2.2 TranslationFunctor

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`TF_<hex>`） |
| `sourceOntologyId` | string | 源本体 |
| `targetOntologyId` | string | 目标本体 |
| `mappings` | `ConceptMapping[]` | 映射规则（**不变量 I1：至少一条**） |
| `strictMode` | boolean | 映射失败是否报错 |

**不变量**

- **TF-I1**: `mappings` 非空
- **TF-I2**: `sourceOntologyId ≠ targetOntologyId`
- **TF-I3**: `mapping.confidence ∈ [0,1]`

**执行语义** (`translateAtomRef`)

1. 解析 `sourceRef` 为 `(conceptLocalId, instanceId?)`
2. 验证 `conceptLocalId` 存在于源本体
3. 选取 `sourceConceptId === conceptLocalId` 且置信度最高的映射规则
4. 验证 `targetConceptId` 存在于目标本体
5. 返回 `TranslationResult`（成功/失败原因）

### 2.3 ConflictSet

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`CS_<hex>`） |
| `translationFunctorId` | string | 关联函子 |
| `entries` | `ConflictEntry[]` | 冲突条目（可为空数组） |

**ConflictEntry 字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `entityRef` | string | 冲突实体 ref |
| `ontologyAId` / `ontologyBId` | string | 两个本体 |
| `descriptionA` / `descriptionB` | string | 各本体的描述（JSON） |
| `kind` | ConflictKind | 冲突类型枚举 |
| `resolved` | boolean | 是否已解决 |

---

## 3. 操作

| 操作 | 函数 | 说明 |
|------|------|------|
| 翻译 Atom ref | `translateAtomRef(functor, ref, srcOM, tgtOM)` | 返回 TranslationResult |
| 追加冲突条目 | `appendConflictEntry(cs, entry)` | immutable update |
| 标记冲突解决 | `resolveConflictEntry(cs, entryId, resolution)` | immutable update |

---

## 4. 存储

| 对象 | Store 类 | 表名 |
|------|----------|------|
| OntologyModel | `OntologyModelStore` | `ontology_models` |
| ConflictSet | `ConflictSetStore` | `conflict_sets` |
| TranslationFunctor | 内存（暂无持久化） | — |

---

## 5. 设计决策

- **TranslationFunctor 暂无 store**：函子是轻量规则集，首轮可内存持有，v9.1 再持久化。
- **ConflictSet 是 append-only 追加语义**：通过 `appendConflictEntry` 追加，不修改已有条目；解决通过 `resolveConflictEntry` 标记。
- **多映射规则取置信度最高**：当一个 sourceConceptId 有多条映射规则时，`translateAtomRef` 取 confidence 最高者。
