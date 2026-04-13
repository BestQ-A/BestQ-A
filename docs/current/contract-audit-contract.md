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
