---
kind: contract
status: current
schema_version: 1
describes: HistoricalCompressionRecord
implements:
  - causal-learner/mcp-server/src/core/historical-compression-record.ts
  - causal-learner/mcp-server/src/core/historical-compression-record-store.ts
upstream:
  - present-slice-contract.md
---

<!-- audit-ignore: describes-too-long -->

# HistoricalCompressionRecord 合同：历史压缩审计记录

> v13 §12.1 Civilization Memory Layer 核心审计对象。定义历史压缩操作的记录职责、Schema、不变量、持久化层。
> 上游依赖：PresentSlice（压缩目标）
> 关联实现：`core/historical-compression-record.ts`、`core/historical-compression-record-store.ts`

---

## §1 职责

HistoricalCompressionRecord 是"当前态是历史的压缩"这一 v13 根公理 G2 的显式落地对象。每次从历史 Episode 压缩到 PresentSlice 的操作，必须产生一条 HCR，记录：

- 哪些 Episode 被压缩（历史来源）
- 哪些 Atom 被保留、哪些被丢弃
- 压缩比是多少
- 压缩是否可逆

**是什么**：
- 历史压缩操作的审计记录，与 PresentSlice 1:N 关联（一个切片可由多次压缩产生）
- 告诉后来者"现在为什么看起来这么自然"、哪些失败已被历史抹平
- `reversible=true` 意味着可从 `retainedAtomIds` 完整重建原始 Episode

**不是什么**：
- 不执行压缩操作——压缩逻辑由调用方（pipeline 或工具函数）负责
- 不负责 Episode 的存储——Episode 由 EpisodeEventStore 管理
- 不驱动 fidelity 回归检查——HCR 是记录层，不是验证层

---

## §2 Schema

```typescript
interface HistoricalCompressionRecord {
  id: string;                      // 格式: "HCR_<random_hex_12>"
  name: string;                    // 人类可读名称（描述本次压缩操作）
  sourceEpisodeIds: string[];      // 被压缩的 Episode ID（不变量 HCR-1：非空）
  targetPresentSliceId: string;    // 压缩结果 PresentSlice ID
  retainedAtomIds: string[];       // 保留的关键节点 Atom ID
  discardedAtomIds: string[];      // 被丢弃的节点 Atom ID
  compressionRatio: number;        // 压缩比 = sourceCount / retainedCount（不变量 HCR-2：> 0）
  lossDescription: string;         // 压缩损失说明（人类可读）
  reversible: boolean;             // 是否可从 retainedAtomIds 完整重建
  createdAt: ISO8601;
  createdBy: string;               // "system" | "pipeline" | 具体调用方标识
}
```

---

## §3 工厂函数

| 函数 | 签名 | 语义 |
|------|------|------|
| `createHistoricalCompressionRecord` | `(input: CreateHistoricalCompressionRecordInput) => HistoricalCompressionRecord` | 创建实例，自动计算默认 compressionRatio，校验 HCR-1/HCR-2 |
| `assertValidCompressionRecord` | `(record: HistoricalCompressionRecord) => void` | 校验 HCR-1/HCR-2，违反时抛出 |

### §3.1 compressionRatio 默认计算规则

```
若 retainedAtomIds 非空：
  ratio = sourceEpisodeIds.length / retainedAtomIds.length

若 retainedAtomIds 为空：
  ratio = sourceEpisodeIds.length（若 > 0），否则 1.0（无压缩）
```

调用方可通过 `compressionRatio` 字段覆盖自动计算值。

---

## §4 持久化层（HistoricalCompressionRecordStore）

SQLite（better-sqlite3）持久化层，WAL 模式。

### §4.1 存储 Schema

```sql
CREATE TABLE historical_compression_records (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  target_present_slice_id  TEXT NOT NULL,
  compression_ratio        REAL NOT NULL,
  reversible               INTEGER NOT NULL,          -- 0/1
  source_episode_count     INTEGER NOT NULL,
  created_at               TEXT NOT NULL,
  data                     TEXT NOT NULL              -- 完整 JSON
);

CREATE INDEX idx_hcr_slice      ON historical_compression_records (target_present_slice_id);
CREATE INDEX idx_hcr_ratio      ON historical_compression_records (compression_ratio);
CREATE INDEX idx_hcr_reversible ON historical_compression_records (reversible);
```

### §4.2 接口

| 方法 | 签名 | 语义 |
|------|------|------|
| `save` | `(record: HistoricalCompressionRecord) => void` | INSERT OR REPLACE，幂等写入 |
| `get` | `(id: string) => HistoricalCompressionRecord \| null` | 按主键精确查询 |
| `listAll` | `(limit?: number) => HistoricalCompressionRecord[]` | 全量，默认 limit=100 |
| `getByPresentSliceId` | `(sliceId: string) => HistoricalCompressionRecord[]` | 按 targetPresentSliceId 查询（一个切片可有多条） |
| `getBySourceEpisodeId` | `(episodeId: string) => HistoricalCompressionRecord[]` | JSON 子串匹配，返回含该 Episode 的所有压缩记录 |
| `getHighCompression` | `(threshold: number, limit?: number) => HistoricalCompressionRecord[]` | compressionRatio ≥ threshold（降序），默认 limit=50 |
| `getReversible` | `(limit?: number) => HistoricalCompressionRecord[]` | 只返回 reversible=true 的记录，默认 limit=50 |
| `getStats` | `() => HistoricalCompressionRecordStoreStats` | 返回 `{ totalCount }` |
| `close` | `() => void` | 关闭数据库连接 |

### §4.3 HistoricalCompressionRecordStoreStats

```typescript
interface HistoricalCompressionRecordStoreStats {
  totalCount: number;
}
```

---

## §5 不变量

| # | 不变量 | 违反时的后果 |
|---|--------|-------------|
| HCR-1 | `sourceEpisodeIds` 非空（工厂函数校验） | 压缩无来源，语义无效 |
| HCR-2 | `compressionRatio` > 0（工厂函数校验） | 压缩比无意义 |
| HCR-3 | `id` 格式为 `HCR_<hex12>`（PRIMARY KEY 约束） | 主键冲突 |
| HCR-4 | `save` 幂等：同 id 重复写入覆盖而非报错 | INSERT OR REPLACE 保证 |
| HCR-5 | `getBySourceEpisodeId` 对 JSON 子串匹配后无二次精确过滤（性能取舍，id 足够唯一） | 极低概率误匹配（可接受） |
| HCR-6 | 构造时自动创建目录 + 初始化表（若不存在） | 零配置启动 |
| HCR-7 | WAL 模式开启 | 并发读写安全 |

---

## §6 语义定位（v13 G2）

```
v13 根公理 G2：当前状态是历史的压缩态
  ↓
HistoricalCompressionRecord 实现 G2 的显式记录：
  sourceEpisodeIds  →  压缩前的历史
  targetPresentSliceId → 压缩后的当下
  compressionRatio    → 信息丢失程度量化
  lossDescription     → 丢弃了什么（文明记忆的"负片"）
  reversible          → 能否还原（可逆性保证）
```

HCR 是 v13 "文明记忆层（Civilization Memory Layer）"的审计基础：
后代智能体通过 HCR 可以知道"这种自然感背后，哪些失败已经被历史抹平"。

---

## §7 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-16 | 初版。定义 HistoricalCompressionRecord Schema、工厂函数、HistoricalCompressionRecordStore 持久化层、7 条不变量 |

---

## 参考

- [[present-slice-contract|PresentSlice 合同]] — `targetPresentSliceId` 指向 PresentSlice
- [[reconstruction-store-contract|ReconstructionStore 合同]] — 姊妹，同为持久化审计层
- [[branch-point-contract|BranchPoint 合同]] — 分叉治理层，与 HCR 共同支撑 v13 G4
