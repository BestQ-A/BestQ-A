---
kind: contract
status: current
verified: 2026-04-13
schema_version: 1
describes: "run summary 文档结构"
---

# Run Summary 合同：人读摘要 Markdown 结构规范

> 本文档定义一类**人读 markdown 文档**的骨架：每次 eval/bench/baseline 运行在 `artifacts/<run_id>/summary.md`、`.omx/baselines/<date>/summary.md`、`.omx/baselines/<date>/coverage-matrix.md` 落盘的摘要页面。
> 这类文件不是机器字典，不是目录清单，而是给工程师 30 秒扫一眼就能判断"这次跑得怎么样"的报告。
> 代码位置：`scripts/capture-baseline.mjs` / `scripts/eval.mjs`
> 上游依赖：[artifact-contract.md](artifact-contract.md)（管"目录里要不要有 summary.md"）、[metrics-contract.md](metrics-contract.md)（被引用做 delta）

---

## 1. 目的

artifact-contract.md §1 只要求 `summary.md` 文件必须存在于每个运行目录，不定义文件内容。reviewer 2026-04-13 问题 4 指出：把这类 Markdown 直接 `conforms_to: artifact-contract.md` 是 schema 错绑。本合同补上 payload 侧的缺口。

适用实例：

1. `artifacts/<run_id>/summary.md` — 单次 eval 运行的摘要
2. `.omx/baselines/<date>/summary.md` — 基线快照的摘要
3. `.omx/baselines/<date>/coverage-matrix.md` — 基线附带的覆盖近似报告

**不适用**：`docs/current/*.md`（合同本身）、`artifacts/<run_id>/metrics.json`（机器字典）、任何无 frontmatter 的 README。

---

## 2. 强制章节

一份合法的 run summary 文档必须按顺序包含以下结构。缺失任一节都算违反本合同，`contract-audit.mjs` 应报 `run-summary-missing-section`。

### 2.1 H1 标题

第一个非 frontmatter 节点必须是唯一的 H1，格式为：

```
# <type> <date_or_run_id>
```

`<type>` 是 `Eval` / `Baseline` / `Bench` / `Coverage Matrix` 之一；`<date_or_run_id>` 是 `YYYY-MM-DD` 或 `YYYYMMDD-NNN`。例：

- `# Eval 20260413-002`（见 `artifacts/20260413-002/summary.md:8`）
- `# Baseline 2026-04-13`（见 `.omx/baselines/2026-04-13/summary.md:8`）
- `# Coverage Matrix`（见 `.omx/baselines/2026-04-13/coverage-matrix.md:8`，允许省略日期当已落在日期目录下）

### 2.2 结论段

紧接 H1（可以在一段键值 `- commit: ...` 列表之后）必须有一个 `## Conclusion`（或中文别名 `## 结论`）小节，**正文仅一句话**，给出运行是否可接受的定性判断。

例：

- `Run completed. 28 fields captured, 10 fields null (TBD or Phase-gated).`（`artifacts/20260413-002/summary.md:18`）
- `Build OK, 5 test files passed. Baseline is reproducible for re-run.`（`.omx/baselines/2026-04-13/summary.md:16`）

一句话禁止展开为多段。如果需要展开，必须拆到下面的 §2.3 / §2.4 章节里。

### 2.3 Files 段

`## Files` 列出该运行目录下每个产物文件的一行中文说明。用于让读者不打开其它文件就能知道目录里有什么。

### 2.4 Steps 段

`## Steps` 列出本次运行的主要步骤，每行形如 `- <STATUS> <name> — <detail>`，`<STATUS>` 用 `OK` / `FAIL` / `SKIP`。允许用 `## Verification` 作为别名（见 `artifacts/20260413-002/summary.md:26`）。

### 2.5 Failed Steps 段

`## Failed Steps` 必须存在；即便为空也要写 `- (none)`。不允许用"隐式为空"省略该节。这是为了让失败的运行和成功的运行**章节结构同构**。

### 2.6 Known Gaps 段（可选但强烈建议）

`## Known Gaps` 列出明知尚未覆盖/采集/实现的项。这一段是可选的，但对 phase 0/1 运行强烈建议写出来，避免读者误以为某些字段真的是 0 而不是 "not yet collected"。

---

## 3. Frontmatter 字段

每份实例必须带 YAML frontmatter，字段集如下：

```yaml
---
kind: instance
conforms_to: docs/current/run-summary-contract.md
generated_by: scripts/eval.mjs            # 或 scripts/capture-baseline.mjs
generated_at: 2026-04-13                  # YYYY-MM-DD 或 ISO-8601
---
```

| 字段 | 必需 | 值 | 语义 |
|------|------|----|------|
| `kind` | 是 | `instance` | 固定。让 `contract-audit.mjs` 识别为实例 |
| `conforms_to` | 是 | `docs/current/run-summary-contract.md` | **必须指向本合同**，不再指向 artifact-contract.md（问题 4 的正式修补丁） |
| `generated_by` | 是 | 生产者脚本相对路径 | 审计追溯 |
| `generated_at` | 是 | 日期或 ISO-8601 | 生成时间 |

旧实例的现状：`artifacts/20260413-002/summary.md:3` 与 `.omx/baselines/2026-04-13/summary.md:3` 目前仍写 `conforms_to: docs/current/artifact-contract.md`。这是 reviewer 抓到的绑错对象，待后续修补丁切换，切换动作**不算**对本合同的破坏性变更（见 §6）。

---

## 4. 失败语义

artifact-contract.md §3 规定运行失败时目录和文件仍须产出。本合同与之配合，对 summary.md 在失败场景下的**内容**追加以下强约束：

| 情况 | summary.md 必须满足 |
|------|---------------------|
| build 失败 | H1 存在；§2.2 结论段首词为 `Build failed:`；§2.5 Failed Steps 至少一行 `FAIL build — <error first line>` |
| 评测中途异常 | §2.2 结论段包含 `partial`；§2.5 Failed Steps 列出崩溃样本；§2.6 Known Gaps 段必须存在且说明未覆盖范围 |
| 断言失败但 build 过 | §2.5 Failed Steps 列出每个失败断言；§2.2 结论段首词为 `Assertions failed:` |
| 全部成功 | §2.5 Failed Steps 写 `- (none)`，不得省略 |

**绝不允许**失败运行产出空 summary.md 或只含一行 `failed` 的 summary.md。原子性写法（一次全写）+ 结构同构（总是同样的章节）是这个合同的硬性要求，让 downstream diff 工具可以无视成功/失败统一解析。

---

## 5. 与 artifact-contract.md 的边界

两份合同回答的是**不同问题**，绝不重合：

| 问题 | 回答者 |
|------|--------|
| "目录 `artifacts/<run_id>/` 下必须有哪些文件？" | artifact-contract.md §1 |
| "运行失败时目录还要不要生成？" | artifact-contract.md §3 |
| "`summary.md` 里要写哪些章节？" | **本合同** §2 |
| "`summary.md` 的 H1 格式是什么？" | **本合同** §2.1 |
| "失败时 `summary.md` 的内容应该长什么样？" | **本合同** §4 |

换句话说：artifact-contract.md 管**目录形态**（有没有这个文件），本合同管**文件 payload**（文件里写什么）。一个实例同时**违反 artifact-contract.md 文件存在性**和**违反本合同章节结构**是可能的，audit 会分别报两条错误。

`coverage-matrix.md` 虽然在 H1 级别偏"表格数据"而非"运行报告"，但因它同样是 `.omx/baselines/<date>/` 下的人读 Markdown 附件，复用本合同的 frontmatter 约定和 H1 规则；§2.2-§2.6 的后续章节对它**软约束**（允许用一个表格替代 Files/Steps，只要仍有 `## Known Gaps` 或等价段）。

---

## 6. schema_version 变更流程

`schema_version: 1` 语义：本合同 §2 六个强制章节 ID、§3 四个 frontmatter 键、§4 四个失败场景属于冻结面。下列变更需要 `schema_version +1`：

1. §2 章节增减或改名（如把 `## Files` 改成 `## Artifacts`）
2. §3 frontmatter 键集变更
3. §4 失败场景语义反转（如允许失败时省略 Failed Steps 段）
4. H1 格式约定变更（`<type> <date_or_run_id>` 改成其它模板）

下列变更**不需要**升级版本：

1. 把某章节从"可选"改"强制"或反向（只要 key 集不变），在 §2 表格里打注就行
2. 修正 §2 例子的 file:line 引用
3. 新增受本合同管辖的实例文件类型（例如未来加入 `bench/<date>/summary.md`）

升级流程：

1. 在本文件 `schema_version` 上 bump
2. 改 §2 / §3 / §4
3. 同步改 `scripts/capture-baseline.mjs` 与 `scripts/eval.mjs` 写 frontmatter 的代码，让生成的 `conforms_to` 与新 schema 一致
4. 允许历史实例保留旧 schema，不强制回改已发布 run_id（呼应 artifact-contract.md §1 "只追加" 不变量）
5. 触发 `contract-audit.mjs` 验证新生成的实例解析得通
6. commit message 前缀：`docs(run-summary): ...`

---

## 参考

- [[artifact-contract|Artifact 合同]] — 定义目录结构与文件存在性
- [[metrics-contract|Metrics 合同]] — 被 summary.md 的 Key deltas 段引用
- [[stats-snapshot-contract|Stats Snapshot 合同]] — 被 summary.md 的 Captured 段引用
- [[pipeline-contract|Pipeline 合同]] — 风格参考
