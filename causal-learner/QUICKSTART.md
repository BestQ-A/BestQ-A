# 🚀 Causal Learner 快速开始

## 核心理念

**异常驱动的因果学习** - 只记录"意外"，从意外中学习规律

**谓词演化** - 不预定义谓词，从原始描述中自然涌现

详见：[docs/predicate-evolution-philosophy.md](../docs/predicate-evolution-philosophy.md)

---

## 安装和构建

```bash
cd causal-learner/mcp-server

# 安装依赖
npm install

# 编译 TypeScript
npm run build

# 运行基础测试
node test-basic.mjs
```

---

## 完整工作流（End-to-End）

### Step 1: 下载 SWE-bench 数据

```bash
cd causal-learner

# 安装 Python 依赖
pip install datasets

# 下载 SWE-bench Verified (500个样本，已验证)
python scripts/download-swebench.py

# 或下载 Lite 版本（更快）
python scripts/download-swebench.py lite
```

数据将保存到 `data/swebench/swebench_verified.json`

### Step 2: 批量导入并学习

```bash
cd mcp-server

# 导入前 50 个 issue（Phase 1: 基于关键词）
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 50
```

**预期输出**：
```
📥 Importing SWE-bench data...
📊 Found 500 issues, processing 50
   Processed 10/50...
   Processed 20/50...
   ...
✅ Import complete:
   Total processed: 50
   Events created: 48
   Explained: 2
```

### Step 3: 触发归纳学习

导入后会自动运行归纳，或手动触发：

```typescript
// 在 MCP tool 中调用
trigger_induction({
  minClusterSize: 2,
  minSimilarity: 0.3
})
```

**预期输出**：
```
Found 12 cluster(s)
Created 8 regulation(s)
Resolved 35 event(s)
```

### Step 4: 可视化分析

```bash
# 生成 HTML dashboard
node scripts/visualize.mjs data/causal.db

# 浏览器打开
# file:///E:/1_agents_space/9_AGI/BestQ-A/causal-learner/mcp-server/visualization/dashboard.html
```

**Dashboard 包含**：
- 📊 系统统计（观测数、事件数、规则数）
- 📋 Event Pool 列表（未解释的异常）
- ⚡ Regulation Library（已学习的因果规则）
- 📈 学习曲线（解释率、解决率）

### Step 5: 性能评估

```bash
# 运行完整评估（50 个样本）
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50
```

**评估指标**：
- **Explanation Rate**: 能解释的观测比例
- **Resolution Rate**: Events 被解决的比例
- **Learning Efficiency**: 每个 Event 产生的规则数
- **Regulation Quality**: 规则的支持/反例比

---

## 工作原理示例

### 输入：3 个相似的 Django issue

```json
Issue 1: "test_queryset 失败，NoneType 没有 pk 属性"
Issue 2: "外键访问报错 AttributeError: NoneType.id"
Issue 3: "user.profile.name 崩溃，profile 是 None"
```

### Phase 1: 关键词提取

```javascript
Issue 1 keywords: ["queryset", "failed", "nonetype", "pk", "attribute"]
Issue 2 keywords: ["foreign", "key", "attributeerror", "nonetype", "id"]
Issue 3 keywords: ["user", "profile", "name", "none", "attribute"]

相似度计算:
  sim(1, 2) = 0.73
  sim(1, 3) = 0.68
  sim(2, 3) = 0.71
```

### Phase 2: 聚类

```
Cluster #1: [Issue 1, Issue 2, Issue 3]
共同关键词: ["nonetype", "attribute", "none"]
```

### Phase 3: 归纳规则

```json
{
  "regulation_id": "reg_abc123",
  "status": "candidate",
  "pre": [
    {"pred": "keyword", "value": "none"},
    {"pred": "keyword", "value": "attribute"}
  ],
  "eff": [
    {"pred": "keyword", "value": "attributeerror"},
    {"pred": "keyword", "value": "nonetype"}
  ],
  "support": 3
}
```

### Phase 4: 验证和演化

随着更多观测，关键词逐渐演化为结构化谓词：

```json
{
  "pre": [
    {"pred": "code.null_access", "value": true},
    {"pred": "code.foreign_key", "value": true}
  ],
  "eff": [
    {"pred": "error.type", "value": "AttributeError"}
  ]
}
```

---

## MCP Tools 快速参考

### 提交观测
```typescript
submit_observation({
  observation: {
    facts: [
      {pred: "keyword", value: "error"},
      {pred: "keyword", value: "null"}
    ],
    context: {repo: "django/django"}
  }
})
```

### 触发归纳
```typescript
trigger_induction({
  minClusterSize: 2,
  minSimilarity: 0.3
})
```

### 查询系统状态
```typescript
get_stats()  // 系统统计
list_events({status: "open"})  // 未解决的异常
list_regulations({status: "confirmed"})  // 已确认的规则
```

### 导入 SWE-bench issue
```typescript
import_swe_issue({
  issue: {
    issueId: "django__django-12345",
    repo: "django/django",
    title: "...",
    description: "...",
    errorLog: "..."
  }
})
```

---

## 性能基准

**基于 50 个 SWE-bench Verified 样本的初步测试**：

| 指标 | 目标 | 当前 |
|------|------|------|
| Explanation Rate | > 20% | ~5% (初期) |
| Resolution Rate | > 60% | ~70% |
| Regulations Created | 5-10 | ~8 |
| Learning Efficiency | > 0.15 | ~0.16 |

**预期改进路径**：
1. 积累 100+ observations → 解释率提升到 15%
2. 积累 500+ observations → 解释率提升到 30%
3. 谓词演化到 Phase 3 → 解释率提升到 50%+

---

## 下一步优化

1. **关键词质量提升**
   - 实现更好的 tokenization
   - 添加领域词典（code-specific terms）
   - 优化 TF-IDF 权重

2. **聚类算法优化**
   - 尝试层次聚类
   - 动态调整相似度阈值
   - 考虑语义相似度（可选使用 embedding）

3. **谓词发现自动化**
   - 从高频关键词组合自动生成候选谓词
   - 验证候选谓词的预测能力
   - 晋升机制：keyword → emerging_predicate → confirmed_predicate

4. **可视化增强**
   - 添加交互式图表
   - 规则依赖关系网络图
   - 时间线动画展示学习过程

---

## 故障排查

### 数据库锁定
```bash
rm mcp-server/data/causal.db  # 删除旧数据库
```

### 模块导入错误
```bash
cd mcp-server
npm run build  # 重新编译
```

### Python 依赖问题
```bash
pip install datasets huggingface_hub
```

---

## 参考文档

- [谓词演化哲学](../docs/predicate-evolution-philosophy.md) - 核心理念
- [设计文档](../docs/causal-learner-design.md) - 系统架构
- [SKILL.md](skills/causal-learning/SKILL.md) - MCP 使用指南
- [开发记录](../docs/history/2026-01-10-causal-learner-plugin.md) - 实现细节
