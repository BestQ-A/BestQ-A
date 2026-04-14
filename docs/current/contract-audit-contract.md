---
kind: contract
status: current
verified: 2026-04-13
phase: 0
schema_version: 1
describes: "契约审计规则规格"
---

# 契约真值审计合同：自动抓契约漂移的 CI 门禁规格

> 本文档**既是合同也是审计脚本的规格**。
> 对应实现：[`scripts/contract-audit.mjs`](../../scripts/contract-audit.mjs)
> CI 入口：[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) 中的 `contract-truth-check` job
> 上游依赖：[pipeline-contract.md](pipeline-contract.md)（风格基准）、[metamodel.md](metamodel.md)
>
> 背景：2026-04-13 审计（见 [contract-vs-impl-audit.md](contract-vs-impl-audit.md)）发现 `docs/current/*.md` 里大量函数名、行号、字段来源是编造的。本合同把那轮人工审计脚本化，让以后的契约漂移在 CI 阶段立刻红灯。

---

## 1. 审计规则

审计脚本对 `docs/current/*.md` 执行以下 7 条规则。每条都有固定的错误码与严重级别。

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| 1 | frontmatter 强制 | `missing-status` / `bad-status` | error | 每份合同必须有 `status:` frontmatter，取值限于下表枚举 |
| 2 | 文件引用存在性 | `missing-file` | current=error / 其他=warn | 反引号 ``` `path:line` ``` 或 markdown 链接 `[text](path)` 所指的相对文件必须存在 |
| 3 | 行号范围合法 | `bad-line` | current=error / 其他=warn | 形如 `path:123` / `path:100-120` 的引用，目标文件行数必须覆盖该范围 |
| 4 | 符号 drift（best-effort） | `symbol-drift` | warn | 反引号内的 `functionName()` 或 `ClassName` 必须能在同段落前后 ±3 行内某个 `.ts` 文件中 grep 到 |
| 5 | `status: current` 无 error | — | — | 若当前合同段有任何上列 error，脚本退出码非零 |
| 6 | `status: draft` 仅做 1+2 | — | — | draft 合同只做 frontmatter 和文件存在性检查，不做行号和符号 drift |
| 7 | `status: mixed` 分段判定 | — | — | 标题含 `§2A`/`现状`/`current` 的段按 current 规则；含 `§2B`/`目标`/`target`/`计划`/`future` 的段按 draft 规则 |

### 引用解析顺序

`path` 型引用按以下顺序解析，**任一命中即算存在**：

1. 相对于合同自身所在目录（`docs/current/`）
2. 相对于仓库根
3. `basename` fallback：依次尝试 `causal-learner/mcp-server/src/core/<base>`、`.../tools/<base>`、`.../src/<base>`、`scripts/<base>`

第 3 步是为了兼容形如 `` `storage.ts:465` `` 这种省略前缀的裸引用。

### 符号 drift 判定细节

- 仅对反引号内形如 `foo()` 或 `BarClass` 的标识符触发
- 以该标识符所在行为中心，取前后 3 行作"段落上下文"
- 段落内若出现 `.ts` 文件引用（反引号或括号形式），则对每个这样的文件执行字面量 `\b<symbol>\b` 搜索
- 只要**任一**附近文件能 grep 到，即视为对齐；全部未命中才报 `symbol-drift`
- `symbol-drift` 永远是 warning，不阻断 CI（减少误报）

---

## 2. `status:` 枚举值语义

| 值 | 含义 | 审计强度 |
|----|------|----------|
| `current` | 已对齐当前代码实现，承诺"此刻说的话全是真话" | 最严：规则 1-4 全开，任何 error 阻断 CI |
| `draft` | 目标态描述，尚未全部落地 | 宽松：规则 1-2，file 存在性错为 warning |
| `mixed` | 同文档内既有现状也有目标（典型：§2A 现状 + §2B 目标） | 分段：按章节标题关键字切段后分别按 current/draft 规则处理 |
| `reference` | 仅为历史审计快照或外部文档索引，内容不纳入真值池 | 全跳过（只校验 frontmatter 合法） |

Frontmatter 建议模板：

```yaml
---
status: current
verified: 2026-04-13
phase: 1
---
```

`verified` 与 `phase` 是描述性字段，脚本不做强校验，但约定每次让合同"重新过 current 审核"时必须更新 `verified`。

---

## 3. CI 门禁规则

`.github/workflows/ci.yml` 中的 `contract-truth-check` job 触发条件：`push` + `pull_request`。

失败（红灯）条件：

| 条件 | 行为 |
|------|------|
| 任一合同有 `level=error` 的 finding | 脚本退出码 1 → job 失败 |
| 仅有 warning | 退出码 0 → job 绿灯，但 warning 会打印到 job log |
| 脚本自身抛异常 | 退出码 2 → job 失败（带堆栈） |

job 始终上传 `artifacts/contract-audit-latest.json` 作为 workflow artifact，供事后追溯。

---

## 4. 豁免机制

当某条 warning 被确认为误报（例如符号在跨文件的 barrel 导出里、或引用的是已删除但契约故意保留为历史对照的路径），可在合同文档内用以下 HTML 注释显式豁免：

```html
<!-- audit-ignore: symbol-drift: myHelperFn -->
<!-- audit-ignore: symbol-drift -->
```

- `audit-ignore: <code>: <target>` 精确豁免某个符号
- `audit-ignore: <code>` 豁免整份合同的该类 finding
- 豁免只对 warning 生效；error 不可豁免（必须改合同或改代码）
- 豁免注释必须直接写在合同文件里（脚本按字面扫描），review 时评审人能看见是谁在放水

目前仅 `symbol-drift` 支持豁免。其他错误码若被误报，应提 issue 改进脚本，而不是加豁免。

---

## 5. 新增契约检查清单

提交新的 `docs/current/*-contract.md` 前，作者必须自检：

1. 顶部是否有合法的 `---\nstatus: ...\n---` frontmatter
2. 所有反引号 ``` `path:line` ``` 引用是否对应仓内真实文件+真实行号（本机跑一遍 `node scripts/contract-audit.mjs`）
3. 所有 `[text](../relative/path)` markdown 链接指向的文件是否存在
4. 所有代码块外反引号提到的 `functionName()` / `ClassName` 是否在代码里能 grep 到
5. 是否在 [architecture-overview.md](architecture-overview.md) 或对应 MOC 里登记了新合同（无孤岛文档）
6. `status: current` 的合同：本地审计零 error、零 warning；若有 warning 必须要么修掉要么加豁免注释
7. `status: draft` 的合同：顶部必须写明"哪些章节是目标态，何时转 current"
8. commit message 前缀建议 `docs(contract): ...`，PR 描述里贴本机审计输出

---

## 6. 脚本边界与非目标

审计脚本**不做**以下事：

- 不做语义对齐（"字段含义是否准确"靠人工 review）
- 不做跨合同 SSOT 检查（比如 metrics-contract 和 artifact-contract 字段是否一致）——后续合同可以扩展
- 不做 TypeScript AST 解析（`symbol-drift` 只是字面量 grep，不检查 scope/export/类型签名）
- 不验证 frontmatter `verified` 字段是否"真的"新鲜

这些都是未来扩展空间，目前先守住"引用/行号/符号名"三条底线。

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-04-13 | 初稿：7 条规则 + 4 种 status + CI job + 豁免机制 |
| 1.1 | 2026-04-13 | 新增第 8 节「文件正交规矩」：R1/R2/R3/R4 四条规则 + kind 二分 + describes 约束 + 密度门禁 + 跨文件真相去重 |
| 1.2 | 2026-04-14 | 新增 §10「v7 绑定 pass」：五条跨文件绑定真值规则 R16–R20（V7-1 ~ V7-5），新增 5 个错误码 |
| 1.3 | 2026-04-14 | 新增 §11「ObservationModel binding pass」：三条规则 R21–R23（OM-1 ~ OM-3），新增 3 个错误码；同步 export-v7-artifacts.mjs 补导出 observation_models / observation_records / support_links |
| 1.4 | 2026-04-14 | 新增 §13「ExperimentDesign binding pass」：三条规则 R28–R30（ED-1 ~ ED-3），新增 3 个错误码；同步 artifact/export 登记 `experiment_designs/` |
| 1.5 | 2026-04-14 | 新增 §14「ActionExecution binding pass」：四条规则 R31–R34（AX-1 ~ AX-4），新增 4 个错误码；同步 artifact/export 登记 `action_executions/` |
| 1.6 | 2026-04-14 | 新增 §17「StateSnapshot binding pass」（SS-1 ~ SS-2）和 §18「Transition binding pass」（TR-1 ~ TR-3），新增 6 个错误码；同步 artifact/export 登记 `state_snapshots/` / `transitions/` |

---

## 8. 文件正交规矩

任何 `docs/current/*.md` 必须二选一，不允许混合体。这套规矩把"文件混角色 / 大文件 / 重复真相"升级为 CI 红灯条件。

### 8.1 kind 二分法

| kind | 含义 | 特征 |
|------|------|------|
| `I` | **Type I 自足真相单位** | 站在这里说**一件事**，正文是具体定义/公式/表格/代码；只能通过少量 `[[link]]` 引用其他笔记 |
| `II` | **Type II 组合/索引** | **只含引用**，无 substance；骨架是层级大纲 + `![[embed]]` / `[[link]]`；严禁在标题下直接写散文 |

frontmatter 模板：

```yaml
---
kind: I
describes: "一句话 ≤20 字"   # 仅 kind: I 必填
status: current
phase: 1
verified: 2026-04-13
---
```

### 8.2 R1 · kind 必填与合法

- 每份 `docs/current/*.md` 的 frontmatter 必须有 `kind: I` 或 `kind: II`
- 缺失 → **error** (`missing-kind`)
- 取值非法 → **error** (`bad-kind`)

### 8.3 R2 · describes 单句 + 禁止连词

- `kind: I` 必须有 `describes:` 字段
- 缺失 → **error** (`missing-describes`)
- 字符数（按 Unicode code point，而非 UTF-16 code unit）> 20 → **warn** (`describes-too-long`)
- 含禁用词 → **error** (`describes-conjunction`)
- `kind: II` **不应**有 `describes:`（info 级提示 `type2-has-describes`）

**describes 禁用词清单**（任一命中即连词违规）：

| 类别 | 符号/词 |
|------|---------|
| 中文并列连词 | `和` `及` `并` `同时` |
| 中文并列标点 | `，` `、` |
| 英文并列连词（`\b` 边界） | `and` `also`（大小写不敏感） |

### 8.4 R3 · reference 密度

**密度公式**：

```
total      = 去掉 frontmatter 和 fenced code block 后的正文字符数
link_bytes = 所有 [text](url) + [[wiki]] + ![alt](url) + ![[embed]] 的原始字符长度之和
             （按非重叠顺序匹配：先双括号 embed/wiki，再 markdown 链接）
density    = link_bytes / total
```

**判定**（仅 warn，不阻断 CI）：

| kind | 密度区间 | 判定 |
|------|----------|------|
| `I`  | density > 0.30 | **warn** (`type1-too-many-refs`) — 本应是 Type II |
| `II` | density < 0.70 | **warn** (`type2-too-much-substance`) — 夹带了 Type I substance |

给作者留空间写几句导航性叙述，所以越界只 warn。

### 8.5 R4 · 跨文件 describes 重复真相

- 收集所有 `kind: I` 文件的 `describes:`
- 按**英文单词 + 中文单字**切 token，去停用词，两两做 Jaccard 相似度
- 相似度 ≥ 0.5 → **warn** (`duplicate-truth: <other-file>`)
- 相似度 ≥ 0.7 → **error** (`duplicate-truth-severe: <other-file>`)

两份合同 describes 越像，说明两人讲的是同一件事——必须合并或让其中一份降级为 `kind: II`。

### 8.6 输出格式扩展

`artifacts/contract-audit-latest.json` 新增字段：

```json
{
  "kind_stats": { "I": 14, "II": 1, "missing": 0 },
  "density_distribution": [
    { "file": "docs/current/metrics-contract.md", "kind": "I", "density": 0.02 }
  ]
}
```

每个 `results[i]` 元素也扩展 `kind` / `describes` / `density` 三个字段。

### 8.7 豁免机制（与 §4 统一）

```html
<!-- audit-ignore: missing-kind -->
<!-- audit-ignore: describes-too-long -->
<!-- audit-ignore: describes-conjunction -->
<!-- audit-ignore: type1-too-many-refs -->
<!-- audit-ignore: type2-too-much-substance -->
```

- R1/R2/R3 的 error 和 warn **均可**通过 `<!-- audit-ignore: <code> -->` 豁免
- R4 (`duplicate-truth` / `duplicate-truth-severe`) **不可豁免**——重复真相只能通过合并文件或改 `kind` 解决
- 豁免注释必须写在合同文件内，review 时评审人能看见谁在放水

---

## 9. 五类 MECE 扩展（R5–R15）

§8 的 `kind: I | II` 二分法是过渡态；正式分类见 [file-taxonomy-contract.md](file-taxonomy-contract.md)。本节把五类 MECE `contract | instance | record | code | index` 升格为 CI 红灯规则，并把审计范围从 `docs/current/*.md` 扩展到 `scripts/`、`artifacts/**`、`.omx/baselines/**`、顶层 `docs/*.md` 白名单。

### 9.1 五类速查

| kind | 角色 | 必填字段（除 `kind`） | 写入时机 |
|------|------|------------------------|----------|
| `contract` | 类：一份"说这件事的规则" | `describes`、`schema_version`（建议） | 人写 / 人改 |
| `instance` | 实例：某次运行产出的具体数据 | `conforms_to`、`generated_by`、`generated_at` | 脚本写，一次性 |
| `record` | 记录：一次性不可变事件快照 | `event`、`recorded_at`、`immutable: true` | 脚本或人写一次，不再改 |
| `code` | 代码：实现某个 contract 的脚本 | `implements`（建议） | 人写 |
| `index` | 索引：只含引用的 MOC | —（禁止 `describes`） | 人写 |

### 9.2 Frontmatter 提取器

审计脚本对**三种**文件格式用不同提取器，缺失不崩溃：

| 格式 | 扫描范围 | 提取器 | 元数据语法 |
|------|----------|--------|------------|
| Markdown | `docs/current/*.md` + 顶层 `docs/*.md` 白名单 | `parseMarkdownFrontmatter` | `---\nkey: value\n---` |
| JS | `scripts/*.{mjs,js}` | `parseJsFrontmatter` | 头部 `// ---\n// kind: code\n// ---` |
| JSON | `artifacts/**/*.json` + `.omx/baselines/**/*.json` | `parseJsonFrontmatter` | 根对象的 `$kind` / `$conforms_to` / `$generated_by` / `$generated_at` 字段 |

顶层 `docs/*.md` 白名单当前为 `bestqa-roadmap.md`、`external-integration.md`。

### 9.3 规则 R5–R15 正式表述

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| R5 | kind 取值合法 | `missing-kind` / `bad-kind` | error | `kind` ∈ {contract, instance, record, code, index}；兼容旧值 `I`/`II`，但触发 R13 |
| R6 | instance 绑定完备 | `missing-conforms-to` / `missing-generated-by` / `missing-generated-at` / `bad-generated-at` | error | `kind: instance` 必须同时有 `conforms_to` + `generated_by` + `generated_at`（ISO 8601） |
| R7 | conforms_to 目标合法 | `bad-conforms-to-target` | error | `conforms_to` 指向的文件必须存在且 `kind: contract` |
| R8 | generated_by 目标存在 | `bad-generated-by-target` | error | `generated_by` 指向的文件必须存在 |
| R9 | record 绑定完备 | `missing-event` / `missing-recorded-at` / `bad-recorded-at` / `missing-immutable` | error | `kind: record` 必须同时有 `event` + `recorded_at`（ISO 8601）+ `immutable: true` |
| R10 | record 不可变（弱版） | `record-mutated` | warning | 对 `kind: record` 文件跑 `git log --oneline <file>`，commit 数 > 1 则警告。强制不可变依赖未来的 pre-commit hook |
| R11 | code 绑定严格校验 | `missing-implements` / `bad-implements-target` / `implements-wrong-kind` | error | `kind: code` 必须有 `implements` 字段，且目标文件必须存在且 `kind: contract`（与 R7 `conforms_to` 同级）。支持字符串或数组（多 contract 实现） |
| R12 | contract 有 schema_version | `missing-schema-version` | warning | `kind: contract` 建议有 `schema_version: <int>` |
| R13 | 旧 kind 升级建议 | `suggest-upgrade` | warning | 旧 `kind: I` → 建议升级为 contract / record / code；旧 `kind: II` → 建议改为 `index`。兼容期内按旧规则继续审计 |
| R14 | index 严格无 substance | `type2-has-describes` / `type2-too-much-substance` | warning | `kind: index` 禁止 `describes:`；引用密度 < 0.70 警告（复用旧 R3 公式，目标 kind 从 `II` 改为 `index`） |
| R15 | 审计范围扩展 | —（范围配置） | — | 扫描根：`docs/current/*.md` + 顶层 `docs/*.md` 白名单 + `scripts/*.{mjs,js}` + `causal-learner/mcp-server/scripts/*.{mjs,js}` + `artifacts/**/*.{json,md}` + `.omx/baselines/**/*.{json,md}`。脚本自生成的 `artifacts/contract-audit-latest.json` 自动排除 |

### 9.4 `artifacts/contract-audit-latest.json` 扩展

```json
{
  "files_scanned": 31,
  "kind_distribution": {
    "contract": 17, "instance": 9, "record": 1, "code": 3, "index": 1,
    "legacy_I": 0, "legacy_II": 0, "missing": 0
  },
  "binding_errors": {
    "missing_conforms_to": [],
    "bad_conforms_to_target": [],
    "missing_generated_by": [],
    "bad_generated_by_target": [],
    "missing_generated_at": [],
    "bad_generated_at": [],
    "missing_event": [],
    "missing_recorded_at": [],
    "bad_recorded_at": [],
    "missing_immutable": [],
    "record_mutated": [],
    "missing_implements": [],
    "missing_schema_version": []
  }
}
```

`results[i]` 每项新增 `format`（md|js|json）、`legacy_kind`（兼容旧 I/II）字段。

### 9.5 stdout 报告扩展

`Kind distribution:` 段落紧跟总计行，打印 `contract/instance/record/code/index/legacy_I/legacy_II/missing` 八个计数，便于人眼一眼看出结构漂移。

### 9.6 豁免机制

R5–R15 的 warning 均可通过 `<!-- audit-ignore: <code> -->` 豁免（仅在 markdown 文件中解析注释）。R6–R9 的 error（绑定缺失 / 目标非法）**不可豁免**——绑定是 instance / record 的命脉，没有例外。

---

## 10. v7 绑定 pass（R16–R20）

本节增加第二阶段"跨文件绑定审计"，在 `main()` 聚合所有 `auditFile()` 结果后执行（对应实现函数 `checkV7Bindings(results)`，在 `checkDuplicateTruth(results)` 之后调用）。

只对 `kind=instance` 且 `format=json` 的条目生效，检查 v7 五类核心对象之间的引用完整性。此轮只验证**存在性与绑定性**，不做语义合理性检查。

### 10.1 五条绑定规则

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| R16 (V7-1) | AcceptedReconstruction.mechanism_instance_ids 全部 resolvable | `bad-mechanism-instance-ref` | error | ids 数组中每个 id 必须在 mechanism instance 索引中存在 |
| R17 (V7-2) | Episode.ontologyDeltaId resolvable | `bad-ontology-delta-ref` | error | ontologyDeltaId 必须能在 ontology delta 索引中找到 |
| R18 (V7-3) | reconstruction.traceId ↔ trace.reconstructionId 双向一致 | `trace-reconstruction-mismatch` | error | reconstruction.traceId 指向的 trace 必须存在，且 trace.reconstructionId 必须等于 reconstruction.id |
| R19 (V7-4) | OntologyDelta.kind=none 时 no_update_reason 完整 | `missing-no-update-reason` | error | no_update_reason.reason_kind 与 .explanation 均不能缺失或为空 |
| R20 (V7-5) | MechanismInstance.status=accepted 时有支撑证据 | `accepted-instance-without-support` | error | claim_ids.length > 0 或 support_link_refs.length > 0 至少一个成立 |

### 10.2 对象索引方式

按 `$conforms_to` 字段的路径片段分组，索引 key 为对象根字段 `id`：

| 对象类型 | `conforms_to` 包含片段 |
|---------|----------------------|
| AcceptedReconstruction | `reconstruction-contract` |
| OntologyDelta | `ontology-delta-contract` |
| DerivationTrace | `derivation-chain-contract` |
| MechanismInstance | `mechanism-instance-contract` |
| Episode | `v7-world-model-contract` |

### 10.3 findings 回写策略

- 所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总
- R18（V7-3）不一致时 reconstruction 和 trace 两侧都写错误

### 10.4 新增错误码

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-mechanism-instance-ref` | error | AcceptedReconstruction.mechanism_instance_ids 中的 id 在 MI 索引中不存在 |
| `bad-ontology-delta-ref` | error | Episode.ontologyDeltaId 在 delta 索引中不存在 |
| `trace-reconstruction-mismatch` | error | trace↔reconstruction 双向引用不一致，或 traceId 指向的 trace 不存在 |
| `missing-no-update-reason` | error | OntologyDelta.kind=none 但 no_update_reason 字段缺失或 reason_kind/explanation 为空 |
| `accepted-instance-without-support` | error | MechanismInstance.status=accepted 但 claim_ids 和 support_link_refs 均为空 |

### 10.5 限制与非目标（第一轮）

- 不检查 fidelity 合理性
- 不检查 replay 正确性
- 不检查 `selectedMechanismIds` 是否仍为 proxy 引用
- 不检查 `MechanismClass` 是否真实存在
- 不解析 `support_link_refs` 指向的 SupportLink 对象

---

## 11. ObservationModel binding pass（R21–R23）

本节增加第三阶段"ObservationModel 链审计"，在 `main()` 中 `checkV7Bindings(results)` 之后调用（对应实现函数 `checkObservationModelBindings(results)`）。

只对 `kind=instance` 且 `format=json` 的条目生效。此轮只验证**存在性与可解析性**，不做语义深检查。

### 11.1 三条绑定规则

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| R21 (OM-1) | ObservationRecord.observationModelId resolvable | `bad-observation-model-ref` | error | 每个 OR 的 `observationModelId` 必须能 resolve 到一个 ObservationModel |
| R22 (OM-2) | SupportLink → ObservationRecord → ObservationModel 链不断 | `supportlink-observation-chain-broken` | error | SupportLink 的 `observationRecordId` 指向的 OR，再经 OR.`observationModelId` 指向的 OM，整条链不得断 |
| R23 (OM-3) | status=current 的 ObservationModel 有实际引用 | `orphan-current-observation-model` | warning | 若无任何 ObservationRecord 引用它，说明它仍是孤立草案 |

### 11.2 对象索引方式

按 `$conforms_to` 路径片段 + 对象字段结构区分：

| 对象类型 | `conforms_to` 包含片段 | 鉴别字段 |
|---------|----------------------|---------|
| ObservationModel | `observation-model-contract` | `outputSignals`（数组） |
| ObservationRecord | `observation-model-contract` | `observationModelId`（字符串） |
| SupportLink | `support-link-contract` | `observationRecordId` |

### 11.3 新增错误码

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-observation-model-ref` | error | ObservationRecord.observationModelId 缺失或在 OM 索引中不存在 |
| `supportlink-observation-chain-broken` | error | SupportLink → OR 或 OR → OM 任一跳不可 resolve |
| `orphan-current-observation-model` | warning | ObservationModel.status=current 但无 ObservationRecord 引用它 |

### 11.4 findings 回写策略

所有 binding error/warning 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 11.5 限制与非目标（第一轮）

- 不检查 ObservationModel.outputSignals 与 ObservationRecord.payload 的 key 对齐
- 不检查 ObservationModel.blindSpots / noiseModel 内容合理性
- 不检查 SupportLink 权重合理性
- 不检查 ObservationModel 与 MechanismProgram.emittedObservationSignals 的 signal 对齐

---

## 12. Counterfactual binding pass（R24–R27）

本节增加第四阶段"CounterfactualScenario 链审计"，在 `main()` 中 `checkObservationModelBindings(results)` 之后调用（对应实现函数 `checkCounterfactualBindings(results)`）。

只对 `kind=instance` 且 `format=json` 的条目生效。此轮只验证**存在性与基本绑定性**，不做语义深检查。

### 12.1 四条绑定规则

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| R24 (CF-1) | CounterfactualScenario.baseEpisodeId resolvable | `bad-counterfactual-episode-ref` | error | baseEpisodeId 必须能 resolve 到一个 Episode instance |
| R25 (CF-2) | CounterfactualScenario.baseReconstructionId resolvable | `bad-counterfactual-reconstruction-ref` | error | baseReconstructionId 必须能 resolve 到一个 AcceptedReconstruction instance |
| R26 (CF-3) | CounterfactualScenario.mechanismProgramRefs 全部 resolvable | `bad-counterfactual-program-ref` | error | 每个 ref 必须能 resolve 到一个 MechanismProgram instance |
| R27 (CF-4) | CounterfactualScenario.modifiedAssumptions 非空 | `empty-counterfactual-assumptions` | error | modifiedAssumptions 必须是非空数组（工厂不变量 1 的治理层镜像） |

### 12.2 对象索引方式

| 对象类型 | `conforms_to` 包含片段 |
|---------|----------------------|
| CounterfactualScenario | `counterfactual-scenario-contract` |
| Episode | `v7-world-model-contract` |
| AcceptedReconstruction | `reconstruction-contract` |
| MechanismProgram | `mechanism-program-contract` |

### 12.3 新增错误码

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-counterfactual-episode-ref` | error | CounterfactualScenario.baseEpisodeId 缺失或在 Episode 索引中不存在 |
| `bad-counterfactual-reconstruction-ref` | error | CounterfactualScenario.baseReconstructionId 缺失或在 Reconstruction 索引中不存在 |
| `bad-counterfactual-program-ref` | error | CounterfactualScenario.mechanismProgramRefs 中某 ref 在 MechanismProgram 索引中不存在 |
| `empty-counterfactual-assumptions` | error | CounterfactualScenario.modifiedAssumptions 为空数组或缺失 |

### 12.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 12.5 限制与非目标（第一轮）

- 不检查 predictedTrajectory 与 MechanismProgram.phases 的 step 对应关系
- 不检查 modifiedAssumptions.targetRef 是否指向真实字段
- 不检查 predictedOutcome 与实际结局的语义一致性
- 不检查多 CounterfactualScenario 之间的 divergencePoints 重叠

---

## 13. ExperimentDesign binding pass（R28–R30）

本节增加第五阶段"ExperimentDesign 链审计"，在 `main()` 中 `checkCounterfactualBindings(results)` 之后调用（对应实现函数 `checkExperimentDesignBindings(results)`）。

只对 `kind=instance` 且 `format=json` 的条目生效。此轮只验证**存在性与基本绑定性**，不做信息增益算法或动作执行语义深检查。

### 13.1 三条绑定规则

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| R28 (ED-1) | ExperimentDesign.baseEpisodeId resolvable | `bad-experiment-design-episode-ref` | error | `baseEpisodeId` 必须能 resolve 到一个 Episode instance |
| R29 (ED-2) | ExperimentDesign.basedOnCounterfactualIds 全部 resolvable | `bad-experiment-design-counterfactual-ref` | error | 每个 id 必须能 resolve 到一个 CounterfactualScenario instance |
| R30 (ED-3) | ExperimentDesign.recommendedAction 属于候选集合 | `recommended-action-outside-candidates` | error | `recommendedAction` 必须属于 `candidateMeasurements` 或 `candidateInterventions` |

### 13.2 对象索引方式

| 对象类型 | `conforms_to` 包含片段 |
|---------|----------------------|
| ExperimentDesign | `experiment-design-contract` |
| Episode | `v7-world-model-contract` |
| CounterfactualScenario | `counterfactual-scenario-contract` |

### 13.3 新增错误码

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-experiment-design-episode-ref` | error | ExperimentDesign.baseEpisodeId 缺失或在 Episode 索引中不存在 |
| `bad-experiment-design-counterfactual-ref` | error | ExperimentDesign.basedOnCounterfactualIds 中某 id 在 CounterfactualScenario 索引中不存在 |
| `recommended-action-outside-candidates` | error | ExperimentDesign.recommendedAction 缺失或不属于候选集合 |

### 13.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 13.5 限制与非目标（第一轮）

- 不检查 `expectedInformationGain` 是否由真实算法计算得出
- 不检查 `discriminatingPower` 的数值合理性
- 不检查 `recommendedAction` 是否最优，只检查它是否属于候选集合
- 不检查 `ExperimentDesign → ActionExecution → new Episode` 闭环

---

## 14. ActionExecution binding pass（R31–R34）

本节增加第六阶段"ActionExecution 链审计"，在 `main()` 中 `checkExperimentDesignBindings(results)` 之后调用（对应实现函数 `checkActionExecutionBindings(results)`）。

只对 `kind=instance` 且 `format=json` 的条目生效。此轮只验证**存在性与基本绑定性**，不扩展到真实外部执行器、prediction error 算法或 FailureBoundary 语义。

### 14.1 四条绑定规则

| # | 规则 | 错误码 | 级别 | 说明 |
|---|------|--------|------|------|
| R31 (AX-1) | ActionExecution.basedOnExperimentDesignId resolvable | `bad-action-execution-design-ref` | error | `basedOnExperimentDesignId` 必须能 resolve 到一个 ExperimentDesign instance |
| R32 (AX-2) | ActionExecution.sourceEpisodeId resolvable | `bad-action-execution-source-episode-ref` | error | `sourceEpisodeId` 必须能 resolve 到一个 Episode instance |
| R33 (AX-3) | completed ActionExecution.targetEpisodeId resolvable | `bad-action-execution-target-episode-ref` | error | 当 `executionStatus=completed` 时，`targetEpisodeId` 必须存在且能 resolve 到一个 Episode instance |
| R34 (AX-4) | ActionExecution.actionRef 等于来源推荐动作 | `action-execution-ref-mismatch` | error | `actionRef` 必须等于来源 ExperimentDesign.`recommendedAction` |

### 14.2 对象索引方式

| 对象类型 | `conforms_to` 包含片段 |
|---------|----------------------|
| ActionExecution | `action-execution-contract` |
| ExperimentDesign | `experiment-design-contract` |
| Episode | `v7-world-model-contract` |

### 14.3 新增错误码

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-action-execution-design-ref` | error | ActionExecution.basedOnExperimentDesignId 缺失或在 ExperimentDesign 索引中不存在 |
| `bad-action-execution-source-episode-ref` | error | ActionExecution.sourceEpisodeId 缺失或在 Episode 索引中不存在 |
| `bad-action-execution-target-episode-ref` | error | ActionExecution.executionStatus=completed 且 targetEpisodeId 缺失，或在 Episode 索引中不存在 |
| `action-execution-ref-mismatch` | error | ActionExecution.actionRef 与来源 ExperimentDesign.recommendedAction 不一致 |

### 14.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 14.5 限制与非目标（第一轮）

- 不检查真实外部执行器是否被调用
- 不检查 `predictionError` 数值或算法来源
- 不检查 `observedOutcomeSummary` 的语义充分性
- 不检查多次 ActionExecution 的调度策略

---

## §15 OutcomeRecord binding pass

**入口函数**：`checkOutcomeRecordBindings(results)`

**触发时机**：在 §14 ActionExecution binding pass 之后执行。

### 15.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `orcMap` | `docs/current/outcome-record-contract.md` | `id` |
| `axMap`  | `docs/current/action-execution-contract.md` | `id` |
| `epMap`  | `docs/current/v7-world-model-contract.md` | `id` |

### 15.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| OR-1 | `OutcomeRecord.episodeId` 必须在 Episode 索引中存在 | `bad-outcome-record-episode-ref` | error |
| OR-2 | `OutcomeRecord.causedByActionExecutionId` 若存在，必须在 ActionExecution 索引中存在 | `bad-outcome-record-action-ref` | error |
| OR-3 | `OutcomeRecord.status` 必须是 `success \| failure \| partial \| abandoned` | `bad-outcome-record-status` | error |
| OR-4 | `OutcomeRecord.summary` 必须是非空字符串 | `empty-outcome-record-summary` | error |

### 15.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-outcome-record-episode-ref` | error | OutcomeRecord.episodeId 缺失或在 Episode 索引中不存在 |
| `bad-outcome-record-action-ref` | error | OutcomeRecord.causedByActionExecutionId 存在但在 ActionExecution 索引中不存在 |
| `bad-outcome-record-status` | error | OutcomeRecord.status 不是合法枚举值 |
| `empty-outcome-record-summary` | error | OutcomeRecord.summary 为空字符串或缺失 |

### 15.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 15.5 限制与非目标（第一轮）

- 不检查 `observedSignals` 与 `ObservationRecord` 的深一致性
- 不检查 `sideEffects` 语义合理性
- 不检查 `evidenceRefs` 是否指向真实文件
- 不检查 `PredictionError` 计算或算法来源
- 不检查 `OutcomeRecord → Counterfactual / MechanismProgram` 校正链

---

## §16 PredictionError binding pass

**入口函数**：`checkPredictionErrorBindings(results)`

**触发时机**：在 §15 OutcomeRecord binding pass 之后执行。

### 16.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `peMap`  | `docs/current/prediction-error-contract.md` | `id` |
| `axMap`  | `docs/current/action-execution-contract.md` | `id` |
| `orcMap` | `docs/current/outcome-record-contract.md` | `id` |
| `cfMap`  | `docs/current/counterfactual-scenario-contract.md` | `id` |

### 16.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| PE-1 | `PredictionError.causedByActionExecutionId` 必须在 ActionExecution 索引中存在 | `bad-prediction-error-action-ref` | error |
| PE-2 | `PredictionError.outcomeRecordId` 必须在 OutcomeRecord 索引中存在 | `bad-prediction-error-outcome-ref` | error |
| PE-3 | `PredictionError.basedOnCounterfactualId` 若存在，必须在 CounterfactualScenario 索引中存在 | `bad-prediction-error-counterfactual-ref` | error |
| PE-4 | `expectedSummary`、`actualSummary`、`deltaSummary` 必须都是非空字符串 | `empty-prediction-error-summary` | error |

### 16.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-prediction-error-action-ref` | error | PredictionError.causedByActionExecutionId 缺失或在 ActionExecution 索引中不存在 |
| `bad-prediction-error-outcome-ref` | error | PredictionError.outcomeRecordId 缺失或在 OutcomeRecord 索引中不存在 |
| `bad-prediction-error-counterfactual-ref` | error | PredictionError.basedOnCounterfactualId 存在但在 CounterfactualScenario 索引中不存在 |
| `empty-prediction-error-summary` | error | expectedSummary / actualSummary / deltaSummary 中至少一项为空或缺失 |

### 16.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 16.5 限制与非目标（第一轮）

- 不检查 `score` 数值合理性
- 不检查 `deltaSummary` 的语义质量
- 不检查 `expectedSummary` 是否真正派生自 `CounterfactualScenario.predictedOutcome`
- 不检查 `PredictionError → MechanismProgram` 自动回写

---

## §17 StateSnapshot binding pass

**入口函数**：`checkStateSnapshotBindings(results)`

**触发时机**：在 §16 PredictionError binding pass 之后执行。

### 17.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `ssMap` | `docs/current/state-snapshot-contract.md` | `id` |
| `epMap` | `docs/current/v7-world-model-contract.md` | `id` |

### 17.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| SS-1 | `StateSnapshot.episodeId` 必须在 Episode 索引中存在 | `bad-state-snapshot-episode-ref` | error |
| SS-2 | `StateSnapshot.values` 必须存在且不可为 `null` | `empty-state-snapshot-values` | error |

### 17.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-state-snapshot-episode-ref` | error | StateSnapshot.episodeId 缺失或在 Episode 索引中不存在 |
| `empty-state-snapshot-values` | error | StateSnapshot.values 为 null 或缺失 |

### 17.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 17.5 限制与非目标（第一轮）

- 不检查 `values` 的内容语义质量
- 不检查 `values` 字段结构的完整性
- 不检查 `t` 的单调性或范围
- 不检查 `StateSnapshot` 与 `ObservationRecord` 的时序对齐

---

## §18 Transition binding pass

**入口函数**：`checkTransitionBindings(results)`

**触发时机**：在 §17 StateSnapshot binding pass 之后执行。

### 18.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `trMap` | `docs/current/transition-contract.md` | `id` |
| `ssMap` | `docs/current/state-snapshot-contract.md` | `id` |
| `epMap` | `docs/current/v7-world-model-contract.md` | `id` |
| `axMap` | `docs/current/action-execution-contract.md` | `id` |

### 18.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| TR-1 | `Transition.episodeId` 必须在 Episode 索引中存在 | `bad-transition-episode-ref` | error |
| TR-2 | `fromSnapshotId` 与 `toSnapshotId` 必须都能 resolve 到 `StateSnapshot`，且不得相同 | `bad-transition-snapshot-ref` / `same-transition-endpoints` | error |
| TR-3 | `Transition.causedByActionId` 若存在，必须在 ActionExecution 索引中存在 | `bad-transition-action-ref` | error |

### 18.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-transition-episode-ref` | error | Transition.episodeId 缺失或在 Episode 索引中不存在 |
| `bad-transition-snapshot-ref` | error | fromSnapshotId 或 toSnapshotId 缺失或在 StateSnapshot 索引中不存在 |
| `same-transition-endpoints` | error | fromSnapshotId === toSnapshotId |
| `bad-transition-action-ref` | error | causedByActionId 存在但在 ActionExecution 索引中不存在 |

### 18.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 18.5 限制与非目标（第一轮）

- 不检查 `candidateMechanismIds` 的机制归因质量
- 不检查 `fromSnapshotId` 与 `toSnapshotId` 是否属于同一 Episode
- 不检查 transition 时序的单调性
- 不检查 `StateSnapshot.t` 与 `Transition` 之间的时序一致性

---

## §19 MechanismClass binding pass

**入口函数**：`checkMechanismClassBindings(results)`

**触发时机**：在 §18 Transition binding pass 之后执行。

### 19.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `mcMap` | `docs/current/mechanism-class-contract.md` | `id` |
| `mpMap` | `docs/current/mechanism-program-contract.md` | `id` |

### 19.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| MC-1 | `MechanismClass.id` 必须符合 `MC_<slug>_<hex4>` 格式 | `bad-mechanism-class-id` | error |
| MC-2 | `compilation_status=compiled` 时 `supporting_episode_ids.length >= 2` | `compiled-mechanism-without-support` | error |
| MC-3 | `observable_signatures` 必须覆盖所有 `phases[*].expected_observations` | `mechanism-observation-signature-gap` | error |
| MC-4 | `intervention_points` 中的每个名称必须存在于 `phases[*].name` | `mechanism-intervention-point-missing` | error |
| MC-5 | `mechanismProgramIds` 中的每个 id 必须能 resolve 到 `MechanismProgram` | `bad-mechanism-program-ref` | error |

### 19.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-mechanism-class-id` | error | MechanismClass.id 不符合 `MC_<slug>_<hex4>` 格式（slug：小写字母数字下划线 1–32 位，后缀：4 位十六进制） |
| `compiled-mechanism-without-support` | error | compilation_status=compiled 但 supporting_episode_ids 数量 < 2 |
| `mechanism-observation-signature-gap` | error | observable_signatures 未覆盖某个 phase 的 expected_observations 中的某一项 |
| `mechanism-intervention-point-missing` | error | intervention_points 中某名称在 phases[*].name 中不存在 |
| `bad-mechanism-program-ref` | error | mechanismProgramIds 中某 id 在 MechanismProgram 索引中不存在 |

### 19.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 19.5 限制与非目标（第一轮）

- 不检查 `replayError` 真实计算结果
- 不检查多 Episode 自动归并质量
- 不检查 `candidate → compiled` 晋升算法的策略正确性
- 不检查 `MechanismClass` 与 `PredictionError` 的自动反馈耦合
- 不检查 `FailureBoundary / Constitution / Federation` 等更高层本体演化语义

---

## §20 ProgramRevisionProposal binding pass

**入口函数**：`checkProgramRevisionProposalBindings(results)`

**触发时机**：在 §19 MechanismClass binding pass 之后执行。

### 20.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `prpMap` | `docs/current/program-revision-proposal-contract.md` | `id` |
| `peMap`  | `docs/current/prediction-error-contract.md` | `id` |
| `mpMap`  | `docs/current/mechanism-program-contract.md` | `id` |
| `omMap`  | `docs/current/observation-model-contract.md` + `outputSignals`（鉴别 ObservationModel） | `id` |

### 20.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| PRP-1 | `ProgramRevisionProposal.basedOnPredictionErrorIds` 中每个 id 必须在 PredictionError 索引中存在 | `bad-prp-prediction-error-ref` | error |
| PRP-2 | `ProgramRevisionProposal.targetRef` 必须能 resolve 到 `targetKind` 指定的对象（`mechanism_program` → mpMap；`observation_model` → omMap） | `bad-prp-target-ref` | error |
| PRP-3 | `ProgramRevisionProposal.status` 必须是 `proposed \| accepted \| rejected \| superseded` | `bad-prp-status` | error |
| PRP-4 | `ProgramRevisionProposal.rationale` 必须是非空字符串 | `empty-prp-rationale` | error |

### 20.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-prp-prediction-error-ref` | error | basedOnPredictionErrorIds 中某 id 缺失或在 PredictionError 索引中不存在 |
| `bad-prp-target-ref` | error | targetRef 缺失，或 targetKind=mechanism_program 但 targetRef 不在 MechanismProgram 索引中，或 targetKind=observation_model 但 targetRef 不在 ObservationModel 索引中 |
| `bad-prp-status` | error | status 不是 proposed / accepted / rejected / superseded |
| `empty-prp-rationale` | error | rationale 为空字符串、仅空白或缺失 |

### 20.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 20.5 限制与非目标（第一轮）

- 不检查 `proposedChangeKind` 与 `targetKind` 的语义兼容性
- 不检查同一 PredictionError 是否产生了重复的 proposal
- 不检查 proposal 是否已被执行（`accepted` 后是否有对应修改记录）
- 不检查 `createdBy` 字段的合法性
- 不检查 `ProgramRevisionProposal → MechanismProgram` 的版本号递增约束

---

## §21 SupportLink deep binding pass

**入口函数**：`checkSupportLinkDeepBindings(results)`

**触发时机**：在 §20 ProgramRevisionProposal binding pass 之后执行。

### 21.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `slMap` | `docs/current/support-link-contract.md` | `id` |
| `miMap` | `docs/current/mechanism-instance-contract.md` | `id` |
| `dtMap` | `docs/current/derivation-chain-contract.md` | `id` |

### 21.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| SL-1 | `SupportLink.polarity` 必须是 `supports \| contradicts` | `bad-support-link-polarity` | error |
| SL-2 | `SupportLink.weight` 必须是 `[0.0, 1.0]` 区间数值 | `bad-support-link-weight` | error |
| SL-3 | `MechanismInstance.support_link_refs` 中每个 id 必须在 slMap 中存在 | `bad-mechanism-instance-support-link-ref` | error |
| SL-4 | `DerivationTrace.supportLinks` 中每个内嵌元素的 `id` 必须在 slMap 中存在 | `bad-derivation-trace-support-link` | error |

### 21.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-support-link-polarity` | error | SupportLink.polarity 不是 supports / contradicts |
| `bad-support-link-weight` | error | SupportLink.weight 缺失、非数值、或不在 [0.0, 1.0] 区间 |
| `bad-mechanism-instance-support-link-ref` | error | MechanismInstance.support_link_refs 中某 id 不在 slMap（即使用了 compiled Ref / MI id / 任意非 SL id）|
| `bad-derivation-trace-support-link` | error | DerivationTrace.supportLinks 中某内嵌元素的 id 缺失或不在 slMap |

### 21.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 21.5 限制与非目标（第一轮）

- 不检查 `SupportLink.claimId` 是否指向真实 Claim 对象（Claim 尚未独立持久化）
- 不检查 `source_kind = llm_binder` 单独支撑 accepted Claim 的禁止语义（I4）
- 不检查 `weight` 在多条 SupportLink 之间的分布合理性
- 不检查 `DerivationTrace.supportLinks` 中内嵌对象的其余字段完整性
- 不检查 `support_link_refs` 的 polarity 与 claim 结论的逻辑一致性

## §22 ReviewDecision binding pass

**入口函数**：`checkReviewDecisionBindings(results)`

**触发时机**：在 §21 SupportLink deep binding pass 之后执行。

### 22.1 索引构建

| 索引名 | conforms_to | 键 |
|--------|-------------|-----|
| `rdMap` | `docs/current/review-decision-contract.md` | `id` |
| `prpMap` | `docs/current/program-revision-proposal-contract.md` | `id` |

### 22.2 规则表

| 规则 | 检查内容 | 错误码 | 级别 |
|------|----------|--------|------|
| RD-1 | `ReviewDecision.proposalRef` 非空且在 prpMap 中存在 | `bad-rd-proposal-ref` | error |
| RD-2 | `ReviewDecision.decision` 必须是 `accepted \| rejected \| superseded` | `bad-rd-decision` | error |
| RD-3 | `decision=superseded` 时 `supersededByRef` 非空 | `bad-rd-superseded-ref` | error |
| RD-4 | `ReviewDecision.rationale` 非空且非纯空白 | `empty-rd-rationale` | error |

### 22.3 错误码登记

| 错误码 | 级别 | 触发条件 |
|--------|------|----------|
| `bad-rd-proposal-ref` | error | proposalRef 缺失或引用不在 prpMap 中的 PRP |
| `bad-rd-decision` | error | decision 不是合法三值之一 |
| `bad-rd-superseded-ref` | error | decision=superseded 但 supersededByRef 缺失或为空 |
| `empty-rd-rationale` | error | rationale 为空或纯空白 |

### 22.4 findings 回写策略

所有 binding error 挂到**被检查对象自身的文件**上，不写到全局汇总。

### 22.5 限制与非目标（第一轮）

- 不验证 `supersededByRef` 是否指向真实存在的 PRP id（跨批次引用）
- 不验证 `generatedDeltaRef` 是否指向真实存在的 OntologyDelta id
- 不检查 `accepted` 路径是否真正生成了 OntologyDelta（已由 export 脚本保证）
