---
kind: contract
status: current
verified: 2026-04-13
phase: 1
schema_version: 1
describes: "summary.md 结构规范"
---

# Summary Markdown 合同：人类可读摘要的结构约束

> 本合同定义 `artifacts/<run_id>/summary.md` 与 `.omx/baselines/<date>/summary.md` 两类人类可读摘要文件的 frontmatter、章节骨架与每节格式。
> 这两类文件的内容 schema 由本合同裁决，[artifact-contract.md](artifact-contract.md) 只约束目录布局，不约束 markdown 字段。
> 代码位置：`scripts/eval.mjs`、`scripts/capture-baseline.mjs`
> 上游依赖：[artifact-contract.md](artifact-contract.md)、[stats-snapshot-contract.md](stats-snapshot-contract.md)

---

## 1. 范围

本合同适用于以下两类 markdown instance 文件：

| 路径模式 | 生成器 | 触发时机 |
|---------|--------|----------|
| `artifacts/<run_id>/summary.md` | `scripts/eval.mjs` | 每次 eval 运行结束 |
| `.omx/baselines/<date>/summary.md` | `scripts/capture-baseline.mjs` | 每次抓 baseline |

两类文件共享同一 frontmatter 要求（§2）与必需章节骨架（§3）。特有章节见 §4。

---

## 2. 必需 frontmatter

每份 instance 文件顶部必须是严格的 YAML frontmatter，恰好包含以下四个字段（其它字段一律不允许）：

```yaml
---
kind: instance
conforms_to: docs/current/summary-markdown-contract.md
generated_by: scripts/eval.mjs          # 或 scripts/capture-baseline.mjs
generated_at: 2026-04-13                # ISO 8601 日期或时间戳
---
```

| 字段 | 取值约束 |
|------|---------|
| `kind` | 字面量 `instance` |
| `conforms_to` | 字面量 `docs/current/summary-markdown-contract.md` |
| `generated_by` | 生成脚本相对仓根路径，必须真实存在（否则 `contract-audit.mjs` R8 报 `bad-generated-by-target`） |
| `generated_at` | ISO 8601 日期（`YYYY-MM-DD`）或带时区时间戳（`YYYY-MM-DDTHH:MM:SSZ`） |

---

## 3. 必需章节骨架

frontmatter 之后，正文必须按下列顺序出现以下章节（允许中间插入特有章节，但这四节必须齐全、顺序不倒）：

| 顺序 | 标题 | 级别 | 作用 |
|------|------|------|------|
| 1 | `# <run 或 baseline 标题>` | H1 | 一行标题，后跟一个 bullet 块（`- commit:` / `- phase:` / `- dataset:` 等元信息 bullet） |
| 2 | `## Conclusion` | H2 | 一段话结论，说明"整体 OK/FAIL + 最关键的一句发现" |
| 3 | `## Files` | H2 | 本目录下落盘文件清单 |
| 4 | `## Steps` | H2 | 逐步状态列表 |
| 5 | `## Failed Steps` / `## Failed steps` | H2 | 失败步骤列表（大小写允许两种，由生成器一致即可） |

**不变量**：即使某一步失败，这五节也必须全部存在。失败只改变节内取值，不得省略整节。

---

## 4. 每节的格式约束

### 4.1 H1 标题与元信息 bullet

H1 后第一块必须是短 bullet list，每条形如 `` - <key>: <value> `` 或 `` - <key>: `<code-value>` ``。最少给出 `commit`，其它字段按类型追加：

- eval summary 必须给：`commit` / `phase` / `dataset` / `n_instances` / `duration_sec`
- baseline summary 必须给：`commit` / `out`（目录路径）/ `Stats capture status`

元信息之后、`## Conclusion` 之前允许有补充 bullet（例如 baseline 的 "ok=[...] error=[...]"），但仍属 H1 段落。

### 4.2 `## Conclusion`

正文为一段自然语言（1–3 句），**不得**是 bullet。结论必须明示三件事之一：

- 整体 OK 并给出最关键数据点
- 整体 FAIL 并给出首行错误
- `partial` 并说明已完成的部分

### 4.3 `## Files`

每行必须是 `` - `<filename>` — <一行说明> ``。

- 路径用反引号包裹
- 说明用全角破折号 `—` 而非 ASCII 连字符
- 必须枚举当前目录下全部落盘文件（含 `summary.md` 自身）

### 4.4 `## Steps`

每行必须是 `` - <STATUS>   <step name> — <detail> ``。

- `<STATUS>` ∈ {`OK`, `FAIL`, `SKIP`}，全大写
- `<STATUS>` 与 `<step name>` 之间用多个空格分隔（对齐用）
- `<step name>` 用短英文短语（例如 `mcp-server build`、`stats snapshot`、`capture git HEAD`）
- `<detail>` 是一行可读信息，禁止换行

### 4.5 `## Failed Steps`

| 情况 | 写法 |
|------|------|
| 零失败 | 必须写 `` - (none) ``，不允许空节 |
| 一个或多个失败 | 每行 `` - <step name> — <error first line> ``，引用 §4.4 中状态为 `FAIL` 的步骤 |

**一致性约束**：`Failed Steps` 列表必须恰好等于 `Steps` 中 `FAIL` 状态的子集。生成器若打破此约束视为 bug。

---

## 5. 失败语义

| 情况 | summary.md 行为 |
|------|----------------|
| 生成器自身 crash | 仍必须落盘最小版 summary.md（至少含 frontmatter + H1 + `## Conclusion` "generator crashed: <msg>" + `## Failed Steps` 列出 crash） |
| 某一步失败 | 正文 `## Steps` 写 `- FAIL   <name> — <msg>`，`## Failed Steps` 同步追加；其它步骤仍按实际状态落盘 |
| 全部步骤成功 | `## Conclusion` 写 OK 文案，`## Failed Steps` 写 `- (none)` |
| 部分完成（中途退出） | `## Conclusion` 必须含 `partial` 字样，已完成步骤正常 OK，未执行步骤写 `SKIP` 或不列出（由生成器一致即可） |

**不变量**：summary.md 一旦开始写入，不得以"空文件"或"只有 frontmatter"收尾。最小合法实例必须四节齐全。

---

## 6. 特有章节（非强制，生成器可扩展）

两类生成器各自允许追加下列扩展节。这些节不是本合同的必需项，但若出现必须遵守本节的格式约束：

| 章节 | 适用生成器 | 格式 |
|------|-----------|------|
| `## Key deltas (dualStats)` | `eval.mjs` | bullet 列表，每行 `- <path>: <before>→<after>` |
| `## Verification` | `eval.mjs` | bullet 列表，每行 `- <check>: <status>` |
| `## Captured` | `capture-baseline.mjs` | 分组 bullet，描述 stats.json 捕获详情 |
| `## Known Gaps` | `capture-baseline.mjs` | bullet 列表，一条一个已知缺口 |

特有章节必须出现在 `## Failed Steps` 之后。

---

## 7. 变更流程

1. 新增必需章节：先在本合同 §3 表格追加一行，然后修改 `scripts/eval.mjs` + `scripts/capture-baseline.mjs` 的生成逻辑，两个生成器必须同时落地
2. 新增特有章节：只改 §6 表格 + 对应生成器
3. 改 frontmatter 字段集：破坏性变更，升 `schema_version`
4. 改 `## Steps` 的行格式（例如加入耗时列）：破坏性变更，升 `schema_version`
5. commit message 前缀：`docs(summary): ...`

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初稿。从 `.omx/baselines/2026-04-13/summary.md` 与 `artifacts/20260413-001/summary.md` 抽象五节骨架（H1 / Conclusion / Files / Steps / Failed Steps），冻结每节格式，划清与 artifact-contract.md 的边界（后者只管目录布局，不管内容 schema） |

---

## 参考

- [artifact-contract.md](artifact-contract.md) — 上游，规定 summary.md 必须落在 `artifacts/<run_id>/` 下
- [stats-snapshot-contract.md](stats-snapshot-contract.md) — 特有节 `Key deltas` 的数据源
- [contract-audit-contract.md](contract-audit-contract.md) §9.3 — R6/R7/R8 对 instance frontmatter 的强约束
