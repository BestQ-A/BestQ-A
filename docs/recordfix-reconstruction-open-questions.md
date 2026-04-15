# recordFix / Reconstruction / OntologyDelta 实现级未决问题

> 目的：承接当前 `v7` 目标态合同与已经落地到 `causal-learner/mcp-server/src/core/` 的第一轮实现。
> 本文不是新合同，也不是纯计划，而是**实现级自我批判文档**：把当前已经做出来的壳与尚未稳定的语义分开，避免后续实现时把“临时可跑”误当成“语义已定”。

---

## 0. 为什么这份文档存在

当前工作区已经不是“还没实现 v7 对象”的状态了。

现在的真实状态是：

- `story.ts` 已增加 `Episode` 兼容壳
- `reconstruction.ts` 已新增 `AcceptedReconstruction`
- `ontology-delta.ts` 已新增 `OntologyDelta` / `NoUpdateReason`
- `pipeline.recordFix()` 已经开始同时产出这三类对象

也正因为如此，风险变了：

> 现在最危险的不是“没做出来”，而是“先做出了壳，但还没把语义边界钉死”。

这份文档的任务就是把这些边界钉出来。

---

## 1. 当前已实现到什么程度

### 1.1 已落地对象

#### `Episode` 兼容壳

位置：

- `causal-learner/mcp-server/src/core/story.ts`

当前形态：

- `episodeId = story.id`
- `initialConditions = { observationAtomIds, context }`
- `acceptedReconstructionId?`
- `ontologyDeltaId?`

#### `AcceptedReconstruction`

位置：

- `causal-learner/mcp-server/src/core/reconstruction.ts`

当前形态已经包含：

- `episode_id`
- `selectedMechanismIds`
- `ontology_snapshot_ref`
- `derivation_chain_id`
- `traceId`
- `majorChain`
- `reconstructed_timeline`
- `fidelity`

#### `OntologyDelta / NoUpdateReason`

位置：

- `causal-learner/mcp-server/src/core/ontology-delta.ts`

当前形态已经包含：

- `episode_id`
- `reconstruction_id`
- `claim_ids`
- `kind`
- `changes`
- `fidelity_regression_check`
- `NoUpdateReason.reason_kind`

#### `recordFix()` 主流程已开始双层输出

位置：

- `causal-learner/mcp-server/src/core/pipeline.ts`

当前已经做到：

- compile 前后仍沿用原有 Story / Hypothesis / Evidence 主逻辑
- compile 后创建 `AcceptedReconstruction`
- 结束前生成 `OntologyDelta` 或 `NoUpdateReason`

---

## 2. 当前实现最需要警惕的 7 个问题

### 2.1 Reconstruction 现在还是“结构化壳”，还不是“真正重建”

当前 `createAcceptedReconstruction()` 的主要来源仍然是：

- `chosenPathAtomIds`
- `observationAtomIds`

而不是：

- `Episode.initialConditions`
- 当前 `Ontology`
- `MechanismClass`
- replay engine

这说明当前实现更接近：

```text
把现有路径结构化并补上 timeline/fidelity 外壳
```

而不是：

```text
给定初始条件 + 当前本体
重新生成主要过程
```

**结论**：

- 当前对象名可以保留
- 但语义上必须明确它仍是 `reconstruction shell / scaffold`
- 不能误报为“已经完成 ontology-driven replay”

---

### 2.2 Fidelity 现在偏自洽，不足以证明重建成功

当前 fidelity 来自：

- expected = `chosenPathAtomIds` 或 `observationAtomIds`
- actual = `majorChain`

但 `majorChain` 又是从当前构造出的 `reconstructed_timeline` 直接提取出来的。

这导致一个风险：

> fidelity 现在更像“当前 reconstruction 壳对自己的一致性评分”，而不是“它与原始 Episode 主过程的匹配度”。

**结论**：

- 现在的 fidelity 适合做占位指标
- 不适合在当前阶段作为强门控依据
- 特别不适合立刻支撑高风险的 `PromoteMechanism / SplitClass / MergeClass`

---

### 2.3 `selectedMechanismIds` 目前仍像 path 代理，不是真正的 MechanismClass

当前 `selectedMechanismIds` 在很多路径上来自：

- `chosenPathAtomIds`
- 或 `observationAtomIds`

这在第一轮实现里是可以接受的技术代理，但语义上要非常小心：

> Atom path 不是 MechanismClass。

如果不明确这一点，后续很容易把：

- “一次选中的路径”

偷换成：

- “已经存在的机制类”

**结论**：

- 当前 `selectedMechanismIds` 只能视为 mechanism proxy ids
- 真正的 `MechanismClass` 晋升必须后置

---

### 2.4 `recordFix()` 里现在已经混了四条语义轴

当前 `recordFix()` 同时在做：

1. 修复执行 / fix atom 写入
2. hypothesis validate / canPromote
3. compile + evidence record
4. reconstruction + ontology update

这四轴并不天然同涨同跌。

最典型的情况：

- 修复动作执行了，但 compile 没过
- compile 没过，但仍然可以生成一个弱 reconstruction
- reconstruction 生成了，但 ontology update 只能是 `NoUpdateReason`

如果这些轴不分开，未来最容易出现：

- 调用方只能看到“成功/失败”
- 但不知道到底是哪一层失败

**结论**：

未来 `FixResult` 的语义必须保持多轴，而不是重新折叠成单一状态。

---

### 2.5 `OntologyDelta.applied_at` 现在可能过早填充

当前实现中，`createOntologyDelta()` 在 `changes.length > 0` 时就直接写 `applied_at`。

但按合同语义：

> `applied_at` 应该意味着：回归检查已经通过，并且 delta 被允许提交到稳定本体。

而现在：

- `fidelity_regression_check` 还是占位
- 真正 replay all historical episodes 还没做

所以这里有潜在语义漂移：

> 现在的 `applied_at` 更像“本轮生成了一个 delta 对象”，而不是“它真的通过了世界模型更新门控”。

**结论**：

- 第一轮实现里更稳的语义应是：
  - `created_at` = 对象生成时间
  - `applied_at` = 先保持 `null`
- 等真实 gate 做完，再启用 `applied_at`

---

### 2.6 `NoUpdateReason` 已存在，但 Episode 侧绑定还不完整

当前 `Episode` 上只有：

- `ontologyDeltaId?`

但 `NoUpdateReason` 本身没有 `id`。

这会导致一个长期问题：

> “本次没有更新”的结构化结果存在了，但 Episode 侧无法像 reconstruction 一样稳定引用它。

**结论**：

- 长期要么给 `NoUpdateReason` 自己一个 id
- 要么统一把 `OntologyDelta(kind=none)` 作为唯一持久对象，`NoUpdateReason` 成为其 payload

否则会出现：

- delta 能绑定
- no-update 不能绑定

的非对称状态。

---

### 2.7 `Episode` 目前只有 envelope，没有 timeline

当前 `Episode` 的最大价值本应是：

- 从 bag-of-fields 升级成 timeline-bearing instance

但现在它还只是：

- `Story + initialConditions + 2 个绑定 ID`

这作为第一轮很合理，但也必须明确：

> 现在还没有真正的 `Episode timeline / transitions / state snapshots`。

否则后续会误以为 Episode 问题已经解决了。

---

## 3. `recordFix` 推荐真值表（Truth Table）

下面这张表是当前最值得钉死的实现语义。

| 路径输入 | canPromote | compile 结果 | Reconstruction | Ontology 更新 | Story / Episode 结果 |
|---|---|---|---|---|---|
| 无 `chosenPathAtomIds` | N/A | 不执行 | 允许生成弱 reconstruction（基于 observation） | `NoUpdateReason` | `success` 或 `partial`，取决于调用语义 |
| 有路径，但 `canPromote` 不通过 | 否 | 不执行 | 生成 reconstruction shell | `NoUpdateReason(reason=pending_more_evidence 或 episode_inconclusive)` | `partial` |
| 有路径，canPromote 通过，但 compile 写入 0 条 | 是 | 失败 / 空写入 | 生成 reconstruction shell | `NoUpdateReason` | `partial` |
| 有路径，compile 成功 | 是 | 成功 | 生成 accepted reconstruction | 生成 delta 或 none | `success` |

### 关键解释

#### 3.1 Reconstruction 不应只在 compile 成功时存在

否则 `NoUpdateReason.reconstruction_id` 这条合同语义无法成立。

因此：

- compile 成功 → accepted reconstruction
- compile 失败 / 未执行 → reconstruction shell 或 draft reconstruction

#### 3.2 `success` 不等于 Ontology 已更新

一个更合理的语义是：

- `execution success`
- `reconstruction ready`
- `ontology update applied / blocked / none`

分开表达。

---

## 4. 推荐的第一轮边界纪律

为了避免第一轮把边界做歪，建议强制遵守以下纪律。

### 4.1 Reconstruction 只解决“对象存在 + 最小可审计”

第一轮必须做到：

- 有对象
- 有 timeline
- 有 fidelity
- 有 trace / derivation 绑定

第一轮暂时不解决：

- 完整 Ontology replay
- 完整 latent phase 推演
- 全历史 fidelity gate

### 4.2 OntologyDelta 只允许低风险动作

第一轮建议仅允许：

- `strengthen_relation`
- `weaken_relation`
- `reject_claim`
- `none`

暂缓：

- `promote_mechanism`
- `split_class`
- `merge_class`
- `deprecate_relation`
- `register_pattern`

### 4.3 `Story` 不要被急着抹掉

第一轮原则：

- `Story` 保留
- `Episode` 只是兼容壳
- 先建立绑定关系，再逐步替代语义

---

## 5. 建议的下一批文档 / 代码动作

### 文档层

1. 更新 `v7-implementation-plan`
   - 明确 reconstruction shell / accepted reconstruction 区分
2. 更新 `v7-world-model-contract`
   - 明确第一轮实现允许 `ReconstructionDraft`
3. 新增一条 `NoUpdateReason` 身份策略裁决
   - 是独立对象，还是 `OntologyDelta(kind=none)` 的 payload

### 代码层

1. 收紧 `createOntologyDelta()`
   - 第一轮默认 `applied_at = null`
2. 让 reconstruction 明确区分状态
   - `accepted` / `draft`
3. 给 `NoUpdateReason` 引入稳定身份方案
4. 在 `Episode` 中逐步引入 timeline events，而不是只放两个绑定 id

---

## 6. 一句话结论

当前实现已经跨过了“完全没有 v7 对象”的阶段，但还处在：

**对象壳已出现，语义边界仍需继续收紧**

的阶段。

所以接下来的优先级不是“赶快加更多功能”，而是：

**先把 `recordFix → Reconstruction → OntologyDelta` 这条链的失败语义、绑定语义、门控语义钉死。**
