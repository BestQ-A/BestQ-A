# 谓词演化哲学 (Predicate Evolution Philosophy)

> **核心思想**：谓词不是预先定义的，而是从原始经验中自然涌现出来的。

---

## 1. 从具体描述开始（Phase 0）

**一开始没有谓词**，只有具体的、详细的自然语言描述：

```
描述 1:
"在 Django ORM 查询时，如果外键字段为 null，
直接访问关联对象的属性会抛出 AttributeError:
'NoneType' object has no attribute 'pk'"

描述 2:
"测试 test_queryset_filter 失败，原因是 user.profile.pk
访问时 user.profile 是 None，导致 AttributeError"

描述 3:
"在处理外键关系时，没有检查 null 就访问了 .id 字段，
结果报错 'NoneType' object has no attribute 'id'"
```

这些是**原始经验**：
- 过程描述：外键为 null + 直接访问属性
- 结果描述：AttributeError + NoneType 消息

---

## 2. 发现共同模式（Phase 1 - 关键词相关性）

**第一步：像搜索引擎一样提取关键词**

从大量描述中用 **TF-IDF** 提取高频词：

```javascript
描述 1 关键词: [null, 外键, 访问, 属性, AttributeError, NoneType, pk]
描述 2 关键词: [null, profile, 访问, AttributeError, NoneType, pk]
描述 3 关键词: [null, 外键, 访问, AttributeError, NoneType, id]
```

**第二步：基于关键词相似度聚类**

计算余弦相似度：
```
sim(描述1, 描述2) = 0.82  ✅ 相似
sim(描述1, 描述3) = 0.85  ✅ 相似
sim(描述2, 描述3) = 0.79  ✅ 相似
```

→ 形成一个聚类（Cluster）

**第三步：从聚类中发现共同部分**

统计分析聚类内的共现模式：
```
高频词（出现在 100% 描述中）:
  - null (100%)
  - 访问 (100%)
  - AttributeError (100%)
  - NoneType (100%)

中频词（出现在 67%+ 描述中）:
  - 外键 (67%)
  - pk/id (100% 但形式不同)
```

---

## 3. 抽象出因果规律（Phase 2 - 统计抽象）

**忽略细节，提取形式相似的核心**：

```
聚类签名（Cluster Signature）:
  [null, 访问, AttributeError, NoneType]

抽象规律：
  IF:  有 null 值的字段 + 直接访问属性
  THEN: 抛出 AttributeError (NoneType 无属性)
```

**转化为初步因果规则**：

```json
{
  "regulation_id": "reg_001",
  "status": "candidate",
  "pattern": {
    "pre": [
      {"keyword": "null", "score": 1.0},
      {"keyword": "访问", "score": 1.0},
      {"keyword": "外键", "score": 0.67}
    ],
    "eff": [
      {"keyword": "AttributeError", "score": 1.0},
      {"keyword": "NoneType", "score": 1.0}
    ]
  },
  "evidence": {
    "support_count": 3,
    "cluster_size": 3
  }
}
```

此时规则还是**基于关键词**的，不是结构化的谓词。

---

## 4. 结构化演化（Phase 3 - 谓词涌现）

**当规则积累更多证据后，逐渐结构化**：

随着更多相似观测（如 10+ 个），可以提炼出更精确的模式：

```
观测到的共同模式：
  - 100% 涉及对象属性访问
  - 90% 是外键/关联对象
  - 95% 缺少 null 检查
  - 100% 报 AttributeError

→ 自动涌现结构化谓词：
  pre: code.missing_null_check + code.foreign_key_access
  eff: error.type(AttributeError) + error.pattern(NoneType.*)
```

**关键点**：谓词不是人工定义的，而是从关键词聚类中**自动提炼**出来的。

---

## 5. 完整演化路径

```
Phase 0: 原始自然语言描述
         ↓ (大量积累)
Phase 1: 关键词提取 + TF-IDF 相关性计算
         ↓ (聚类发现相似经验)
Phase 2: 统计抽象 → 基于关键词的因果规律
         ↓ (积累更多证据)
Phase 3: 结构化 → 涌现出谓词体系
         ↓ (持续验证和优化)
Phase 4: 成熟的谓词逻辑系统
```

---

## 6. 实现策略

### 6.1 初期（现在）

**存储原始文本 + 关键词**：

```typescript
Observation {
  raw_text: "完整的自然语言描述...",
  keywords: ["null", "访问", "AttributeError", ...],
  facts: []  // 暂时为空，后续从关键词生成
}
```

**聚类基于关键词相似度**：

```typescript
cluster = clusterByKeywordSimilarity(observations, minSim=0.3)
```

### 6.2 中期（积累经验后）

**从聚类中提取候选谓词**：

```typescript
// 高频关键词组合 → 候选谓词
["null", "访问"] 出现 95 次 → 候选谓词: "null_access"
["AttributeError", "NoneType"] 出现 92 次 → 候选谓词: "none_attribute_error"
```

**规则逐渐结构化**：

```json
{
  "pre": [
    {"keyword_cluster": ["null", "访问", "外键"]},  // 还是关键词，但已分组
    {"emerging_predicate": "null_access", "confidence": 0.8}  // 涌现中的谓词
  ]
}
```

### 6.3 后期（谓词成熟）

**完全结构化**：

```json
{
  "pre": [
    {"pred": "code.missing_null_check", "value": true},
    {"pred": "code.foreign_key_access", "value": true}
  ],
  "eff": [
    {"pred": "error.type", "args": {"kind": "AttributeError"}, "value": true}
  ]
}
```

---

## 7. 核心优势

| 传统方式 | 谓词演化方式 |
|---------|-------------|
| 预先定义谓词体系 | 从数据中涌现 |
| 需要领域专家 | 自动发现模式 |
| 固定、脆弱 | 动态、适应性强 |
| 冷启动困难 | 从第一条描述就能工作 |

**关键洞察**：
> 人类也不是先学逻辑再认知世界，而是先积累具体经验，
> 再从经验中提炼出抽象概念和逻辑规则。

---

## 8. 实现检查点

- [x] Phase 0: 存储原始文本（rawRefs 字段）
- [ ] Phase 1: 关键词提取和 TF-IDF
- [ ] Phase 2: 基于关键词的聚类
- [ ] Phase 3: 候选谓词发现
- [ ] Phase 4: 谓词验证和晋升

---

## 9. 示例：完整演化过程

**输入（原始描述 x 20）**：

```
"Django test_filter 失败，NoneType.pk 报错"
"测试报 AttributeError，user.profile 是 None"
"外键访问崩溃，NoneType 无 id 属性"
... (17 more similar)
```

**Phase 1 输出（关键词聚类）**：

```
Cluster #1: 20 个描述
  共同关键词: [null, 访问, AttributeError, NoneType, 外键]
  相似度: 0.75 - 0.92
```

**Phase 2 输出（初步规律）**：

```
Regulation candidate_001:
  keywords_pre: [null, 访问, 外键]
  keywords_eff: [AttributeError, NoneType]
  support: 20
```

**Phase 3 输出（涌现谓词）**：

```
发现候选谓词:
  - null_access (from ["null", "访问"], coverage=95%, score=0.89)
  - none_type_error (from ["NoneType", "AttributeError"], coverage=100%, score=0.95)

Regulation candidate_001 升级:
  pre: [emerging_predicate("null_access")]
  eff: [emerging_predicate("none_type_error")]
```

**Phase 4 输出（成熟谓词）**：

```
经过 50+ 验证后：
  null_access → 提炼为 code.missing_null_check
  none_type_error → 提炼为 error.null_pointer_access

Regulation confirmed_001:
  pre: [code.missing_null_check, code.foreign_key_access]
  eff: [error.type(AttributeError), error.pattern(NoneType.*)]
  status: confirmed
  support: 58, contradict: 2
```

---

## 总结

**谓词演化 = 从经验到抽象的自然过程**

1. 先收集**大量具体经验**（自然语言描述）
2. 用**统计方法**发现共现模式（关键词聚类）
3. 从模式中**抽象出候选谓词**（忽略细节）
4. 通过**持续验证**晋升成熟谓词

这样系统可以：
- ✅ 从零开始，无需预定义
- ✅ 自适应不同领域
- ✅ 持续演化和优化
- ✅ 保持灵活性
