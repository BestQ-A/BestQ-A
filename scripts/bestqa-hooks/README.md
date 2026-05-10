---
kind: ops
status: draft
verified: 2026-04-17
schema_version: 1
describes: "bestqa dogfood 脚手架"
---

# bestqa Dogfood 脚手架

> 对应 [docs/mvp-llm-reasoning-guard-plan.md](../../docs/mvp-llm-reasoning-guard-plan.md) W3 T3.5 自用一周。

## 目标

让甲方在日常写代码时尽可能无痛地使用 `bestqa` 流程，同时
把 approved 元反馈喂进 SimpleMem 作为跨会话长期记忆。

## 组件

### 1. post-commit hook

每次 `git commit` 后自动对该次 commit 的 diff 跑 `bestqa check`。

**行为**：
- pass/warn → 静默
- block → 打印推理链卡片到 stderr（commit 已落地，不阻塞；只警示）
- patch > 500 行 → 跳过（避免大重构噪音）
- 错误 → 打印前 20 行诊断（不影响 commit）

**安装**：

```bash
cp scripts/bestqa-hooks/post-commit .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

**临时跳过**：`BESTQA_SKIP=1 git commit ...`

**永久禁用**：`mv .git/hooks/post-commit .git/hooks/post-commit.off`

### 2. sync-feedback-to-simplemem.mjs

把 `.bestqa/feedback/approved/` 下的审查员元反馈同步进 SimpleMem，
这样 Claude 和 Codex 两边 `memory_query` 都能检索到。

**前置**：
- SimpleMem 服务跑着：`http://localhost:8000`
- 从 `~/.claude.json` 的 `simplemem.headers.Authorization` 取 Bearer token

**用法**：

```bash
# 同步所有未同步的 approved 反馈
SIMPLEMEM_TOKEN=<jwt> node scripts/bestqa-hooks/sync-feedback-to-simplemem.mjs

# 只看会同步什么（不实际调用）
node scripts/bestqa-hooks/sync-feedback-to-simplemem.mjs --dry-run

# 只同步某时间点之后批准的
SIMPLEMEM_TOKEN=<jwt> node scripts/bestqa-hooks/sync-feedback-to-simplemem.mjs --since=2026-04-17
```

**幂等**：已同步的条目会在 `metadata.synced_to_simplemem` 写时间戳标记；
下次运行自动跳过。

**建议节奏**：跟着 `bestqa review` weekly review 走——批完 feedback 就
跑一次 sync，让下次调用 MiniMax 时 Claude 能通过 SimpleMem 查到相关元规律。

## 一周 dogfood 清单

| 日 | 事 |
|----|----|
| 周一 | 装 hook：`cp scripts/bestqa-hooks/post-commit .git/hooks/` |
| 周一到周五 | 正常写代码提交；遇到 BLOCK 判断是漏报/误报/真问题 |
| 遇到漏报 | `bestqa feedback --type false_negative --target-code <CODE> --argument "..."` |
| 遇到误报 | `bestqa feedback --type false_positive --argument "..."` |
| 周五 | `bestqa review --list` 看本周 pending，逐条 `--approve` 或 `--reject` |
| 周五 | `node scripts/bestqa-hooks/sync-feedback-to-simplemem.mjs` 同步进 SimpleMem |
| 周末 | 写主观感受日志：是否"有帮助、不烦人"（MVP §5 W3 T3.5 验收标准） |

## 未处理的 stability 问题

来自 [tests/agent-eval/REPORT.md](../../tests/agent-eval/REPORT.md)：

- [ ] Windows `STATUS_STACK_BUFFER_OVERRUN (3221226505)` — CLI 尾部偶发崩溃，
      JSON body 已产出可用；原生模块析构问题，暂未修复（cosmetic）
- [x] MiniMax 瞬时 `fetch failed` — 已把 retry 从 3 次加到 5 次，带指数退避
      1s/3s/7s/15s/31s（共 ~57s 覆盖窗口）
- [ ] A02 trap issue code 映射（`COARSE_CHAIN` 未命中，reviewer 更倾向
      `LOW_CONFIDENCE_HYPOTHESIS + UNDECLARED_RISK`）— 合约层决策，
      见 [docs/current/reasoning-card-grading-contract.md](../../docs/current/reasoning-card-grading-contract.md)
- [ ] A04 gold patch 只 warn 不 pass — support-link 覆盖保守，
      可能要加"已知正确 patch"白名单机制或降低 warn 阈值
