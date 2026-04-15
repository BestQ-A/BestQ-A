# 认识论公理

## 北极星

BestQ-A 的北极星不是 solve_rate，而是**推导链 + 重建保真度**。

```text
系统价值 = 重建轨迹的可回放性 × 本体边界的可辩护性
不是：系统价值 = 答对了多少题
```

---

## 公理集

### A1: 推导链优先于结论

任何结论必须携带完整的 `DerivationTrace`。没有推导链的结论不允许进入 compiled 世界模型。

```text
结论 without 推导链 = 不可审计的断言 = 禁止
```

### A2: 重建保真度优先于覆盖率

宁可少回答几个问题，也不允许用模糊推理扩大覆盖率。

```text
高保真的 10 条重建 > 模糊的 100 条"回答"
```

### A3: 可逆建模

世界模型的每一次变更都必须是可逆的。`OntologyDelta` 必须携带足够信息支持回滚。

```text
升级 without 回滚路径 = 不可逆承诺 = 禁止
```

### A4: 七对象集完备性

系统的认识论操作通过七类一等公民对象实现：

1. **MechanismClass** — 世界如何运作的类定义
2. **Episode** — 对世界的一次采样
3. **StateSnapshot** — 某时刻的世界状态
4. **ActionExecution** — 执行了什么动作
5. **OutcomeRecord** — 发生了什么结果
6. **PredictionError** — 预测与现实的偏差
7. **OntologyDelta** — 世界模型的变更

### A5: 两闭环

系统运行两个并行闭环：

```text
问题求解环: 问题 → 观察 → 重建 → 结论
本体学习环: Episode → 抽象 → 验证 → 本体升级
```

两个环通过 `MechanismClass` 和 `PredictionError` 耦合。

### A6: 法律内核不可绕过

v6 确立的关系法律（`RefTypeSpec` + `ComposeRule`）是硬约束，任何 agent、任何流程都不能绕过。

```text
indicates ∘ causes = FORBIDDEN
无论是人还是 agent 还是自动化流程
```

### A7: Horizon ≠ 承诺

设计历史中的上行 horizon（v8-v11）不是当前能力承诺。当前 contract surface（`docs/current/`）才是唯一的承诺。

---

## 参考

- [[trace-and-fidelity-axioms]]：追踪保真度的具体约束
- [[epistemic-open-questions]]：当前未解决的认识论问题
- [[knowledge-source-strategy]]：知识源策略
