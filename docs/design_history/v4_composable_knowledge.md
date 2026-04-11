# 递归式问答 (Recursive Q&A) 系统设计 v4: 知识组合引擎

## 1. 核心哲学: 80/19/1 法则 (The 80/19/1 Rule)

系统设计的终极目标是建立一个**可组合的知识库 (Composable Knowledge Base)**，以应对世界的重复性。

- **80% (Reuse)**: 全可以直接复用的已解决问题。我们只做检索 (Retrieve)。
- **19% (Recombine)**: 已有的基础模块，需要针对新场景进行重新组合。我们做编排 (Orchestrate)。
- **1% (Invent)**: 全新的底层问题。我们需要创造新的原子模块 (Create Atom)。

**核心推论**: 我们的 DB 结构必须彻底分离 **Atoms (原子)** 和 **Composites (组合)**。

---

## 2. 目录结构设计 (Physical Layout)

为了支持这种组合，文件系统将分为两层：

```text
docs/knowledge_base/
├── atoms/                  # [底层模块] 稳定的、通用的、不依赖上下文的
│   ├── network/
│   │   ├── atom_tcp_connect.md
│   │   ├── atom_dns_resolve.md
│   ├── database/
│   │   ├── atom_sql_query.md
│   └── os/
│       ├── atom_check_process.md
│
└── composites/             # [组合逻辑] 针对特定问题类的拼装树
    ├── troubleshooting/
    │   ├── tree_web_latency.md  # 引用 atoms/network/*
    │   ├── tree_db_conn_fail.md # 引用 atoms/network/* 和 atoms/database/*
    └── deployment/
        ├── tree_deploy_k8s.md
```

## 3. 文件格式标准

### 3.1 原子模块 (The Atom)

**特点**: 只做一件事，做到极致，无状态，纯函数式。

````markdown
---
id: "atom_check_tcp_port"
type: "atom"
desc: "检查特定 IP 和端口的 TCP 连通性"
inputs: ["target_host", "target_port"]
outputs: ["is_reachable (bool)", "latency_ms (int)"]
---

# 实现 (Implementation)

这是一个标准操作，不依赖任何业务逻辑。

## CLI

`nc -zv {target_host} {target_port}`

## Python

```python
import socket
...
```
````

````

### 3.2 组合树 (The Composite Tree)
**特点**: 描述 "如何组合 Atoms 来解决 High-level 问题"。它是**结构化的逻辑**。

```markdown
---
id: "tree_diagnose_web_latency"
type: "composite"
problem_class: "PC_Web_Performance"
desc: "Web 访问慢的通用排查树"
reusability: "High"
---

# 树状拆解 (Decomposition)

## Step 1: 基础网络检查 (Reuse 80%)
利用原子模块快速排除网络层。
- Action: @atom/network/atom_dns_resolve (Check DNS)
- Action: @atom/network/atom_check_tcp_port (Check 443)

## Step 2: 后端处理分析 (Recombine 19%)
组合多个原子来分析是 App 慢还是 DB 慢。
- Strategy: **Parallel Execution**
  - Branch A: @atom/http/atom_curl_ttfb (测 TTFB)
  - Branch B: @atom/db/atom_query_latency (测 DB 响应)

## Step 3: 业务特定逻辑 (Invent 1%)
如果上述标准组合没发现问题，进入特定业务逻辑。
- Action: 查询特定的 Trace ID (Custom Logic)
````

## 4. 运作流程：语义接龙的演变

当面对一个新需求：

1.  **检索 (Scan)**: 先看库里有没有现成的 `tree_*.md` 能解决？(80% 概率有)
2.  **组合 (Composing)**: 如果没有完全匹配的，能不能找几个 `atom_*.md` 和 `tree_*.md` 拼凑一个？(19% 概率)
    - _例_: "我要查 Redis 慢"，发现只有 "查 MySQL 慢" 的树。
    - _Action_: 复制 MySQL 树结构，把底层的 `atom_mysql_query` 替换为 `atom_redis_ping`。
3.  **创造 (Creating)**: 发现缺一个 `atom_redis_ping`？
    - _Action_: 创建 `atoms/db/atom_redis_ping.md`。

## 5. 总结

这本质上是在构建一种 **"工程化的常识库"**。
通过显式地维护 **Tree** 和 **Atom**，我们让解决问题的经验变成了可复用的资产，而不再是散落在聊天记录里的碎片。
