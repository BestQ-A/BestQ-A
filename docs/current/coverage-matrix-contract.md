---
kind: contract
status: current
verified: 2026-04-13
phase: 0
schema_version: 1
describes: "coverage-matrix 表规范"
---

# Coverage Matrix 合同：baseline 粗粒度覆盖表规范

> 本合同定义 `.omx/baselines/<date>/coverage-matrix.md` 文件的 frontmatter、前言、表格列集与行约束。
> 这是 Phase 0 的粗粒度"提及即覆盖"近似，不等价于行覆盖率。本合同不与行覆盖率工具竞争。
> 代码位置：`scripts/capture-baseline.mjs`
> 上游依赖：[artifact-contract.md](artifact-contract.md)

---

## 1. 范围

本合同适用以下 instance 文件：

| 路径模式 | 生成器 |
|---------|--------|
| `.omx/baselines/<date>/coverage-matrix.md` | `scripts/capture-baseline.mjs` |

当前唯一实例：`.omx/baselines/2026-04-13/coverage-matrix.md`。`artifacts/<run_id>/` 目录下**不生成**本类文件（eval 流程不做覆盖率扫描）。

---

## 2. 必需 frontmatter

```yaml
---
kind: instance
conforms_to: docs/current/coverage-matrix-contract.md
generated_by: scripts/capture-baseline.mjs
generated_at: 2026-04-13
---
```

| 字段 | 取值约束 |
|------|---------|
| `kind` | 字面量 `instance` |
| `conforms_to` | 字面量 `docs/current/coverage-matrix-contract.md` |
| `generated_by` | 字面量 `scripts/capture-baseline.mjs`（本合同只承认这一个生成器） |
| `generated_at` | ISO 8601 日期或时间戳 |

---

## 3. 必需正文结构

frontmatter 之后，正文按以下顺序出现，缺一不可：

1. `# Coverage Matrix` 标题（H1，字面量）
2. 一段 blockquote 前言，至少两行：第一行说明扫描范围，第二行声明"粗粒度近似，不等价于行覆盖率"
3. 一张 markdown 表格（§4）

---

## 4. 表格列集（冻结）

表格必须恰好包含下列三列，顺序与列名冻结：

| 列名 | 类型 | 语义 |
|------|------|------|
| `source` | 字符串 | 被扫描的源文件名（basename，不含目录前缀，形如 `atom-graph.ts`） |
| `referenced by tests` | `yes` / `no` | 该 source 是否被 tests 目录下任一文件字面引用 |
| `hits` | 字符串 | 命中时是逗号分隔的测试文件列表；未命中时字面量 `-` |

**字段约束**：

- `source` 列只允许 `.ts` 扩展名的 basename（当前扫描范围是 `causal-learner/mcp-server/src/core/*.ts`）
- `referenced by tests` 只允许 `yes` 或 `no`，不允许空或 `maybe` 或 `unknown`
- 当 `referenced by tests` 为 `no` 时，`hits` 必须是字面量 `-`
- 当 `referenced by tests` 为 `yes` 时，`hits` 必须是至少一个测试文件名，多个用 `, ` 分隔

---

## 5. 行约束

- **一行一源文件**：每一行对应扫描范围内恰好一个源文件，行数 = 扫描范围内源文件数
- **字母序**：行按 `source` 列字母序升序排列（便于 diff）
- **无空行**：表格主体内部不得有空行
- **全覆盖**：扫描范围内每个源文件都必须出现一行，即使 `referenced by tests` 为 `no`

---

## 6. 失败语义

| 情况 | 行为 |
|------|------|
| 扫描根不存在 | 生成 frontmatter + H1 + blockquote（注 "source dir missing"）+ 空表头 |
| 测试目录不存在 | 所有行 `referenced by tests=no`、`hits=-`，blockquote 追加说明 |
| 单源文件读错 | 该行 `hits` 写 `- (read error)`，其它行不受影响 |

**不变量**：文件一旦写入必须至少含 frontmatter + H1 + blockquote + 表头。空文件与纯 frontmatter 均违规。

---

## 7. 变更流程

1. 扩扫描范围：更新 §4 `source` 列前缀说明 + `capture-baseline.mjs` 扫描根
2. 加列 / 改列名 / 改排序：破坏性变更，升 `schema_version`，同步改生成器
3. commit message 前缀：`docs(coverage-matrix): ...`

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初稿。从 `.omx/baselines/2026-04-13/coverage-matrix.md` 抽象三列骨架（source / referenced by tests / hits），冻结列名与行约束。本合同不承担行覆盖率职责，仅记录 Phase 0 粗粒度近似 |

---

## 参考

- [artifact-contract.md](artifact-contract.md) — 上游，规定 baseline 产物目录布局
- [summary-markdown-contract.md](summary-markdown-contract.md) — 姊妹合同，约束同目录下 `summary.md`
