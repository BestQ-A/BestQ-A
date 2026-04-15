---
kind: contract
status: current
phase: 0
schema_version: 1
describes: "任务回报文件命名、路径与模板规范"
---

# Reporting Workflow 合同：任务回报不再依赖人工复制

## §1 目标

后续实现与测试结果回流，**不再依赖用户把 Claude 的聊天内容复制给我**。

统一改成：

```text
编号任务
  → brief
  → 固定 report 文件
  → 我读取 report 文件更新规划
```

一句话：

> 人不是 message bus，仓库里的固定报告文件才是。

## §2 固定目录

所有任务回报统一写入：

```text
.omx/reports/
```

## §3 命名规则

每个任务一个固定 report 文件：

```text
.omx/reports/P02-program-revision-proposal-governance.md
.omx/reports/P03-supportlink-deep-audit.md
.omx/reports/P04-mechanismclass-promotion-gate.md
```

命名格式：

```text
P<编号>-<slug>.md
```

要求：

1. 与编号队列中的 `Pxx` 一一对应
2. slug 稳定，不随一次对话措辞变化
3. 同一任务持续迭代时，覆盖同一个 report 文件，而不是新建多个名字

## §4 report 模板

每个 report 文件必须使用以下结构：

```md
# P02 Report

## Task
- P02 ProgramRevisionProposal governance

## Changed Files
- file A
- file B

## Verification
- npm run build: pass
- test-foo.mjs: 10/10

## Risks
- risk A
- risk B

## Decision
- done | partial | blocked

## Next Handoff
- optional next step
```
```

## §5 字段要求

### 5.1 `Task`

必须明确：

- 任务编号
- 任务名称

### 5.2 `Changed Files`

必须列出：

- 真实修改过的文件

### 5.3 `Verification`

必须列出：

- 实际跑过的验证命令或测试
- 结果

### 5.4 `Risks`

必须写：

- 仍未解决的风险
- 或明确写 `- none`

### 5.5 `Decision`

只允许：

- `done`
- `partial`
- `blocked`

## §6 与 brief 的关系

以后每个 Claude brief 都应包含：

1. 固定 report 文件路径
2. 要求把结果写入该路径
3. 不要只在聊天中回报

## §7 与规划更新的关系

我后续更新编号队列时，只把以下信息当成一级真相来源：

1. 代码和测试的本地复核
2. `.omx/reports/*.md`
3. commit 历史

不再把“用户复制来的二手摘要”当默认真相来源。

## §8 不变量

1. 每个 active 任务都应有固定 report 路径
2. 同一任务不得散落多个 report 文件
3. 无 report 文件的回报不算正式收口
4. 若 `Decision=done`，必须有 `Verification`

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-14 | 初版。把任务结果回流从人工复制改成固定 report 文件流程 |
