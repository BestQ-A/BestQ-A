# recordFix 真值表：执行 / 编译 / 重建 / 本体更新四轴语义

> 目的：给 `pipeline.recordFix()` 一个不会随实现细节漂移的语义基线。
> 本文不定义 schema 细节，而定义 **状态轴、真值表、禁止折叠规则**。
> 它是 [recordfix-reconstruction-open-questions.md](recordfix-reconstruction-open-questions.md) 的收束版，供后续实现与 review 使用。

---

## 0. 核心判断

`recordFix()` 不是单一动作，而是 4 条并行语义轴的合成：

1. **执行轴**：修复动作是否被记录 / 执行
2. **编译轴**：路径是否通过门控并写入 compiled Ref
3. **重建轴**：是否生成了可接受的过程重建结果
4. **本体更新轴**：是否产出了本体更新，或显式拒绝更新

**硬约束**：

> 这四轴不得被折叠成一个“成功/失败”布尔值。

---

## 1. 四轴定义

### 1.1 执行轴（Execution Axis）

回答：

- 本次 fix 描述是否被记录？
- fix action atom 是否已写入？
- Story/Episode 是否从“待处理”进入“已处理”？

建议状态：

```text
execution.status ∈ { success, partial, failure }
```

### 1.2 编译轴（Compile Axis）

回答：

- chosen path 是否满足 `Hypothesis.validate + canPromote`
- compile 是否真的写入 compiled Ref

建议状态：

```text
compile.status ∈ { applied, skipped, blocked, empty }
```

解释：

- `applied`：写入了 >= 1 条 compiled Ref
- `skipped`：没有足够路径输入，因此未尝试 compile
- `blocked`：尝试了，但被门控拒绝
- `empty`：尝试了，但写入结果为 0

### 1.3 重建轴（Reconstruction Axis）

回答：

- 是否生成了 Reconstruction 对象
- 该对象是 accepted 还是只是壳 / draft

建议状态：

```text
reconstruction.status ∈ { accepted, draft, failed }
```

解释：

- `accepted`：有完整对象，满足当前最小 contract
- `draft`：有对象壳，但不能被拿去支撑高风险本体升级
- `failed`：本轮无法形成 reconstruction 对象（应视为异常路径）

### 1.4 本体更新轴（Ontology Update Axis）

回答：

- 是否生成 `OntologyDelta`
- 若未更新，是否显式生成 `NoUpdateReason`

建议状态：

```text
ontology.status ∈ { applied, blocked, none }
```

解释：

- `applied`：已形成可提交的 OntologyDelta
- `blocked`：形成了 delta 候选，但被 gate 或策略阻断
- `none`：本轮显式判定“不更新”，并给出 `NoUpdateReason`

---

## 2. 真值表

### 2.1 输入维度

影响 `recordFix()` 状态的最关键输入有：

- 是否提供 `chosenPathAtomIds`
- chosen path 长度是否足够
- hypothesis 是否创建成功
- `canPromote` 是否通过
- compile 是否写入 compiled refs
- 是否存在可接受 reconstruction

### 2.2 规范化真值表

| Case | chosenPath 输入 | canPromote | compile 写入 | Reconstruction | OntologyUpdate | 推荐 Story/Episode 结果 |
|---|---|---|---|---|---|---|
| A | 无路径 | N/A | `skipped` | `draft` 或 `accepted`（基于 observation shell） | `none` | `partial` 或 `success`，由调用语义决定 |
| B | 有路径但长度不足 | N/A | `skipped` | `draft` | `none` | `partial` |
| C | 有路径 | 否 | `blocked` | `draft` | `none` 或 `blocked` | `partial` |
| D | 有路径 | 是 | 0 条 | `draft` 或弱 `accepted` | `none` | `partial` |
| E | 有路径 | 是 | >=1 条 | `accepted` | `applied` 或 `none` | `success` |

### 2.3 最重要的三条解释

#### 规则 R1：没有 compile，也应该允许有 reconstruction

否则以下合同会失效：

- `NoUpdateReason` 必须绑定 reconstruction
- `recordFix` 的学习环会在 compile 失败时完全失声

所以：

```text
compile 不成功 ≠ reconstruction 不存在
```

#### 规则 R2：execution success 不等于 ontology applied

一个修复动作可以是成功的，但：

- 还不足以提交世界模型更新
- 只能形成 `NoUpdateReason`

所以：

```text
execution.success
  不蕴含 ontology.applied
```

#### 规则 R3：ontology blocked 与 ontology none 必须区分

两者差别是：

- `blocked`：本来有候选更新，但被门控拦住
- `none`：系统判定本轮就不应更新

如果把这两者合并，后续就无法分辨：

- 是 gate 太严
- 还是本来就不该更新

---

## 3. 禁止语义折叠规则

以下折叠一律禁止。

### 禁止 1：把四轴折叠成单一 success / failure

错误示例：

```text
recordFix succeeded
```

问题：

- 不知道是 compile 成功了
- 还是只是 fix 记录成功了
- 还是 reconstruction 生成了
- 还是 ontology delta 真被应用了

### 禁止 2：把 compile 成功等同于 ontology 更新成功

错误示例：

```text
compiled refs written => ontology updated
```

问题：

- compile 是图存储层动作
- ontology update 是逻辑层声明
- 两者不是一个层级

### 禁止 3：把 reconstruction 存在等同于 replay 已完成

错误示例：

```text
有 reconstruction 对象 => 已完成 ontology-driven replay
```

问题：

- 当前阶段 reconstruction 可能只是 shell
- replay fidelity 可能还只是占位

### 禁止 4：把 `NoUpdateReason` 视为空动作

错误示例：

```text
no ontology update => do nothing
```

问题：

- 不更新本身也是信息
- 若不显式落盘，就等于系统在学习环失语

---

## 4. 推荐返回结构（语义层，不限定代码命名）

可以不是完全照着这个字段名实现，但语义至少应表达为：

```typescript
interface RecordFixSemantics {
  execution: {
    status: 'success' | 'partial' | 'failure';
    note?: string;
  };

  compile: {
    status: 'applied' | 'skipped' | 'blocked' | 'empty';
    compiledRefCount: number;
  };

  reconstruction: {
    status: 'accepted' | 'draft' | 'failed';
    reconstructionId?: string;
  };

  ontology: {
    status: 'applied' | 'blocked' | 'none';
    deltaId?: string;
    reasonKind?: string;
  };
}
```

---

## 5. 对当前实现的最小收紧建议

结合当前代码，最应该先做的不是新增功能，而是收紧以下两处语义：

### 5.1 `OntologyDelta.applied_at`

当前若 `changes.length > 0` 就直接写 `applied_at`，语义过早。

建议：

- 第一轮默认 `applied_at = null`
- 等真实 fidelity regression gate 接入后，再在通过时赋值

### 5.2 `NoUpdateReason` 的身份问题

当前 `Episode` 只能绑定 `ontologyDeltaId`，但 `NoUpdateReason` 自身无稳定 id。

建议二选一：

1. 给 `NoUpdateReason` 自己 id
2. 统一将“无更新”编码为 `OntologyDelta(kind=none)`

第二种通常更干净，因为 Episode 侧只需要绑定一种对象。

---

## 6. 一句话结论

`recordFix()` 的正确目标不是“返回更多字段”，而是：

**把执行、编译、重建、本体更新四条语义轴显式分开，并禁止它们在实现中被偷偷折叠。**
