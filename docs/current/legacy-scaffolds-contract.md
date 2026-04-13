---
kind: contract
status: draft
phase: 0
schema_version: 1
describes: "legacy 脚本登记"
---

# Legacy Scaffolds 合同：前 epistemic 时代脚手架脚本登记

> 本合同登记 BestQ-A 仓内在 [epistemic-contract.md](epistemic-contract.md) 钉定之前存在的、目前尚未能精确映射到单一下游 contract 的 scaffold 类脚本。
> 它们的存在是阶段性的——服务于 v5 及更早的原型工作。任何一个被本合同收录的脚本，都必须在 `epistemic-contract.md` 转为 `status: current` 之前被重新分类或删除。
> 本合同本身是**一份 scaffold 合同**：它的存在就是为了让 `scripts/contract-audit.mjs` 不红灯，同时把"这里有一笔未清的旧账"显式化，符合 `Clarity Ceiling 优于 Scale` 的 scaffold 声明规矩。
> 上游依赖：[epistemic-contract.md](epistemic-contract.md)、[file-taxonomy-contract.md](file-taxonomy-contract.md)、[contract-audit-contract.md](contract-audit-contract.md)

---

## 1. 登记范围

下列脚本全部位于 `causal-learner/mcp-server/scripts/`，全部是 pre-epistemic scaffold：

| 脚本 | 行数 | 自述用途 | 推测归属（epistemic 转 current 后） |
|------|------|----------|-------------------------------------|
| `evaluate.mjs` | 240 | Performance evaluation for causal learner | 问题求解环 · metrics 采集器 |
| `import-swebench.mjs` | 162 | Import SWE-bench data（keyword-based） | 本体学习环 · 输入适配器 |
| `swebench-evaluate.mjs` | 292 | SWE-bench 评估 runner | 问题求解环 · 评估器 |
| `swebench-train-test.mjs` | 492 | SWE-bench train/test 分割 | 本体学习环 · 训练集管理 |
| `visualize.mjs` | 329 | Dashboard HTML 生成 | HITL 展示层 |

**登记即承认**：这些脚本的职责边界尚未被 epistemic 7 对象集的任何单一合同精确覆盖。

---

## 2. 本合同的唯一用途

让 `contract-audit.mjs` R11 通过：

- 登记表里的每个脚本必须在其头部 JS 伪 frontmatter 写 `implements: docs/current/legacy-scaffolds-contract.md`
- 这是 scaffold 的诚实自述，不是对未来的承诺
- R11 校验只要求"指向 kind: contract 文件存在"，本合同满足该条件

---

## 3. 硬约束

- **禁止**在本合同之外的任何脚本或新脚本里把 `implements` 指向本合同
- **禁止**在本合同中添加"实际职责描述"——那是下游 contract 的工作
- 新增脚本若没有对应的具体 contract，必须**先起草下游 contract 的 draft 版本**再写脚本，而不是往本合同里加一行
- 本合同**不得**被任何 draft 以外的 downstream tooling 依赖

---

## 4. 拆除里程碑（scaffold 声明的核心）

本合同必须在以下任一条件满足后**整份删除**：

1. [epistemic-contract.md](epistemic-contract.md) 从 `draft` 转为 `current`
2. 登记表的 5 个脚本**全部**被重新分类到具体的下游 contract（例如 `reconstruction-contract.md` / `ontology-update-contract.md` 尚不存在，届时由其承接）
3. 登记表为空（所有脚本被删除或迁移出本仓）

---

## 5. 反不变量

- 本合同**不应该**长期存在
- 任何在本合同登记超过 90 天的脚本，必须走 ADR 决定：**重分类** / **改写** / **删除**
- 本合同从创建起进入倒计时，到期必须 review

---

## 6. 变更流程

- 新脚本加入登记：commit message 前缀 `docs(legacy): add <script>`
- 脚本被重分类 / 删除：commit message 前缀 `docs(legacy): evict <script>`
- 登记表清空：commit message 前缀 `docs(legacy): retire contract` + 同一 commit 里删除本文件

---

## 7. 版本历史

- v1（2026-04-13）：初版，收录 5 个 causal-learner/mcp-server/scripts/*.mjs 遗留脚本
