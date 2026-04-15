# BestQ-A Project — Claude Instructions

## CCB 握手记录

| CCB_REQ_ID | 时间 | 结果 |
|---|---|---|
| 20260414-194040-827-87204-1 | 2026-04-14 19:40 | HANDSHAKE_OK |
| 20260414-194338-014-87204-2 | 2026-04-14 19:43 | HANDSHAKE_OK（Claude 主动发起） |
| 20260414-215455-025-9924-1 | 2026-04-14 21:54 | HANDSHAKE_OK（Claude→Codex，Enter 键修复后） |
| 20260414-215652-501-9924-2 | 2026-04-14 21:56 | HANDSHAKE_OK（Codex→Claude，双向验证通过） |

## CCB 互操作经验（2026-04-14）

### 环境
- 终端：WezTerm，多 pane 布局
- Claude（Pane 0）+ Codex（Pane 1）同时运行于同一项目目录
- CCB 版本：bfly123/claude_code_bridge
- askd 守护进程通过 TCP socket（127.0.0.1）通信

### 通信机制

CCB 使用 `ask` CLI 命令作为跨 AI 通信桥梁：

```bash
# Claude → Codex
ask codex --foreground -t 60 "<message>"

# Codex → Claude
ask claude --foreground -t 60 "<message>"
```

`ask` → askd 守护进程（TCP）→ `terminal.py WeztermBackend.send_text()` → 注入文本到目标 pane + 发送 Enter → 目标 AI 处理 → 通过 session log 读取回复。

### CCB_WEZTERM_ENTER_METHOD 必须是 auto（重要！）

```bash
# 正确
$env:CCB_WEZTERM_ENTER_METHOD='auto'

# 错误 — 会导致 Enter 键永远发不出
$env:CCB_WEZTERM_ENTER_METHOD='key'
```

**根因**：`terminal.py:_send_enter()` 在 `method=key` 时只尝试 `wezterm cli send-key`（当前 WezTerm 版本没有此子命令），且**不 fallback** 到 `send-text --no-paste \r`。`method=auto` 则会在 `send-key` 失败后自动 fallback。

**症状**：消息文本出现在目标 pane 的输入框中但堆积不提交，目标 AI 无响应，askd 日志显示 `exit=2 anchor=False done=False`。

**修复**：用户级环境变量已改为 `auto`。修改后需重启 askd（优雅关闭：向 askd 发送 `ask.shutdown` RPC，`ask` 下次调用会自动重启新 daemon）。

> **注意**：Codex 可能会自己把这个变量设回 `key`。如果通信又断了，先检查这个变量。

### 备用通信方式（绕过 askd）

当 `ask` 不可用时，可直接用 WezTerm CLI 注入：

```bash
# Claude → Codex（Pane 1）
wezterm cli send-text --pane-id 1 --no-paste $'\x15'   # Ctrl+U 清输入
wezterm cli send-text --pane-id 1 "消息内容"             # 写入
wezterm cli send-text --pane-id 1 --no-paste $'\r'      # Enter 提交

# 读取 Codex 回复
wezterm cli get-text --pane-id 1 | tail -N
```

### 关键教训

1. **收到 CCB 请求后立刻输出回复内容，不要解释、不要找工具**。`ask --foreground` 有超时，废话会导致 `CCB_TASK_INCOMPLETE`。
2. **握手格式严格遵守**：
   ```
   CCB_BEGIN: <REQ_ID>
   HANDSHAKE_OK
   CCB_DONE: <REQ_ID>
   ```
3. `codex` 和 `codex-persistent` MCP server 已删除，不再使用。通信统一走 `ask` 命令。
4. **exit=2 / TASK_INCOMPLETE 不一定是传输失败**，可能只是目标 AI 没在回复中加 `CCB_DONE` 行。用 `wezterm cli get-text --pane-id <N>` 直接看目标 pane 确认。

### 新现象：前台 `ask --foreground` 可能“假性 incomplete”

2026-04-14 新观察：

- `ask claude --foreground -t 60` 发送任务时，Claude 已经返回：
  - `CCB_BEGIN: ...`
  - 简短确认
  - `CCB_DONE: ...`
- 但 CLI 仍可能显示：
  - `[CCB_TASK_INCOMPLETE]`
  - `Result: 收到，开始执行 P05。`

这类情况不应立刻判定为失败。正确判断顺序：

1. 先执行 `pend claude 3`
2. 确认目标回复里是否已经出现 `CCB_DONE`
3. 再查看固定 report 文件是否开始更新

如果 `CCB_DONE` 已出现，且 report/后续输出显示任务继续推进，则把它视为：

```text
bridge 已成功送达任务
foreground 调用返回状态不可靠
```

经验结论：

- **不要只看前台返回码判断任务是否启动**
- 对长任务，`ask --foreground` 更适合作为“送达确认”
- 真正进度以：
  - `pend claude`
  - `.omx/reports/Pxx-*.md`
  为准

### 诊断 CCB 通信问题的快速路径

1. `wezterm cli get-text --pane-id <N>` — 直接看目标 pane 内容（最可靠）
2. `tail laskd.log / caskd.log` — 看 askd 子守护进程日志（位于 `CCB_RUN_DIR` 下）
3. `wezterm cli list` — 确认 pane ID 映射
4. 检查 `CCB_WEZTERM_ENTER_METHOD` 环境变量（必须是 `auto`）
5. 检查 askd 进程是否存活：`Get-NetTCPConnection -LocalPort <port>` 或看 `askd.json`
