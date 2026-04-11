# BestQA MCP Server 实现与验证计划

## 1. 目标

构建一个符合 `search-and-retrieve` 范式的 MCP Server，作为 BestQA 的"大脑"。

- **实现**: 让 AI 能通过工具调用，访问 `docs/knowledge_base` 中的 Atoms 和 Composites。
- **验证**: 建立一个"模拟演练"流程，通过实际提问来验证系统的"语义接龙"能力，并在验证中完善知识库。

## 2. MCP Server 实现方案 (Python FastMCP)

我们将使用 `mcp` Python SDK (FastMCP) 构建一个轻量级服务。

### 2.1 核心组件

文件位置: `bestqa_mcp/server.py`

#### 工具 1: `search_problem_class`

- **Input**: `query` (e.g., "Web latency issues")
- **Logic**:
  - 扫描 `docs/knowledge_base/composites/` 下所有的 Problem Class 定义。
  - (Simple) 使用文件名和 `desc` 字段进行模糊匹配。
  - (Advanced) 未来可接向量搜索。
- **Output**: 匹配到的 Problem Classes 列表 (ID, Desc, MatchScore)。

#### 工具 2: `get_decomposition_tree`

- **Input**: `tree_id` (e.g., "tree_diagnose_network_latency")
- **Logic**: 读取对应的 `.md` 文件内容。
- **Output**: Markdown 内容（包含 Atoms 引用）。

#### 工具 3: `get_atom`

- **Input**: `atom_id` (e.g., "atom_check_tcp_port")
- **Logic**: 读取 `docs/knowledge_base/atoms/` 下的对应文件。
- **Output**: Atom 的具体实现代码和说明。

#### 工具 4: `submit_observation` (For Causal Loop)

- **Input**: `observation` (JSON)
- **Logic**: 将未知错误记录到 `pending_events` (mock/file-based)。

## 3. 验证与完善闭环 (Verification Loop)

如何验证这个系统？我们使用 **"模拟演练" (Simulation)**。

### 3.1 验证脚本 (`scripts/verify_scenario.py`)

编写一个脚本，模拟一个 Agent 试图解决问题的过程。

**Scenario: "Diagnose Slow API"**

1.  **Step 1 (Agent)**: 调用 `search_problem_class(query="API response is slow")`
    - _Check_: 是否返回了 `tree_diagnose_network_latency`?
    - _Refinement_: 如果没返回，说明 `desc` 写得不好，或者缺了 Keywords -> **修改 Markdown**。
2.  **Step 2 (Agent)**: 调用 `get_decomposition_tree(tree_id="...")`
    - _Check_: 返回的树结构是否合理？是否包含必要的 Atoms？
    - _Refinement_: 如果发现缺了 "Check Load Balancer"，-> **修改 Markdown，增加 Step**。
3.  **Step 3 (Agent)**: 模拟执行。
    - _Check_: Atom 的代码 (`get_atom`) 能跑通吗？
    - _Refinement_: 如果 Atom 代码报错 -> **修改 Atom Markdown**。

### 3.2 完善流程

在验证过程中，我们实际上是在**完善 Knowledge Base**。
**Verification IS Authoring.**

## 4. 执行步骤

1.  [ ] 创建 `bestqa_mcp/` 目录和 `requirements.txt` (mcp, uv)。
2.  [ ] 实现 `server.py` 包含上述工具。
3.  [ ] 创建 `scripts/verify_mcp_logic.py` (模拟 Client)。
4.  [ ] 运行验证脚本，根据结果 iterate 修改 KB 文件。
