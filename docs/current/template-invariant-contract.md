---
status: current
verified: 2026-04-13
phase: 1
---

# PatternTemplate 不变量合同：模板约束与门控规范

> 本文档是 `metamodel.md` 的局部合同，管辖模板匹配、不变量门控、模板生命周期。
> 代码位置：`core/pattern-template.ts`

---

## 1. SlotFingerprint — 角色由关系定义，不由名字定义

`atomKinds` 不足以区分角色（Symptom 和 Failure 都是 FACT）。区分靠关系指纹：

```typescript
interface SlotFingerprint {
  inboundRefKinds?: string[];     // 期望入边类型
  outboundRefKinds?: string[];    // 期望出边类型
  isConvergencePoint?: boolean;   // 是否是多条路径的汇合点
  minInDegree?: number;
  minOutDegree?: number;
}
```

**约束**：匹配时优先检查 fingerprint，atomKinds 作为宽松兜底。

---

## 2. InvariantCheck — 可执行不变量

### DSL 规则语法

| 规则格式 | 含义 | 示例 |
|---------|------|------|
| `slot:X != slot:Y` | 两个 slot 不能绑定同一 Atom | `slot:Symptom != slot:Failure` |
| `slot:X exists` | slot 必须有绑定 | `slot:Mechanism exists` |
| `ref:X->Y:kind` | X 到 Y 必须有指定类型的边 | `ref:Symptom->Mechanism:indicates` |

### 严重度

| 级别 | compile 影响 | 含义 |
|------|-------------|------|
| `hard` | 不通过 → 阻止 compile | 违反即结构错误 |
| `soft` | 不通过 → 只能留在 candidate | 违反但可能有合理原因 |

### canCompile 门控

```
canCompile(template, bindings, refChecker) →
  所有 hard invariant 必须通过
  soft invariant 不影响门控，但记录到 Story
```

---

## 3. 模板生命周期

```
candidate → verified → stable → deprecated
```

| 阶段 | 主路由参与 | 说明 |
|------|-----------|------|
| `candidate` | ❌ shadow match only | 新涌现，未经验证 |
| `verified` | ✅ 有限参与 | 通过回放测试 |
| `stable` | ✅ 完全参与 | 多次成功实例化 |
| `deprecated` | ❌ | 被更好模板取代 |

**约束**：
- `candidate` 模板不参与 `constrainSubgraph` 路由
- 升级到 `verified` 需要：cross-context support + compression gain + predictive gain
- 种子模板直接为 `stable`

---

## 4. 模板涌现治理

`compileThreshold` 单独一个数字不够。升级门槛：

| 条件 | 含义 |
|------|------|
| `cross-context support` | 不能只在一个 project/stack 成功 |
| `compression gain` | 比现有模板更省描述长度 |
| `predictive gain` | 提升 slot fill / path selection 准确率 |
| `novelty` | 不是已有模板的轻微别名 |

---

## 5. 与 RefAlgebra 的交互

模板的 `arrows` 中指定的 `refKind` 必须与 RefAlgebra 的复合规则一致：

- 模板内的箭头序列必须通过 `isPathLegal`
- 匹配时 `refChecker` 只检查已存在的 Ref，不自动创建
- compile 时先通过 `canCompile` 门控，再通过 RefAlgebra 路径验证，两关都过才允许写入

---

## 6. 不变量

| 不变量 | 说明 |
|--------|------|
| hard invariant 不过 → compile 被阻止 | `canCompile` 函数保证 |
| candidate 模板不参与主路由 | 只做 shadow match |
| 模板箭头必须符合 RefAlgebra | 注册时可预检 |
| 涌现模板需要多维度门槛 | 不只是 compileThreshold 计数 |
