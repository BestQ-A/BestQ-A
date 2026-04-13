---
kind: record
event: "2026-04-13 taxonomy review findings"
recorded_at: 2026-04-13
immutable: true
---

# Taxonomy Review 问题汇总（2026-04-13）

> 本文档是对本轮 reviewer 输出的中文整理。
> 目的不是重新裁决，而是把问题收敛成一个可跟踪的单一记录。

---

## 总体结论

review 认为，这次补丁虽然引入了新的五类 taxonomy，但“声明了分类”不等于“真正被审计和约束”。

核心问题有三类：

1. 部分元数据链接已经写上，但没有被严格校验，导致绑定不可靠。
2. 一部分新分类的文件根本没有进入审计范围，因此 CI 无法真正兜底。
3. 某些文件绑定到了错误 contract，或把已修改的旧文件错误标记为 immutable record。

这意味着补丁当前还不能稳妥支撑“文件五类分类已被 CI 强制执行”的结论。

---

## 问题清单

| 严重度 | 位置 | 中文摘要 | review 的核心意思 |
|---|---|---|---|
| P2 | `scripts/contract-audit.mjs:463-467` | `kind: code` 的 `implements` 目标没有被严格校验 | 现在只检查“有没有写”，没有检查“指向的文件是否存在、是否真的是 `kind: contract`”，所以 code → contract 绑定可能是错的 |
| P2 | `scripts/contract-audit.mjs:594-603` | 新增分类的文件没有全部进入审计 | `collectTargets()` 仍只扫旧范围，导致新纳入 taxonomy 的脚本和 Markdown 实例文件对 CI 不可见 |
| P2 | `causal-learner/mcp-server/scripts/dump-stats.mjs:54-57` | 统计快照被错误标记为 `metrics-contract` 实例 | `metrics-contract.md` 定义的是 `metrics.json`，而这个脚本输出的是 `stats.json` 一类原始存储快照，两者不是同一 schema |
| P2 | `scripts/capture-baseline.mjs:41-46` | `summary.md` / `coverage-matrix.md` 被错误绑定到 `artifact-contract.md` | `artifact-contract.md` 只定义目录和文件布局，不定义这些 Markdown 文件的内容 schema，因此 `conforms_to` 绑错了对象 |
| P3 | `docs/current/contract-vs-impl-audit.md:1-5` | 已存在且被修改过的文件被重新标成 immutable record | 这个文件是旧文件，补丁又原地修改了它，但同时把它声明成 `immutable: true`，会导致审计永远报 `record-mutated` |

---

## 逐项展开

### 1. `implements` 只检查存在，不检查真伪

**位置**

- `scripts/contract-audit.mjs:463-467`

**review 指出的问题**

- R11 当前只在 `implements` 缺失时报警
- 但如果 `implements` 写错路径，或者指向的不是 contract 文件，也能通过

**影响**

- 新 taxonomy 中，`kind: code` 和 contract 的绑定关系并不可信
- downstream tooling 如果依赖这层绑定，可能会读到错误 contract 或静默失效

**review 期望的修正方向**

- 和 `conforms_to` 一样，解析目标路径
- 校验目标文件真实存在
- 校验目标文件 frontmatter 中是 `kind: contract`

---

### 2. 审计范围没有覆盖这次新增分类的文件

**位置**

- `scripts/contract-audit.mjs:594-603`

**review 指出的问题**

- `collectTargets()` 仍然主要只扫：
  - 根目录 `scripts/*.{js,mjs}`
  - `artifacts/` 下的 JSON
  - `.omx/baselines/` 下的 JSON
- 但这次补丁已经把更多文件纳入 taxonomy，例如：
  - `causal-learner/mcp-server/scripts/dump-stats.mjs`
  - `artifacts/*/summary.md`
  - `.omx/baselines/*/summary.md`
  - `.omx/baselines/*/coverage-matrix.md`

**影响**

- 这些文件即使 metadata 写错、缺失，也不会触发 gate
- review 认为这直接削弱了“CI 已真正 enforce 五类分类”的说法

**review 期望的修正方向**

- 扩展 `collectTargets()` 的收集范围
- 让所有被新 taxonomy 认定的文件都进入审计

---

### 3. `dump-stats.mjs` 输出被绑定到了错误 contract

**位置**

- `causal-learner/mcp-server/scripts/dump-stats.mjs:54-57`

**review 指出的问题**

- `metrics-contract.md` 定义的是 `metrics.json`
- 但 `dump-stats.mjs` 输出的是 `stats.json / stats_before.json / stats_after.json` 一类原始统计快照
- 这些快照包含的是 `graph`, `stories`, `evidence` 等存储状态，不是 metrics 字典

**影响**

- 后续如果开始按 `conforms_to` 做 schema 校验，这些文件会被送去错误 contract
- 结果可能是：
  - 校验直接失败
  - 或者被错误解释

**review 期望的修正方向**

- 为 stats snapshot 单独建立 contract
- 或在新 contract 出现前，不要把它们标为 `metrics-contract` 实例

---

### 4. `summary.md` 和 `coverage-matrix.md` 也被绑定到了错误 contract

**位置**

- `scripts/capture-baseline.mjs:41-46`

**review 指出的问题**

- `artifact-contract.md` 定义的是 run 目录布局、文件存在性和组织关系
- 它并不定义：
  - `summary.md` 的内容结构
  - `.omx/baselines/*/coverage-matrix.md` 的内容结构
- 但补丁把这些 Markdown payload 直接标成了 `artifact-contract.md` 的实例

**影响**

- `conforms_to` 的语义被混淆
- downstream 工具无法根据 contract 正确理解这些 Markdown 文件的内容
- 也和 `file-taxonomy-contract.md` 第 4.5 节关于 summary instance 需要独立 schema 的要求相冲突

**review 期望的修正方向**

- 给 summary / baseline Markdown 单独定义 contract
- 在没有专属 contract 前，不要把它们错误归入 `artifact-contract.md`

---

### 5. 旧文件被改完之后再标 immutable record

**位置**

- `docs/current/contract-vs-impl-audit.md:1-5`

**review 指出的问题**

- 这个文件在补丁前就已经存在
- 这次补丁又对它做了原地修改
- 但 frontmatter 同时把它声明为：
  - `kind: record`
  - `immutable: true`

**影响**

- 按照新的 record 规则，这个文件会持续被视为“被修改过的 immutable record”
- review 已指出：`node scripts/contract-audit.mjs` 已经报出了 `record-mutated`

**review 期望的修正方向**

- 如果目标是 append-only 语义，就应该新建一个新的 record 文件
- 原先这个会继续编辑的审计文档，应保留为普通参考文档，而不是 immutable record

---

## 汇总判断

从本轮 review 的角度看，当前补丁的主要问题不是“没有 taxonomy”，而是 taxonomy 的三个关键环节还没闭合：

1. **绑定未校验**
   - `implements` / `conforms_to` 语义还没有被一致执行
2. **范围未覆盖**
   - 新分类文件没有全部进入审计入口
3. **语义未对齐**
   - 一些实例绑定到了错误 contract
   - 一些文件类型声明与其真实生命周期不一致

---

## 后续修复顺序（按本轮 review 的优先级理解）

1. 先补 `implements` 目标校验
2. 再扩展 `collectTargets()`，让所有新分类文件真正进 gate
3. 再拆分 `stats` 与 `summary` 的专属 contract
4. 最后修正 `contract-vs-impl-audit.md` 的类型与生命周期声明

---

## 原始问题来源

本记录整理自用户提供的 reviewer 输出，原始问题共 5 条：

- 4 条 `P2`
- 1 条 `P3`

其共同指向是：

> “五类分类已 enforce by CI” 这个主张，目前仍缺少完整实现支撑。
