# 递归式问答 (Recursive Q&A) 系统设计 v1

## 1. 核心理念 (Core Philosophy)

系统的核心是将"复杂的知识"结构化为一颗"递归的任务树"。
**本质**：所有的复杂能力（High-level Capability）都是由更简单的能力（Low-level Skills）组合而成的。

- **Q (Question/Goal)**: 代表"想要达成什么目的"或"如何解决什么问题"。
- **A (Answer/Strategy)**: 代表"如何做"。高层的 A 不是直接的代码，而是对问题的**分解 (Decomposition)**。
- **Leaf Node (Atomic Task)**: 当分解到足够细粒度，A 变成具体的、熟悉的、原子的操作（如几行代码、一个 API 调用、一个具体的数学公式）。

## 2. 数据结构设计 (Data Structure)

我们需要一种图/树结构来存储这些 Q&A。

### 2.1 核心节点 (QA Node)

```json
{
  "qa_id": "qa_001",
  "type": "composite", // composite (组合式) | atomic (原子式)

  // Q: 问题/目标定义
  "question": {
    "title": "如何实现高并发下的库存扣减？",
    "intent": "high_concurrency_inventory_deduction",
    "parameters": ["sku_id", "quantity", "user_id"],
    "constraints": ["no_oversell", "low_latency"]
  },

  // A: 答案/策略
  "answer": {
    "summary": "使用 Redis Lua 脚本进行预扣减，数据库异步兜底。",

    // 如果是 composite，则分解为子步骤 (Sub-Questions)
    "decomposition": [
      {
        "step_id": 1,
        "description": "在 Redis 中执行 Lua 脚本原子扣减",
        "ref_qa_id": "qa_redis_lua_deduct" // 指向更底层的 Q&A
      },
      {
        "step_id": 2,
        "description": "发送消息到 MQ 记录订单",
        "ref_qa_id": "qa_mq_send"
      }
    ],

    // 如果是 atomic，则直接包含实现 (Implementation)
    "implementation": {
      "language": "python",
      "code": "r.eval(lua_script, 1, key, val)"
    }
  },

  // V: 验证/示例 (Verification)
  "verification": {
    "examples": [
      {
        "input": { "sku_id": "123", "quantity": 1 },
        "expected_output": true,
        "context": "redis_available"
      }
    ],
    "test_case_ref": "tests/inventory/test_high_concurrency.py"
  }
}
```

## 3. 系统架构 (Architecture)

```mermaid
graph TD
    UserGoal[用户目标: "我想做X"] --> |匹配/搜索| RootQA[Root Q&A: 如何做X?]

    RootQA --> |Decompose| Step1[Step 1: 如何做A?]
    RootQA --> |Decompose| Step2[Step 2: 如何做B?]

    Step1 --> |Decompose| SubStep1[SubStep 1.1: 原子操作]
    Step1 --> |Decompose| SubStep2[SubStep 1.2: 原子操作]

    Step2 --> |Atomic| Code[代码/工具调用]

    style RootQA fill:#f9f,stroke:#333
    style Step1 fill:#bbf,stroke:#333
    style Code fill:#bfb,stroke:#333
```

### 3.1 知识库分层

1.  **L1 - 战略层 (Strategy Layer)**:
    - 处理极高层问题，如架构设计、业务流程。
    - A 通常是流程图或步骤列表。
2.  **L2 - 战术层 (Tactic Layer)**:
    - 处理具体技术方案，如"如何解析 JSON"、"如何连接数据库"。
    - A 可能是设计模式或算法选择。
3.  **L3 - 执行层 (Execution Layer)**:
    - Leaf Nodes。
    - 具体的代码片段、CLI 命令、工具调用。

## 4. 验证机制 (Verification Context)

为了保证 Q&A 的质量，每个节点必须是"可验证的"（Verifiable）。

- **原子节点验证**：拥有具体的单元测试 (Unit Test) 或断言 (Assertion)。
- **组合节点验证**：验证所有子步骤按顺序执行后，是否达到了最终的高层目标（集成测试）。

**文档结构建议**:
在 `docs/` 下可以维护一个 `knowledge_base/` 目录，按照领域分类存储这些 JSON/Markdown 定义，或者使用向量数据库存储。

## 5. 与 Causal Learner (现有项目) 的结合

当前的 BestQ-A 项目包含 Causal Learner（因果学习）。Recursive QA 可以与之形成完美互补：

- **Causal Learner (Why)**: 当系统遇到未知错误（Event），Causal Learner 分析"为什么会出错"，归纳出因果规则。
- **Recursive QA (How)**: 当系统试图解决问题时，Recursive QA 提供"如何做"。
- **闭环 (Loop)**:
  1.  Recursive QA 执行任务。
  2.  如果失败，产生的 Error 被 Causal Learner 捕获。
  3.  Causal Learner 分析出原因（例如：Token 过期）。
  4.  系统生成一个新的 Q&A："如何解决 Token 过期？"，并将其插入到 Recursive QA 库中。
