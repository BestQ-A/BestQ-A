---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "显式求解与本体更新"
superseded_by: v6-world-model-contract.md
---

# Epistemic Contract：显式求解环与本体学习环

> **本合同已被 [v6-world-model-contract.md](v6-world-model-contract.md) 取代**（2026-04-13）。保留作为演化记录，不再作为设计依据。

> 本文档把 BestQ-A 的认识论目标正式化：系统的核心资产不是“答案文本”，而是**可回放实例、可审计证据、可比较假设、可复用机制、可更新本体**。
> 本合同是 **目标态 draft contract**。它定义 v6 方向，但不宣称仓内已完整实现。
> 当且仅当 `Reconstruction`、结构化 `Conclusion`、显式 `OntologyUpdate` 成为一等对象并接入主流程后，本文件才可转为 `status: current`。
> 上游依赖：[metamodel.md](metamodel.md)、[pipeline-contract.md](pipeline-contract.md)、[hypothesis-contract.md](hypothesis-contract.md)、[compile-promotion-contract.md](compile-promotion-contract.md)

---

## 0. 两条根公理

### 公理 A：答案不是主资产，生成轨迹才是主资产

系统不得把一次回答建模为“问题 → 文本答案”的一次性模式补全。

系统必须把一次回答建模为：

```text
问题
  → 收集 Observation
  → 绑定 Evidence
  → 形成 / 比较 Hypothesis
  → 选择 Mechanism / Path
  → 生成 Conclusion
  → 保留 Rejected Alternatives
```

**含义**：

- 结论可以错，但错因必须可定位
- 过程必须可回放、可审计、可复用
- 以后遇到相似问题时，系统应优先延续已有结构，而不是重新“灵光一现”

### 公理 B：经历不是聊天记录，而是世界模型的一次采样

系统不得把一次实践经历仅存为“问题 A → 解法 B”的薄 case。

系统必须把一次经历视为：

```text
某些条件成立
某些现象被观察到
某些机制被激活
某些结果最终发生
```

因此，一次经历的本体地位是：

**Instance Sample of World Model**

---

## 1. 系统的两个闭环

### 1.1 问题求解环

目标：解决当前问题。

```text
Observation 收集
  → Hypothesis 生成
  → Evidence 补全
  → Mechanism 判断
  → Conclusion / Action
```

它回答的是：

- 这次最可能是什么原因？
- 这次应该采取什么动作？
- 这次有哪些链路被排除？

### 1.2 本体学习环

目标：用这次经历修正系统对世界的理解。

```text
Instance
  → 抽象稳定结构
  → 更新 Class / Relation / Pattern
  → 驳回错误假设
  → 形成 OntologyUpdate
```

它回答的是：

- 这次经历对世界模型新增了什么？
- 哪些关系被强化、弱化、否定？
- 哪个类需要细分、合并或重命名？

**硬约束**：

- 系统不得只有求解环，没有学习环
- 每个已完成实例都必须产生：
  - `OntologyUpdate`
  - 或 `NoUpdateReason`

---

## 2. 一等对象

本合同要求系统的核心对象不再以 QA 对为中心，而以以下对象为中心：

### 2.1 Observation

**定义**：被观察到的现象，不自带解释。

例如：

- 接口超时
- 日志出现 `AttributeError`
- residual 在某阶段升高
- glint 相对 pupil 出现系统性偏移

**约束**：

- Observation 只陈述“看到了什么”
- 不得直接把结论塞进 Observation

### 2.2 Evidence

**定义**：支撑或反驳某个判断的证据对象。

例如：

- 日志片段
- 测试结果
- 标定统计
- 实验观测

**约束**：

- Evidence 必须可追溯来源
- Evidence 必须可绑定到一个或多个 Hypothesis / Mechanism

### 2.3 Hypothesis

**定义**：对现象的候选解释。

例如：

- 是 DNS 故障
- 是几何参数错配
- 是 side camera 系统性偏差

**约束**：

- Hypothesis 必须是显式对象，不能只留在 LLM 隐式链路里
- Hypothesis 的通过、驳回、取代必须可审计

### 2.4 Mechanism

**定义**：比单个假设更稳定的关系或解释结构。

例如：

- A `causes` B
- A `indicates` B
- A `requires` B
- A 与 B 共现但不构成因果

**约束**：

- Mechanism 是世界模型的一部分，不是一次性回答副产物
- Mechanism 必须能由多个实例反复支撑或修正

### 2.5 Class

**定义**：问题类、机制类、失败类等更高层抽象。

例如：

- 网络连通性故障
- 几何退化问题
- 反射模型失配

**约束**：

- Class 不等于标签
- Class 必须服务于检索约束、比较边界、实例聚类与本体更新

### 2.6 Instance

**定义**：一次真实发生的、具备上下文与结果的经历。

**它不是聊天记录。**

它至少包含：

- 输入条件
- Observation 集合
- Evidence 集合
- 候选 Hypothesis
- 最终选中的 Mechanism
- 结果 / 动作 / Outcome

### 2.7 Reconstruction

**定义**：从已知 Observation、Evidence、Mechanism 与实例条件中，重建此次主要发生过程的结构化结果。

**这是本合同新增的一等目标对象。**

系统最终必须支持：

```text
case → abstract mechanism
mechanism + instance conditions → reconstruct main case chain
```

### 2.8 Conclusion

**定义**：给人直接使用的结论层输出。

它不是系统唯一产物，只是对外投影。

### 2.9 OntologyUpdate

**定义**：本次实例对世界模型产生的结构化修正。

包括但不限于：

- 新增 / 合并 / 细分 Class
- 强化 / 弱化 / 驳回 Relation
- 新增 Pattern / Invariant
- 记录反例和边界条件

---

## 3. 主输出必须分两层

### 3.1 结论层（给人用）

```typescript
interface Conclusion {
  answer: string;
  recommendedAction?: string[];
  priority?: 'low' | 'medium' | 'high';
  confidence: number;            // 0..1
}
```

### 3.2 重建层（给系统积累资产）

```typescript
interface Reconstruction {
  observationIds: string[];
  evidenceIds: string[];
  hypothesisIds: string[];
  selectedMechanism: string;     // mechanism / path / rule id
  rejectedAlternatives: string[];
  causalChain: string[];         // ordered chain
  classIds: string[];
  ontologyUpdateIds?: string[];
}
```

**硬约束**：

- 系统不得只输出 `Answer: X`
- 每个高置信结论都必须附带重建层
- 若证据不足，系统可以拒答，但必须输出“缺什么 Observation / Evidence”

---

## 4. 结论包络不变量

任何可落盘的求解结果都必须满足：

### 4.1 No Free-Floating Answer

不得存在无法追溯到 `Observation / Evidence / Hypothesis / Mechanism` 的裸答案。

### 4.2 Rejected Alternatives Must Survive

被排除的备选解释不得在生成结论时丢失。

### 4.3 Confidence Must Be Structural

`confidence` 不得只来自 LLM 的语气词，必须来自结构证据：

- evidence 数量
- evidence 一致性
- mechanism 稳定性
- rejected alternatives 的排除力度

### 4.4 Every Solved Instance Must Feed Learning

每个已求解实例必须产生：

- `OntologyUpdate`
- 或 `NoUpdateReason`

否则视为“只消费经验，不积累经验”。

---

## 5. 与现有仓内对象的映射

本节说明“目标态认识论对象”与“现有代码对象”如何对齐。

| 目标态对象 | 当前最接近对象 | 现状判断 |
|---|---|---|
| `Observation` | `core/types.ts` 中的 `Observation` | 已有一等对象 |
| `Evidence` | `core/evidence.ts` + `metamodel.md` 的 Evidence | 已有一等对象 |
| `Hypothesis` | `core/hypothesis.ts` | 已有一等对象 |
| `Mechanism` | `Ref` / `PatternTemplate` / `RegulationView` 的组合 | 已有局部实现，但边界仍分散 |
| `Class` | `ProblemClass` + pattern / cluster 的组合 | 已有基础，但尚非统一本体层 |
| `Instance` | `Story/Case` + Observation + Fix/Evidence 的组合 | 语义接近，但仍缺统一 first-class envelope |
| `Reconstruction` | 无显式对象 | **未实现** |
| `Conclusion` | 当前 answer / suggestion / search result 文本 | 有投影，无统一结构合同 |
| `OntologyUpdate` | compile / promote / future memory updates 的分散结果 | **未实现为一等对象** |

---

## 6. 实现含义

本合同对工程实现提出以下要求：

### 6.1 输出合同必须升级

主流程最终输出不能只返回：

- answer
- suggestion
- regulation list

而必须返回：

- `Conclusion`
- `Reconstruction`
- `OntologyUpdate | NoUpdateReason`

### 6.2 Instance 必须成为可落盘资产

每次真实经历都必须能作为可复用 Instance 被保存，而不是只散落在：

- Story
- Evidence
- compile side effects

### 6.3 Reconstruction 必须成为显式能力

系统必须支持：

- 从实例抽象机制
- 从机制 + 条件回放主要过程

没有 Reconstruction，系统就只有 retrieval，没有“过程重建”。

### 6.4 OntologyUpdate 必须与求解结果绑定

系统不得把“求解成功”和“世界模型更新”分成两个互不相干的副作用。

---

## 7. 目标态接口草案

```typescript
interface EpistemicSolveResult {
  instanceId: string;
  conclusion: Conclusion;
  reconstruction: Reconstruction;
  ontologyUpdate?:
    | { kind: 'applied'; updateIds: string[] }
    | { kind: 'proposed'; proposalIds: string[] }
    | { kind: 'none'; reason: string };
}
```

---

## 8. 转为 current 的条件

本合同只有在以下条件满足后，才可从 `draft` 转为 `current`：

1. `Reconstruction` 成为显式对象并可落盘
2. 主流程输出统一 `Conclusion + Reconstruction`
3. `OntologyUpdate` 成为显式对象，而非隐含 side effect
4. 至少一条主路径能从实例回放主要机制链
5. contract audit 能检查上述对象的存在性与基本绑定关系

---

## 9. 一句话版目标

系统的中心不再是：

**生成答案**

而是：

**积累可重建世界的结构化知识，并在此基础上生成答案**

更狠一点说：

**不是做一个会说的系统，而是做一个会取样、会建模、会重建、会更新本体的系统。**
