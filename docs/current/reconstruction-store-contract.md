---
kind: contract
status: current
schema_version: 1
describes: ReconstructionStore
implements:
  - causal-learner/mcp-server/src/core/reconstruction-store.ts
  - causal-learner/mcp-server/src/core/reconstruction.ts
---

# ReconstructionStore 合同：AcceptedReconstruction 持久化层

> 定义 AcceptedReconstruction 的持久化职责、查询接口、存储不变量。
> 上游依赖：[[reconstruction-contract|AcceptedReconstruction 合同]]
> 关联实现：`core/reconstruction-store.ts`

---

## §1 职责

ReconstructionStore 是 AcceptedReconstruction 的**唯一持久化入口**。pipeline 通过 `recordFix` 生成 AcceptedReconstruction 后，必须经由 ReconstructionStore 落盘，使其从临时返回值升级为可查询、可审计、可复用的一等治理对象。

**是什么**：

- SQLite（better-sqlite3）持久化层，WAL 模式
- 按 `episode_id` 索引，支持按 Episode 查询全版本历史
- 按 `fidelity_score` 索引，支持低 fidelity 审计查询

**不是什么**：

- 不负责创建 AcceptedReconstruction——创建逻辑在 `reconstruction.ts` 的 `createAcceptedReconstruction`
- 不负责 fidelity 回归检查——回归逻辑由 OntologyDelta 提交流驱动
- 不做 JSON schema 校验——信任上游 `createAcceptedReconstruction` 的类型约束

---

## §2 存储 Schema

```sql
CREATE TABLE reconstructions (
  id              TEXT PRIMARY KEY,
  episode_id      TEXT NOT NULL,
  version         INTEGER NOT NULL,
  fidelity_score  REAL NOT NULL,
  created_at      TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  data            TEXT NOT NULL          -- 完整 AcceptedReconstruction JSON
);

CREATE INDEX idx_rc_episode  ON reconstructions (episode_id);
CREATE INDEX idx_rc_fidelity ON reconstructions (fidelity_score);
```

`data` 列存储 `JSON.stringify(AcceptedReconstruction)` 全量快照，其余列为查询热路径的冗余索引字段。

---

## §3 接口

| 方法 | 签名 | 语义 |
|------|------|------|
| `save` | `(reconstruction: AcceptedReconstruction) => void` | INSERT OR REPLACE，幂等写入 |
| `get` | `(id: string) => AcceptedReconstruction \| null` | 按主键精确查询 |
| `getByEpisode` | `(episodeId: string) => AcceptedReconstruction[]` | 按 Episode 查询所有版本（version 降序） |
| `getLowFidelity` | `(threshold: number, limit?: number) => AcceptedReconstruction[]` | fidelity 低于阈值的记录（升序），默认 limit=50 |
| `getStats` | `() => ReconstructionStoreStats` | 返回 `{ totalCount }` |
| `close` | `() => void` | 关闭数据库连接 |

### §3.1 ReconstructionStoreStats

```typescript
interface ReconstructionStoreStats {
  totalCount: number;
}
```

---

## §4 不变量

| # | 不变量 | 违反时的后果 |
|---|--------|-------------|
| S1 | `data` 列 JSON 反序列化后必须符合 `AcceptedReconstruction` 接口 | 查询返回脏数据 |
| S2 | `id` 全局唯一（PRIMARY KEY 约束） | 写入冲突 |
| S3 | `save` 幂等：同 id 重复写入覆盖而非报错 | INSERT OR REPLACE 保证 |
| S4 | `getByEpisode` 返回顺序为 version DESC | 调用方依赖首元素为最新版 |
| S5 | 构造时自动创建目录 + 初始化表（若不存在） | 零配置启动 |
| S6 | WAL 模式开启 | 并发读写安全 |

---

## §5 Pipeline 集成

ReconstructionStore 作为 `CausalPipeline` 的 `readonly reconstructions` 字段暴露。Pipeline 构造时根据 `PipelineConfig.reconstructionDbPath` 初始化。

```
CausalPipeline
  └── reconstructions: ReconstructionStore
        ├── save()        ← recordFix 内部调用
        ├── getByEpisode() ← 审计 / fidelity 回归查询
        └── getLowFidelity() ← 低 fidelity 巡检
```

---

## §6 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-15 | 初版。定义 ReconstructionStore 职责、SQLite schema、6 个接口方法、6 条不变量 |

---

## 参考

- [[reconstruction-contract|AcceptedReconstruction 合同]] — 上游，定义存储对象的完整 schema
- [[artifact-contract|Artifact 合同]] — 落盘目录结构
