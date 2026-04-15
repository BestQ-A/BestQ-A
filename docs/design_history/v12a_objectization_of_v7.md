# 递归式问答系统 v12a：v7 世界模型到对象化契约栈的落地桥

---

## 0. 一句定义

v7 的方向是对的，但粒度还不对。

更准确地说：

```text
v7 已经给出了正确的世界模型骨架
但它仍然把太多不同层级的语义
压在少数几个大对象里
```

因此，v12a 的任务不是改判 v7，而是把 v7 从“正确但过粗的总蓝图”，继续推进为“可审计、可落盘、可逐步闭合的对象化契约栈”。

一句话压缩：

> **v12a 不是发明新世界观，而是把 v7 的世界动力学主张，拆成一组可以逐桥实现的一等对象与合同边界。**

---

## 1. 为什么说 v7 在概念上正确、但不能作为单次跃迁直接实现

v7 已经正确指出，系统不能只停留在关系法律内核，而必须继续补齐：

- 世界本体层
- Episode 采样层
- 推理与证明层
- 本体演化层

这个判断没有问题。

问题在于，v7 把这些层第一次提出时，仍然主要停留在“总骨架对象”级别。

例如：

- `Episode` 同时承担了时间线容器、观测承接、动作记录、结果归档等多个职责
- “claim / proof space” 已经出现，但证据边、推导轨迹、接受结果之间尚未完全拆开
- `MechanismClass` 被要求既表达抽象机制，又隐含承担与具体 episode 绑定的职责
- 本体演化被要求发生，但“无更新也是一种结果”这件事尚未被彻底对象化

因此，v7 的困难不在于方向错误，而在于它试图把以下事情一次做完：

1. 定义世界动力学骨架
2. 定义 episode 轨迹语义
3. 定义重建与证明资产
4. 定义本体更新协议
5. 同时把这些对象接入现有代码主链

这在设计上可以一次写出来，在工程上却不能一次跳过去。

所以真正发生的演化不是：

```text
v6 → 一步到位的完整 v7
```

而是：

```text
v6 → v7 总蓝图
   → 若干桥接对象显式化
   → 若干专项合同独立立法
   → 主链先闭最小真链
   → 再逐步补齐剩余 frontier
```

这一步，就是 v12a 所要记录的“对象化”。

---

## 2. v12a 的核心判断：不是继续加大对象，而是继续拆职责

v12a 的总判断可以写成：

```text
v7 解决的是：世界模型必须有状态、有轨迹、有重建、有演化
v12a 解决的是：这些语义分别由哪些一等对象承接，彼此如何绑定，哪些已经闭合，哪些仍在前沿
```

因此，v12a 做的不是抽象升级，而是语义拆桥。

拆桥的标准只有一个：

> **凡是会在生命周期、审计责任、持久化形态、状态机或回溯路径上独立变化的东西，都不该继续混在同一个粗对象里。**

从这个标准出发，v7 的若干大块语义被继续拆为：

- Episode 系：`ObservationRecord` / `EpisodeEvent` / `ActionExecution` / `OutcomeRecord`
- 证明系：`SupportLink` / `DerivationTrace` / `AcceptedReconstruction`
- 演化系：`OntologyDelta`
- 机制桥系：`MechanismInstance`

---

## 3. 第一座桥：Episode 从“总经历对象”拆成可审计轨迹栈

v7 已经正确地把 `Episode` 提升为一等公民。

但如果 `Episode` 只是一个装着 observations / actions / outcomes 的大容器，那么系统仍然会混淆：

- 看到过什么
- 顺序上发生了什么
- 主动做过什么
- 最后如何收束

因此，当前对象化后的桥接不是“用一个更大的 Episode 替代旧 Story”，而是把 Episode 内部继续拆层。

### 3.1 `ObservationRecord`：把“看到了什么”从 Episode 中剥离出来

它承接的是 v7 中“经历是世界采样”的最小事实切片。

这里的关键变化不是字段增多，而是边界变硬：

- `ObservationRecord` 不再只是某次输入的附属文本
- 它必须显式归属某个 `Episode`
- 后续 `SupportLink`、`DerivationTrace`、`AcceptedReconstruction` 都必须能回溯到它

这意味着：

```text
Episode 不再直接等于 observation 集合
Episode 只是 observation 的轨迹容器
ObservationRecord 才是现象切片本身
```

就当前状态看，`ObservationRecord` 与 `episodeId` 的显式绑定已经进入主链，可视为这座桥的主体已闭合；但围绕它的证据边与更深审计仍未完全收束到 current 语义。

### 3.2 `EpisodeEvent`：把“按什么顺序发生”从自由叙述改成 append-only 时间轴

v7 要求 Episode 是轨迹，不是静态 note。

但“轨迹”如果没有一个轻量、统一、严格单调的事件轴，就仍然会退化成若干对象之间的松散引用。

因此引入 `EpisodeEvent` 的意义在于：

- 给 Episode 提供唯一时序权威轴
- 记录 observation / mechanism / reconstruction / ontology delta / outcome 的发生顺序
- 但不拿事件日志去替代高层对象自身语义

也就是说：

```text
EpisodeEvent 负责顺序
高层对象负责含义
```

这座桥目前已建立最小合同与事件存储语义，但整体仍处在 draft 阶段；它解决的是时间线存在性，不是完整状态演化闭环。

### 3.3 `ActionExecution`：把“做了什么动作”从建议层剥离为执行层对象

在 v7 的最初蓝图里，`ActionExecution` 已经被点名，但当时它仍主要是 Episode 内的一个字段性角色。

对象化之后，它被明确重新定位为：

```text
ExperimentDesign = should do
ActionExecution  = did do
new Episode      = what the world returned
```

它的作用不是解释世界，而是把干预真正接到世界反馈上。

截至当前文档栈，`ActionExecution` 已经转为 `current`，并且至少有一条 `ExperimentDesign → ActionExecution → new Episode` 的最小闭环样例已经跑通。这意味着 Episode 内“动作真的发生了”这条桥，已经从设想进入已闭合主链。

### 3.4 `OutcomeRecord`：把“最后怎样了”从 Episode 结果字段升级为独立反馈对象

v7 提出了 `OutcomeRecord`，但早期语义仍容易退化为 `Story.outcome` 一类尾字段。

对象化后的判断是：

- `ObservationRecord` 是局部观测
- `ActionExecution` 是动作执行
- `OutcomeRecord` 是对 episode 最终反馈的聚合判断

它回答的不是“某一刻看到了什么”，而是“这次执行或这次经历最后收束成什么结果”。

这条桥目前仍是 draft。

更具体地说：`OutcomeRecord` 作为独立对象的边界已经被写清，但显式持久化、与 `ActionExecution` 的强绑定、以及更深治理链仍属于 frontier，而不是已经完全闭合的 current 事实。

### 3.5 第一座桥的总结果

因此，v7 里的：

```text
Episode
```

在当前对象化栈里，不再单独承受整条经历语义，而是被拆成：

```text
Episode
  = 轨迹容器 / 归属壳
  + ObservationRecord   （看到了什么）
  + EpisodeEvent        （按什么顺序发生）
  + ActionExecution     （做了什么动作）
  + OutcomeRecord       （最后怎样收束）
```

这就是从“经历对象”到“经历契约栈”的第一步。

---

## 4. 第二座桥：claim / proof space 从松散推理结果拆成显式证明资产

v7 已经判断，系统不能只有 answer，必须有可回放的重建与证明。

但在总蓝图阶段，claim、evidence、proof、accepted result 仍然容易被混看成“同一坨推理副产物”。

对象化后的核心动作，就是把这坨东西拆成不同法律位置的对象。

### 4.1 `SupportLink`：把“观察对断言起什么作用”从间接关联提升为显式边

`ObservationRecord` 是现象本身。

但系统真正需要保存的，还包括：

- 这条 observation 支持哪条 claim
- 这条 observation 反驳哪条 claim
- 权重如何
- 这条证据边是谁给出的

因此 `SupportLink` 的意义，不是多加一层包装，而是明确：

```text
ObservationRecord = 现象
SupportLink       = 现象相对于某条 Claim 的证据角色
```

这条桥目前属于“基础链已成立，但还未完全 current 化”的状态。

可以明确说已成立的部分是：

- `SupportLink` 已有独立合同
- 其目标绑定关系已经明确写成 `ObservationRecord → Claim`
- `MechanismInstance` 与 `DerivationTrace` 都开始以它作为目标证据边

但必须保留限定：

- 显式持久化与查询层仍未完全闭合
- `support_link_refs` 的深审计仍在第二轮 frontier

### 4.2 `DerivationTrace`：把“怎么推出来的”从 proof 字段收束为独立轨迹对象

v6 已经把 proof trace 变成硬要求，v7 则要求接受结果能够回放。

对象化后的关键变化是：

- proof 不再只是某个 Claim 或 Hypothesis 的附属字段
- `DerivationTrace` 被看作独立的推导轨迹资产
- 它聚合 proof steps、support links、rejected claims

因此它回答的是：

```text
为什么这条链被推出来
```

而不是：

```text
这条链最后是否足够好地重建了 episode
```

后一件事属于 `AcceptedReconstruction`。

### 4.3 `AcceptedReconstruction`：把“当前接受哪条过程重建”从结论副产品升级为主资产

v7 的一句关键主张是：答案不是主资产，重建轨迹才是主资产。

对象化之后，这句话第一次有了稳定落点：`AcceptedReconstruction`。

它保存的不是“系统说了什么”，而是：

- 针对哪个 `Episode`
- 在哪版 ontology 下
- 选中了哪些机制
- 重建出的主链是什么
- fidelity 如何
- 它依赖哪条 `DerivationTrace`

因此：

```text
DerivationTrace        = 怎么推
AcceptedReconstruction = 推出来的过程与原 Episode 匹配得怎样
```

从主链状态看，`AcceptedReconstruction` 作为显式对象与必备输出，已经可视为闭合；但必须保留一个状态限定：其专项合同仍标记为 draft，说明其对象身份与主链位置已经成立，而围绕 replay 细节、版本治理与全面审计的语义仍未完全收官。

### 4.4 第二座桥的总结果

因此，v7 中较粗的：

```text
Claim / CandidatePath / proof / accepted result
```

在当前对象化栈中被拆成：

```text
SupportLink            （证据角色边）
DerivationTrace        （推导轨迹）
AcceptedReconstruction （被接受的过程重建）
```

这使得“证据是什么”“怎么推”“最终接受什么”第一次各有自己的对象边界，而不再挤在同一层语义里。

---

## 5. 第三座桥：Ontology Evolution 从“有时更新”改成“每次都必须表态”

v7 已经正确提出，本体演化不能是 compile 的副作用，必须有更高层协议。

但如果系统只在“有变更时”才写升级结果，那么未变更轮次就会成为语义黑洞：

- 是当前 ontology 已足够？
- 还是 episode 信息不足？
- 还是因为证据冲突而暂缓？

因此对象化的关键一步，是把“无更新”也立法成显式结果。

### 5.1 `OntologyDelta`：每个已完成 Episode 都必须产出一份本体立场

当前合同栈已经明确：

- 每个已完成 `Episode` 必须产生一个 `OntologyDelta`
- 若本轮不更新，也必须写成 `OntologyDelta(kind=none)`
- 并附 `no_update_reason` payload

这是一个非常关键的对象化动作，因为它把：

```text
没更新
```

从无记录状态，变成了可审计立场。

### 5.2 `kind=none` 的意义，不是保守，而是消除悬空态

`kind=none` 的意义不是“先偷懒不做”，而是强制系统回答：

- 当前 ontology 是否已经足够
- 这次 episode 是否证据不足
- 是否只是重复 episode
- 是否需要更多证据

所以 `kind=none` 的引入，标志着 v7 的本体演化层从“只有更新才显式”变成“每轮都必须表态”。

这实际上是本体层面的闭环化。

### 5.3 当前状态：输出义务已闭，回归门控仍属 frontier

关于 `OntologyDelta`，当前可以明确写成两句话：

1. 每个完成 episode 必须产出 `OntologyDelta`，且无更新时使用 `kind=none`，这条主链义务已经闭合。
2. 但 fidelity 回归检查、真实 replay 门控、以及 compile 完全声明化，仍然属于 draft 语义中的前沿部分。

因此这里不能写成“本体演化已经 fully current”。

更准确的表述是：

```text
OntologyDelta 作为必备对象已闭合
OntologyDelta 作为完整本体升级门控器仍未完全闭合
```

---

## 6. 第四座桥：MechanismClass 必须经 MechanismInstance 才能进入 Episode

v7 的最大工程难点之一，在于 `MechanismClass` 的双重拉扯。

一方面，它属于世界本体层，是抽象机制模板。

另一方面，重建一个具体 episode 时，系统又必须回答：

- 这次 episode 里到底是不是这个机制
- 如果是，它绑定到了哪些具体 observation / action / role
- 这个绑定是 candidate、accepted 还是 rejected

如果没有中间桥层，系统就只能在两种错误之间摇摆：

1. 把抽象 `MechanismClass` 直接硬贴到 episode 上
2. 继续用 path proxy、pattern proxy 之类过渡对象偷渡语义

所以对象化后的关键动作，是引入 `MechanismInstance`。

### 6.1 `MechanismInstance` 的本质：类与经历之间的实例裁决层

它的定义非常直接：

```text
MechanismClass   = 世界里可能存在怎样的机制
MechanismInstance = 在这次 Episode 里，这个机制怎样被具体绑定与裁决
```

因此它必须持有：

- `mechanism_class_ref`
- `episode_id`
- 具体 `bindings`
- `claim_ids`
- `support_link_refs`
- `status`

它不是额外包装，而是：

> **把抽象动力学模板，压入具体 episode 语义时所必须经过的实例层。**

### 6.2 为什么它是 v7 到当前栈之间最关键的桥

没有 `MechanismInstance` 时，以下链条是不完整的：

```text
MechanismClass → Episode → Reconstruction
```

因为这里缺了“具体绑定”这一步。

有了 `MechanismInstance` 之后，链条才变成：

```text
MechanismClass
  → MechanismInstance
  → AcceptedReconstruction
  → Episode
```

于是：

- 抽象类保持抽象
- 具体绑定有实例层承接
- 接受与拒绝也有显式状态机

这正是 v7 里“机制可回放”得以真正落地的桥。

### 6.3 当前状态：桥层已成立，但仍带过渡限定

按当前主链判断，`MechanismInstance` 这座桥已经可以视为主体闭合，因为：

- 上游合同已明确禁止 `MechanismClass` 直接跳到 `AcceptedReconstruction`
- 主链缺口表已把“MechanismClass → MI → Reconstruction”标记为已闭合

但这里仍然必须保留两个限定：

- 专项合同本身仍是 draft
- `source_kind=path_projection` 等过渡态仍被明确承认为临时桥，而非最终 current 语义

所以最准确的说法是：

```text
MechanismInstance 已经成为当前对象化栈的成立桥
但机制本体的多类化、晋升门控与完整 replay 语义仍在 frontier
```

---

## 7. 对象化之后，v7 的五层蓝图如何落到当前契约栈

如果把这次对象化压成一张图，可以写成：

```text
v7 总蓝图
  ├─ Episode 采样层
  │    ├─ ObservationRecord
  │    ├─ EpisodeEvent
  │    ├─ ActionExecution
  │    └─ OutcomeRecord
  │
  ├─ 推理与证明层
  │    ├─ SupportLink
  │    ├─ DerivationTrace
  │    └─ AcceptedReconstruction
  │
  ├─ 本体演化层
  │    └─ OntologyDelta(kind=none included)
  │
  └─ 世界本体层与 Episode 之间的桥
       └─ MechanismInstance
```

因此，所谓“对象化”，本质上就是把 v7 的层级主张变成一组可单独立法、单独审计、单独逐步闭合的合同对象。

这一步并没有离开 v7，反而是把 v7 真正变成工程可达形态。

---

## 8. 哪些部分已经进入 current 语义，哪些仍在 frontier

截至当前文档栈，更准确的状态判断如下。

### 8.1 已闭合或主链已成立的部分

- `ObservationRecord` 对 `episodeId` 的显式归属已经进入主链
- `AcceptedReconstruction` 作为显式对象与主流程输出，主链已成立
- `OntologyDelta` 作为每个完成 episode 的必备输出，且 `kind=none` 路径必须存在，这条义务已成立
- `MechanismInstance` 作为 `MechanismClass` 到 `Episode / Reconstruction` 的桥层，主链已成立
- `ActionExecution` 已转 `current`，最小执行闭环已跑通

### 8.2 仍处于 draft / frontier 的部分

- `SupportLink` 的显式持久化、查询层与第二轮 audit 仍未闭合
- `DerivationTrace` 虽然语义位置已明确，但仍属于 draft 契约面
- `OutcomeRecord` 仍在 draft，独立持久化与强绑定尚未完全落地
- `EpisodeEvent` 已有明确合同与时序轴语义，但整体仍为 draft
- `OntologyDelta` 的 replay / fidelity regression gate 仍未 fully current
- `MechanismClass` 本身作为真实动力学模板的多类本体化与晋升门控，仍是 frontier

### 8.3 一个必须保留的总限定

因此，当前不能把“对象化已经完成”说成一个无保留的完成时。

更准确地说：

> **对象化的主桥已经跨过去了，但若干桥头堡仍在施工。**

也就是说，当前系统已经不再依赖 v7 的粗粒度总对象来硬撑主语义，但其中一些专项合同仍处在从 draft 向 current 收束的过程中。

---

## 9. v12a 的设计判断

回头看，v7 的真正贡献，不是直接给出了最终对象表。

v7 的真正贡献是先把以下判断钉死：

- 世界模型必须有状态
- 经历必须有轨迹
- 解释必须能重建
- 本体必须能演化

而 v12a 的贡献则是把这些判断继续压成工程现实：

- 轨迹不再只靠 `Episode` 一词承接，而要拆成事件、观测、动作、结果
- 证明不再只靠 claim + proof 字段承接，而要拆成证据边、推导轨迹、接受重建
- 本体演化不再只在更新时才出现，而要每轮都显式表态
- 机制不再允许从类直接跳到具体经历，而必须经过实例层

因此，v12a 不是 v7 的替代品。

它更像是 v7 的工程化翻译层。

---

## 10. 对象化之后，下一个尚未跨越的边界是什么

对象化解决的是：

- 语义边界不再混住
- 主要对象开始可审计
- 主链开始具备最小闭环

但对象化之后，系统仍然还没有完全跨过下一个边界：

> **从“对象已经齐备”进入“对象之间的动态约束、回放门控、跨 episode 晋升法律真正全面自动执行”的边界。**

换句话说，下一道尚未完全跨越的边界，不再是“有没有这些对象”，而是：

```text
这些对象是否已经被真正纳入统一的 replay、regression、promotion、audit 治理闭环
```

更具体地说，下一步 frontier 不再是继续发明新名词，而是继续把以下东西做硬：

- `MechanismClass` 的真实动力学模板化与晋升门控
- `SupportLink` / `DerivationTrace` / `OutcomeRecord` 的全面持久化与深审计
- `StateSnapshot` / `Transition` 的真正落地
- `OntologyDelta` 的 replay 与 fidelity regression gate 完整接管本体升级

因此，v12a 之后的下一条边界，不是概念边界，而是治理边界。

一句话收束：

> **v12a 完成的是对象化；对象化之后，下一个尚未跨越的边界，是把这套对象化契约栈真正变成统一受 replay 与 regression 法律约束的动态治理系统。**
