# 知识源策略

## 核心原则

BestQ-A 的知识不从"权威数据库"导入，而从 **Episode 采样 → 机制抽象 → 本体升级** 闭环中生长。

```text
知识源 = Episode 采样，不是静态导入
知识质量 = 重建保真度，不是来源权威性
```

---

## 知识生长路径

### 路径 1: Episode 驱动（主路径）

```text
真实问题 → 观察 → Episode 记录 → 机制抽象 → MechanismClass 提名
→ 多 Episode 验证 → Compile 晋升 → 进入稳定本体
```

这是系统的主知识源。每条稳定知识都必须可追溯到具体 Episode。

### 路径 2: 反事实探测（v8 路径，部分可用）

```text
已有机制 → 识别不确定边界 → 设计反事实场景
→ 预测轨迹 → 与实际对比 → 更新机制置信度
```

当前状态：可以记录反事实场景和预测误差，但自动闭环未实现。

### 路径 3: 外部知识注入（受控入口）

```text
外部知识 → 转化为 Observation → 经过正常 Episode 流程
→ 不允许直接写入 compiled 世界模型
```

核心约束：

- 外部知识必须经过 Episode 流程，不能直接注入
- 外部知识的 `RefForce` 初始为 `candidate`，不能为 `compiled`
- 必须经过 `ReviewDecision` 门控才能晋升

---

## 知识质量分级

| 级别 | 条件 | RefForce |
|------|------|----------|
| compiled | 多 Episode 验证 + replay 一致 + 无高强度反例 | `compiled` |
| candidate | 有支持 Episode 但验证不足 | `candidate` |
| hypothesis | 仅有推测，无 Episode 支持 | `hypothesis` |
| deprecated | 被更强机制替代或反例推翻 | `deprecated` |

---

## 禁止的知识源模式

### 禁止 1: 权威注入

```text
"因为教科书这么说" → 直接写入 compiled
```

不允许。教科书内容必须转化为 Observation，经过 Episode 流程。

### 禁止 2: 多数投票

```text
"3 个 agent 说是，1 个说不是" → 多数获胜
```

不允许。知识质量由推导链和重建保真度决定，不由投票数决定。

### 禁止 3: 隐式假设

```text
"大家都知道 X 导致 Y" → 不记录推导链
```

不允许。A1 公理要求每条因果关系都有显式推导链。

---

## 参考

- [[epistemic-axioms]]：认识论公理（特别是 A1 和 A2）
- [[trace-and-fidelity-axioms]]：追踪保真度约束
- [[epistemic-open-questions]]：当前开放问题
