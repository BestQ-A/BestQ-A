---
status: current
verified: 2026-04-13
phase: 0
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
