---
status: current
verified: 2026-04-13
phase: 1
---

# Compile 晋升合同：路径编译与引用强化规范

> 本文档是 `metamodel.md` 的局部合同，管辖 Ref 编译（compile）、Hypothesis 晋升、证据记录、Shortcut 创建及失效传播。
> RefAlgebra 管"能不能推"，本文管"什么时候落盘、怎么晋升、怎么失效"。
> 代码位置：`core/atom-graph.ts + core/pipeline.ts`

---

## 1. Compile 的输入前提

compile 接受一条 `correctPath`（有序 Atom IDs）和可选的 `failedPaths`。

### 前提检查

| 检查项 | 条件 | 失败后果 |
|--------|------|---------|
| **路径最小长度** | correctPath 至少 2 个 Atom | 返回零结果，不写入变更 |
| **相邻关系存在** | 相邻 Atom 对之间必须有 Ref | 返回零结果，不写入变更 |
| **路径合法性** | Ref kind 序列通过 `isPathLegal(refKinds)` (RefAlgebra) | 返回零结果，不写入变更 |
| **晋升资格** | 如果来自 Hypothesis，`canPromote` 必须通过 | 返回零结果，不写入变更 |

**执行顺序**：按上述顺序逐项检查，首次失败立即返回。

---

## 2. Compile 执行步骤

### 2.1 对 correctPath 强化

```
对每对相邻 (atomIds[i], atomIds[i+1]):
  1. 找到对应 Ref
  2. weight = min(1.0, weight + 0.1)
  3. evidence += 1
  4. mode = 'compiled'
  5. lastUsedAt = now
  6. 写入数据库
```

### 2.2 对 failedPaths 削弱

```
对每条 failedPath 中的 tentative Ref:
  1. weight = max(0.0, weight - 0.05)
  2. 如果 weight < 0.1 → 删除该 Ref
  3. 写入数据库
```

### 2.3 执行顺序保证

| 阶段 | 操作 | 约束 |
|------|------|------|
| **Phase 1: 预检查** | 检查上述 4 项前提 | 全部通过才进入 Phase 2 |
| **Phase 2: 写入 Ref** | 强化 correctPath，削弱 failedPaths | 原子批处理 |
| **Phase 3: 记录证据** | 调用 `Evidence.recordSupport` | 仅对 correctPath 上的 compiled Ref |
| **Phase 4: 创建 Shortcut** | 可选，执行 myelinate | 在 Phase 3 之后 |

---

## 3. Hypothesis → Compiled Ref 晋升

### 3.1 Canine.Promote 四项检查

```typescript
canPromote(hypothesis: Hypothesis): boolean {
  ✅ hypothesis.status == 'validated'
  ✅ hypothesis.interventionOutcome >= 'symptom_relieved'
  ✅ hypothesis.validatedByEvidenceIds.length > 0
  ✅ hypothesis.forceUpperBound != 'analogical'
  
  return 全部通过;
}
```

**全部通过** → 允许 compile 将 claim 对应的 Ref 写入 mode='compiled'

### 3.2 InterventionOutcome 晋升矩阵

| Outcome | Explanatory Ref | Interventional Ref | Shortcut |
|---------|-----------------|-------------------|----------|
| **mechanism_confirmed** | ✅ 可晋升 | ✅ 可晋升 | ✅ 可创建 |
| **symptom_relieved** | ❌ 不可 | ✅ 可晋升 | ⚠️ 需 3+ 次 |
| **workaround_only** | ❌ 不可 | ⚠️ candidate only | ❌ 不可 |
| **no_effect** | ❌ 降权 | ❌ 降权 | ❌ 不可 |
| **side_effect** | ❌ 降权+标记 | ❌ 降权+标记 | ❌ 不可 |

**矩阵说明**：
- `mechanism_confirmed`：全面晋升，可创建 Shortcut
- `symptom_relieved`：interventional Ref 可晋升，但 Shortcut 需 3 次及以上成功示例
- `workaround_only`：only candidate，无法 compile 到 confirmed
- `no_effect` / `side_effect`：降权或标记，不允许晋升

---

## 4. Evidence 追加顺序

### 4.1 执行序列（不可颠倒）

```
1. compile 执行完毕
   ↓
2. Ref 已更新（weight、mode、evidence 计数）
   ↓
3. 对 correctPath 上每条 compiled Ref 调用 Evidence.recordSupport
   ↓
4. 设置：
   - sourceType = 'fix'
   - sourceId = storyId
   - contextSnapshot = 当时的 ContextScope
```

### 4.2 约束

| 约束 | 说明 |
|------|------|
| **不可提前写 Evidence** | 必须先确认路径合法，再记录证据 |
| **Evidence 只关联 compiled Ref** | failedPaths 对应的削弱 Ref 不记录证据 |
| **sourceType 固定为 'fix'** | 来源必须是修复故事 |
| **contextSnapshot 必须捕获** | 记录 compile 时的 ContextScope |

---

## 5. Shortcut 创建（Myelinate）

### 5.1 创建条件

| 条件 | 阈值 | 说明 |
|------|------|------|
| **路径长度** | >= 3 | 首尾 + 至少 1 个中间节点 |
| **Ref Mode** | all = 'compiled' | 路径上每条 Ref 的 mode 必须是 compiled |
| **Ref Weight** | all >= minWeight | 默认 minWeight = 0.6 |
| **Evidence 总和** | >= minUseCount | 默认 minUseCount = 3 |

### 5.2 Shortcut 结构

```typescript
interface Shortcut {
  fromAtom: string;
  toAtom: string;
  viaPath: string[];              // 中间节点 IDs（必须保留）
  derivedFromRefIds: string[];    // 来源 Ref IDs（必须保留）
  weight: number;                 // 聚合权重
  createdAt: Date;
  invalidatedAt?: Date;           // 失效时戳（如果已失效）
}
```

### 5.3 失效规则

| 触发 | 失效动作 |
|------|---------|
| 底层 Ref.kind 变更 | 标记 invalidatedAt |
| 底层 Ref.weight 降到 < 0.3 | 标记 invalidatedAt |
| 底层 Ref 被删除 | Shortcut 及其引用全部删除 |

**约束**：Shortcut 不能直接提高底层 Ref 的因果置信度。

---

## 6. RegulationView 投影

### 6.1 投影时机

| 事件 | 动作 |
|------|------|
| compile 完成后 | 调用 `RegulationViewBuilder.buildAll()` 刷新 |
| myelinate 完成后 | 调用 `RegulationViewBuilder.buildAll()` 刷新 |
| Ref 被删除 | 自动触发下次 buildAll |

### 6.2 投影逻辑

```
1. 扫描所有 compiled Ref (kind IN {causes, fixes, requires})
2. 展开 CONJUNCTION Atom 对应的 PART_OF 入边
3. 按 (precondition set, effect) 分组聚合
4. 映射 status:
   - avgWeight >= 0.7 && evidence >= 3 → confirmed
   - avgWeight >= 0.4 && evidence >= 1 → hypothesis
   - else → candidate
```

### 6.3 投影约束

| 约束 | 说明 |
|------|------|
| **只投影 compiled Ref** | candidate/hypothesis Ref 不参与 |
| **CONJUNCTION 展开必须** | 复合原子的完整语义需展开 |
| **status 严格由计数驱动** | 不受 Ref.force 影响 |

---

## 7. 失效传播

### 7.1 失效矩阵

| 触发 | 影响范围 | 动作 | 级联 |
|------|---------|------|------|
| 修改 Ref.kind | 依赖此 Ref 的 Shortcut | 标记 invalidatedAt | ❌ 无级联 |
| 修改 Ref.weight 降到 < 0.3 | 依赖此 Ref 的 Shortcut | 标记 invalidatedAt | ❌ 无级联 |
| **删除 Ref** | **依赖此 Ref 的 Shortcut + RegulationView** | **删除 Shortcut，View 下次 buildAll 自动更新** | ✅ 触发 ComposeRule 失效检查 |
| 修改 ComposeRule | 所有依赖此规则的 compiled Ref | 需回放 proof 验证 | ✅ 级联失效 Shortcut |
| **删除 Atom** | **入出边的所有 Ref + 依赖 Ref 的 Shortcut** | **级联删除 Ref (ON DELETE CASCADE)** | ✅ 触发上述 Ref 删除的连锁 |

### 7.2 失效检查职责分工

| 组件 | 职责 |
|------|------|
| **Ref 修改** | 检查依赖 Shortcut，标记 invalidatedAt |
| **Shortcut 查询** | 筛出 invalidatedAt 为 null 的有效 Shortcut |
| **RegulationView** | 下次 buildAll 时自动排除失效 Ref（不需显式触发） |
| **ComposeRule 变更** | 调用 `validateProof` 回放受影响的 Ref 序列 |

---

## 8. 不变量

| 不变量 | 强度 | 检查点 |
|--------|------|--------|
| **compile 前必须通过 RefAlgebra 路径合法性检查** | 硬约束 | `validatePath` 在 Phase 1 执行 |
| **compile 只能基于 Story/Evidence，不可凭空强化** | 硬约束 | canPromote 检查 validatedByEvidenceIds.length > 0 |
| **Evidence 写在 compile 之后** | 硬约束 | Phase 顺序执行，Phase 3 在 Phase 2 后 |
| **Shortcut 写在 compile 之后** | 硬约束 | myelinate 在 recordSupport 后执行 |
| **analogical force 的 Hypothesis 永远不能触发 compile** | 硬约束 | canPromote 检查 forceUpperBound != 'analogical' |
| **Regulation 只是投影，不参与写路径** | 硬约束 | RegulationView 仅读取已有 Ref，不创建新 Ref |
| **Shortcut 不能直接提高底层 Ref 置信度** | 软约束 | Shortcut 仅作导航加速，权重独立 |
| **失效 Shortcut 标记 invalidatedAt，不删除** | 软约束 | 保留历史审计跟踪 |

---

## 9. 决策树：Compile 能否执行

```
输入: correctPath, failedPaths, maybeHypothesis

├─ len(correctPath) < 2?
│  └─ YES → 返回 {ok: false, reason: "path too short"}
│
├─ ∃ 相邻 pair 无 Ref?
│  └─ YES → 返回 {ok: false, reason: "disconnected path"}
│
├─ isPathLegal(refKinds)? (RefAlgebra 检查)
│  └─ NO → 返回 {ok: false, reason: "illegal path"}
│
├─ maybeHypothesis exists?
│  ├─ YES
│  │  ├─ canPromote(hypothesis)?
│  │  │  ├─ NO → 返回 {ok: false, reason: "promotion failed"}
│  │  │  └─ YES → 继续
│  │  └─ 否则 hypothesis = null
│  └─
│
└─ 执行 compile（Phase 2-4）
   └─ 返回 {ok: true, result: ...}
```

---

## 10. 风格指南

- **表格优先**：复杂逻辑用表格展示，清晰明确
- **编号精确**：步骤编号顺序，不能乱序
- **无废话**：每句话都是约束或规则，删除过渡说明
- **数字化**：阈值、计数、百分比等显式写出
- **链接 RefAlgebra**：涉及 Ref 复合必须明确指向 RefAlgebra 合同
