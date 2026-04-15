---
kind: review
status: current
date: 2026-04-14
focus: "commit-driven planning strategy"
---

# Review：按 commit 动态更新规划的策略

## 结论

后续规划不再只按：

- 最近 commit 标题

来判断任务状态。

改为四层判断：

1. **代码对象是否存在**
2. **专项测试是否锁定**
3. **artifact / audit / CI 是否接入**
4. **合同是否已转 current**

只有四层一起看，编号队列才不会漂。

## 为什么需要这套策略

当前工作区已经出现了这种典型情况：

- `ProgramRevisionProposal` 的代码和 pipeline 接线已经存在
- 但还没有独立专项测试文件
- 更没有治理接入

如果只看早期 plan，会误判为“尚未开始”；
如果只看代码文件，又会误判为“已经完成”。

所以后续必须按分层状态更新。

## 统一状态语义

编号任务以后统一用这 5 个状态：

- `queued`：尚未开始
- `in-progress`：代码或合同已部分存在，但未锁测试
- `verified-runtime`：代码与专项测试已成立，但治理未接入
- `next-up`：前置已基本满足，可作为当前主线
- `governed`：artifact / audit / CI 已接入
- `frozen`：合同已 current，当前阶段不再优先打磨

## 更新规则

### 规则 1：代码存在但无测试

标记为：

```text
in-progress
```

而不是：

```text
done
```

### 规则 2：有测试但无治理

应标记为：

```text
verified-runtime
```

而不是 `governed` 或 `frozen`。

### 规则 3：治理闭环完成

满足：

- artifact 已导出
- contract-audit 已接入
- 合法实例不命中新错误桶

才可升级到：

```text
governed
```

### 规则 4：合同转 current

只有在对象：

- runtime 成立
- store 成立
- 测试成立
- 治理成立

后，才允许把专项合同从 `draft` 升成 `current`，并将该编号任务视为：

```text
frozen
```

## 对当前队列的影响

截至 2026-04-14：

- `P01` 不应再标为 `ready`
- 它应标为：
  - 代码已存在
  - pipeline 已接线
  - 但缺专项测试
  - 因此状态应为 `in-progress`

接下来正确顺序是：

```text
先补 P01 验证收口
再做 P02 治理接入
```

## 一句话收束

以后“动态更新规划”不以自然语言感觉为准，而以：

**代码存在 → 测试锁定 → 治理接入 → 合同转 current**

这四层状态机为准。
