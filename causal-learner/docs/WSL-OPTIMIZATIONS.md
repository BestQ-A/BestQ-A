# WSL 环境优化建议

切换到 WSL 后可以利用的性能优化和开发增强。

---

## 1. 存储层优化

### 使用 better-sqlite3 的高级特性

```typescript
// 批量插入优化（10-50x 速度提升）
const insertStmt = db.prepare('INSERT INTO events (event_id, data) VALUES (?, ?)');
const insertMany = db.transaction((events) => {
  for (const evt of events) {
    insertStmt.run(evt.eventId, JSON.stringify(evt));
  }
});

// 使用事务
insertMany(events);  // 单次事务，性能大幅提升
```

```typescript
// 预编译语句（避免重复解析 SQL）
class CausalStorage {
  private stmts = {
    getEvent: null,
    saveEvent: null,
    listEvents: null,
  };

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // 预编译常用查询
    this.stmts.getEvent = this.db.prepare('SELECT data FROM events WHERE event_id = ?');
    this.stmts.saveEvent = this.db.prepare('INSERT OR REPLACE INTO events ...');
  }

  getEvent(id: string): Event | null {
    const row = this.stmts.getEvent.get(id);
    // ...
  }
}
```

### SQLite 性能调优

```sql
-- 启用 WAL 模式（已启用）
PRAGMA journal_mode = WAL;

-- 增加缓存大小（默认 2MB → 64MB）
PRAGMA cache_size = -64000;

-- 启用内存映射 I/O
PRAGMA mmap_size = 268435456;  -- 256MB

-- 优化同步模式（开发时）
PRAGMA synchronous = NORMAL;  -- 生产环境用 FULL
```

---

## 2. 并发处理

### 使用 Worker Threads 并行化

```typescript
// scripts/import-parallel.mjs
import { Worker } from 'worker_threads';

async function importInParallel(issues, numWorkers = 4) {
  const chunks = chunkArray(issues, Math.ceil(issues.length / numWorkers));

  const workers = chunks.map((chunk, i) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./worker-import.mjs', {
        workerData: { chunk, workerId: i }
      });
      worker.on('message', resolve);
      worker.on('error', reject);
    });
  });

  const results = await Promise.all(workers);
  return results;
}
```

**预期提升**：4 核心情况下接近 3-4x 提升

---

## 3. 关键词提取优化

### 使用 native 分词库

```bash
# 安装 natural (NLP 库)
npm install natural

# 或使用更快的 node-jieba (中文分词)
npm install nodejieba
```

```typescript
import natural from 'natural';
const tokenizer = new natural.WordTokenizer();

export function extractKeywordsOptimized(text: string): string[] {
  // 使用专业分词器
  const tokens = tokenizer.tokenize(text.toLowerCase());

  // 词性标注（保留名词、动词）
  const tagger = new natural.BrillPOSTagger();
  const taggedWords = tagger.tag(tokens);

  // 只保留有意义的词
  return taggedWords
    .filter(([word, tag]) => ['NN', 'VB', 'JJ'].includes(tag))
    .map(([word]) => word);
}
```

### 使用 LSH (Locality-Sensitive Hashing) 加速聚类

```typescript
import { MinHash } from 'minhash';

export function fastClusterByKeywords(
  docKeywords: Map<string, Keyword[]>,
  minSimilarity: number = 0.3
): string[][] {
  // 为每个文档生成 MinHash 签名
  const signatures = new Map<string, MinHash>();

  for (const [docId, keywords] of docKeywords) {
    const mh = new MinHash();
    for (const kw of keywords) {
      mh.update(kw.term);
    }
    signatures.set(docId, mh);
  }

  // 使用 LSH 快速找到候选对
  // O(n) vs O(n²) 的暴力对比
  return lshClustering(signatures, minSimilarity);
}
```

**预期提升**：1000+ 文档时从分钟级降到秒级

---

## 4. 数据加载优化

### 流式处理大文件

```typescript
// 不要一次性加载整个 JSON
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function importSWEBenchStream(jsonlFile) {
  const rl = createInterface({
    input: createReadStream(jsonlFile),
    crlfDelay: Infinity,
  });

  let batch = [];
  for await (const line of rl) {
    const issue = JSON.parse(line);
    batch.push(issue);

    // 每 100 条批量处理
    if (batch.length >= 100) {
      await processBatch(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await processBatch(batch);
  }
}
```

---

## 5. 监控和性能分析

### 添加性能监控

```typescript
class PerformanceMonitor {
  private timers = new Map<string, number>();

  start(label: string) {
    this.timers.set(label, performance.now());
  }

  end(label: string): number {
    const start = this.timers.get(label);
    if (!start) return 0;
    const duration = performance.now() - start;
    console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }
}

// 使用
const monitor = new PerformanceMonitor();
monitor.start('induction');
const result = triggerInduction(...);
monitor.end('induction');
```

### SQLite 查询分析

```typescript
// 分析慢查询
db.pragma('query_only = ON');
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT ...').all();
console.log('Query plan:', plan);
```

---

## 6. 内存优化

### 大数据集处理

```typescript
// 分页加载避免内存溢出
function* iterateEvents(storage: CausalStorage, batchSize = 1000) {
  let offset = 0;
  while (true) {
    const events = storage.listEvents({ limit: batchSize, offset });
    if (events.length === 0) break;

    yield events;
    offset += batchSize;
  }
}

// 使用
for (const batch of iterateEvents(storage)) {
  processBatch(batch);
  // 处理完立即释放内存
}
```

---

## 7. 开发工具

### 使用 tmux 多窗口开发

```bash
# 创建 tmux 会话
tmux new -s causal

# 窗口 1: 编辑代码
# 窗口 2: 自动构建
cd mcp-server && npm run dev  # watch 模式

# 窗口 3: 运行测试
node test-basic.mjs

# 窗口 4: 查看日志
tail -f data/causal.log
```

### 使用 nodemon 自动重启

```bash
npm install -g nodemon

# 代码改动自动重新编译和测试
nodemon --watch src --exec "npm run build && node test-basic.mjs"
```

---

## 8. 数据持久化优化

### 定期备份

```bash
# 创建备份脚本
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
cp data/causal.db $BACKUP_DIR/
echo "Backed up to $BACKUP_DIR"
EOF

chmod +x scripts/backup.sh

# 定时备份（crontab）
0 */6 * * * cd /path/to/causal-learner && ./scripts/backup.sh
```

### 数据导出和版本控制

```typescript
// 定期导出为 JSON（便于版本控制）
const data = storage.exportAll();
fs.writeFileSync(
  `snapshots/snapshot_${Date.now()}.json`,
  JSON.stringify(data, null, 2)
);
```

---

## 9. 调试工具

### SQLite GUI 工具

```bash
# 安装 SQLite Browser (WSL + X11)
sudo apt install sqlitebrowser

# 或使用命令行
sqlite3 data/causal.db "SELECT * FROM regulations ORDER BY support_n DESC LIMIT 10"
```

### Node.js 调试

```bash
# 使用 Node.js inspector
node --inspect-brk test-basic.mjs

# 在 Chrome 中打开：chrome://inspect
# 可以设置断点、查看变量
```

---

## 10. 基准测试脚本

```typescript
// scripts/benchmark.mjs
import { createStorage } from '../dist/core/storage.js';

function benchmark() {
  const storage = createStorage(':memory:');
  const iterations = 1000;

  // 测试插入性能
  console.time('Insert 1000 observations');
  for (let i = 0; i < iterations; i++) {
    storage.saveObservation({
      observationId: `bench_${i}`,
      timestamp: new Date().toISOString(),
      facts: [
        { pred: 'keyword', value: `word_${i % 100}` },
        { pred: 'test.failed', value: true },
      ],
      context: { source: 'benchmark' },
    });
  }
  console.timeEnd('Insert 1000 observations');

  // 测试查询性能
  console.time('Query 1000 observations');
  const obs = storage.listObservations(1000);
  console.timeEnd('Query 1000 observations');

  console.log(`Retrieved: ${obs.length} observations`);

  storage.close();
}

benchmark();
```

**预期结果（WSL + better-sqlite3）**：
```
Insert 1000 observations: 200-300ms
Query 1000 observations: 50-100ms
```

---

## 总结：WSL 迁移收益

| 方面 | Windows (sql.js) | WSL (better-sqlite3) |
|------|------------------|----------------------|
| **插入性能** | 2-3 秒/1000条 | 0.2-0.3 秒/1000条 |
| **查询性能** | 1 秒/1000条 | 0.05-0.1 秒/1000条 |
| **编译工具** | 需要 VS Build Tools | apt install build-essential |
| **编码问题** | GBK/UTF-8 混乱 | UTF-8 原生 |
| **开发体验** | 一般 | 优秀 |

**综合提升**：开发效率和运行性能都有显著改善 🚀
