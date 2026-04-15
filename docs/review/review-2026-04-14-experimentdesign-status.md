---
kind: record
event: "2026-04-14 experiment design status review"
recorded_at: 2026-04-14
immutable: true
---

# ExperimentDesign 阶段性评审（2026-04-14）

> 记录当前工作区中 `ExperimentDesign` 的真实状态，并据此调整下一步主线。

---

## 1. 当前判断

`ExperimentDesign` 已经不再只是合同草案。

当前工作区里已经出现了：

- `core/experiment-design.ts`
- `core/experiment-design-store.ts`
- `index.ts` 导出
- `tests/test-v8-experiment-design.mjs`
- `export-v7-artifacts.mjs` 中的 experiment design 导出路径

这说明：

```text
ExperimentDesign 已完成“对象化 + 存储化 + 最小导出”
```

所以主线不应再停留在“给 Claude 下 ExperimentDesign 实现 brief”。

---

## 2. 现在最值的下一步

既然对象、store、测试、导出已经存在，那么最值的下一步自然变成：

## `ExperimentDesign` 治理接入

也就是：

- artifact 目录结构正式纳入合同
- `contract-audit` 第一轮基础绑定检查
- CI 中开始把它视为受治理对象

一句话：

```text
ExperimentDesign 现在缺的不是代码
而是治理
```

---

## 3. 为什么不该现在直接继续往更高层推

如果这时直接去做：

- `FailureBoundaryArchive`
- `CounterexampleCommons`
- `Civilization Memory`

就会重复之前已经踩过的模式：

> 对象先出来，治理后补。

这会让主线再次漂移。

现在更稳的做法是：

1. 先让 `ExperimentDesign` 进入治理链
2. 再决定是推进：
   - `ActionExecution -> new Episode` 回流
   - 还是更高层的长期资产

---

## 4. 建议的下一步顺序

### Phase A

补 `ExperimentDesign` 的 artifact / audit / CI 接入

### Phase B

当 `ExperimentDesign` 进入治理链后，再评估两条分支哪个更值：

#### 分支 1：闭环回流

```text
ExperimentDesign
  → ActionExecution
  → new Episode
```

#### 分支 2：长期资产

```text
FailureBoundary
  / CounterexampleCommons
```

从当前工程态看，**我更倾向分支 1 先行**，因为它离现有主线更近，也更容易产生真实闭环样例。

---

## 5. 一句话结论

**ExperimentDesign 已经够了。下一步不该再补它的对象壳，而该让它进入治理系统。**
