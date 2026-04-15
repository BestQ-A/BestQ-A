---
kind: contract
status: current
verified: 2026-04-13
schema_version: 1
describes: "文件五类零交集分类公理"
---

# File Taxonomy 合同：五类 MECE 分类

> 本合同定义 BestQ-A 仓库内所有文件的分类规矩。五类 MECE（互斥且完备），任何文件恰属一类。
> 本合同是 [contract-audit-contract.md](contract-audit-contract.md) 的上游依赖：审计脚本的 `kind:` 相关规则以本合同为准；当两者冲突时，以本合同为真。
> 代码位置：`scripts/contract-audit.mjs`

---

## 1. 五类定义

五类一次性列出，每类包含：定义、不变量、典型例子、生命周期、不应混淆的边界。

### 1.1 contract（类 / schema / 规范）

**定义**：定义某种形状、行为或规矩的文件。产出的是"模板"而非"数据点"。

**不变量**：
- 必须有 `kind: contract`、`describes: "..."`（≤20 字无连词）、`schema_version: <int>`
- 正文必须是"定义性语言"：field、invariant、constraint、rule、axiom
- 一份 contract 不得包含任何一次性运行结果、时间戳数据、个案记录
- 修改属于**破坏性变更**，必须同步 `schema_version`

**典型例子**：
- `docs/current/pipeline-contract.md` — 定义 Pipeline 调用顺序
- `docs/current/compile-promotion-contract.md` — 定义 compile 晋升规则
- 本文件自身

**生命周期**：draft → current → superseded（被新 schema_version 替代时进入版本历史节）

**不应混淆**：一份 contract **不能**同时装 instance 数据。若某个 schema 下正好只有一条数据，仍需拆成 contract + instance 两份文件。

### 1.2 instance（数据点）

**定义**：符合某个 contract 的一条具体数据点。由生成器（人类或脚本）在某一时刻产出。

**不变量**：
- 必须有 `kind: instance`、`conforms_to: <path-to-contract>`、`generated_by: <author-or-script>`、`generated_at: <ISO8601>`
- `conforms_to` 所指文件必须真实存在且其 `kind: contract`
- 正文必须是"具体取值"，可被对应 contract 的 schema 验证
- 不定义新概念，只填已有槽位

**典型例子**：
- 某个具体模块的性能 baseline 数据（符合 `metrics-contract.md`）
- 某次 audit 发现的 finding 列表实体（符合 audit schema）
- 某个具体 Regulation 的 YAML 序列化快照

**生命周期**：生成 → 活跃 → 被更新版替换（旧的成为 `status: reference`）

**不应混淆**：instance 不写规则。若发现 instance 文件里出现 "必须" / "禁止" / "任何 X 都…"，说明这是 contract 泄漏进了 instance 文件，必须抽离。

### 1.3 record（历史事件）

**定义**：append-only 的历史事件流。记录"某时某地发生了什么"，写入后永不修改。

**不变量**：
- 必须有 `kind: record`、`event: <event-name>`、`recorded_at: <ISO8601>`、`immutable: true`
- 一旦落盘只允许**追加**新的 record 文件，**不得编辑**已有 record
- 内容是**事实陈述**：观测、测量、决策、变更，无规范性语言
- 时间戳必须可排序

**典型例子**：
- `docs/audit-2026-04-13-gpt54.md`（GPT 审计发现的历史快照）
- `docs/bestqa-roadmap.md` 里形如 "2026-04-13 完成 X" 的历史节（如果单独成文）
- CHANGELOG 单条条目
- ADR 决策记录

**生命周期**：写入 → 永久保留。允许因为内容本身失效而在审计下降级为 `status: reference`，但**字节级内容不可改**。

**不应混淆**：record 不是 contract 的降级版。一个 audit finding 是 record，但定义 audit finding schema 的文件是 contract。record 记录事件发生，contract 定义事件应该长什么样。

### 1.4 code（行为实现）

**定义**：可执行的行为实现。机器按字节逐行执行的源文件。

**不变量**：
- 扩展名是 `.ts` / `.js` / `.mjs` / `.py` / `.sh` / `.sql` 等可执行类型，或 `.md` 内纯粹作为"脚本外皮"出现
- 必须有 `implements: <path-to-contract>` 在文件顶部注释或 frontmatter（对 `.md` 外皮文件）
- `implements` 所指文件必须真实存在且其 `kind: contract`
- 对 `.md` 扩展的 code 外皮文件，frontmatter 要求 `kind: code`

**典型例子**：
- `scripts/contract-audit.mjs` — 实现 `contract-audit-contract.md`
- `core/pipeline.ts` — 实现 `pipeline-contract.md`
- `core/atom-graph.ts` — 实现 `compile-promotion-contract.md` 的 compile 部分

**生命周期**：与 contract 同步演化。contract schema_version 升级 → code 必须跟进或显式声明 lag。

**不应混淆**：code 不是 contract。一段代码可能看起来像规则（大量 `if` 和 `throw`），但它是**执行**规则，而规则的**定义**必须在 contract。

### 1.5 index（指针组合）

**定义**：只有指针，无 substance。像图书馆的目录卡：每个条目都是一个 `[[link]]` 或 `![[embed]]`，自己不承载任何原创真相。

**不变量**：
- 必须有 `kind: index`
- 正文的 reference_density ≥ 0.70（见 `contract-audit.mjs` 的 `computeLinkBytes`）
- 严禁在标题下直接写散文段落；允许的只有：`<details>`/`<summary>` 包裹的嵌入、`[[wiki-link]]` 列表、极短（一句）的导航说明
- 删除该文件不应丢失任何事实——因为事实都在被指向的文件里

**典型例子**：
- `docs/current/memory-layer-contract.md`（本仓现存的 index 范例，注意它文件名带 -contract 但其实是 index 类型，frontmatter 需纠正）
- `docs/current/architecture-overview.md`（若存在，作为合同总目）
- 模块 MOC / 章节 MOC

**生命周期**：随被指向文件的增减而更新。单条 link 失效 → 修复或删除该条目。

**不应混淆**：一个包含大纲 + 简短解释段落的文件不是 index，是 contract 或混合体。混合体必须拆分：index 负责导航，被抽出来的原创段落变成独立的 contract / record。

---

## 2. 零交集证明

五类两两配对共 10 对，每对给出一个**可验证的硬区分特征**：一个文件不可能同时满足两者的不变量。

| # | A × B | 硬区分 |
|---|-------|--------|
| 1 | contract × instance | contract 无 `conforms_to` 字段；instance 必填 `conforms_to` 且指向的必须是 `kind: contract`。互相排斥：instance 有 `conforms_to`，contract 不能有（否则它本身就变成了某个元合同的 instance，但此时它就不是"规定形状的文件"而是"一个数据点"，归入 instance）。|
| 2 | contract × record | contract 可被编辑并升 `schema_version`；record 有 `immutable: true` 禁止编辑。一个文件不能同时"可升版"又"不可编辑"。|
| 3 | contract × code | contract 无可执行入口，扩展名在 `.md` 语义下；code 要么是可执行扩展名，要么是 `kind: code` 的 `.md` 外皮且必须 `implements:` 某 contract。互相排斥：contract 不能 `implements` 自己。|
| 4 | contract × index | contract 的 reference_density 通常 ≤0.30 并有大段定义性正文；index 的 density 必须 ≥0.70 且禁止定义性正文。密度区间不重叠。|
| 5 | instance × record | instance 可被新版替换（替换后旧版进入 reference）；record 任何情况都不可编辑也不被替换，只能追加新 record。生命周期规则互斥。|
| 6 | instance × code | instance 是静态数据，无执行入口也无 `implements:`；code 必填 `implements:`。字段存在性互斥。|
| 7 | instance × index | instance 的 `conforms_to` 指向单一 contract 且正文是具体取值；index 无 `conforms_to`，正文是指针列表。字段存在性 + 密度区间双重互斥。|
| 8 | record × code | record 的 `immutable: true` 禁止编辑；code 必然随 contract 演化而编辑。immutability 标志互斥。|
| 9 | record × index | record 有 `event` + `recorded_at` + `immutable: true`；index 无这些字段且必须随被指向文件更新。immutability 互斥。|
| 10 | code × index | code 有 `implements:` 指向 contract；index 无该字段且 density ≥0.70。字段存在性 + 密度区间双重互斥。|

**证明强度**：以上 10 对每对都由**frontmatter 字段存在性**或**密度阈值**决定，审计脚本可机械判定，无主观解释空间。

---

## 3. 每类的强制 frontmatter

### 3.1 contract 模板

```yaml
---
kind: contract
status: current          # 或 draft | mixed | reference
verified: 2026-04-13
schema_version: 1
describes: "一句话 ≤20 字"
---
```

### 3.2 instance 模板

```yaml
---
kind: instance
status: current
conforms_to: docs/current/metrics-contract.md
generated_by: scripts/collect-baseline.mjs
generated_at: 2026-04-13T10:22:00Z
---
```

### 3.3 record 模板

```yaml
---
kind: record
status: current          # record 一旦写入即 immutable，status 仅反映"是否仍被引用"
event: audit-finding
recorded_at: 2026-04-13T10:22:00Z
immutable: true
---
```

### 3.4 code 模板（.md 外皮）

```yaml
---
kind: code
status: current
implements: docs/current/contract-audit-contract.md
---
```

对可执行扩展名文件（`.ts` / `.mjs` / `.py`），`implements:` 以顶部注释形式出现：

```js
// implements: docs/current/contract-audit-contract.md
```

### 3.5 index 模板

```yaml
---
kind: index
status: current
verified: 2026-04-13
---
```

---

## 4. 边界案例裁决

### 4.1 README.md 是 index 还是 contract？

**裁决**：`kind: index`。README 的职责是导航，链接到其它文件，自身不定义任何 schema。若 README 里出现"本项目必须遵循 X"这种规范性段落，必须抽离成独立 contract，README 只保留 `[[link]]`。

### 4.2 tutorial.md 有叙事有代码块，是什么？

**裁决**：`kind: code`（整篇视为脚本外皮），以 `implements:` 指向被教学的 contract。理由：tutorial 的正文是"按步执行的操作序列"，本质是可执行行为的说明书，属于 code 的 .md 外皮形态。若某份 tutorial 其实只是"索引各章节"，则降级为 index。

### 4.3 changelog.md 既是 record 又像 index？

**裁决**：拆。`CHANGELOG.md` 本身是 `kind: index`，按版本列出指针。每一条具体变更条目（如 `changelog/2026-04-13-pipeline-v2.md`）是 `kind: record`（immutable）。混合写法（一个 .md 文件内既含 immutable 历史条目又含当期导航）违反 Axiom 1，必须拆分。

### 4.4 audit-report 是 record 还是 instance？

**裁决**：`kind: record`。audit 报告描述"某次审计在某时发现了什么"，是事件陈述，不可编辑。即使它符合某个 audit-schema-contract，也仍然是 record（record 与 instance 的硬区分是 immutability，见 §2 的第 5 对）。若审计产出的是"结构化的可被后续更新的状态文件"（如 findings 数据库），则那份才是 instance。

### 4.5 Phase 0 baseline 下的 summary.md 是什么？

**裁决**：`kind: instance`，`conforms_to: docs/current/baseline-schema-contract.md`（若存在；否则必须先建立 schema contract 再落 summary）。理由：baseline summary 的每个字段都是"当前系统的一次测量结果"，是数据点，遵循一个固定的 schema。它**可以**被下一次 baseline 收集覆盖替换，这与 record 的 immutability 相悖，因此归 instance。

### 4.6 一份 roadmap.md 既列目标又列已完成事项？

**裁决**：拆成两份。已完成事项 → `kind: record`（按日期归档）；未来目标 → `kind: contract`（定义"要达成什么形状"）或 `kind: instance`（若符合已有 planning schema）。根文件 `roadmap.md` 本身变 `kind: index`，引用两者。

---

## 5. 强制字段与审计检查点

| 字段 | 哪类必填 | 审计检查点 | 错误码 |
|------|---------|-----------|--------|
| `kind` | 全部 | R1（原有） | `missing-kind` / `bad-kind` |
| `describes` | 仅 contract | R2（原有，禁用连词，≤20 字） | `missing-describes` / `describes-conjunction` / `describes-too-long` |
| `schema_version` | contract | R10（新） | `missing-schema-version` |
| `conforms_to` | instance | R11（新），指向必须为 `kind: contract` | `missing-conforms-to` / `conforms-to-not-contract` |
| `generated_by` | instance | R12（新） | `missing-generated-by` |
| `generated_at` | instance | R12（新） | `missing-generated-at` |
| `event` | record | R13（新） | `missing-event` |
| `recorded_at` | record | R13（新） | `missing-recorded-at` |
| `immutable: true` | record | R14（新），强制且字面值必须为 `true` | `missing-immutable` / `record-edited`（git diff 检测） |
| `implements` | code | R15（新），指向必须为 `kind: contract` | `missing-implements` / `implements-not-contract` |
| reference_density ≥ 0.70 | index | R3（原有，阈值以本合同为准） | `type2-too-much-substance`（脚本沿用旧名） |
| reference_density ≤ 0.30 | contract | R3（原有） | `type1-too-many-refs`（脚本沿用旧名） |

**与现行 `contract-audit.mjs` 的对齐义务**：当前脚本使用 `kind: I` / `kind: II` 的旧二分；本合同 v1 一旦生效，审计脚本必须升级为识别上表五类取值并实现 R10–R15。迁移窗口期内允许脚本同时接受新旧值，但新建文件必须使用本合同的五类取值。

---

## 6. kind 变更流程

- **kind 从一类改到另一类** = 破坏性变更。必须在对应 ADR（record）中说明理由、旧引用的处理、迁移脚本（若涉及多个文件）
- **新增一类** = 必须先改本合同 §1 增加新类定义，再改 `contract-audit-contract.md` 的枚举与规则，最后升级 `scripts/contract-audit.mjs`。三步顺序不可颠倒
- **取消一类** = 必须先证明仓内零实例（审计跑一次 `kind_stats` 确认），才可从本合同 §1 删除该类定义。对应 schema_version 必须升版

---

## 7. 不变量（偏执模式）

- **Axiom 1（恰属一类）**：每个文件恰属五类中的一类。无混合体，无"既是 A 又是 B"。
- **Axiom 2（零交集）**：任意两类之间零交集。由 §2 的 10 对硬区分保证，机械可判定。
- **Axiom 3（结构化组合允许，但组件必须清晰）**：一个 contract 可以由多个 sub-contract 组成（通过 `[[link]]` 引用），但每个 sub-contract 仍是完整的 contract 文件。禁止"大 contract 文件内嵌若干 sub-contract 段落"——这样的段落要么抽成独立 contract 文件，要么并入主 contract 成为其章节，不存在中间态。
- **Axiom 4（类与实例显式分开）**：contract 定义形状，instance 持有值，审计通过 `conforms_to` 强制绑定。同一份文件不得同时承担两角色。
- **Axiom 5（宁愿多定义几类也不允许模糊边界）**：若发现当前五类无法干净容纳某个文件，先扩 §1 再动该文件。绝不通过"塞进最接近的一类"制造灰区。

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初版。确立五类 MECE（contract / instance / record / code / index）取代旧的 kind: I / kind: II 二分。定义 10 对零交集证明、强制 frontmatter、6 条边界裁决、R10–R15 新审计检查点、5 条偏执 Axiom |

---

## 参考

- [contract-audit-contract.md](contract-audit-contract.md) — 本合同的下游消费者，审计脚本规格
- [pipeline-contract.md](pipeline-contract.md) — 风格基准
- [compile-promotion-contract.md](compile-promotion-contract.md) — 风格基准
