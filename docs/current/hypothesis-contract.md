---
status: current
verified: 2026-04-13
phase: 1
---

# Hypothesis 合同：门控与状态机规范

> 本文档是 `metamodel.md` 的局部合同，管辖假设生命周期、验证门控、晋升规则。
> 代码位置：`core/hypothesis.ts`

---

## 1. Schema

```typescript
interface Hypothesis {
  id: string;                           // "hyp_xxxxxxxx"
  claim: { 
    fromAtomId: string; 
    toAtomId: string; 
    kind: string;                       // Ref 类型（causes, fixes, indicates 等）
  };
  forceUpperBound: RefForce;            // 不能超过此强度
  evidencePolicy: EvidencePolicy;       // 证据继承策略
  derivation: HypothesisDerivation[];   // 推导步骤（proof-carrying）
  scope: HypothesisScope;               // 适用范围（project/domain/universal）
  status: HypothesisStatus;             // open | validated | rejected | superseded
  storyId?: string;                     // 关联 Story ID
  blockedBy?: string[];                 // 阻塞的 Hypothesis IDs
  validatedByEvidenceIds?: string[];    // 验证依据的 Evidence IDs
  interventionOutcome?: InterventionOutcome;  // 干预结果语义
}

interface HypothesisDerivation {
  stepIndex: number;
  refKind: string;
  force: RefForce;
  position: number;                     // Atom 在路径中的位置
}

type HypothesisStatus = 'open' | 'validated' | 'rejected' | 'superseded';
type HypothesisScope = 'project' | 'domain' | 'universal';
type InterventionOutcome = 
  | 'mechanism_confirmed'
  | 'symptom_relieved'
  | 'workaround_only'
  | 'no_effect'
  | 'side_effect';
```

---

## 2. 状态机

```
┌─────┐    validate()      ┌───────────┐    supersede()    ┌────────────┐
│open │ ─────────────────→ │validated  │ ──────────────→ │superseded │
└─────┘                    └───────────┘                  └────────────┘
  │                              │
  │                              │
  └──────reject()────→ ┌─────────┴──────┐
                      │                 │
                    ┌────────┐     ┌─────────┐
                    │rejected│     │terminal │
                    └────────┘     └─────────┘
```

| 流转 | 条件 | 说明 |
|------|------|------|
| `open → validated` | validate(evidenceIds, outcome) | 提供证据 ID 和干预结果，门控通过 |
| `open → rejected` | reject(reason) | 证据不足或推导无效，永久阻止 |
| `validated → superseded` | supersede(newHypothesisId) | 被更好的假设取代 |
| `rejected → (终态)` | - | 不可逆，审计日志保留 |
| `superseded → (终态)` | - | 不可逆，新假设继承此线索 |

**禁止流转**：
- `validated → open`（验证不可撤销）
- `rejected → validated`（驳回不可复活）
- `superseded → validated`（已取代不可重启）

---

## 3. InterventionOutcome 语义

| 值 | 含义 | 对 explanatory Ref 的影响 | 对 interventional Ref 的影响 |
|----|------|--------------------------|---------------------------|
| `mechanism_confirmed` | 机理被确认，修复成功 | 允许大幅提升置信度（necessary/sufficient） | 允许推 interventional |
| `symptom_relieved` | 症状缓解但机理未确认 | 允许保守提升（contributory） | 允许推 interventional |
| `workaround_only` | 只是绕过，非根治 | 禁止推 explanatory | 仅允许记录 interventional（标记 workaround） |
| `no_effect` | 干预无效果 | 降低相关 Ref 权重 | 降低权重，标记无效 |
| `side_effect` | 有副作用 | 降低权重 + 标记风险 | 标记有害，禁止推荐 |

**核心原则**：修复成功 ≠ 解释正确。`symptom_relieved` 只说明修复有效，不说明机理理解正确。

---

## 4. canPromote 门控矩阵

四项检查全部通过才允许晋升为 compiled Ref：

| 检查项 | 门控条件 | 失败时 | 说明 |
|--------|---------|--------|------|
| **状态** | `status === 'validated'` | 阻止晋升 | 仅 validated 假设可晋升 |
| **干预强度** | `outcome >= 'symptom_relieved'` | 阻止晋升 | no_effect/side_effect 禁止晋升 |
| **证据支撑** | `validatedByEvidenceIds.length > 0` | 阻止晋升 | 必须有至少一个证据 ID |
| **force 上界** | `forceUpperBound !== 'analogical'` | 阻止晋升 | analogical 边永不晋升为世界模型 |

**门控逻辑**（伪代码）：
```typescript
canPromote(hyp: Hypothesis): boolean {
  return hyp.status === 'validated' &&
         hyp.interventionOutcome &&
         ['mechanism_confirmed', 'symptom_relieved'].includes(hyp.interventionOutcome) &&
         hyp.validatedByEvidenceIds?.length > 0 &&
         hyp.forceUpperBound !== 'analogical';
}
```

---

## 5. derivation 与 proof-carrying

每个 Hypothesis 携带完整推导记录：

```typescript
interface HypothesisDerivation {
  stepIndex: number;        // 路径中的第 N 步
  refKind: string;          // 此步的 Ref 类型（causes, fixes 等）
  force: RefForce;          // 此步的 force 值
  position: number;         // Atom 序号（用于 Ref 查询）
}
```

**失效规则**：
- 底层 Ref 的 `kind` 或 `force` 或 `scope` 变更时，所有依赖它的 Hypothesis 的 derivation 必须回放验证
- 若回放失败（path no longer legal），Hypothesis 标记为 `rejected`（reason='derivation replay failed'），不再参与编译

---

## 6. 与其他模块的关系

| 模块 | 交互点 | 说明 |
|------|--------|------|
| **Pipeline** | submitObservation 中的 explore 跨层 | 产生 Hypothesis |
| **Pipeline** | recordFix 调用 validate | 验证假设，绑定 Evidence 与 outcome |
| **RefAlgebra** | compile 晋升前验证 path 合法性 | isPathLegal 门控 |
| **Evidence** | validatedByEvidenceIds 关联 | 每次 validate 链接证据 |
| **PatternTemplate** | 模板实例化产生 Hypothesis | 模板的 arrows 约束 claim.kind |

---

## 7. 不变量

| 不变量 | 说明 | 执行者 |
|--------|------|--------|
| Hypothesis 不可删除 | 永久审计日志，状态标记 rejected 不删除 | 存储层 |
| 状态流转不可逆 | open→validated 后不能重置为 open | validate/reject 守卫 |
| analogical force 永远无法晋升 | canPromote 中的 force 上界检查 | compile 门控 |
| 没有 Evidence 的 Hypothesis 不能 validate | validatedByEvidenceIds.length > 0 | validate 守卫 |
| derivation 回放失败 → Hypothesis 标记 rejected | proof-carrying 机制 | derivation replay 函数 |
| 一个 Hypothesis 不能同时 validated 和 rejected | 状态机独占性 | 状态转移函数 |

---

## 8. 验证流程（Pipeline.recordFix）

```
recordFix(eventId, fix) →
  ├─ 查询关联的 Hypothesis 列表 (by storyId)
  ├─ 获取 InterventionOutcome（从修复结果推断）
  ├─ 逐个调用 hypothesis.validate(evidenceIds, outcome)
  │  ├─ 检查 evidence 合法性
  │  ├─ 状态转移 open → validated
  │  └─ 保存 validatedByEvidenceIds
  ├─ 遍历所有 validated hypothesis
  ├─ 逐个调用 compile(hyp)
  │  ├─ canPromote 门控
  │  ├─ derivation 回放验证
  │  └─ 如果通过，写入 compiled Ref
  └─ 标记 Event 为 resolved
```

---

## 9. 角色边界

| 角色 | 职责 | 不负责 |
|------|------|--------|
| **Hypothesis** | 候选解释、推导记录、状态机 | 不管理 Evidence 生命周期 |
| **Evidence** | 观察事实、支撑力度 | 不判断假设有效性 |
| **Ref** | 编译后的世界模型边 | 不追踪假设来源 |
| **Story** | 事件群聚 + 解释线索 | 不管理单个假设状态 |
