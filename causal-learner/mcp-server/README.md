# @bestqa/causal-learner

异常驱动的因果学习 MCP 服务器。通过观测异常事件、归纳因果规律、构建知识图谱，帮助 AI Agent 从失败中持续学习。

An exception-driven causal learning MCP server. Learns causal regulations from failure observations, builds knowledge graphs, and helps AI agents improve through experience.

## Quick Start

```bash
# 一键启动
npx @bestqa/causal-learner
```

### MCP 配置

在 `claude_desktop_config.json` 或 `.claude.json` 中添加：

```json
{
  "mcpServers": {
    "causal-learner": {
      "command": "npx",
      "args": ["-y", "@bestqa/causal-learner"]
    }
  }
}
```

## Benchmark

| 指标 | 结果 |
|------|------|
| Hit Rate（命中率） | 100% |
| Category Accuracy（分类准确率） | 83.3% |

基于 SWE-bench 子集评测。

## 核心概念

- **Observation（观测）**：记录一次事件执行结果（成功/失败/异常）
- **Event（事件）**：被观测的操作或过程
- **Regulation（因果律）**：从观测中归纳出的 cause → effect 规律
- **Knowledge Cluster（知识簇）**：相关因果律的聚合
- **Knowledge Graph（知识图谱）**：原子节点 + 引用关系构成的推理网络

## API 概览

### 观测与学习

| Tool | 说明 |
|------|------|
| `submit_observation` | 提交单次观测 |
| `batch_submit_observations` | 批量提交观测 |
| `reevaluate_event` | 重新评估事件状态 |
| `trigger_induction` | 触发因果归纳 |
| `record_fix` | 记录修复操作 |

### 查询与检索

| Tool | 说明 |
|------|------|
| `list_events` / `get_event` | 事件列表/详情 |
| `list_regulations` / `get_regulation` | 因果律列表/详情 |
| `search_events` / `search_regulations` | 关键词搜索 |
| `fuzzy_search_events` / `fuzzy_search_regulations` | 模糊搜索 |
| `get_regulations_for_effect` | 按效果查因果律 |
| `get_regulations_with_precondition` | 按前置条件查因果律 |
| `causal_search` | 因果链搜索 |

### 知识管理

| Tool | 说明 |
|------|------|
| `create_cluster` / `build_knowledge_cluster` | 创建/构建知识簇 |
| `search_knowledge_clusters` | 搜索知识簇 |
| `sample_evidence` | 采样证据 |
| `suggest_causes` | 建议可能原因 |
| `load_relevant_knowledge` | 加载相关知识 |

### 知识图谱

| Tool | 说明 |
|------|------|
| `add_atom` / `add_ref` | 添加原子/引用 |
| `explore_graph` / `query_graph` | 探索/查询图谱 |
| `find_atoms` / `graph_stats` | 查找原子/统计 |
| `compile_path` / `myelinate_graph` | 编译路径/髓鞘化 |
| `ingest_facts` / `prune_graph` | 导入事实/剪枝 |

### SWE-bench 集成

| Tool | 说明 |
|------|------|
| `import_swe_issue` | 导入 SWE-bench issue |
| `analyze_swe_batch` | 批量分析 SWE 问题 |

### 系统管理

| Tool | 说明 |
|------|------|
| `get_stats` / `get_dual_stats` / `get_longterm_stats` | 统计信息 |
| `flush_to_longterm` | 刷写到长期存储 |
| `reset_session` | 重置会话 |
| `update_event_status` | 更新事件状态 |
| `add_regulation` / `update_regulation` / `delete_regulation` | 因果律 CRUD |
| `set_test_mode` | 设置测试模式 |

## License

MIT
