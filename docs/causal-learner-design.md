# 异常驱动的因果学习系统

## 核心理念

```
Event = 现有 Cause Regulation 解释不了的"意外"
```

**不是记录一切，而是只记录边界。**

---

## 1. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Cause Regulations                         │
│                 （当前能解释世界的规则集合）                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ reg_001  │  │ reg_002  │  │ reg_003  │  ...              │
│  │ confirmed│  │ hypothesis│ │ candidate│                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
        ↑ 归纳                           │ 解释
        │                                ↓
┌───────┴─────────────────────────────────────────────────────┐
│                       Event Pool                             │
│              （规则解释不了的"意外"，等待归纳）                 │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ evt_001  │  │ evt_002  │  │ evt_003  │  ...              │
│  │ 黑屏异常  │  │ 延迟飙升  │  │ crash    │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
        ↑ 检测（解释失败）               │ 消解（被新规则解释）
        │                                ↓
┌───────┴─────────────────────────────────────────────────────┐
│                   Observation Stream                         │
│                     （所有原始观测）                           │
│                                                              │
│  日志、指标、trace、错误码、用户报告...                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心数据结构

### 2.1 Observation（原始观测）

系统的输入，来自日志、指标、trace 等。

```json
{
  "obs_id": "obs_20260110_001",
  "timestamp": "2026-01-10T10:20:00Z",
  "source": "compositor_monitor",
  
  "facts": [
    {"pred": "display.black_screen", "args": {"duration": "ge_2s"}, "value": true},
    {"pred": "gpu.device_removed", "value": true},
    {"pred": "swapchain.create_failed", "args": {"api": "dxgi"}, "value": true}
  ],
  
  "context": {
    "env.os": "win11",
    "gpu.model": "rtx4090",
    "driver.version": "546.33"
  },
  
  "raw_refs": {
    "logs": "s3://logs/2026-01-10/compositor.log",
    "metrics": "s3://metrics/2026-01-10/gpu.json"
  }
}
```

### 2.2 Event（异常/意外）

**定义**：现有规则解释不了的观测。

```json
{
  "event_id": "evt_001",
  "created_at": "2026-01-10T10:21:00Z",
  "status": "pending",  // pending | clustered | resolved
  
  "observation": {
    "obs_id": "obs_20260110_001",
    "facts": [
      {"pred": "display.black_screen", "value": true},
      {"pred": "gpu.device_removed", "value": true}
    ],
    "context": {"env.os": "win11", "gpu.model": "rtx4090"}
  },
  
  "explanation_attempts": [
    {
      "regulation_id": "reg_003",
      "score": 0.23,
      "result": "failed",
      "reason": "pre_not_satisfied",
      "missing": [
        {"pred": "compositor.restarted", "value": true}
      ]
    },
    {
      "regulation_id": "reg_007",
      "score": 0.41,
      "result": "partial",
      "reason": "only_explains_subset",
      "unexplained": [
        {"pred": "gpu.device_removed", "value": true}
      ]
    }
  ],
  
  "unexplained_core": [
    {
      "fact": {"pred": "gpu.device_removed", "value": true},
      "note": "没有规则能解释这个现象"
    }
  ],
  
  "similar_events": ["evt_003", "evt_007"],  // 后续聚类填充
  "resolved_by": null  // 如果被新规则解释，填 regulation_id
}
```

**关键设计**：
- `explanation_attempts`：记录尝试过哪些规则、为什么失败
- `unexplained_core`：具体哪些事实无法解释——这是归纳新规则的线索
- `similar_events`：聚类后填充，用于批量归纳

### 2.3 Cause Regulation（因果规则）

**定义**：从 Events 中归纳出的因果模式。

```json
{
  "regulation_id": "reg_012",
  "name": "Surface Handle Reuse Causes Swapchain Failure",
  "status": "hypothesis",  // candidate → hypothesis → confirmed → deprecated
  
  "pattern": {
    "pre": [
      {"pred": "compositor.restarted", "value": true},
      {"pred": "surface.handle_reused", "value": true}
    ],
    "trigger": {
      "action": "swapchain.create",
      "params": {"api": "dxgi"}
    },
    "eff": [
      {"pred": "swapchain.create_failed", "value": true}
    ]
  },
  
  "scope": {
    "required": [
      {"pred": "env.os", "value": "win11"}
    ],
    "optional": [
      {"pred": "gpu.vendor", "value": "nvidia"}
    ]
  },
  
  "origin": {
    "type": "induced",  // induced | manual | imported
    "from_events": ["evt_001", "evt_003", "evt_007"],
    "induced_at": "2026-01-10T12:00:00Z",
    "induced_by": "auto_inducer_v1"
  },
  
  "evidence": {
    "support": {
      "count": 12,
      "examples": ["obs_001", "obs_015", "obs_023"]
    },
    "contradiction": {
      "count": 1,
      "examples": ["obs_042"]
    },
    "last_used": "2026-01-10T15:30:00Z",
    "confidence": 0.87
  },
  
  "lifecycle": {
    "created_at": "2026-01-10T12:00:00Z",
    "promoted_to_hypothesis": "2026-01-10T14:00:00Z",
    "promoted_to_confirmed": null,
    "deprecated_at": null,
    "deprecation_reason": null
  },
  
  "verification": {
    "suggested_probes": [
      {"probe_id": "probe.check_surface_reuse_log"}
    ],
    "suggested_interventions": [
      {"action_id": "act.force_release_surface"}
    ]
  }
}
```

**生命周期**：

```
candidate ──(3+ supports)──→ hypothesis ──(10+ supports, <10% contradiction)──→ confirmed
    │                            │                                                  │
    │                            │                                                  │
    └──(2+ contradictions)───────┴──────────(>30% contradiction)───────────────────→ deprecated
```

---

## 3. 核心流程

### 3.1 流程总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         主循环                                       │
│                                                                      │
│   Observation ──→ 尝试解释 ──→ 成功? ──Y──→ 更新规则证据             │
│                                  │                                   │
│                                  N                                   │
│                                  ↓                                   │
│                            创建 Event                                │
│                                  │                                   │
│                                  ↓                                   │
│                      Event Pool 积累                                 │
│                                  │                                   │
│                         (定期触发)                                   │
│                                  ↓                                   │
│                       聚类相似 Events                                │
│                                  │                                   │
│                                  ↓                                   │
│                       归纳候选规则                                    │
│                                  │                                   │
│                                  ↓                                   │
│                       验证 & 晋升                                    │
│                                  │                                   │
│                                  ↓                                   │
│                    消解 Events (标记 resolved)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 解释流程（Explain）

```python
def explain(observation, regulations, threshold=0.6):
    """
    尝试用现有规则解释一个观测
    返回: (是否成功, 最佳解释, 所有尝试)
    """
    attempts = []
    
    for reg in regulations:
        # 1. 检查 scope 是否匹配
        if not scope_match(reg.scope, observation.context):
            continue
        
        # 2. 检查 pre 是否满足
        pre_result = check_preconditions(reg.pattern.pre, observation.facts)
        
        # 3. 检查 eff 是否出现在观测中
        eff_result = check_effects(reg.pattern.eff, observation.facts)
        
        # 4. 计算解释分数
        score = compute_explanation_score(pre_result, eff_result, reg.evidence)
        
        attempts.append({
            "regulation_id": reg.regulation_id,
            "score": score,
            "pre_satisfied": pre_result.satisfied,
            "eff_matched": eff_result.matched,
            "missing_pre": pre_result.missing,
            "unexplained_facts": eff_result.unmatched
        })
    
    # 排序，取最佳
    attempts.sort(key=lambda x: x["score"], reverse=True)
    
    if attempts and attempts[0]["score"] >= threshold:
        return (True, attempts[0], attempts)
    else:
        return (False, None, attempts)
```

### 3.3 Event 检测流程（Detect）

```python
def detect_event(observation, explanation_result):
    """
    当解释失败时，创建 Event
    """
    success, best, attempts = explanation_result
    
    if success:
        return None  # 不需要创建 event
    
    # 分析哪些 facts 解释不了
    all_explained = set()
    for attempt in attempts:
        if attempt["score"] > 0.3:  # 部分解释
            all_explained.update(attempt["eff_matched"])
    
    unexplained = [f for f in observation.facts if f not in all_explained]
    
    event = Event(
        observation=observation,
        explanation_attempts=attempts,
        unexplained_core=unexplained,
        status="pending"
    )
    
    return event
```

### 3.4 归纳流程（Induce）

```python
def induce_regulations(event_pool, min_cluster_size=3):
    """
    从 Event Pool 中归纳新规则
    定期执行（如每小时、每 N 个新 event）
    """
    # 1. 聚类相似 events
    clusters = cluster_events(
        event_pool.pending_events(),
        similarity_fn=event_similarity,
        min_size=min_cluster_size
    )
    
    candidates = []
    
    for cluster in clusters:
        # 2. 提取共同模式
        common_pre = extract_common_preconditions(cluster)
        common_eff = extract_common_effects(cluster)
        common_context = extract_common_context(cluster)
        
        if not common_pre or not common_eff:
            continue  # 模式不够清晰
        
        # 3. 构建候选规则
        candidate = CauseRegulation(
            status="candidate",
            pattern={
                "pre": common_pre,
                "eff": common_eff
            },
            scope=common_context,
            origin={
                "type": "induced",
                "from_events": [e.event_id for e in cluster]
            }
        )
        
        candidates.append(candidate)
        
        # 4. 标记 events 为 clustered
        for event in cluster:
            event.status = "clustered"
            event.similar_events = [e.event_id for e in cluster if e != event]
    
    return candidates
```

### 3.5 验证与晋升流程（Validate & Promote）

```python
def validate_and_promote(regulation, new_observation):
    """
    用新观测验证规则，更新证据，必要时晋升/降级
    """
    # 1. 检查规则是否适用于这个观测
    if not scope_match(regulation.scope, new_observation.context):
        return  # 不在 scope 内，跳过
    
    pre_satisfied = check_preconditions(regulation.pattern.pre, new_observation.facts)
    
    if not pre_satisfied.all_satisfied:
        return  # 前提不满足，规则不应该触发
    
    # 2. 前提满足时，检查效应是否出现
    eff_appeared = check_effects(regulation.pattern.eff, new_observation.facts)
    
    if eff_appeared.all_matched:
        # 预测正确！增加支持证据
        regulation.evidence.support.count += 1
        regulation.evidence.support.examples.append(new_observation.obs_id)
    else:
        # 预测失败！增加反例
        regulation.evidence.contradiction.count += 1
        regulation.evidence.contradiction.examples.append(new_observation.obs_id)
    
    # 3. 更新置信度
    regulation.evidence.confidence = compute_confidence(regulation.evidence)
    
    # 4. 检查是否需要晋升或降级
    promote_or_demote(regulation)


def promote_or_demote(regulation):
    """
    根据证据情况晋升或降级规则
    """
    support = regulation.evidence.support.count
    contradiction = regulation.evidence.contradiction.count
    total = support + contradiction
    
    if total == 0:
        return
    
    contradiction_rate = contradiction / total
    
    # 晋升条件
    if regulation.status == "candidate" and support >= 3 and contradiction_rate < 0.2:
        regulation.status = "hypothesis"
        regulation.lifecycle.promoted_to_hypothesis = now()
    
    elif regulation.status == "hypothesis" and support >= 10 and contradiction_rate < 0.1:
        regulation.status = "confirmed"
        regulation.lifecycle.promoted_to_confirmed = now()
    
    # 降级条件
    if contradiction_rate > 0.3:
        regulation.status = "deprecated"
        regulation.lifecycle.deprecated_at = now()
        regulation.lifecycle.deprecation_reason = f"contradiction_rate={contradiction_rate:.2%}"
```

### 3.6 Event 消解流程（Resolve）

```python
def resolve_events(event_pool, new_regulation):
    """
    当新规则被创建后，检查它能否解释 pending 的 events
    """
    resolved = []
    
    for event in event_pool.pending_events():
        # 尝试用新规则解释
        explanation = try_explain_with_regulation(event.observation, new_regulation)
        
        if explanation.score >= 0.6:
            event.status = "resolved"
            event.resolved_by = new_regulation.regulation_id
            resolved.append(event)
    
    return resolved
```

---

## 4. 关键算法

### 4.1 Event 相似度计算

```python
def event_similarity(event_a, event_b):
    """
    计算两个 events 的相似度，用于聚类
    """
    # 1. unexplained_core 的 Jaccard 相似度（最重要）
    unexplained_a = set(fact_signature(f) for f in event_a.unexplained_core)
    unexplained_b = set(fact_signature(f) for f in event_b.unexplained_core)
    
    jaccard_unexplained = len(unexplained_a & unexplained_b) / len(unexplained_a | unexplained_b)
    
    # 2. context 相似度
    context_sim = context_similarity(event_a.observation.context, event_b.observation.context)
    
    # 3. 失败原因相似度
    failure_sim = failure_pattern_similarity(event_a.explanation_attempts, event_b.explanation_attempts)
    
    # 加权组合
    return 0.5 * jaccard_unexplained + 0.3 * context_sim + 0.2 * failure_sim
```

### 4.2 共同模式提取

```python
def extract_common_preconditions(event_cluster):
    """
    从一组 events 中提取共同的前置条件
    """
    # 收集所有 events 的 facts
    all_facts = [set(fact_signature(f) for f in e.observation.facts) for e in event_cluster]
    
    # 取交集：所有 events 都有的 facts
    common = set.intersection(*all_facts) if all_facts else set()
    
    # 过滤掉属于 effects 的部分（unexplained_core）
    effects = set()
    for e in event_cluster:
        effects.update(fact_signature(f) for f in e.unexplained_core)
    
    preconditions = common - effects
    
    return [parse_fact_signature(sig) for sig in preconditions]


def extract_common_effects(event_cluster):
    """
    从一组 events 中提取共同的效应（就是 unexplained_core 的交集）
    """
    all_unexplained = [set(fact_signature(f) for f in e.unexplained_core) for e in event_cluster]
    
    common = set.intersection(*all_unexplained) if all_unexplained else set()
    
    return [parse_fact_signature(sig) for sig in common]
```

### 4.3 解释分数计算

```python
def compute_explanation_score(pre_result, eff_result, evidence):
    """
    计算一个规则对观测的解释分数
    """
    # 1. 前提满足率
    pre_score = pre_result.satisfied_count / pre_result.total_count if pre_result.total_count > 0 else 0
    
    # 2. 效应匹配率
    eff_score = eff_result.matched_count / eff_result.total_count if eff_result.total_count > 0 else 0
    
    # 3. 规则本身的可信度
    reg_confidence = evidence.confidence
    
    # 4. 综合
    # 前提必须完全满足才能得高分
    if pre_score < 1.0:
        return pre_score * 0.3  # 前提不满足，大幅降分
    
    return eff_score * 0.6 + reg_confidence * 0.4
```

---

## 5. 谓词体系设计

### 5.1 命名规范

```
{domain}.{entity}.{attribute}
```

例如：
- `display.screen.black`
- `gpu.device.removed`
- `swapchain.create.failed`
- `compositor.process.restarted`
- `surface.handle.reused`

### 5.2 核心谓词示例（GPU/显示系统）

```yaml
# 现象层
display.black_screen:
  args: {duration: enum[lt_1s, ge_1s, ge_2s, ge_5s]}
  
display.flicker:
  args: {frequency: enum[rare, occasional, frequent]}

display.freeze:
  args: {duration: enum[lt_1s, ge_1s, ge_5s]}

# 设备层
gpu.device_removed:
  args: {}
  
gpu.device_reset:
  args: {reason: string}

gpu.memory_exhausted:
  args: {threshold_percent: number}

# 组件层
swapchain.create_failed:
  args: {api: enum[dxgi, vulkan], error_code: string}

swapchain.present_failed:
  args: {error_code: string}

surface.handle_reused:
  args: {}

surface.invalid:
  args: {}

# 进程层
compositor.restarted:
  args: {mode: enum[soft, hard]}

compositor.crashed:
  args: {}

# 环境层
env.os:
  args: {name: enum[win10, win11, linux]}

env.driver_version:
  args: {version: string}

gpu.model:
  args: {name: string}
```

---

## 6. API 设计

### 6.1 提交观测

```http
POST /observations
Content-Type: application/json

{
  "source": "compositor_monitor",
  "facts": [
    {"pred": "display.black_screen", "args": {"duration": "ge_2s"}, "value": true}
  ],
  "context": {
    "env.os": "win11",
    "gpu.model": "rtx4090"
  },
  "raw_refs": {
    "logs": "s3://..."
  }
}
```

**响应**：

```json
{
  "obs_id": "obs_20260110_001",
  "explanation": {
    "success": true,
    "best_regulation": {
      "regulation_id": "reg_005",
      "score": 0.85,
      "story": ["compositor.restarted", "→", "surface.handle_reused", "→", "swapchain.create_failed", "→", "display.black_screen"]
    }
  },
  "event_created": null
}
```

或（解释失败时）：

```json
{
  "obs_id": "obs_20260110_002",
  "explanation": {
    "success": false,
    "attempts": [...]
  },
  "event_created": {
    "event_id": "evt_015",
    "unexplained_core": [
      {"pred": "gpu.device_removed", "value": true}
    ]
  }
}
```

### 6.2 查询 Event Pool

```http
GET /events?status=pending&limit=50
```

### 6.3 手动触发归纳

```http
POST /induce
Content-Type: application/json

{
  "min_cluster_size": 3,
  "similarity_threshold": 0.7
}
```

**响应**：

```json
{
  "clusters_found": 2,
  "candidates_created": [
    {
      "regulation_id": "reg_candidate_001",
      "from_events": ["evt_001", "evt_003", "evt_007"],
      "pattern": {
        "pre": [...],
        "eff": [...]
      }
    }
  ]
}
```

### 6.4 查询规则

```http
GET /regulations?status=confirmed
GET /regulations/{regulation_id}
```

### 6.5 手动添加/修改规则

```http
POST /regulations
PUT /regulations/{regulation_id}
```

---

## 7. 存储设计

### 7.1 表结构（PostgreSQL）

```sql
-- 观测记录
CREATE TABLE observations (
    obs_id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    source TEXT,
    facts JSONB NOT NULL,
    context JSONB,
    raw_refs JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events
CREATE TABLE events (
    event_id TEXT PRIMARY KEY,
    obs_id TEXT REFERENCES observations(obs_id),
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, clustered, resolved
    explanation_attempts JSONB,
    unexplained_core JSONB NOT NULL,
    similar_events TEXT[],
    resolved_by TEXT REFERENCES regulations(regulation_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 因果规则
CREATE TABLE regulations (
    regulation_id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'candidate',  -- candidate, hypothesis, confirmed, deprecated
    pattern JSONB NOT NULL,
    scope JSONB,
    origin JSONB NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{"support":{"count":0},"contradiction":{"count":0}}',
    lifecycle JSONB,
    verification JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：用于快速查找能产生某效应的规则
CREATE INDEX idx_regulations_effects ON regulations 
    USING GIN ((pattern->'eff'));

-- 索引：用于查找 pending events
CREATE INDEX idx_events_status ON events(status) WHERE status = 'pending';
```

### 7.2 倒排索引（内存/Redis）

```python
# Effect → Regulations 索引
# 用于快速查找"能产生某个效应"的规则
effect_index = {
    "display.black_screen:true": ["reg_001", "reg_005", "reg_012"],
    "swapchain.create_failed:true": ["reg_003", "reg_005"],
    ...
}

# Precondition → Regulations 索引  
# 用于正向推理
pre_index = {
    "compositor.restarted:true": ["reg_005", "reg_007"],
    ...
}
```

---

## 8. Skill 文件结构

```
/mnt/skills/user/causal-learner/
├── SKILL.md                      # 主入口文档
├── schemas/
│   ├── observation.schema.json   # 观测结构
│   ├── event.schema.json         # Event 结构
│   ├── regulation.schema.json    # 规则结构
│   └── api.schema.json           # API 请求/响应
├── templates/
│   ├── python/
│   │   ├── models.py             # 数据模型
│   │   ├── explainer.py          # 解释器
│   │   ├── detector.py           # Event 检测
│   │   ├── inducer.py            # 规则归纳
│   │   ├── validator.py          # 验证与晋升
│   │   └── storage.py            # 存储层
│   └── sql/
│       └── schema.sql            # 数据库 schema
├── examples/
│   └── gpu_display/
│       ├── predicates.yaml       # 谓词定义
│       ├── seed_regulations.json # 种子规则
│       └── walkthrough.md        # 使用演示
└── prompts/
    ├── extract_facts.md          # 从日志提取 facts
    └── design_predicates.md      # 设计谓词体系
```

---

## 9. 设计哲学总结

### 9.1 为什么是"Event 驱动"？

| 传统方式 | Event 驱动 |
|---------|-----------|
| 记录所有观测 | 只记录"意外" |
| 存储成本高 | 存储成本低 |
| 规则是静态的 | 规则从 events 生长 |
| 不知道知识边界 | events = 知识边界的可视化 |

### 9.2 核心不变式

```
∀ observation:
    explained(observation, regulations) ∨ event_created(observation)
```

每个观测要么能被解释，要么变成 event。没有中间态。

### 9.3 系统的"记忆"

- **短期记忆**：Event Pool（等待归纳的意外）
- **长期记忆**：Cause Regulations（已归纳的规则）
- **遗忘机制**：Events 被消解、Regulations 被 deprecated

### 9.4 与人类学习的类比

```
人类                          系统
────────────────────────────────────────
遇到意外 → 困惑               检测到 Event
积累相似经验                  Event 聚类
"哦我明白了"                  归纳出 Regulation
下次遇到不再意外              Event 被消解
知识过时/错误                 Regulation deprecated
```

---

## 10. 下一步行动

1. **定义谓词体系**（30-50 个核心谓词）
2. **实现 Explainer**（用规则解释观测）
3. **实现 Event Detector**（检测无法解释的观测）
4. **实现 Inducer**（聚类 + 归纳）
5. **搭建存储层**（PostgreSQL + Redis 索引）
6. **部署 API 服务**
7. **接入真实数据流**
