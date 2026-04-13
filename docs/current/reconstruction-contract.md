---
kind: contract
status: draft
phase: 2
schema_version: 1
describes: "过程重建对象规范"
---

# Reconstruction 合同：过程重建对象规范

> 定义 Derivation Space 中 `AcceptedReconstruction` 的完整 schema、Fidelity 评分方法、与 Episode / DerivationTrace 的绑定关系。
> v7 命名：`AcceptedReconstruction`（v6 曾用名 `Reconstruction`，v7 §2.D / §3.3 更名以区分"过程重建的输出"与"过程重建的动作"）。
> AcceptedReconstruction 是 BestQ-A 区别于普通 RAG 的核心——没有 AcceptedReconstruction，系统只有 retrieval，没有"过程重建"。
> 上游依赖：[v7-world-model-contract.md](v7-world-model-contract.md) §2.D / §3.3 / §5.1 S6、[mechanism-instance-contract.md](mechanism-instance-contract.md)
> 姊妹合同：[derivation-chain-contract.md](derivation-chain-contract.md)、[ontology-delta-contract.md](ontology-delta-contract.md)

---

## §1 定义与边界

**定义**：给定 Episode 的初始条件 + 当前 Ontology Space，用 MechanismClass 的可回放规格重新生成该 Episode 主要发生过程的结构化结果。

**是什么**：

- 用当前 Ontology **重新生成**过程（generative）
- 与原始 Episode timeline 对比计算 fidelity
- 7 步算子链 S6 的核心产出

**不是什么**：

- 不是 retrieval——retrieval 输出"已存在的 Episode 或 MechanismClass 的 ID 列表"
- 不是 summarization——summarization 压缩 Episode 为人类摘要
- 不是 prediction——prediction 预测未来 Episode

**硬区分**：Reconstruction 的输出**必须包含** `reconstructed_timeline`（过程链）+ `fidelity`（评分）。只有 ID 列表没有过程链的输出不是 Reconstruction。

---

## §2 Schema

```yaml
AcceptedReconstruction:           # v7 §3.3 命名
  # 身份
  id: string                      # 格式: "RC_<episode_id>_<version>"
  version: int                    # 同一 Episode 可有多次重建，version 递增

  # 绑定
  episode_id: string              # 被重建的 Episode
  selectedMechanismIds: string[]  # 重建中使用的 MechanismClass 集合（v7 字段名）
  mechanism_instance_ids: string[] # v7 bridge：对应 Episode 内被接受的 MechanismInstance 集合
  ontology_snapshot_ref: string   # 重建时的 Ontology 版本标识

  # 核心产出
  traceId: string                 # 关联的 DerivationTrace（v7 字段名，见 derivation-chain-contract.md）
  majorChain: string[]            # 主因果链节点列表（v7 字段，reconstructed_timeline 的简化索引）
  reconstructed_timeline:         # 重建出的完整时间线（详细版，本合同扩展）
    - step: int
      kind: string                # 见 §2.1 枚举
      node_ref: string            # 被重建的节点标识（LP/OS/IP 等）
      content: string             # 人类可读描述
      source: string              # "ontology_derived" | "episode_anchored"

  # Fidelity
  fidelity: FidelityScore         # 见 §3

  # 元数据
  created_at: ISO8601
  created_by: string              # "pipeline_s6" | "human_review" | "regression_rerun"
  supersedes: string | null       # 前一版 Reconstruction 的 id
```

### §2.1 reconstructed_timeline.kind 枚举

| kind | 语义 | 举例 |
|------|------|------|
| `initial_condition` | 起始环境状态 | firmware_3.1.2 + calibration_module_v2 |
| `latent_phase` | MechanismClass 的不可直接观测阶段 | LP1：参数漂移积累 |
| `observable` | MechanismClass 的可观测特征 | OS1：注视误差超阈值 |
| `intervention` | 干预行为 | IP1：重标定 |
| `outcome` | 最终结果 | 误差恢复到 0.9° |

### §2.2 字段约束

| 字段 | 约束 |
|------|------|
| `id` | 全局唯一，格式 `RC_<episode_id>_<version>` |
| `episode_id` | 必须指向已存在的 Episode |
| `selectedMechanismIds` | 非空数组；每个 ID 必须指向已存在的 MechanismClass |
| `mechanism_instance_ids` | draft 阶段允许为空；转 current 前必须非空，且每个 ID 指向已存在的 MechanismInstance |
| `ontology_snapshot_ref` | 不可为空——必须记录"用哪个版本的 Ontology 做的重建" |
| `traceId` | 必须指向已存在的 DerivationTrace |
| `majorChain` | 非空数组；从 reconstructed_timeline 中提取的关键节点 ID 列表 |
| `reconstructed_timeline` | 非空；step 编号严格递增；首步 kind 必须是 `initial_condition` |
| `fidelity` | 不可为空——即使 score = 0 也必须给出 FidelityScore |
| `supersedes` | 首版为 null；后续版本必须指向上一版的 id |

---

## §3 Fidelity 评分

Fidelity 衡量"重建出的过程"与"原始 Episode 轨迹"的匹配程度。它是 BestQ-A 的北极星指标——Reconstruction Fidelity。

### §3.1 FidelityScore Schema

```yaml
FidelityScore:
  score: float            # [0.0, 1.0]
  method: string          # 评分方法标识（见 §3.2）
  matched_nodes: string[] # 原始 Episode 中被正确重建的关键节点
  missed_nodes: string[]  # 原始 Episode 中未能重建的关键节点
  extra_nodes: string[]   # 重建中出现但原始 Episode 中不存在的节点
```

### §3.2 评分方法

Phase 2 定义一种方法，后续 Phase 可扩展（扩展需升 schema_version）。

| method | 公式 | 说明 |
|--------|------|------|
| `key_node_coverage` | `\|matched\| / (\|matched\| + \|missed\|)` | extra 不扣分但必须记录 |

**关键节点定义**：Episode.timeline 中以下 kind 的 step 被视为关键节点：

| Episode step kind | 关键节点？ | 理由 |
|-------------------|-----------|------|
| `observation` | 是 | 可观测现象必须被重建覆盖 |
| `intervention` | 是 | 干预行为是因果验证的核心 |
| `claim_accepted` | 是 | 被接受的断言是推导链的终点 |
| `claim_proposed` | 否 | 系统未必能重建每个被提出的候选 |
| `claim_rejected` | 否 | 被拒绝的候选是探索副产品 |
| `derivation` | 否 | 推导步骤由 DerivationTrace 单独审计 |

### §3.3 Fidelity 等级

| 等级 | score | 语义 | 系统行为 |
|------|-------|------|---------|
| `excellent` | >= 0.90 | Ontology 充分重建该 Episode | 可用于晋升门控证据 |
| `adequate` | [0.70, 0.90) | 主过程已重建，部分细节缺失 | 允许存档；标记待改进节点 |
| `poor` | [0.40, 0.70) | 显著过程缺失 | 触发 Ontology 审查——可能缺 MechanismClass |
| `failure` | < 0.40 | Ontology 无法重建该 Episode | 标记为 Ontology 盲区，优先补充 |

### §3.4 Fidelity 单调性约束

引用 v6 §6 S7："fidelity 在'未被标记为错误'的老 Episode 上不得下降"。

具体规则：

1. 每次 OntologyDelta 提交前，对所有 `status != obsolete` 的 Episode 重跑 Reconstruction
2. 若任一 Episode 的新 fidelity < 旧 fidelity，OntologyDelta 被阻断
3. 解除阻断的唯一方式：显式标记该老 Episode 为 `obsolete`（附理由），然后重跑

详见 [[ontology-delta-contract]] §5。

---

## §4 与 Episode 的绑定

```
Episode ──1:N──> Reconstruction
                   │
                   └── version 递增，旧版 superseded
```

- 一个 Episode 可有多个 Reconstruction（Ontology 演化时旧版被 supersede）
- 每个 Reconstruction 恰好绑定一个 Episode
- Episode 的 `accepted_reconstruction` 字段指向当前最新有效 Reconstruction

**生命周期联动**：

| Episode 事件 | Reconstruction 行为 |
|-------------|-------------------|
| Episode 创建 | Reconstruction 暂无（Episode 可以先存在） |
| S6 首次重建 | 创建 Reconstruction v1 |
| Ontology 更新 | 对受影响 Episode 重跑 Reconstruction，产出 v(N+1)，vN 进入 superseded |
| Episode 标记 obsolete | 该 Episode 的所有 Reconstruction 不再参与 fidelity 回归检查 |

---

## §5 与 MechanismInstance 的绑定

```text
AcceptedReconstruction ──N:1──> MechanismInstance ──N:1──> MechanismClass
```

- `selectedMechanismIds` 记录使用到的机制类
- `mechanism_instance_ids` 记录这些机制类在当前 Episode 中的具体绑定
- 在 target state 中，`AcceptedReconstruction` 不得直接从裸 path / atom 代理跳到 MechanismClass

**第一轮兼容说明**：

- 允许 `selectedMechanismIds` 暂时仍由 path proxy 生成
- 但本合同转 `current` 前，必须完成 `mechanism_instance_ids` 的显式绑定

---

## §6 与 DerivationTrace 的绑定

```
AcceptedReconstruction ──1:1──> DerivationTrace
```

- 每个 AcceptedReconstruction 恰好关联一个 DerivationTrace
- DerivationTrace 记录"怎么推的"（proof steps，每步可审计 + supportLinks + rejectedClaimIds）
- AcceptedReconstruction 记录"推得对不对"（fidelity 评分 + majorChain + reconstructed_timeline）
- 两者通过 `traceId` 字段关联

分工：

| 对象 | 回答的问题 | 核心字段 |
|------|-----------|---------|
| DerivationTrace | 从初始条件到结论经过了哪些推导步骤？ | proof[] + rejectedClaimIds |
| AcceptedReconstruction | 用这些步骤重建的结果与原始 Episode 匹配度如何？ | fidelity + majorChain |

---

## §7 落盘格式

Reconstruction 作为 JSON 对象落盘：

```
artifacts/<run_id>/reconstructions/<reconstruction_id>.json
```

JSON 根字段必须包含元数据：

```json
{
  "$kind": "instance",
  "$conforms_to": "docs/current/reconstruction-contract.md",
  "$generated_by": "scripts/eval.mjs",
  "$generated_at": "2026-04-13T10:20:00Z"
}
```

---

## §8 不变量

| # | 不变量 | 违反时的后果 |
|---|--------|-------------|
| I1 | 非 retrieval：必须包含 `reconstructed_timeline` | 审计红灯 |
| I2 | Ontology 绑定：`ontology_snapshot_ref` 不可为空 | 重建结果无法复现——不知道用的哪版 Ontology |
| I3 | Fidelity 必填：即使 score = 0.0 也必须有完整 FidelityScore | 审计红灯 |
| I4 | bridge 不可跳过：转 current 前 `mechanism_instance_ids` 必须非空 | MechanismClass 与 Episode 之间无实例层 |
| I5 | 步骤可审计：关联 DerivationTrace 每步 `audit_replayable` 必须为 true | 推导链断裂 |
| I6 | 版本单调：同一 Episode 的 version 严格递增 | 版本冲突 |
| I7 | supersede 链完整：v(N+1).supersedes 必须指向 v(N).id | 历史断裂 |
| I8 | 首步锚定：reconstructed_timeline 首步 kind 必须是 `initial_condition` | 重建缺起点 |

---

## §9 与现有代码的映射

| 组件 | 当前状态 | Gap |
|------|---------|-----|
| Reconstruction 类型 | **未实现** | 需在 `core/types.ts` 新增接口 |
| FidelityScore 计算 | **未实现** | 需新建 `core/reconstruction.ts` |
| Episode.accepted_reconstruction | Episode = Story，无该字段 | Story 升级为 Episode 后添加 |
| reconstructed_timeline | **未实现** | 需定义 ReconstructedStep 类型 |
| mechanism_instance_ids | **未实现** | 需新增 `core/mechanism-instance.ts` 并从 PatternInstance / path projection 过渡 |
| 落盘路径 | `artifacts/` 目录已存在 | eval.mjs 扩展输出 `reconstructions/` 子目录 |
| fidelity 回归检查 | **未实现** | 需在 OntologyDelta 提交前集成 |

---

## §10 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1 | 2026-04-13 | 初版。定义 AcceptedReconstruction schema、FidelityScore 四等级、key_node_coverage 评分方法、Episode/DerivationTrace 绑定关系、7 条不变量。对象命名对齐 v7 §3.3 |
| 2 | 2026-04-14 | 引入 `mechanism_instance_ids` 作为 bridge 字段，明确 MechanismClass → MechanismInstance → Reconstruction 的目标绑定链 |

---

## 参考

- [[v7-world-model-contract|v7 世界模型合同]] — 上游，§2.D / §3.3 / §5.1 S6
- [[derivation-chain-contract|DerivationTrace 合同]] — 姊妹，推导链规范
- [[ontology-delta-contract|OntologyDelta 合同]] — 姊妹，本体增量规范
- [[artifact-contract|Artifact 合同]] — 落盘目录结构
