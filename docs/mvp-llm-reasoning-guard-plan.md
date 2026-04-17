---
kind: plan
status: draft
verified: 2026-04-17
schema_version: 1
describes: "LLM 推理链外挂 MVP 规划（甲方访谈版）"
---

# LLM 推理链外挂 MVP 规划

> 本文档记录 2026-04-17 甲方（胡飞扬）与项目管理（Claude）的需求访谈结论，作为 MVP 的单一事实源（SSOT）。
> 后续所有 MVP 相关任务拆解、进度跟踪、验收标准都回溯到本文件。

---

## 0. 与设计史的对齐（2026-04-17 补充）

本 MVP **不是独立的应用层工具**，而是 v12 / v13 设计史的当前边界落地实例。

| 设计史概念 | MVP 对应物 |
|------------|------------|
| v12: 耐久资产 = 证据承载世界模型 | 每次审查 → causal-learner 增长 `SupportLink` + `DerivationChain` |
| v13 G2: 当前状态 = 历史压缩态 | LLM patch = 压缩态；MiniMax 任务 = 解压 |
| v13 G3: 理解 = 最小充分追溯 | MiniMax 生成的推理链卡片即 `Minimal Sufficient Provenance` |
| v13 G5: 失败 = 被剪掉的可能性 | 反向元评价 = 审查员自身的剪枝记录 |
| v6 lawful kernel | 分级拦截的致命规则必须走 ref-algebra 合法性判定 |

**词汇对齐**：MVP **不造新对象**，复用：
- `DerivationChain`（[current/derivation-chain-contract.md](current/derivation-chain-contract.md)）
- `SupportLink`（[current/support-link-contract.md](current/support-link-contract.md)）
- `ObservationRecord`（[current/observation-model-contract.md](current/observation-model-contract.md)）
- `Hypothesis`（[current/hypothesis-contract.md](current/hypothesis-contract.md)）

**边界声明**：MVP **不触及** v9 本体联邦 / v10 参与式自反 / v11 文明记忆，这些仍是 horizon。

---

## 1. 甲方诉求（原话 + 翻译）

**原话**：
> "我觉得 llm 编程不靠谱，没有显式的逻辑连贯的思维。"
> "给我自己用。"

**翻译后的产品定位**：
> 一个**给胡飞扬自己用**的工具，用来**弥补 LLM 编程时缺乏显式、逻辑连贯思维**的问题。
> 形态：给 LLM 套一个"外挂大脑"（路线 A），LLM 继续写代码，外挂负责强制其思维显式化、可验证。

非目标（明确排除）：
- ❌ 不是给团队/公众用的 SaaS
- ❌ 不是"让甲方自己取代 LLM 去思考"（那是路线 B，已否决）
- ❌ 不是打 SWE-bench 榜分的工具（solve_rate 不是北极星，见 [memory: 认识论根公理]）

---

## 2. "LLM 思维不连贯"的四种症状

访谈中识别出的四类具体表现，**四个都真实存在**：

| 编号 | 症状 | 典型表现 | 对应的外挂机制 |
|------|------|----------|----------------|
| S1 | **健忘型** | 文件 A 刚决定用 snake_case，文件 B 就写成 camelCase | 约束系统 / 决策日志 |
| S2 | **幻觉型** | 调用不存在的 API、编造字段名 | 事实 grounding / 代码索引 |
| S3 | **跳步型** ⭐ | 从 A 直接跳到 D，中间 B、C 推理未交代，结论是错的 | **推理链强制展开 / 因果追踪** |
| S4 | **重复踩坑型** | 同一陷阱反复踩，无经验积累 | 长期记忆 / 因果学习 |

---

## 3. MVP 聚焦决策：先打 S3（跳步型）

甲方已批准"先打拳头 = S3"，其他三症状作为后续版本。

### 选 S3 的理由

1. **基础设施已就位**：`causal-learner` + v13 六对象合约本质就是在对抗跳步——强制记录"什么原因导致什么结果"。与 [memory: 北极星=推导链+重建保真度] 对齐。
2. **S3 是其他症状的根源**：
   - S1（健忘）= 推理链断裂
   - S2（幻觉）= 跳过了"验证 API 存在"这一步
   - S4（重复踩坑）= 没把上次的推理链存下来复用
3. **能做出最小闭环**：估算三周内可做出可自用的 MVP。

### 延期处理的三个症状（不遗忘）

以下三个症状**承诺在本文档中持续追踪**，防止 MVP 聚焦后被遗忘：

| 症状 | 承接版本（占位） | 触发条件 |
|------|------------------|----------|
| S1 健忘型 | v2 — 约束系统 | MVP 验证推理链机制跑通后 |
| S2 幻觉型 | v3 — 代码索引 grounding | S1 完成 or 与 MVP 并行调研 |
| S4 重复踩坑型 | 已部分被 causal-learner 覆盖，v4 做 retrieval 整合 | S1、S2 完成后 |

> **管理规则**：每次 MVP 评审会上重读本章，确认三个延期症状是否仍在延期、是否需要提前。

---

## 4. MVP 形态预览

### 4.1 用户故事（2026-04-17 更新：双脑架构）

> 胡飞扬在 IDE 里让 Claude Code 改代码，产出 patch。
> `bestqa check <patch>` 被触发（CLI 阶段手动，Hook 阶段自动）。
> CLI 内部调 **MiniMax coding-plan model** 对 patch 做逆向推理，生成一张推理链卡片：
>   - "我推测你的推理链是 A→B→C"
>   - "B 步骤没有对应证据，属于致命问题"
>   - "C 是假设，置信度 0.6"
> 分级判定后返回 `pass / warn / block`。通过则卡片入库 causal-learner 供未来检索。

**核心原则**：卡片由 MiniMax 生成，不由 Claude 自填——避免"同一个 LLM 既写又审"的自我欺骗失效。

### 4.4 反向元评价闭环（2026-04-17 新增）

双脑架构的第二层：让 MiniMax 审查官**在使用中持续学习**。

```
正向：Claude 写 patch → MiniMax 审 → pass/warn/block

反向：
  Claude（或甲方）发现 MiniMax 漏报/误报
    ↓ 结构化反馈
  CLI 暂存为 pending 元评价
    ↓ 甲方 weekly review
  批准的反馈 → causal-learner 存为"审查员元规律"
    ↓
  下次 MiniMax 被调用时，CLI 把相关历史元规律作为 prompt 上下文
    ↓
  MiniMax 审查水平随使用而提升
```

**三阶段过滤防止 Claude 的不可靠污染元规律**：
1. Claude 给反馈 → `pending/` 目录
2. 甲方 weekly review → `approved/` or `rejected/`
3. 仅 `approved/` 入 causal-learner

### 4.5 MVP 验收标准（Q4-b 具体化）

| 指标 | 目标 | 来源 |
|------|------|------|
| 命中率 | ≥ 70% | 在 10-15 个真实错样本上，MiniMax 点出根因 |
| 误报率 | ≤ 20% | 对正确 patch 不误报致命问题 |
| 分级准确性 | ≥ 80% | 致命/非致命判断与甲方标注一致 |

**测试集来源**：`artifacts/20260414-v7e-*` 下已有 15 个运行目录，含 LLM 误判样本，直接复用。

### 4.6 耐久资产指标（v12 对齐）

除功能指标外，MVP **必须**同步交付"证据承载世界模型"的增长指标：

| 指标 | 目标 | 意义 |
|------|------|------|
| 每次 pass 审查产生 SupportLink 数 | ≥ 1 | 证据链不断增长 |
| 每次 pass 审查产生 DerivationChain 数 | ≥ 1 | 追溯链被持久化 |
| 三周后 causal-learner 净增节点 | ≥ 50 | 世界模型实质增长 |

未达此三项，即使功能指标达标，MVP 也**不算通过**——因为那说明没有沉淀耐久资产，只是跑通了一次性审查。

### 4.2 推理链卡片（示意）

```
【这次修改】
  目标：<用户想要什么>
  推理链：A → B → C → 修改点
  每一步的证据：
    A: [读了 file.ts:42]
    B: [因为规律 R123："X 会导致 Y"]
    C: [假设，置信度 0.6]
  风险：C 是假设，如果错了可能影响 <模块>
```

### 4.3 与现有合同的映射

- 推理链卡片 ≈ [current/derivation-chain-contract.md](current/derivation-chain-contract.md)
- 证据引用 ≈ [current/support-link-contract.md](current/support-link-contract.md)
- 假设标记 ≈ [current/hypothesis-contract.md](current/hypothesis-contract.md)
- 入库后规律检索 ≈ causal-learner `search_regulations`

**MVP 不新增抽象**，只把已有合约串成一条"LLM 提交代码前必经"的管道。

---

## 5. 三周实现规划（2026-04-17 定稿）

基于决策：CLI 先行 / 双脑分工 / Q3-c 分级拦截 / 反向元评价 / Q4-b 验收。

### W1：核心骨架（CLI + MiniMax 单次审查）

| 任务 | 产物 | 验收 |
|------|------|------|
| T1.1 测试集构建 | `test/mvp-samples/` 下 10-15 个 `{patch, root_cause, wrong_reasoning}` JSON | 样本齐全、甲方抽查 3 个认可 |
| T1.2 推理链卡片 schema 冻结 | `schemas/reasoning-card.ts` | 复用 derivation-chain-contract 字段 |
| T1.3 `bestqa check <patch>` 骨架 | CLI 入口、参数解析、配置加载 | 能跑空逻辑返回 pass |
| T1.4 MiniMax coding-plan 调用封装 | `src/minimax-reviewer.ts` | 给 patch 能返回结构化卡片 |
| T1.5 **MCP 薄壳改造**（A2 方案起步） | 现有 MCP server 新增 `bestqa_check` 工具，内部调 CLI | 已有 skill 不受影响 |

### W2：分级拦截 + 入库 + 测试集跑通

| 任务 | 产物 | 验收 |
|------|------|------|
| T2.1 致命/非致命规则定义 | `docs/current/reasoning-card-grading-contract.md`（新合同） | 甲方 review |
| T2.2 分级判定实现 | `src/grader.ts` | 单测覆盖致命/非致命/pass 三分支 |
| T2.3 卡片入库 causal-learner | 调现有 `add_atom` / `submit_observation` | 一次审查 → 图谱多一个节点 |
| T2.4 `--force` 逃生阀 | CLI flag | 人工可 override |
| T2.5 **跑测试集 + 调参** | `artifacts/mvp-w2-eval/` 三项指标报告 | 命中 ≥70% / 误报 ≤20% / 分级 ≥80% |

### W3：反向元评价闭环 + 自用 dogfood

| 任务 | 产物 | 验收 |
|------|------|------|
| T3.1 反馈结构化格式 | `schemas/meta-feedback.ts` | 字段含 audit_id / 类型 / 漏报/误报证据 |
| T3.2 `bestqa feedback` 子命令 | Claude 可调 CLI 提交反馈 → pending/ 目录 | 反馈能写、能列 |
| T3.3 `bestqa review` 甲方批准界面 | 终端交互式 list/approve/reject | 甲方 5 分钟能处理 10 条 |
| T3.4 approved 反馈注入下次 MiniMax prompt | 检索相关元规律 + 拼 prompt | 同一类漏报不再发生（抽查 2 例） |
| T3.5 **自用 dogfood 一周** | 每日日志 + 踩坑清单 | 甲方主观感受"有帮助、不烦人" |

### W4+（后置，不算 MVP）

- Claude Code hook 适配
- S1/S2/S4 症状处理
- causal-scenarios 下 skills 全量迁移到 CLI
- MCP server 正式下线

---

## 6. 待甲方下一轮澄清的问题

- Q1：拦截发生在哪里？（Claude Code hook / IDE 扩展 / CLI 包装器）
- Q2：LLM 是 Claude Code 自身？还是 Codex / 其他？
- Q3：卡片不合格时，外挂是"硬拦截"（不让提交）还是"软提示"（标红但放行）？
- Q4：MVP 验收标准——怎么算"够用了可以发 v1"？

---

## 7. 变更记录

| 日期 | 变更 | 决策者 |
|------|------|--------|
| 2026-04-17 | 文档建立，确认路线 A + S3 聚焦 | 胡飞扬（甲方）/ Claude（PM） |
| 2026-04-17 | 交付形态三层：CLI（底）+ Skills（中）+ Claude Code hook（上，优先适配） | 胡飞扬 |
| 2026-04-17 | 底层路线 = 纯 CLI；MCP 采用 A2 过渡方案（MCP 降级为 CLI 薄壳，已有 causal-scenarios skills 逐个迁移后再废弃 MCP） | 胡飞扬 |
| 2026-04-17 | 开发顺序：**CLI 先行**（快速迭代、命令行直接测机制），**Hook 后置**（核心验证通过后再做实战部署层） | 胡飞扬 |
| 2026-04-17 | 拦截硬度 = **Q3-c 分级拦截**：致命问题硬拦截、非致命软提示，保留 `--force` 逃生阀 | 胡飞扬 |
| 2026-04-17 | **架构级变更：双脑分工** — Claude Code 写代码、MiniMax coding-plan model 逆向推理并审查卡片。甲方持有超大 MiniMax 配额，成本近零，可每次调用。推理链卡片由 MiniMax 生成而非 Claude 自填，避免"自我审查失效" | 胡飞扬 |
| 2026-04-17 | 验收标准 = **Q4-b 具体化**：从 artifacts/20260414-v7e-* 挑 10-15 个真实错样本，跑 MiniMax 审查，指标 命中率 ≥70% / 误报率 ≤20% / 分级准确 ≥80% | 胡飞扬 |
| 2026-04-17 | **架构级变更：反向元评价闭环** — Claude 可在使用中评价 MiniMax 的审查质量（漏报/误报），反馈写入 CLI，CLI 作为"审查员元规律"存入 causal-learner，供下次审查时作为 prompt 上下文。**因 Claude 自身不可靠，反馈走 pending→甲方 weekly review→批准→入库 三阶段** | 胡飞扬 |
| 2026-04-17 | PM 拍板：测试集优先从 artifacts/20260414-v7e-* 提取，不足则从 git fix commits 补充 | Claude (PM) |
| 2026-04-17 | PM 拍板：反馈 review 默认 weekly 周五，pending>20 条 CLI 主动提醒 | Claude (PM) |
| 2026-04-17 | PM 拍板：MVP 范围锁定为 (a)-(f)，不加不砍 | Claude (PM) |
| 2026-04-17 | 读完 design_history v12/v13，补充第 0 章对齐声明 + 第 4.6 章耐久资产指标；词汇对齐既有 current 合约；明确 MVP 是 v12/v13 当前边界落地实例，不触及 v9-v11 horizon | Claude (PM) |

<!-- Autogenerated link references for markdown compatibility -->
[current/derivation-chain-contract.md]: current/derivation-chain-contract.md
[current/support-link-contract.md]: current/support-link-contract.md
[current/hypothesis-contract.md]: current/hypothesis-contract.md
