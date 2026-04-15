---
kind: record
event: "2026-04-14 mechanism program milestone review"
recorded_at: 2026-04-14
immutable: true
---

# MechanismProgram 阶段性评审（2026-04-14）

> 记录 `96b595d` 完成后的阶段判断。  
> 目的不是定义新合同，而是确认：当前主线是否可以从“机制模板”正式转入“生成式机制”阶段。

---

## 1. 里程碑判断

`MechanismProgram` 这轮不是“又多了一个对象”，而是第一次让机制侧拥有了明确的中层程序载体。

当前已经形成的机制侧链路是：

```text
MechanismClass
  → MechanismProgram
  → MechanismInstance
  → AcceptedReconstruction
```

这里最关键的变化是：

> 机制不再只能被理解成“关系模板”或“path proxy 的解释壳”，而开始被显式表达为可持久化、可被引用的程序对象。

这对长期上限的价值很高，因为后续：

- 反事实
- 实验设计
- 失败边界
- 有效域验证

都需要站在“机制是程序，而不是标签”的前提之上。

---

## 2. 当前主线状态

截至当前，v7 主线中已经较稳定的对象链是：

```text
ObservationModel
  → ObservationRecord
  → SupportLink
  → Claim
  → MechanismProgram
  → MechanismInstance
  → AcceptedReconstruction
  → DerivationTrace
  → OntologyDelta
```

这意味着：

### 已基本站稳的层

- 观测模型
- 观测记录
- 证据边
- 判断对象
- 机制程序对象
- 机制实例桥
- 重建对象
- 推导链对象
- 本体更新对象

### 仍处于过渡态的层

- `MechanismClass` 仍然带 `proxy:*` 过渡引用
- `MechanismProgram` 目前只是“可持久化程序对象”，还不是“可执行程序引擎”
- `CounterfactualScenario / ExperimentDesign` 仍不应现在主线化

---

## 3. 为什么现在应该转去“生成未来”而不是继续补对象壳

到这一步，继续优先补：

- 新的持久化壳
- 新的桥字段
- 更多 event 类型

边际收益已经开始下降。

因为：

1. 观测侧已经有上游模型
2. 机制侧已经有程序对象
3. 证据链已经有显式边

所以系统第一次具备了一个关键前提：

> 不只是“解释过去”，而是开始有可能“生成另一条可能的未来轨迹”。

这正是 `v8` 的入口。

---

## 4. 现在最应该避免的错误

### 4.1 不要把 `MechanismProgram` 当成 `MechanismClass` 的别名

当前它刚成立，最危险的回退是：

- 名义上有 `MechanismProgram`
- 实际上继续只把它当“多几个字段的 class 壳”

必须继续坚持：

```text
MechanismClass = 机制是什么
MechanismProgram = 机制如何运行
```

### 4.2 不要急着把 `proxy:*` 全部去掉

现在虽然已经有程序对象，但：

- `MechanismClass` 本体侧还没真正落稳

如果现在急着去 proxy 化，很容易把“程序对象初步成立”的收益，又拖回去解决旧本体问题。

### 4.3 不要现在就上 v11 的高层叙事

当前最危险的诱惑是：

- 既然已经有 ObservationModel 和 MechanismProgram，就想直接做
  - FailureBoundary
  - Civilization Memory
  - Constitutional compile

这个顺序是错的。

因为现在真正的下一步不是文明层，而是：

**反事实和实验设计层。**

---

## 5. 下一步最值的对象

如果继续按“以终为始”的主线推进，下一步最值的是：

## `CounterfactualScenario`

理由：

1. 观测侧已经能回答“看到了什么”
2. 机制侧已经能回答“机制如何运行”
3. 下一步自然就该回答：

```text
如果改一个条件，会发生什么？
```

也就是说，`CounterfactualScenario` 不是现在的越级扩展，而是：

**MechanismProgram 成立之后，最自然的下一层。**

---

## 6. 推荐主线顺序

接下来的顺序我建议明确成：

```text
ObservationModel（已成立）
  → MechanismProgram（已成立）
  → CounterfactualScenario（下一步）
  → ExperimentDesign
  → FailureBoundary / Civilization Memory（远期）
```

这条顺序的关键点在于：

- 先从“世界如何被看到”走到“机制如何运行”
- 再从“机制如何运行”走到“如果条件不同会怎样”
- 最后才去谈“文明如何长期保存失败边界和求真制度”

---

## 7. 一句话结论

**机制侧已经第一次站稳，现在主线应转入 v8 的真正入口：从程序化机制推进到反事实场景。**
