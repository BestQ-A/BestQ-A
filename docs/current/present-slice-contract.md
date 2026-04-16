---
kind: contract
status: current
schema_version: 1
describes: PresentSlice
implements:
  - causal-learner/mcp-server/src/core/present-slice.ts
  - causal-learner/mcp-server/src/core/present-slice-store.ts
upstream:
  - reconstruction-contract.md
  - branch-point-contract.md
---

# PresentSlice 合同：当前观测面对象化

> v13 §7.1 核心桥接对象。定义 PresentSlice 的职责、Schema、工厂函数、持久化层。
> 上游依赖：AcceptedReconstruction（重建来源）、BranchPoint（分叉点）
> 关联实现：`core/present-slice.ts`、`core/present-slice-store.ts`

---

## §1 职责

PresentSlice 是"当下"的显式对象化，是 v13 历史生成本体论的核心桥接对象。

**是什么**：
- 在某个时刻，从历史 Episode lineage 压缩而来的当前观测面
- 之后一切 provenance tracing 和 LineageCompileProposal 的起点
- 关联活跃规律（Regulation）、活跃分叉点（BranchPoint）和重建记录（AcceptedReconstruction）

**不是什么**：
- 不是整个 Episode——Episode 是原始经历，PresentSlice 是压缩投影
- 不负责计算 provenance——追溯逻辑由调用方或 ProvenanceLineage 承担
- 不做 fidelity 回归检查——由 HistoricalCompressionRecord 驱动

---

## §2 Schema

```typescript
interface PresentSlice {
  id: string;                      // 格式: "PS_<random_hex_12>"
  name: string;                    // 人类可读名称
  episodeIds: string[];            // 来源 Episode ID（历史来源）
  reconstructionIds: string[];     // 关联 AcceptedReconstruction ID
  activeRegulationIds: string[];   // 当前活跃规律 ID
  activeBranchPointIds: string[];  // 当前活跃分叉点 ID
  compressionSummary: string;      // 压缩过程人类可读说明
  fidelityScore: number;           // 综合保真度 [0.0, 1.0]
  stateSnapshotIds: string[];      // 状态快照 ID（v13 §7.1）
  activeConstraints: string[];     // 当前活跃约束（v13 §7.1）
  visibleOutcomes: string[];       // 可见结果（v13 §7.1）
  inferredLatentStates: string[];  // 推断的潜在状态（v13 §7.1）
  unresolvedUnknowns: string[];    // 未解决的未知项（v13 §7.1）
  createdAt: ISO8601;
  createdBy: string;               // "system" | "pipeline" | 具体调用方标识
}
```

---

## §3 工厂函数

| 函数 | 签名 | 语义 |
|------|------|------|
| `createPresentSlice` | `(input: CreatePresentSliceInput) => PresentSlice` | 直接创建，`fidelityScore` 自动 clamp 到 [0,1] |
| `buildPresentSliceFromPipeline` | `(snapshot: PipelineSnapshot) => PresentSlice` | 从 pipeline 快照构建，自动计算 fidelity 均值和 compressionSummary |

### §3.1 PipelineSnapshot

`buildPresentSliceFromPipeline` 接受扁平快照，避免直接依赖 `CausalPipeline` 类型（防止循环依赖）：

```typescript
interface PipelineSnapshot {
  name: string;
  episodeIds: string[];
  reconstructionIds: string[];
  reconstructionFidelities: number[];  // 用于计算均值 fidelityScore
  activeRegulationIds: string[];
  activeBranchPointIds: string[];
  stateSnapshotIds?: string[];
  activeConstraints?: string[];
  visibleOutcomes?: string[];
  inferredLatentStates?: string[];
  unresolvedUnknowns?: string[];
  createdBy?: string;
}
```

---

## §4 持久化层（PresentSliceStore）

SQLite（better-sqlite3）持久化层，WAL 模式。

### §4.1 存储 Schema

```sql
CREATE TABLE present_slices (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  fidelity_score REAL NOT NULL,
  created_at     TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  data           TEXT NOT NULL          -- 完整 PresentSlice JSON
);

CREATE INDEX idx_ps_fidelity   ON present_slices (fidelity_score);
CREATE INDEX idx_ps_created_at ON present_slices (created_at);
```

### §4.2 接口

| 方法 | 签名 | 语义 |
|------|------|------|
| `save` | `(slice: PresentSlice) => void` | INSERT OR REPLACE，幂等写入 |
| `get` | `(id: string) => PresentSlice \| null` | 按主键精确查询 |
| `listAll` | `(limit?: number) => PresentSlice[]` | 按 created_at 降序，默认 limit=100 |
| `getLowFidelity` | `(threshold: number, limit?: number) => PresentSlice[]` | fidelity 低于阈值（升序），默认 limit=50 |
| `getByEpisodeId` | `(episodeId: string) => PresentSlice[]` | JSON 子串匹配 + 精确过滤，返回含该 Episode 的所有 Slice |
| `getStats` | `() => PresentSliceStoreStats` | 返回 `{ totalCount }` |
| `close` | `() => void` | 关闭数据库连接 |

---

## §5 不变量

| # | 不变量 | 违反时的后果 |
|---|--------|-------------|
| PS1 | `fidelityScore` ∈ [0.0, 1.0]，工厂函数自动 clamp | 聚合计算失真 |
| PS2 | `id` 格式为 `PS_<hex12>`（PRIMARY KEY 约束） | 主键冲突 |
| PS3 | `save` 幂等：同 id 重复写入覆盖而非报错 | INSERT OR REPLACE 保证 |
| PS4 | `getByEpisodeId` 对 JSON 子串匹配后二次精确过滤 | 防止 `"ep1"` 匹配 `"ep10"` 的误判 |
| PS5 | `buildPresentSliceFromPipeline` 的 fidelityScore = 所有 Reconstruction fidelity 的等权均值 | 无 Reconstruction 时退化为 0 |
| PS6 | 构造时自动创建目录 + 初始化表（若不存在） | 零配置启动 |
| PS7 | WAL 模式开启 | 并发读写安全 |

---

## §6 语义定位

```
Episode (原始经历)
  └──压缩──→ PresentSlice (当下切片)
               ├── activeRegulationIds → Regulation (规律层)
               ├── activeBranchPointIds → BranchPoint (分叉治理)
               ├── reconstructionIds → AcceptedReconstruction (重建溯源)
               └── ←── HistoricalCompressionRecord (压缩审计)
                    └── ←── LineageCompileProposal (lineage 编译提案)
```

PresentSlice 是 v13 "当前如何由历史生成"的**起点对象**。没有 PresentSlice，LineageCompileProposal 和 HistoricalCompressionRecord 均无法关联。

---

## §7 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-16 | 初版。定义 PresentSlice Schema、工厂函数、PresentSliceStore 持久化层、7 条不变量 |

---

## 参考

- [[branch-point-contract|BranchPoint 合同]] — PresentSlice.activeBranchPointIds 指向 BranchPoint
- [[reconstruction-contract|AcceptedReconstruction 合同]] — PresentSlice.reconstructionIds 指向 AcceptedReconstruction
- [[historical-compression-record-contract|HistoricalCompressionRecord 合同]] — 每次压缩操作生成 HCR，targetPresentSliceId 指向本对象
- [[lineage-compile-proposal-contract|LineageCompileProposal 合同]] — targetPresentSliceId 指向本对象
