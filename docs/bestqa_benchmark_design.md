# BestQA-Bench: SWE-bench 集成方案 (v3)

## 1. 核心策略: 原生集成 (Native Integration)

为了"不重复造轮子"，我们直接利用 `claudecode-swebench-mcp` 现有的 Harness。
我们只需修改 **Prompt Injection** 逻辑，将 BestQA 的"思考结果"注入到 Agent 的 Context 中。

## 2. 架构图

```mermaid
graph LR
    Harness[SWE-bench Harness] --> |Instance| PromptFormatter
    PromptFormatter --> |get_mcp_context| LogicAdapter[Logic Adapter]

    LogicAdapter --> |Existing| CausalClient[Causal Learner (Why)]
    LogicAdapter --> |New| BestQAClient[BestQA Logic (How)]

    BestQAClient --> |Scan| KB[docs/knowledge_base/composites]
    BestQAClient --> |Retrieve| Tree[Standard Solution Tree]

    LogicAdapter --> |Combined Context| AgentPrompt
```

## 3. 代码修改点

### 3.1 新增模块: `utils/bestqa_client.py`

负责实现 BestQA 的"语义接龙"逻辑 (Lite 版)。

- **Function**: `find_best_match(problem_statement)`
- **Logic**:
  1.  扫描 `docs/knowledge_base/composites/**/*.md`。
  2.  提取 Frontmatter 中的 `problem_class` 和 `desc`。
  3.  (Prototype) 使用简单的 Keyword Matching 计算匹配度。
  4.  返回最匹配的 Markdown 内容。

### 3.2 修改模块: `utils/mcp_knowledge.py`

修改 `get_mcp_context` 函数：

```python
def get_mcp_context(issue, db_path=None):
    context_parts = []

    # 1. 保留原有的 Causal Suggestion (Why)
    causal_context = get_causal_context(issue)
    if causal_context:
        context_parts.append(causal_context)

    # 2. 新增 BestQA Suggestion (How)
    bestqa_tree = BestQAClient().get_solution_tree(issue['problem_statement'])
    if bestqa_tree:
        context_parts.append(f"## Recommended Solution Plan (BestQA)\n{bestqa_tree}")

    return "\n\n".join(context_parts)
```

## 4. 验证计划

1.  **Step 1**: 实现 `utils/bestqa_client.py`。
2.  **Step 2**: 修改 `utils/mcp_knowledge.py`。
3.  **Step 3**: 运行 Standard SWE-bench Lite (e.g., `princeton-nlp/SWE-bench_Lite`) 的一个子集。
4.  **Check**: 观察产生的 Log，确认 Prompt 中是否包含了我们的 Tree，以及 Agent 是否跟随了 Tree 的指引。
