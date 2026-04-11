# 递归式问答 (Recursive Q&A) 系统设计 v3: 语义接龙引擎

## 1. 核心隐喻：语义接龙 (Semantic Solitaire)

系统的核心不再仅仅是"存储"，而是一个动态的**思考过程**。
我们把解决问题看作一次**"语义接龙"**：从用户具体的"需求描述"，一步步接龙到库里已有的"抽象问题类"，再接龙到标准的"拆解树"。

**核心流程**:
`Raw Requirement` -> `Abstract Problem Class` -> `Global Contextualization` -> `Decomposition Retrieval`

---

## 2. 思考协议 (The Thinking Protocol)

当系统接收到一个需求时，它必须严格执行以下心理动作：

### 步骤 1: 语义归类 (Semantic Classification)

**动作**: "这个需求其实是在问一个关于什么类的问题？"

- _Input_: "我的网站加载图片很慢，经常 404。"
- _Thinking_: 这不是一个关于"图片"的问题，这是一个关于 **[Web Resource Loading] (PC_001)** 和 **[Latency Optimization] (PC_002)** 的问题。
- _Output_: `Problem Class Candidate: PC_001_Resource_Loading`

### 步骤 2: 全局上下文重构 (Global Contextualization)

**动作**: "在更全局的视角下，这个问题在这个特定的约束条件下，应该如何描述？"

- _Thinking_: 仅仅说"加载慢"是不够的。在这个项目里，全局约束是"我们是在 Next.js 框架下"且"图片托管在 AWS S3"。
- _Refined Question_: "在 [Constraints: Next.js + S3] 的条件下，如何实现 [Goal: Low Latency & High Availability] 的 [Target: Static Asset Loading]？"
- _Output_: `Contextualized Query Vector`

### 步骤 3: 结构检索 (Structural Retrieval)

**动作**: "对于这类问题，QA 库里有没有现成的拆解树？"

- _Action_: 在 QA DB 中检索与 `PC_001_Resource_Loading` 匹配的记录。
- _Result_: 找到一个标准模版 (Archetype)。

### 步骤 4: 树状拆解 (Tree Decomposition)

**动作**: "将检索到的标准树实例化。"

- _Standard Tree_:
  - Root: Optimize Loading
    - Branch A: Check Network (DNS/CDN)
    - Branch B: Check Resource Existence (404)
    - Branch C: Check Cache Policy
- _Instantiated Tree_:
  - Root: 优化我的图片加载
    - Task 1: 检查 CloudFront 配置 (映射自 Branch A)
    - Task 2: 验证 S3 Bucket 权限 (映射自 Branch B)

---

## 3. 数据结构演进

### 3.1 抽象问题类 (The "Tag")

这不仅仅是分类标签，而是带有语义的"锚点"。

```yaml
class_id: "PC_Resource_Loading"
description: "任何涉及客户端从服务端获取资源失败或延迟的问题"
global_context_model:
  constraints: ["network_condition", "server_type", "client_type"]
  goals: ["availability", "latency", "consistency"]

# 标准拆解树 (The Archetype Tree)
archetype_tree:
  - node: "Connectivity Check"
    why: "首先排除网络通路问题"
  - node: "Auth/Permission Check"
    why: "其次排除资源存在性与权限"
  - node: "Performance Tuning"
    why: "最后优化传输效率"
```

---

## 4. 系统的价值

1.  **避免重复造轮子**: 当用户问 "我的 API 慢" 时，系统通过"语义接龙"直接定位到 `PC_Latency_Diagnosis`，并立即拿出一套标准的排查方案（DB 索引 -> 网络 -> 代码逻辑），而不是每次都瞎猜。
2.  **强制升维**: 系统强迫用户（或系统自己）去思考"约束条件"和"全局目标"，而不是陷在细节里。
3.  **知识沉淀**: 所谓的 Causal 学习，就是不断优化 `archetype_tree` 的过程。如果我们发现 "API 慢" 经常是因为 "Token 过期" 导致的（一个新的 Cause），我们就把这个分支加到 `PC_Latency_Diagnosis` 的标准树里。

## 5. 交互界面想象

```text
User: "我这报错了，说连不上数据库。"

Agent (Semantic Chain):
1. [Classify]: 这是一个 `PC_Database_Connectivity` 类问题。
2. [Context]: 你的环境是 `K8s Cluster`，数据库是 `External RDS`。
3. [Retrieve]: 检索到标准拆解树 `Tree_DB_Conn_K8s`.
4. [Decompose]:
   - 检查 Security Group (from Tree Node 1)
   - 检查 Connection String (from Tree Node 2)
   - 检查 DNS 解析 (from Tree Node 3)

Agent: "已按标准流程拆解为 3 个步骤，正在执行步骤 1..."
```
