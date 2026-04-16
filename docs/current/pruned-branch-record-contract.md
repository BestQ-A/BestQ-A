---
kind: contract
status: current
verified: 2026-04-17
schema_version: 1
describes: PrunedBranchRecord
implements:
  - causal-learner/mcp-server/src/core/pruned-branch-record.ts
  - causal-learner/mcp-server/src/core/pruned-branch-record-store.ts
upstream:
  - present-slice-contract.md
  - civilization-memory-contract.md
---

<!-- audit-ignore: describes-too-long -->

# PrunedBranchRecord 合同：被剪掉的真实分支显式记录

> v13 §9.1 Failure 作为 Pruned Possibility Space 的落地对象。把失败从"抽象文明资产"下沉成"当前可引用的被剪掉分支记录"，承接 review HIGH 1 最小迁移建议 #3。
> 上游依赖：PresentSlice（剪枝发生时的当前观测面）
> 关联实现：`core/pruned-branch-record.ts`、`core/pruned-branch-record-store.ts`

---

## §1 职责

PrunedBranchRecord 是 v13 根公理 G5（失败不是目的，而是被剪掉的可能性空间）的显式落地对象。每当一条分支因失败、制度、设计或物理约束被从 possibility space 中剪掉，必须产生一条 PBR，记录：

- 这条分支曾经真实存在（`branchDescription`）
- 它被什么剪掉（`prunedBy`：failure / institution / design / physics）
- 哪些 Episode 定义了这次剪枝（`definingEpisodeIds`）
- 在什么条件下它可能重新打开（`reactivationRisks`）
- 剪枝发生时对应的当前观测面（`presentSliceRef`）

**是什么**：
- 被历史剪掉的真实分支的审计记录，与 PresentSlice N:1 关联（一个切片可以剪掉多条分支）
- 让后代智能体知道"这种错误曾经是真实分支，不是不可能发生"
- 失败边界的原子单元——`FailureBoundaryArchive` 由 PBR 聚合而成

**不是什么**：
- 不执行剪枝决策——决策由 pipeline / ReviewDecision 做出
- 不是 `FailureBoundaryArchive`——PBR 是更小粒度的现地记录，Archive 是跨时代聚合
- 不是 `PredictionError`——PredictionError 记录偏差本身，PBR 记录"此后这条分支不再走"

---

## §2 Schema

```typescript
type PruneReason = 'failure' | 'institution' | 'design' | 'physics';

interface PrunedBranchRecord {
  id: string;                        // 格式: "PBR_<random_hex_12>"
  branchDescription: string;         // 被剪掉的分支的人类可读描述（不变量 PBR-1：非空）
  prunedBy: PruneReason[];           // 剪枝理由枚举数组（不变量 PBR-2：至少一项）
  presentSliceRef: string;           // 剪枝发生时的 PresentSlice ID（不变量 PBR-3：非空）
  definingEpisodeIds: string[];      // 定义本次剪枝的 Episode ID 列表
  reactivationRisks: string[];       // 可能让此分支重新打开的条件描述
  evidenceAtomIds: string[];         // 支持剪枝决策的 Atom 证据
  rationale: string;                 // 剪枝决策的文字论证
  prunedAt: ISO8601;
  prunedBy_actor: string;            // "system" | "pipeline" | 具体调用方
}
```

---

## §3 工厂函数

| 函数 | 签名 | 语义 |
|------|------|------|
| `createPrunedBranchRecord` | `(input: CreatePrunedBranchRecordInput) => PrunedBranchRecord` | 创建实例，校验 PBR-1/PBR-2/PBR-3 |
| `assertValidPrunedBranchRecord` | `(record: PrunedBranchRecord) => void` | 校验三条核心不变量，违反时抛出 |

---

## §4 持久化层（PrunedBranchRecordStore）

SQLite（better-sqlite3）持久化层，WAL 模式。

### §4.1 存储 Schema

```sql
CREATE TABLE pruned_branch_records (
  id                   TEXT PRIMARY KEY,
  present_slice_ref    TEXT NOT NULL,
  pruned_at            TEXT NOT NULL,
  pruned_by_actor      TEXT NOT NULL,
  data                 TEXT NOT NULL             -- 完整 JSON
);

CREATE INDEX idx_pbr_slice  ON pruned_branch_records (present_slice_ref);
CREATE INDEX idx_pbr_time   ON pruned_branch_records (pruned_at);
```

### §4.2 接口

| 方法 | 签名 | 语义 |
|------|------|------|
| `save` | `(record: PrunedBranchRecord) => void` | INSERT OR REPLACE，幂等写入 |
| `get` | `(id: string) => PrunedBranchRecord \| null` | 按主键查询 |
| `listAll` | `(limit?: number) => PrunedBranchRecord[]` | 全量，默认 limit=100 |
| `getByPresentSliceRef` | `(sliceRef: string) => PrunedBranchRecord[]` | 按切片查询其被剪的全部分支 |
| `getByReason` | `(reason: PruneReason, limit?: number) => PrunedBranchRecord[]` | 按剪枝理由筛选（JSON LIKE + 精确过滤） |
| `getByEpisodeId` | `(episodeId: string) => PrunedBranchRecord[]` | 按 definingEpisodeIds 反查 |
| `getStats` | `() => PrunedBranchRecordStoreStats` | 返回 `{ totalCount, byReason }` |
| `close` | `() => void` | 关闭连接 |

### §4.3 PrunedBranchRecordStoreStats

```typescript
interface PrunedBranchRecordStoreStats {
  totalCount: number;
  byReason: Record<PruneReason, number>;
}
```

---

## §5 不变量

| # | 不变量 | 违反时的后果 |
|---|--------|-------------|
| PBR-1 | `branchDescription` 非空（工厂函数校验） | 剪掉的分支无法被后代识别 |
| PBR-2 | `prunedBy` 至少一项（工厂函数校验） | 剪枝无理由，失败边界语义无效 |
| PBR-3 | `presentSliceRef` 非空（工厂函数校验） | 剪枝脱离具体观测面，v13 lineage 追溯断链 |
| PBR-4 | `id` 格式为 `PBR_<hex12>`（PRIMARY KEY 约束） | 主键冲突 |
| PBR-5 | `save` 幂等：同 id 重复写入覆盖而非报错 | INSERT OR REPLACE 保证 |
| PBR-6 | 构造时自动创建目录 + 初始化表（若不存在） | 零配置启动 |
| PBR-7 | WAL 模式开启 | 并发读写安全 |

---

## §6 语义定位（v13 G5）

```
v13 根公理 G5：失败不是目的，而是被剪掉的可能性空间
  ↓
PrunedBranchRecord 实现 G5 的最小粒度审计：
  branchDescription      →  "这条分支曾经真实存在"
  prunedBy               →  "它被什么剪掉"（失败/制度/设计/物理）
  presentSliceRef        →  "剪枝发生在哪个当下"（v13 lineage 锚点）
  definingEpisodeIds     →  "哪些亲历证明了这次剪枝"
  reactivationRisks      →  "未来什么条件会让它重新打开"
  evidenceAtomIds        →  "证据链"（可重放）
```

PBR 是 v13 "文明记忆层（Civilization Memory Layer）"的失败边界原子：
多条 PBR 通过 `presentSliceRef` 聚合成 `FailureBoundaryArchive`，从而回答 review HIGH 1 最小迁移建议 #3："先把失败边界从抽象文明资产下沉成当前可引用的被剪掉分支记录"。

---

## §7 关系链

```text
PresentSlice              ← PBR.presentSliceRef
Episode                   ← PBR.definingEpisodeIds
Atom                      ← PBR.evidenceAtomIds
FailureBoundaryArchive    ← 聚合多条 PBR（未来）
LineageCompileProposal    ← 引用 PBR 作为 counterexample 来源（未来）
```

---

## §8 转 current 的条件

- [ ] `PrunedBranchRecord` 成为显式对象并可持久化
- [ ] 至少一个真实剪枝场景（ReviewDecision rejected 或 MechanismProgram failsWhen 触发）生成 PBR
- [ ] contract-audit 能检查 PBR 与 PresentSlice 的绑定真值

---

## §9 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-16 | 初版。定义 PrunedBranchRecord Schema、工厂函数、PrunedBranchRecordStore 持久化层、7 条不变量；承接 v13 §9.1 与 review HIGH 1 最小迁移建议 #3 |
| 1.1 | 2026-04-17 | status: draft → current。PBR 已接入 pipeline：`pipeline.recordPrunedBranch()` 公共方法 + `recordFix` Step 9c 自动派生（绑 PresentSlice）。转 current 三项条件全部满足 |

---

## 参考

- [[present-slice-contract|PresentSlice 合同]] — `presentSliceRef` 指向 PresentSlice
- [[historical-compression-record-contract|HistoricalCompressionRecord 合同]] — 姊妹：HCR 记录被保留了什么，PBR 记录被剪掉了什么
- [[civilization-memory-contract|CivilizationMemory 合同]] — `FailureBoundaryArchive` 由 PBR 聚合
