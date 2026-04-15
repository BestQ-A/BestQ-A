# 可复用思维工作流

## 这篇文档是什么

定义 BestQ-A 系统中可复用的思维工作流模式。这些不是代码流程，而是认识论层面的操作模式。

---

## W1: Episode 采样工作流

```text
输入: 真实问题 / 观察到的现象

1. 建立 Episode 上下文
   - 记录当前世界状态（StateSnapshot @ t0）
   - 记录观察条件（ObservationRecord）

2. 收集观察
   - 记录所有相关事实（Observation → Atom）
   - 标注观察的精度和来源

3. 执行动作（如果适用）
   - 记录 ActionExecution
   - 记录动作参数和上下文

4. 记录结果
   - StateSnapshot @ t1
   - OutcomeRecord
   - Transition（从 t0 到 t1）

输出: 完整 Episode
```

---

## W2: 机制抽象工作流

```text
输入: 多个相关 Episode

1. 对齐 Episode
   - 找到共同的 StateVar 变化模式
   - 找到共同的 Transition 结构

2. 提名 MechanismClass
   - 抽象出 inputs / outputs / contextConstraints / triggerConditions
   - 标注为 candidate（不是 compiled）

3. Replay 验证
   - 在每个 Episode 上用候选机制做 replay
   - 记录 replay 一致性

4. 反例搜索
   - 主动寻找不符合候选机制的 Episode
   - 如果找到，尝试解释或修正机制

5. 晋升判定
   - 满足 T4（反例义务）→ 可以提名 compile
   - 经过 ReviewDecision 门控 → compiled

输出: MechanismClass（candidate 或 compiled）
```

---

## W3: 预测-误差校准工作流

```text
输入: 已有 compiled MechanismClass + 新 Episode

1. 预测
   - 用 compiled 机制对新 Episode 做预测
   - 记录 predictedState

2. 观察
   - 记录 observedState

3. 计算误差
   - PredictionError = predictedState - observedState
   - 记录误差向量和解释

4. 评估
   - 误差在容忍范围内 → 机制维持 compiled
   - 误差持续偏大 → 触发降级审查（T5）
   - 误差模式揭示新结构 → 触发机制拆分（SplitClass）

输出: PredictionError 记录 + 可能的 OntologyDelta 提案
```

---

## W4: 重建工作流

```text
输入: Episode + 候选机制集

1. 生成候选路径
   - 从观察事实出发
   - 在 v6 关系法律下枚举合法路径
   - 绑定候选 MechanismClass

2. 过滤
   - 移除违反 ComposeRule 的路径
   - 移除 invariant 不成立的路径

3. 排序
   - 按推导链强度排序
   - 按 Episode replay 一致性排序

4. 选择
   - 选择最强路径为 AcceptedReconstruction
   - 记录被拒路径和拒绝理由

5. 审查
   - ReviewDecision 门控
   - 通过后写入重建结果

输出: AcceptedReconstruction + DerivationTrace
```

---

## W5: 本体升级工作流

```text
输入: OntologyDelta 提案

1. 影响分析
   - 识别所有依赖被变更对象的 Episode、MechanismClass、Reconstruction
   - 评估回滚成本

2. 验证
   - 在受影响的 Episode 上做 replay
   - 确认升级后 replay 一致性不低于升级前

3. 审批
   - ReviewDecision 门控
   - 高影响变更需要多重审批

4. 应用
   - 写入 OntologyDelta
   - 更新所有受影响的绑定

5. 监控
   - 升级后持续监控 PredictionError
   - 如果误差增大，启动回滚评估

输出: 已应用的 OntologyDelta + 监控状态
```

---

## 参考

- [[epistemic-axioms]]：认识论公理
- [[trace-and-fidelity-axioms]]：追踪保真度约束
- [[knowledge-source-strategy]]：知识源策略
