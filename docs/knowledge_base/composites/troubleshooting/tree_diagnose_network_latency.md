---
id: "tree_diagnose_network_latency"
type: "composite"
problem_class: "PC_Network_Performance"
desc: "用于排查服务器间网络延迟的基础树"
reusability: "High"
---

# 树状拆解 (Decomposition)

## Context

当应用报告 "连接超时" 或 "响应慢" 时调用此树。

## Root Goal: 确定延迟来源

_Strategy_: 分层剥洋葱 (Layered Peeling).

### Step 1: 物理/传输层检查

直接引用原子模块，排除最底层的连通性问题。

- **Atom**: `atoms/network/atom_check_tcp_port`
  - _Condition_: `target_port` is open.
  - _Expected_: Latency < 100ms.
- **Atom**: `atoms/network/atom_dns_resolve` (假设存在)
  - _Check_: DNS 解析耗时是否过长。

### Step 2: 路由跳数检查

如果直连没问题，检查路径。

- **Atom**: `traceroute` (需封装)
  - _Check_: 是否有某个跳点丢包率高。

### Step 3: 应用层握手

如果是 HTTPS，检查 TLS 握手耗时。

- **Atom**: `openssl s_client -connect`
