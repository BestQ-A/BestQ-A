---
kind: contract
status: draft
phase: 11
schema_version: 1
describes: "ProofLineage / ConstitutionalLayer 反射性文明引擎规范"
upstream:
  - civilization-memory-contract.md
  - participatory-world-contract.md
downstream: []
---

# v11 World Model Contract — ReflexiveCivilizationEngine

**状态**: draft  
**版本**: v11.0  
**依赖**: v10 participatory-world-contract, civilization-memory-contract

---

## 1. v11 愿景

v11 是 BestQ-A 世界模型的最高抽象层：**反射性文明引擎**。

核心哲学：文明通过积累失败经验（v11 CivilizationMemory）和构建可追溯的求真证明体系（v11 ProofLineage + ConstitutionalLayer），实现自我反射和认识论演化。

---

## 2. 核心对象

### 2.1 ProofLineage（证明谱系）

ProofLineage 将一条或多条 DerivationTrace 组合为"证明血统"，关注从前提到结论的谱系可追溯性。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`PL_<hex>`） |
| `conclusionClaimId` | string | 最终结论（**不变量 PL-I1：非空**） |
| `rootPremiseClaimIds` | string[] | 汇总根前提 |
| `nodes` | `LineageNode[]` | 谱系节点（**不变量 PL-I2：非空**） |
| `completeness` | enum | `complete` / `partial` / `broken` |
| `avgReplayabilityRatio` | number | 平均可重放率 [0,1] |
| `allRejectedAlternatives` | string[] | 所有节点排除的替代假设并集 |

**不变量**

- **PL-I1**: `conclusionClaimId` 非空
- **PL-I2**: `nodes` 非空

**反向重建**

`buildProofLineage(traces, name)` — 从有序 DerivationTrace 列表反向重建 ProofLineage：
1. 每条 trace → `traceToLineageNode(trace)` 生成 LineageNode
2. 汇总所有节点的根前提（已被某节点作为结论的 claim ID 从根前提中排除）
3. 最后一条 trace 的 `conclusionClaimId` 作为 ProofLineage 的最终结论
4. 综合所有节点的 `chainIntegrity` 计算 `completeness`

### 2.2 ConstitutionalLayer（宪法层）

ConstitutionalLayer 定义最基本的认识论约束：任何"知识"对象都必须满足 mandatory 约束。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 全局唯一（`CL_<hex>`） |
| `constraints` | `ConstitutionalConstraint[]` | 约束规则（**不变量 CL-I1：至少一条**） |

**不变量**

- **CL-I1**: `constraints` 非空

**标准约束集**（`STANDARD_CONSTRAINTS`）

| 约束 ID | 名称 | 类型 | 说明 |
|---------|------|------|------|
| `CC_chain_integrity` | 推导链完整性 | mandatory | chainIntegrity === 'complete' |
| `CC_has_premises` | 前提非空 | mandatory | premiseClaimIds.length > 0 |
| `CC_has_conclusion` | 结论非空 | mandatory | conclusionClaimId 非空 |
| `CC_replayability` | 可重放率 ≥ 50% | aspirational | replayableSteps/totalSteps >= 0.5 |
| `CC_explicit_rejections` | 替代假设须显式拒绝 | aspirational | 有 supportLinks 时须有 rejectedClaimIds |

**审计执行**

`auditSubject(layer, subject, kind)` → `ConstitutionalAudit`：
- 对每条约束调用 `constraint.check(subject)`
- `mandatoryPassed`: 所有 mandatory 约束均通过
- `passedCount / failedCount`: 通过/失败数量

---

## 3. v8-v11 对象全景

| 层 | 对象 | 核心功能 |
|----|------|---------|
| v8 | MechanismProgram | phase 执行 + 反事实推演 |
| v8 | ExperimentDesign | 信息增益计算 |
| v9 | OntologyModel | 多本体并存 |
| v9 | TranslationFunctor | 跨本体翻译 |
| v9 | ConflictSet | 本体冲突收集 |
| v10 | ObserverModel | 观察者盲区 + 偏差 |
| v10 | InstitutionModel | 制度约束 + 权限检查 |
| v11 | FailureBoundaryArchive | 历史失败边界 |
| v11 | CounterexampleCommons | 反例公共知识库 |
| v11 | ProofLineage | 证明谱系重建 |
| v11 | ConstitutionalLayer | 基本求真约束审计 |

---

## 4. 设计决策

- **ProofLineage vs DerivationTrace**：DerivationTrace 是单次推导的原始记录；ProofLineage 是"血统视图"，关注前提-结论的可追溯性，可跨多条 trace 组合。
- **ConstitutionalLayer 约束分两级**：mandatory（必须满足）和 aspirational（期望满足）。合规检查只以 mandatory 为准。
- **默认宪法层**：`createDefaultConstitutionalLayer()` 提供开箱即用的标准约束集，可作为所有 DerivationTrace 和 ProofLineage 的基线审计层。
- **约束函数是纯函数**：`ConstitutionalConstraint.check` 不修改 subject，返回 `{passed, evidence}` 元组。
