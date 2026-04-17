---
kind: contract
status: draft
phase: mvp
schema_version: 1
describes: "ReasoningCard 分级判定规则（Q3-c 分级拦截）"
---

# ReasoningCard Grading Contract — 分级判定规则

> 定义 `bestqa check` 产出的 ReasoningCard 如何被判定为 `pass / warn / block` 的硬性规则集。
> 对应 [mvp-llm-reasoning-guard-plan.md](../mvp-llm-reasoning-guard-plan.md) §4.5 与访谈 Q3-c 决策。
> 上游依赖：[derivation-chain-contract.md](derivation-chain-contract.md)、[support-link-contract.md](support-link-contract.md)、[hypothesis-contract.md](hypothesis-contract.md)

---

## §1 定位与边界

**是什么**：
- 给定 MiniMax 逆向推理产出的 ReasoningCard，纯规则判定 verdict
- 纯函数，零 LLM 参与（守 derivation-chain I4：LLM 不自审）

**不是什么**：
- 不是"MiniMax 自己决定 verdict" —— MiniMax 只报告 issue，Grader 独立裁定
- 不是概率模型 —— 硬码规则，可审计
- 不是动态 —— 规则清单通过本合约版本升级，不在运行时改变

---

## §2 Verdict 三档

| Verdict | 语义 | CLI exit code |
|---------|------|---------------|
| `pass` | 推理链完整、证据充分、零 issue | 0 |
| `warn` | 有非致命问题，标红但放行 | 0 |
| `block` | 存在致命问题，拒绝入库（除非 `--force` 降级为 warn） | 1 |

---

## §3 致命码（FATAL_CODES）

任一出现 → `block`。

| Code | 触发条件 | 解释 |
|------|---------|------|
| `BROKEN_CHAIN` | DerivationTrace 步骤间节点不连续 / replayable_steps < total_steps | 推理链断裂（derivation-chain I1） |
| `PHANTOM_API` | SupportLink 引用了不存在的 symbol / file path | 幻觉 API |
| `EMPTY_GOAL` | goal 为空或长度 < 10 字符 | MiniMax 拒绝填目标 |
| `NO_SUPPORT` | supportLinks.length === 0 且 proof.length > 0 | 有推理但零证据 |
| `LLM_SELF_AUDIT` | DerivationStep.llmInvolved=true 且 replay_method='llm_self_check' | 违反 derivation-chain I4 |

---

## §4 警告码（WARN_CODES）

任一出现 → `warn`（若无 fatal）。

| Code | 触发条件 | 解释 |
|------|---------|------|
| `LOW_CONFIDENCE_HYPOTHESIS` | Hypothesis.confidence < 0.5 且未标记 assumption | 置信度低但未交代 |
| `COARSE_CHAIN` | proof.length < 2 | 跳步嫌疑（近因/中因/远因至少 2 层） |
| `UNDECLARED_RISK` | risks.length === 0 | 无风险说明 |

---

## §5 判定算法

```typescript
function computeVerdict(issues: GradingIssue[], force: boolean): 'pass' | 'warn' | 'block' {
  if (issues.length === 0) return 'pass';
  const hasFatal = issues.some(i => i.severity === 'fatal');
  if (hasFatal) return force ? 'warn' : 'block';
  return 'warn';
}
```

**不变量**：
| # | 不变量 |
|---|-------|
| I1 | 零 issue → 必 pass |
| I2 | 任一 fatal 且 !force → 必 block |
| I3 | 任一 fatal 且 force → 降级 warn，forceOverridden=true |
| I4 | 仅 warn 无 fatal → warn |
| I5 | force=true 不能把 block 升为 pass（最多到 warn） |

---

## §6 逃生阀 `--force`

**定位**：`--force` 是紧急出口，不是常态。

**预期使用场景**：
- 甲方明确知道 MiniMax 判断有误（误报）
- 时间紧急，需先放行再补 meta-feedback
- 测试过程中临时 bypass

**不得使用场景**：
- ❌ 因为"懒得修" 而用
- ❌ 在自动化 pipeline 中默认开启

**审计留痕**：`ReasoningCard.forceOverridden = true` 会入库，可追踪。

---

## §7 与反向元评价的协同（W3）

Grader 规则**不被元反馈直接修改**。元反馈只影响 MiniMax 的 issue 报告概率。

路径：
1. MiniMax 基于 meta-rules prompt 调整 issue 报告
2. Grader 对 issue list 做纯规则判定
3. 如果甲方认为 Grader 规则本身需改 → 走本合约版本升级，不走 meta-feedback

这保证 Grader 始终可审计。

---

## §8 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-17 | 初版 MVP。5 个 fatal + 3 个 warn 码、computeVerdict 算法、--force 逃生阀、5 条不变量 |

---

## 参考

- [[mvp-llm-reasoning-guard-plan|MVP 规划（含访谈 Q3-c 决策）]]
- [[derivation-chain-contract|DerivationChain 合同（I1 链连续 / I4 LLM 不自审）]]
- [[support-link-contract|SupportLink 合同]]
- [[hypothesis-contract|Hypothesis 合同]]
