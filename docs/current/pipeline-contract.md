---
kind: contract
status: current
verified: 2026-04-14
phase: 1
schema_version: 1
describes: "pipeline 的调用序列"
---

# CausalPipeline 编排合同：调用序列与失败语义

> 本文档定义 Pipeline 的三条核心流程、事务边界、幂等性约束、错误处理策略与不变量。
> Pipeline 是闭环编排器，没有这份合同，调用顺序、失败语义、事务边界容易漂移。
> 代码位置：`core/pipeline.ts`

---

## 1. 三条核心流程

### 1.1 submitObservation 流程

```
观测输入 (ObservationInput)
  ↓
1. AtomGraph.ingestFacts(facts, context) → Atoms
  ↓
2. ProblemClass.classify(rawInput) → 分类结果
  ↓
3. StoryStorage.create() → Story (status=open)
  ↓
4. AtomGraph.explore(factAtomIds) → 候选路径
   （受 RefAlgebra 剪枝，非法复合被丢弃）
  ↓
5. PatternEngine.matchTemplates(atoms, refChecker) → 模板匹配
  ↓
6. StoryStorage.startExploring(storyId, candidatePaths)
  ↓
7. 返回 ObservationResult {atoms, classification, story, candidatePaths, templateMatches, suggestions}
```

**关键约束**：
- classify 失败 → 跳过分类，继续后续步骤
- explore 无结果 → Story 保持 open，suggestions 提示"等待更多数据"
- 图是唯一写模型，ingestFacts 是唯一的 Atom 写入口

---

### 1.2 recordFix 流程

```
Fix 信息 (FixInput: storyId + fixDescription + chosenPathAtomIds)
  ↓
1. AtomGraph.addAtom(fixDescription, ACTION) → 修复 Atom
  ↓
2. AtomGraph.compile(correctPath, failedPaths)
   → RefAlgebra 路径预检（不合法则返回零结果）
   → 正确路径: weight↑, mode='compiled'
   → 失败路径: weight↓, 低于阈值则删除
  ↓
3. StoryStorage.resolve(storyId, 'success')
  ↓
4. EvidenceStore.recordSupport() → 为路径上每条 compiled Ref 记录证据
  ↓
5. StoryStorage.markCompiled(storyId)
  ↓
6. AtomGraph.myelinate() → 尝试创建 Shortcut（尽力而为）
  ↓
7. RegulationViewBuilder.buildAll() → 刷新只读视图
  ↓
8. 返回 FixResult {story, compile, evidenceCount, regulationViews}
```

**关键约束**：
- compile 前必须通过 RefAlgebra 路径合法性检查
- 已 `resolved` 的 Story 禁止再次 `recordFix`
- compile 被拒绝时，Story 保持未 resolved
- Evidence 写在 compile 之后（先确认合法，再记录证据）
- Evidence 写入失败不回滚 compile 主结果
- `myelinate()` 失败不回滚 compile 主结果
- Regulation 只是投影，不直接写入

---

### 1.3 search 流程

```
查询 Query
  ↓
1. ProblemClass.classify(query) → 问题分类
  ↓
2. AtomGraph.findAtoms(query) → 查找相关原子知识
  ↓
3. AtomGraph.explore(atomIds) → 从原子出发找候选路径
   ├─ divergent 模式：找所有可达解释
   └─ tentative/compiled 边混合使用
  ↓
4. RegulationViewBuilder.search(query) → 查找匹配的规律视图
  ↓
5. 返回 SearchResult
   {
     classification: string,
     paths: Path[],
     regulations: RegulationView[],
     suggestions: string[]
   }
```

---

## 2. 事务边界与失败语义

| 操作 | 原子性 | 失败语义 |
|------|--------|---------|
| `ingestFacts` | 单 DB 事务 | Atom 创建全成功或全失败 |
| `classify` | 无事务（纯计算） | 失败则跳过，不阻塞 |
| `explore` | 非原子（只读 + tentative 创建） | 部分 tentative 可能已写入 |
| `compile` | 单 DB 事务 | 路径不合法则全部不写 |
| `Story.create/resolve` | 单 DB 事务 | 状态要么更新要么不动 |
| `Evidence.record` | 单 DB 事务 + append-only | 失败仅影响证据条目，不回滚 compile 主结果 |
| `myelinate` | 尽力而为 | 失败不影响主流程 |

---

## 3. 幂等性约束

| 操作 | 幂等 | 说明 |
|------|------|------|
| `ingestFacts` | ✅ | canonicalKey 去重 |
| `addRef` | ✅ | UNIQUE(from, to, kind) 冲突时更新 weight |
| `classify` | ✅ | 纯计算无副作用 |
| `compile` | ❌ | weight 会累加 |
| `recordFix` | ❌ | 会创建新 Evidence |
| `myelinate` | ✅ | Shortcut 存在则跳过 |
| `Story.create` | ❌ | 每次创建新 Story |

---

## 4. 错误处理策略

### 4.1 分类失败（classify 返回 null 或异常）

```
流程位置：submitObservation 开头
处理方式：跳过分类，继续后续步骤
结果：observation 保存，照常尝试解释
```

**不中断管道**：分类失败不妨碍问题解决，只是缺少问题类别标签。

### 4.2 探索无结果（explore 返回空路径）

```
流程位置：submitObservation 核心
处理方式：Story 保持 open，suggestions 提示等待更多数据
结果：Story 保持 open，建议告知用户"需要更多数据"
```

**后续路径**：
- 等待更多相关观测加入，可用 `reevaluateEvent` 周期性重试
- 或手动 `recordFix` 来提供修复证据

### 4.3 编译路径非法（compile 拒绝）

```
流程位置：recordFix 中调用 compile 前
处理方式：返回零结果，不写入任何 Ref
结果：Story 不标记 resolved，Regulation 视图不更新
```

**原因例**：
- 路径中存在禁止的复合（如 `indicates` → `causes`）
- RefForce 约束违反（力度不单调下降）
- 证据策略冲突

### 4.4 Evidence 写入失败

```
流程位置：recordFix 的 EvidenceStore.recordSupport 调用
处理方式：记录错误，继续后续流程
结果：部分 Ref 的 Evidence 未记录，但路径已编译，Story 仍按 compile 主结果推进
```

**日志建议**：
```
log.warn('Evidence 写入失败', {
  refId: refId,
  storyId: storyId,
  error: e.message
});
```

### 4.5 myelinate 失败

```
流程位置：recordFix 末尾的 AtomGraph.myelinate()
处理方式：记录错误，继续返回 compile 主结果
结果：Shortcut 可能未更新，但 Story/Evidence/Regulation 主流程不回滚
```

---

## 5. 版本戳与校准（Versioning & Calibration）

Pipeline 每次操作应记录当前系统版本信息以支持后续校准：

```typescript
interface PipelineContext {
  // 代数版本（RefAlgebra 规则的演变）
  algebraVersion: string;        // 如 "v2.1_compositional"
  
  // 模板版本（PatternTemplate 演变）
  templateVersion: string;       // 如 "v1.3_convergent"
  
  // 策略版本（Strategy 集合演变）
  strategyVersion: string;       // 如 "v2_diagnostic"
  
  // 时间戳
  timestamp: string;             // ISO 8601
}
```

**实现**（尚未完成，作为待办项）：
- 在 submitObservation 结果中附加 `pipelineContext`
- 在 recordFix 前验证版本一致性
- 版本不匹配时记录告警，评估是否需要重新校准

---

## 6. 不变量（Invariants）

这些条件必须始终成立，违反则系统处于不一致状态：

| 不变量 | 说明 | 检查点 |
|--------|------|--------|
| **O1** | submitObservation 必须创建 Story（即使分类失败） | submitObservation 返回前 |
| **O2** | 已 resolved 的 Story 不能再次 recordFix | recordFix 开头 |
| **O3** | ingestFacts 是唯一的 Atom 写入口 | AtomGraph.ingestFacts |
| **O4** | recordFix 必须先 compile 再 recordSupport | recordFix 顺序 |
| **O5** | 确认路径合法（isPathLegal）才能写入 compiled Ref | compile 门控 |
| **O6** | compile 被拒绝时 Story 保持未 resolved | recordFix 返回前 |
| **O7** | Evidence 写入必须在路径合法性检查之后，且失败不回滚 compile | compile 之后、myelinate 之前 |
| **O8** | myelinate（快捷路径创建）在 compile 之后，且失败不回滚主结果 | recordFix 末尾 |

**违反检测**：
```typescript
if (event.status === 'resolved') {
  throw new Error(
    `不变量 O2 违反: Event ${eventId} 已解决，不能重新 fix`
  );
}
```

---

## 7. 扩展点与挂钩

Pipeline 支持在关键点插入自定义逻辑，但不能修改核心流程顺序：

| 挂钩点 | 签名 | 典型用途 |
|--------|------|---------|
| `beforeIngestFacts` | `(input: ObservationInput) → void` | 观测预处理、校验 |
| `afterExplore` | `(story: Story, paths: Path[]) → void` | 探索完成的后处理 |
| `beforeCompile` | `(correctPath: string[], failedPaths: string[][]) → void` | compile 前的最后校验 |
| `afterRecordFix` | `(story: Story, compile: CompileResult) → void` | Fix 记录完成的后处理 |

---

## 8. 性能与规模约束

| 约束 | 建议值 | 理由 |
|------|---------|------|
| `explore` 搜索深度 | maxDepth=5 | 超过 5 级的路径解释力极低 |
| `explore` Beam 宽度 | beamSize=30 | 权衡穷举与效率 |
| 单次 compile 的路径节点数 | ≤100 | 避免单次编译拉动过多 Ref |
| Story 历史窗口 | 最近 10000 个 | 超过部分可归档 |

---

## 9. 调试与监控

建议在 Pipeline 关键点记录以下信息供后期审计：

```typescript
interface PipelineAuditLog {
  eventId?: string;
  regulationId?: string;
  operation: 'submit' | 'detect' | 'create' | 'fix' | 'update';
  status: 'success' | 'failure' | 'partial';
  timestamp: string;
  duration_ms: number;
  details?: Record<string, unknown>;
}
```

---

## 10. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-04-10 | 初稿：定义三流程、事务边界、幂等性、不变量 |

---

## 参考

- [[ref-algebra-contract|RefAlgebra 合同]] — Ref 复合和 Evidence 继承规则
- [[template-invariant-contract|PatternTemplate 合同]] — 模板约束与生命周期
- [[metamodel|元模型]] — 五模块系统架构
