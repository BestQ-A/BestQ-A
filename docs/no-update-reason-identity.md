# NoUpdateReason 身份裁决：独立对象，还是 `OntologyDelta(kind=none)` 的 payload

> 目的：回答一个当前实现已经碰到、但若不及时裁决就会持续制造不对称的问题：
>
> **`NoUpdateReason` 应该是独立一等对象，还是统一编码为 `OntologyDelta(kind=none)`？**

---

## 0. 当前真实状态

从当前工作区可见：

- `docs/current/ontology-delta-contract.md` 语义上已经把 `kind=none` 和 `NoUpdateReason` 绑定在一起
- 但代码里 `NoUpdateReason` 仍是独立 TypeScript interface
- `Episode` 侧当前只有：
  - `ontologyDeltaId?`
- 而 `NoUpdateReason` 本身没有 `id`

这导致一个非对称状态：

```text
有更新时：Episode 可以稳定绑定 delta id
没更新时：Episode 无法稳定绑定 no-update 结果
```

这不是小问题，而是一个对象身份设计错误。

---

## 1. 为什么这个问题必须现在裁决

如果现在不钉死，后面会出现 3 个坏后果：

### 1.1 持久化路径会分叉

你会被迫维护两套落盘语义：

- `ontology_deltas/<delta_id>.json`
- `ontology_deltas/<episode_id>_no_update.json`

这会让“有更新”和“没更新”走不同对象模型。

### 1.2 Episode 绑定语义不对称

Episode 只能直接绑定：

- `ontologyDeltaId`

却不能统一绑定：

- “本轮本体更新结果”

这样下游所有查询都得写特殊分支。

### 1.3 review / audit 难以统一

后续 contract audit、run summary、dashboard 都会被迫问：

```text
这次结果是 delta 还是 no-update？
它们是不是一类东西？
```

如果你让它们长期并列存在，后面每层都要加一次分支判断。

---

## 2. 两个备选方案

### 方案 A：`NoUpdateReason` 是独立对象

形式：

```ts
type OntologyUpdate = OntologyDelta | NoUpdateReason
```

#### 优点

- 语义直观：更新是一类对象，不更新是另一类对象
- 第一轮实现改动最少

#### 缺点

- Episode 无法统一绑定
- 存储路径和查询路径分叉
- “有更新 / 无更新”不再是同一决策结果的两种取值，而变成两种对象族
- review 和 metrics 层会持续需要 `if delta else no-update`

#### 最危险的问题

它会把一个本来应该是：

```text
同一决策对象的两种状态
```

做成：

```text
两种不同对象
```

而这从模型层就是过度分裂。

---

### 方案 B：统一为 `OntologyDelta(kind=none)`，`NoUpdateReason` 只做 payload

形式：

```ts
interface OntologyDelta {
  id: string;
  episode_id: string;
  reconstruction_id: string;
  claim_ids: string[];
  kind: 'applied' | 'none';
  changes: OntologyChange[];
  fidelity_regression_check: FidelityRegressionCheck;
  no_update_reason?: {
    reason_kind: ...;
    explanation: string;
    follow_up: string | null;
  };
}
```

#### 优点

- Episode 永远只绑定一种对象：`ontologyDeltaId`
- 持久化路径统一
- 审计、review、summary、dashboard 不需要对象级分叉
- “有更新 / 无更新”被正确建模为**同一决策对象的两种状态**

#### 缺点

- 第一轮需要改代码和合同
- `NoUpdateReason` 从顶层类型降为嵌套 payload，表面上不如独立对象直观

#### 长期收益

这是更干净的类型系统：

```text
OntologyDelta = 本体更新决策结果
kind=applied = 本轮有更新
kind=none    = 本轮无更新，但必须给理由
```

这比“OntologyDelta 和 NoUpdateReason 并列”更接近真正的语义。

---

## 3. 裁决标准

我们不应该按“哪种写起来省事”裁决，而应按以下 5 条标准：

| 标准 | 说明 |
|---|---|
| **S1 对称性** | Episode 是否能用一个字段统一绑定“本轮本体更新结果” |
| **S2 持久化统一性** | 落盘路径是否统一 |
| **S3 审计复杂度** | audit / review / metrics 是否要分两套处理 |
| **S4 语义正确性** | “有更新 / 无更新”是状态差异，还是对象差异 |
| **S5 迁移成本** | 从当前实现改过去的代价是否可控 |

对比：

| 方案 | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|
| A 独立对象 | 差 | 差 | 差 | 一般 | 好 |
| B `kind=none` | 好 | 好 | 好 | 最好 | 中 |

---

## 4. 裁决结论

**推荐结论：采用方案 B。**

也就是：

> `NoUpdateReason` 不再作为与 `OntologyDelta` 并列的一等顶层对象长期存在。
> 它应成为 `OntologyDelta(kind=none)` 的结构化 payload。

更具体地说：

```text
“这次本体更新结果是什么？”
  → 永远回答：OntologyDelta

“为什么没有更新？”
  → 当 kind=none 时，看 no_update_reason
```

---

## 5. 为什么这是更正确的建模

### 5.1 因为“无更新”不是没有结果

`NoUpdateReason` 不是“没有对象”，而是：

> 本体更新决策的一个合法结果。

所以它天然属于：

- `OntologyDelta`

这个对象的取值域，而不该是平行对象。

### 5.2 因为对象边界应该围绕“决策”而不是“结果字面”

真正的一等对象是：

```text
一次 Episode 结束后，对本体该怎么处理的决策
```

这个决策要么：

- `applied`
- 要么 `none`

所以一等对象应该是“决策”，而不是“只有有更新时才有对象”。

### 5.3 因为对下游最稳

未来这会影响：

- run summary
- contract audit
- UI review queue
- metrics
- opencode / MCP surface

把对象统一了，所有下游都会简单很多。

---

## 6. 对当前代码的具体改造建议

### 6.1 类型层

将：

```ts
export interface NoUpdateReason { ... }
export type OntologyUpdate = OntologyDelta | NoUpdateReason;
```

改成：

```ts
export interface NoUpdateReasonPayload {
  reason_kind:
    | 'ontology_sufficient'
    | 'episode_inconclusive'
    | 'duplicate_episode'
    | 'human_override'
    | 'pending_more_evidence';
  explanation: string;
  follow_up: string | null;
}

export interface OntologyDelta {
  id: string;
  episode_id: string;
  reconstruction_id: string;
  claim_ids: string[];
  kind: 'applied' | 'none';
  changes: OntologyChange[];
  fidelity_regression_check: FidelityRegressionCheck;
  no_update_reason?: NoUpdateReasonPayload;
  created_at: string;
  created_by: string;
  applied_at: string | null;
}
```

### 6.2 工厂函数层

将：

- `createNoUpdateReason(...)`

改成：

- `createOntologyDeltaNone(...)`

语义上更准确。

### 6.3 Episode 绑定层

保持：

```ts
ontologyDeltaId?: string
```

不再需要为 “no update” 单独发明第二套绑定字段。

### 6.4 落盘层

统一为：

```text
artifacts/<run_id>/ontology_deltas/<delta_id>.json
```

其中：

- `kind=applied` 时有 `changes`
- `kind=none` 时 `changes=[]`，并带 `no_update_reason`

---

## 7. 对合同的影响

当前 `docs/current/ontology-delta-contract.md` 已经部分接近这个方向，因为它写了：

- `kind: applied | none`
- `kind=none` 时 `changes=[]`

但它仍然保留了独立的 `NoUpdateReason Schema`。

建议下一轮合同收束时：

1. 保留 `NoUpdateReason` 的字段定义
2. 但把它降级为：
   - `no_update_reason` 子结构
3. 明确写：
   - `OntologyDelta` 是唯一持久对象
   - `NoUpdateReason` 不是并列顶层实例文件

---

## 8. 迁移顺序建议

为了不打断你当前实现，建议这样迁移：

### Step 1

先保留现有 `NoUpdateReason` interface，但新增：

- `OntologyDelta.kind = 'none'`
- `no_update_reason` payload

### Step 2

让 `createNoUpdateReason()` 改为内部返回：

- `OntologyDelta(kind=none)`

而不是返回独立对象。

### Step 3

改 `pipeline.recordFix()`：

- `ontologyUpdate` 永远是 `OntologyDelta`
- 其中一部分是 `kind=none`

### Step 4

清理并废弃独立的 `NoUpdateReason` 顶层 union

---

## 9. 一句话结论

`NoUpdateReason` 更正确的身份不是：

**“与 OntologyDelta 并列的一类对象”**

而是：

**“OntologyDelta 在 `kind=none` 时必须携带的结构化理由 payload”**

这才是对象边界最稳、下游最省分支、语义最对称的做法。
