# 追踪保真度公理

## 这篇文档是什么

把 [[epistemic-axioms]] 中 A1（推导链优先于结论）和 A2（重建保真度优先于覆盖率）展开为可操作的约束。

---

## T1: 推导链完整性

每个进入 compiled 状态的结论必须满足：

```text
∀ conclusion ∈ compiled:
  conclusion.derivationTrace ≠ null
  ∧ conclusion.derivationTrace.steps.length > 0
  ∧ ∀ step ∈ conclusion.derivationTrace.steps:
      step.rule ∈ LegalComposeRules(v6)
```

即：每步推导都必须引用 v6 关系法律中的合法规则。

---

## T2: 证据可追溯性

推导链中的每个证据引用必须可追溯到具体 Episode：

```text
∀ evidence ∈ derivationTrace.supportEvidence:
  ∃ episode ∈ Episodes:
    evidence.sourceEpisodeId = episode.id
```

不允许"空中来的证据"。

---

## T3: 重建一致性

`AcceptedReconstruction` 必须满足：

```text
∀ reconstruction:
  reconstruction.selectedMechanismIds ⊆ MechanismClass.all
  ∧ reconstruction.majorChain 可在 Episode 的 StateSnapshot 序列上 replay
  ∧ replay 结果与 OutcomeRecord 一致
```

即：选定的机制链必须能在原始 Episode 上重放，并产生与实际结果一致的输出。

---

## T4: 反例义务

任何晋升为 compiled 的机制，必须经过反例检验：

```text
∀ mechanism ∈ compiled:
  mechanism.counterexampleSearch = completed
  ∧ (mechanism.knownCounterexamples = ∅
     ∨ mechanism.counterexampleResolution ≠ null)
```

即：要么没有找到反例，要么反例已被解释（例如：适用域外、测量误差等）。

---

## T5: 降级触发条件

当以下任一条件成立时，compiled 机制必须被降级：

1. `PredictionError` 在新 Episode 上持续增大
2. 出现高强度反例且无法解释
3. 被更高解释力的机制替代

降级路径：`compiled → candidate → deprecated`

---

## T6: 审计可回放性

系统的任何状态变更都必须可审计回放：

```text
∀ ontologyDelta:
  ontologyDelta.before ≠ null
  ∧ ontologyDelta.after ≠ null
  ∧ apply(ontologyDelta.before, ontologyDelta.diff) = ontologyDelta.after
  ∧ rollback(ontologyDelta.after, ontologyDelta.diff) = ontologyDelta.before
```

---

## 参考

- [[epistemic-axioms]]：认识论公理
- [[epistemic-open-questions]]：开放问题（特别是 OQ-3 关于 PredictionError 阈值）
