# CausalPipeline 编排合同：调用序列与失败语义

> 本文档定义 Pipeline 的三条核心流程、事务边界、幂等性约束、错误处理策略与不变量。
> Pipeline 是闭环编排器，没有这份合同，调用顺序、失败语义、事务边界容易漂移。
> 代码位置：`tools/observation.ts`, `tools/swebench.ts`, `core/index.ts`

---

## 1. 三条核心流程

### 1.1 submitObservation 流程

```
观测输入
  ↓
1. saveObservation() → 保存到历史库
  ↓
2. detectEvent() → 用现有 Regulation 尝试解释
  ↓
3. (explained=true) 
   ├─ updateEvidence(regulationIds) → 更新每条使用的 Regulation
   └─ 返回 SubmitObservationResult(explained=true, story, regulationsUsed)
   
   (explained=false)
   ├─ createEvent() → 创建 Event(status=open)
   ├─ saveEvent(event) → 保存到库
   └─ 返回 SubmitObservationResult(explained=false, eventCreated)
```

**关键参数**：
- `minScore`: 解释的最低评分阈值（默认无限制）
- `maxAssumptions`: 解释中允许的最大假设数（默认无限制）
- `updateEvidence`: 是否增加已使用 Regulation 的 evidence 计数（默认 true）

**返回格式**：
```json
{
  "explained": boolean,
  "story": Story | undefined,
  "eventCreated": Event | undefined,
  "regulationsUsed": string[],
  "message": string
}
```

---

### 1.2 recordFix 流程

```
Fix 信息 + eventId
  ↓
1. getEvent(eventId) → 获取未解决事件
  ↓
2. 查找已有 Regulation 匹配该 Event 的 unexplainedAspects
  ├─ 找到 → targetReg = 该 Regulation
  └─ 未找到 → 从事件观测创建新 Regulation
  ↓
3. updateRegulation(targetReg)
   ├─ supportN++ (证据数增加)
   ├─ explainedCount++ (成功解释数增加)
   ├─ 加入 fix 元数据
   └─ 按 supportN 升级状态：3→hypothesis, 10→confirmed
  ↓
4. updateEventStatus(eventId, 'resolved') → 事件标记已解决
  ↓
5. 返回 FixResult(regulation, event, supportN, status)
```

**必须满足的前置条件**：
- eventId 对应的 Event 状态必须为 'open' 或 'clustered'（已解决事件不能再 fix）
- fix 对象必须包含 fixCommit 和 fixDescription

**状态升级规则**（supportN 是累积证据数）：
- `candidate` → `hypothesis`: supportN >= 3
- `hypothesis` → `confirmed`: supportN >= 10

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

| 操作 | 原子性 | 失败语义 | 回滚/重试策略 |
|------|--------|---------|-------------|
| `saveObservation` | 单 DB 事务 | 写入全成功或全失败 | 失败则 throw，调用者处理 |
| `detectEvent` | 无事务（只读 + tentative 创建） | 返回最优解释，无副作用 | 纯计算，无副作用 |
| `createEvent` | 单 DB 事务 | Event 要么创建要么不创建 | 失败则 throw，不部分提交 |
| `updateEvidence` | 单 DB 事务（per-regulation） | 每条 Regulation 独立增量 | 失败的 Regulation 不影响已成功的 |
| `updateRegulation` | 单 DB 事务 | 所有字段更新要么全成功 | 失败则 throw，不部分更新 |
| `updateEventStatus` | 单 DB 事务 | 状态转移原子 | 失败则 throw |
| `recordFix` | 跨多个 DB 事务（非原子） | 先改 Regulation，再改 Event | 见"复合操作失败语义" |

### 复合操作失败语义

**recordFix 中**：
- 如果 updateRegulation 失败，事件状态不变（未标记 resolved）
- 如果 updateEventStatus 失败，Regulation 已被修改（可能需要手动一致性检查）

**推荐处理**：
```
try {
  updateRegulation(targetReg);
  updateEventStatus(eventId, 'resolved');
} catch (e) {
  log.error('recordFix 部分失败', { eventId, error: e.message });
  // 调用者可选：重试 updateEventStatus 或纠正一致性
}
```

---

## 3. 幂等性约束

| 操作 | 幂等 | 说明 |
|------|------|------|
| `saveObservation` | ✅ | Observation 有 ID；重复保存时更新 lastSeen 字段 |
| `detectEvent` | ✅ | 纯计算无副作用；多次调用返回相同结果 |
| `createEvent` | ❌ | 会生成新 Event ID；重复调用产生不同事件 |
| `updateEvidence` | ❌ | 递增操作，重复调用会累加 supportN |
| `updateRegulation` | ✅ | 字段覆盖式更新；重复同样的内容不产生区别 |
| `updateEventStatus` | ✅ | 状态转移幂等（已是目标状态时无操作） |
| `recordFix` | ❌ | 会累加 supportN 和创建新 fix 记录 |

**幂等性设计建议**：
- 调用 `recordFix` 前需自行去重（检查 fix 是否已记录）
- 调用 `updateEvidence` 前检查 Regulation 是否已在该观测上计数
- 不要多次调用 `createEvent`；使用 `getEvent` 检查是否已存在

---

## 4. 错误处理策略

### 4.1 分类失败（classify 返回 null 或异常）

```
流程位置：submitObservation 开头
处理方式：跳过分类，继续后续步骤
结果：observation 保存，照常尝试解释
```

**不中断管道**：分类失败不妨碍问题解决，只是缺少问题类别标签。

### 4.2 解释无结果（detectEvent 返回 explained=false）

```
流程位置：submitObservation 核心
处理方式：创建 Event(status=open)
结果：Story 保持 open，建议告知用户"需要更多数据"
```

**后续路径**：
- 等待更多相关观测加入，可用 `reevaluateEvent` 周期性重试
- 或手动 `recordFix` 来提供修复证据

### 4.3 编译路径非法（compile 拒绝）

```
流程位置：recordFix 中调用 updateRegulation 前
处理方式：返回零结果，不写入任何 Ref
结果：Event 不标记 resolved，Regulation 不更新
```

**原因例**：
- 路径中存在禁止的复合（如 `indicates` → `causes`）
- RefForce 约束违反（力度不单调下降）
- 证据策略冲突

### 4.4 Evidence 写入失败

```
流程位置：submitObservation 的 updateEvidence 循环
处理方式：记录错误，继续处理其他 Regulation
结果：部分 Regulation 的 evidence 未更新，但观测仍被保存
```

**日志建议**：
```
log.warn('Evidence 写入失败', {
  regulationId: regId,
  eventId: obsId,
  error: e.message
});
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
| **O1** | submitObservation 必须创建 Story 或 Event（即使分类失败） | submitObservationTool 返回前 |
| **O2** | 已解决事件（status='resolved'）不能再次记录 fix | recordFixTool 开头 |
| **O3** | 每个 Event 对应至少一个 Observation | createEvent 时 |
| **O4** | recordFix 必须先 updateRegulation 再 updateEventStatus | recordFixTool 顺序 |
| **O5** | 确认路径合法（isPathLegal）才能写入 compiled Ref | compile 门控 |
| **O6** | Evidence 写入必须在路径合法性检查之后 | compile 之后、myelinate 之前 |
| **O7** | myelinate（快捷路径创建）在 compile 之后 | recordFixTool 末尾 |

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
| `beforeDetectEvent` | `(obs: Observation) → void` | 观测预处理、校验 |
| `afterExplained` | `(story: Story) → void` | 解释成功的后处理 |
| `beforeCreateEvent` | `(unexplainedAspects: Fact[]) → void` | Event 创建前的最后校验 |
| `afterRecordFix` | `(reg: Regulation, event: Event) → void` | Fix 记录完成的后处理 |

---

## 8. 性能与规模约束

| 约束 | 建议值 | 理由 |
|------|---------|------|
| `detectEvent` 搜索深度 | maxDepth=5 | 超过 5 级的路径解释力极低 |
| `detectEvent` Beam 宽度 | beamSize=30 | 权衡穷举与效率 |
| 单次 updateEvidence 的 Regulation 数 | ≤100 | 避免单个观测拉动过多规则 |
| Event 历史窗口 | 最近 10000 个 | 超过部分可归档 |

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
