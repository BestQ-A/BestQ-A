# AcceptedReconstruction 字段映射：从现有代码到 v7 合同

> 目的：回答一个非常具体的问题：
>
> **第一轮实现里，`AcceptedReconstruction` 每个字段到底该从现有 `Story / chosenPath / compile / hypothesis / evidence` 的哪一部分拼出来？**
>
> 本文属于“现状映射层”文档，不是合同。

---

## 0. 为什么要单独写这份文档

当前工作区已经具备：

- `docs/current/reconstruction-contract.md`
- `docs/current/derivation-chain-contract.md`
- `causal-learner/mcp-server/src/core/reconstruction.ts`
- `causal-learner/mcp-server/src/core/pipeline.ts`

也就是说，问题已经不再是“要不要有 Reconstruction”，而是：

> **代码里现在怎么拼这个对象，哪些字段已经靠谱，哪些字段只是第一轮占位。**

如果不把这件事单独钉死，后续最容易出现两种坏情况：

1. 看着字段都齐了，就误以为重建语义已经对齐合同。
2. 每次改实现时，都重新发明一套字段来源，导致对象语义漂移。

---

## 1. 当前对象来源总览

当前 `recordFix()` 中的 Reconstruction 创建入口在：

- `causal-learner/mcp-server/src/core/pipeline.ts:409-418`

当前工厂函数在：

- `causal-learner/mcp-server/src/core/reconstruction.ts:137-171`

因此当前字段的真实来源不是“Ontology replay”，而主要来自：

- `pathWithFix`
- `storySnapshot.observationAtomIds`
- `hypothesisId`
- 常量占位

这意味着当前 Reconstruction 的真实定位应理解为：

```text
由现有推理路径反向整理出的结构化重建壳
```

而不是：

```text
由当前 Ontology 从初始条件重新生成出来的完整 replay
```

---

## 2. 字段逐项映射

| 字段 | 合同语义 | 当前来源 | 当前可靠度 | 问题 | 第一轮建议 |
|---|---|---|---|---|---|
| `id` | `RC_<episode_id>_<version>` | `deriveReconstructionId(episodeId, version)` | 高 | 无 | 保持 |
| `version` | 同一 Episode 的重建版本号 | `input.version ?? 1` | 中 | 还没有真正的 supersede 机制 | 第一轮固定 1 可以接受 |
| `episode_id` | 被重建的 Episode | `input.episodeId`，当前等于 `storyId` | 高 | 仍基于 Story 兼容壳 | 保持 |
| `selectedMechanismIds` | 参与重建的 MechanismClass 集合 | `selectedMechanismIds ?? chosenPathAtomIds ?? observationAtomIds` | 低 | 当前多为 path 代理，不是真正 MechanismClass | 明确标注为 proxy |
| `ontology_snapshot_ref` | 重建使用的 Ontology 版本 | `input.ontologySnapshotRef ?? "ontology_current"` | 低 | 只是占位字符串 | 第一轮允许占位，但必须承认非真实版本 |
| `derivation_chain_id` | 关联 DerivationTrace | `input.derivationChainId ?? derive...` | 中 | 目前只是 id，未必真有对象 | 第一轮可先生成 ID，再补真正 trace 对象 |
| `traceId` | v7 对 DerivationTrace 的绑定字段 | `input.traceId ?? derivation_chain_id` | 低 | 与 `derivation_chain_id` 语义重复 | 长期应二选一，优先保留 `traceId` |
| `majorChain` | 主过程关键链 | 从 `reconstructed_timeline.map(node_ref)` 去重提取 | 中 | 仍是 timeline 的派生结果，不一定真是“主链” | 第一轮作为 timeline 索引可接受 |
| `reconstructed_timeline` | 完整重建过程链 | `deriveTimeline(chosenPathAtomIds, observationAtomIds)` | 中低 | 仍主要由现有 path 直接投影而来 | 第一轮可接受为 shell |
| `fidelity` | 与原始 Episode 主过程的匹配度 | `scoreFidelity(expected, majorChain)` | 低 | 更像“自洽分”，不是严格 replay fidelity | 只能做占位，不做强门控 |
| `created_at` | 创建时间 | `input.createdAt ?? nowIso()` | 高 | 无 | 保持 |
| `created_by` | 创建者 / 创建阶段 | `input.createdBy ?? "pipeline_s6"` | 中 | 阶段名已滞后于 v7 语义 | 建议尽快改成 `pipeline_s6_shell` 或 `pipeline_recordfix` |
| `supersedes` | 上一版重建对象 ID | 固定 `null` | 中 | 目前没有 version 链 | 第一轮可接受 |

---

## 3. 当前最关键的 5 个语义漂移点

### 3.1 `selectedMechanismIds` 其实不是机制类

这是当前最需要显式承认的问题。

按合同，`selectedMechanismIds` 应指向：

- `MechanismClass`

而当前实现中，这个字段常常来自：

- `chosenPathAtomIds`
- `observationAtomIds`

这两者最多只能算：

```text
mechanism proxies
```

不能算真正的 mechanism classes。

**建议**

第一轮实现里明确加注释或文档说明：

> `selectedMechanismIds` 当前为 `selectedMechanismProxyIds` 的兼容占位，真正 MechanismClass 待后续从 Pattern / compiled relations / replay 稳定提炼。

---

### 3.2 `traceId` 和 `derivation_chain_id` 现在有语义重叠

当前对象同时保留：

- `derivation_chain_id`
- `traceId`

但现阶段它们几乎总是同一来源的不同别名。

这会制造一个长期问题：

> 以后到底哪个才是主键绑定字段？

**建议**

- 对外 contract 优先对齐 `traceId`
- `derivation_chain_id` 暂作兼容字段
- 下一轮对象收束时选一个作为主键，另一个降为 alias

---

### 3.3 `ontology_snapshot_ref` 现在只是名义存在

当前默认值：

```text
ontology_current
```

它确实满足了“字段存在”，但还不满足“字段可复现”。

因为合同层真正想表达的是：

> 这次重建是基于哪版本体做出来的？

而现在代码表达的是：

> 我知道将来应该有这个字段，所以先放一个字面量。

**建议**

第一轮不要假装它已经有版本语义。

文档上应明确：

- 当前 `ontology_snapshot_ref` 仅为占位锚点
- 暂不代表真正可复现 ontology snapshot

---

### 3.4 `reconstructed_timeline` 现在更像 path 投影，不是真正 replay

当前 `deriveTimeline()` 的逻辑是：

- 有 `chosenPathAtomIds` 就优先用它
- 否则回退到 `observationAtomIds`
- 再根据 index / node name 猜 `kind`

所以它现在做的其实是：

```text
把现有链条格式化成重建时间线
```

而不是：

```text
依据 ontology + mechanism + episode initial conditions 重新生成过程
```

**建议**

把当前时间线命名理解成：

- `reconstructed_timeline_shell`

语义上不要过度承诺。

---

### 3.5 `fidelity` 现在不能直接喂给高风险 gate

当前 `scoreFidelity()` 的 expected 和 actual 本质都来自当前过程壳本身。

所以它更适合：

- 做调试参考
- 做对象完整性检查
- 做后续更强 fidelity 插件的占位

不适合直接做：

- `PromoteMechanism`
- `SplitClass`
- `MergeClass`

的高风险门控。

**建议**

第一轮的策略应该是：

```text
fidelity 可写
fidelity 可看
fidelity 不直接决定高风险本体升级
```

---

## 4. 当前 `recordFix()` 中 Reconstruction 的推荐拼装顺序

第一轮最稳的拼装顺序建议固定为：

### Step 1：确定 `episode_id`

来源：

- `input.storyId`

说明：

- 当前 `Episode` 仍然是 `Story` 的兼容壳，因此 `episode_id = storyId`

### Step 2：确定“重建期望链”

来源优先级：

1. `pathWithFix`
2. `storySnapshot.observationAtomIds`

说明：

- 这是当前阶段的“expected main chain”
- 它不是真正 ontology replay 的结果，而是重建壳的参考锚点

### Step 3：生成 `reconstructed_timeline`

规则：

- 先按期望链生成最小 timeline
- 第一步必须是 `initial_condition`
- 最后一步必须是 `outcome`
- 中间步骤在第一轮允许用启发式推断 `kind`

### Step 4：生成 `majorChain`

规则：

- 从 timeline 提取关键节点
- 第一轮允许直接由 `node_ref` 去重获得

### Step 5：绑定 trace / derivation

当前来源：

- `hypothesisId` 派生的 ID

说明：

- 第一轮允许先有 trace id，再补真 trace 对象

### Step 6：计算占位 fidelity

规则：

- 对 `expected main chain` 与 `majorChain` 做 `key_node_coverage`
- 结果仅作为占位 fidelity

### Step 7：写元数据

- `created_at`
- `created_by`
- `supersedes = null`

---

## 5. 当前实现下的推荐字段语义

为了避免团队内部误读，建议默认采用以下表述。

### 允许说

- 已有 `AcceptedReconstruction` 对象壳
- 已有最小 `reconstructed_timeline`
- 已有占位 `fidelity`
- 已有 Episode ↔ Reconstruction ↔ OntologyUpdate 的主绑定链

### 不要说

- 已完成 ontology-driven replay
- `selectedMechanismIds` 已经是 MechanismClass
- fidelity 已可作为最终北极星指标
- reconstruction 已经等价于可逆建模终态

---

## 6. 对下一轮实现最有价值的改动

如果只选 3 个最该继续收紧的点：

1. 把 `created_by: "pipeline_s6"` 改成更诚实的阶段标识
   - 例如 `pipeline_recordfix_shell`
2. 明确 `selectedMechanismIds` 当前是 proxy，而不是 class
3. 把 `traceId` / `derivation_chain_id` 的主次关系定下来

---

## 7. 一句话结论

第一轮 `AcceptedReconstruction` 的正确理解不是：

**“已经完成了重建。”**

而是：

**“已经把重建对象的主字段、绑定链和可审计外壳立起来了。”**
