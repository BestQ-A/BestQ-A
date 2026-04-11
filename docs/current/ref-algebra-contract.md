# RefAlgebra 合同：关系代数约束规范

> 本文档是 `metamodel.md` 的局部合同，管辖所有涉及 Ref 复合、Evidence 继承、force 约束的行为。
> 代码位置：`core/ref-algebra.ts`

---

## 1. 四族分类

| 族群 | 成员 | 语义层 | 可复合方向 |
|------|------|--------|-----------|
| **structural** | `is_a`, `part_of` | 世界模型 | 可向解释层投射（inherit） |
| **explanatory** | `causes`, `requires` | 世界模型 | 可链式传递 |
| **evidential** | `indicates`, `cooccurs`, `similar_to` | 认识论 | **禁止**直接复合进解释层 |
| **interventional** | `fixes`, `prevents` | 世界模型 | 可与解释层配对 |

**核心分层约束**：evidential 描述"观察如何提示解释"，不是世界真相。跨层复合产生 Hypothesis，不产生 compiled Ref。

---

## 2. RefForce 维度

| 值 | 含义 | 用途 |
|----|------|------|
| `necessary` | A 是 B 的必要条件 | `requires`, `is_a`, `part_of` 的默认 |
| `sufficient` | A 足以导致 B | 需显式标注，不由复合产生 |
| `contributory` | A 促成 B 但不充分 | `causes`, `fixes`, `prevents` 的默认 |
| `analogical` | 结构类比，非因果 | `indicates`, `cooccurs`, `similar_to` 的默认 |

**约束**：
- `contributory ∘ contributory` 不能升级为 `sufficient`
- force 沿路径**只降不升**：necessary > sufficient > contributory > analogical
- **短期定位**：force 是安全护栏（禁止非法增强），不是排序数轴

---

## 3. 复合规则表

### 合法复合

| first | second | result | mode | evidencePolicy |
|-------|--------|--------|------|---------------|
| causes | causes | causes | direct | inherit |
| requires | causes | requires | direct | inherit |
| requires | requires | requires | direct | inherit |
| fixes | causes | fixes | direct | inherit |
| prevents | causes | prevents | direct | inherit |
| is_a | causes | causes | inherit | revalidate |
| is_a | fixes | fixes | inherit | revalidate |
| is_a | requires | requires | inherit | revalidate |
| is_a | prevents | prevents | inherit | revalidate |
| is_a | is_a | is_a | direct | inherit |
| part_of | part_of | part_of | direct | inherit |
| similar_to | fixes | fixes | candidate | revalidate |
| similar_to | causes | causes | candidate | revalidate |
| indicates | indicates | indicates | weak | discard |
| cooccurs | cooccurs | cooccurs | weak | discard |
| similar_to | similar_to | similar_to | weak | discard |

### 禁止复合

| first | second | 原因 |
|-------|--------|------|
| **indicates** | **causes** | 征兆不能压缩为根因 |
| **cooccurs** | **causes** | 共现不是因果 |
| **indicates** | **fixes** | 征兆不能直接导出修复 |
| **cooccurs** | **fixes** | 共现不能直接导出修复 |
| **part_of** | **causes** | 部分不等于整体的因果 |
| **indicates** | **prevents** | 征兆不能导出预防 |
| **cooccurs** | **prevents** | 共现不能导出预防 |

**闭世界假设**：未显式注册的复合默认禁止。

---

## 4. EvidencePolicy

| 策略 | 含义 | 适用场景 |
|------|------|---------|
| `inherit` | 继承源边的 Evidence | 同族直接复合 |
| `revalidate` | 必须重新验证 | 跨族复合、继承复合 |
| `discard` | 丢弃源 Evidence | 弱传递（evidential 族内） |

---

## 5. Proof-Carrying Inference

每次 `validatePathRich` 返回完整推导记录：

```typescript
interface DerivationStep {
  refKind: string;
  force: RefForce;
  position: number;
}
```

**失效规则**：底层 Ref 的 kind/force/scope 变更时，所有依赖它的 proof 必须回放验证。

---

## 6. 不变量

| 不变量 | 说明 |
|--------|------|
| evidential 不能直接写入 compiled Ref | 必须经过 Hypothesis → validate → compile |
| force 沿路径只降不升 | degradeForce 函数保证 |
| evidencePolicy 沿路径只降不升 | degradeEvidencePolicy 函数保证 |
| 未注册的复合默认禁止 | 闭世界假设 |
| compile 前必须通过路径合法性检查 | isPathLegal 门控 |
