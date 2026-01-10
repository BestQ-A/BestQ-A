# 🚀 WSL 快速参考卡片

**一页搞定 WSL 迁移和首次运行**

---

## 🔧 初始化（仅第一次）

```bash
# 1. 进入项目
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner

# 2. 清理 Windows 构建产物
cd mcp-server
rm -rf node_modules dist package-lock.json

# 3. 切换到 better-sqlite3
npm uninstall sql.js @types/sql.js
npm install better-sqlite3 @types/better-sqlite3

# 4. 替换 storage.ts
cp src/core/storage.ts src/core/storage.sqljs.bak
# 手动将 MIGRATE-TO-WSL.md 中的 better-sqlite3 代码复制到 storage.ts

# 5. 移除 async/await (storage 现在是同步的)
# 在 src/index.ts 中:
#   await createStorage(...) → createStorage(...)

# 6. 安装和构建
npm install
npm run build
```

---

## ✅ 验证安装

```bash
# 基础测试
node test-basic.mjs

# 预期输出：
# ✅ 8 observations → 2 regulations → 8 events resolved
```

---

## 📥 下载 SWE-bench 数据

```bash
cd ..  # 回到 causal-learner 根目录

# 安装 Python 依赖
pip3 install datasets huggingface_hub

# 下载数据（约 2-5 分钟）
python3 scripts/download-swebench.py

# 数据保存位置：
# data/swebench/swebench_verified.json (500 samples)
# data/swebench/sample.json (单个样本预览)
```

---

## 🧪 运行完整测试

```bash
cd mcp-server

# 1. 导入 50 个 issue
node scripts/import-swebench.mjs \
  ../data/swebench/swebench_verified.json 50

# 2. 性能评估
node scripts/evaluate.mjs \
  ../data/swebench/swebench_verified.json 50

# 3. 生成可视化
node scripts/visualize.mjs data/causal.db

# 4. 查看 dashboard
# 浏览器打开：file:///mnt/e/.../visualization/dashboard.html
```

---

## 📊 关键命令

### 查看统计

```bash
# 快速查看数据库统计
sqlite3 data/causal.db << 'EOF'
.mode column
.headers on
SELECT 'Observations' as Type, COUNT(*) as Count FROM observations
UNION ALL
SELECT 'Events', COUNT(*) FROM events
UNION ALL
SELECT 'Regulations', COUNT(*) FROM regulations;
EOF
```

### 查询示例

```bash
# 查看前 5 个规则
sqlite3 data/causal.db \
  "SELECT regulation_id, status, description FROM regulations LIMIT 5"

# 查看 open events
sqlite3 data/causal.db \
  "SELECT event_id, status FROM events WHERE status='open' LIMIT 10"
```

### 清理数据库

```bash
# 删除并重新开始
rm data/causal.db

# 或清空表
sqlite3 data/causal.db << 'EOF'
DELETE FROM observations;
DELETE FROM events;
DELETE FROM regulations;
VACUUM;
EOF
```

---

## 🔍 性能基准

### 运行基准测试

```bash
# 创建基准测试
cat > mcp-server/benchmark.mjs << 'EOF'
import { createStorage } from './dist/core/storage.js';

const storage = createStorage(':memory:');

console.time('Insert 1000 obs');
for (let i = 0; i < 1000; i++) {
  storage.saveObservation({
    observationId: `bench_${i}`,
    timestamp: new Date().toISOString(),
    facts: [{pred: 'test', value: i}],
    context: {},
  });
}
console.timeEnd('Insert 1000 obs');

console.time('Query 1000 obs');
storage.listObservations(1000);
console.timeEnd('Query 1000 obs');

storage.close();
EOF

node benchmark.mjs
```

**better-sqlite3 目标**：
- Insert 1000: < 300ms
- Query 1000: < 100ms

---

## 🐛 常见问题

### better-sqlite3 编译失败

```bash
# 安装编译工具
sudo apt update
sudo apt install build-essential python3

# 重新编译
npm rebuild better-sqlite3
```

### 权限问题

```bash
# WSL 访问 Windows 文件系统
# 确保在 /mnt/e/ 路径下，不是 ~ 路径
pwd  # 应该是 /mnt/e/...
```

### Node.js 版本

```bash
# 检查版本
node --version  # 建议 >= 20.x

# 使用 nvm 管理版本
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

---

## 📁 项目结构（WSL 视角）

```
/mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner/
├── mcp-server/
│   ├── src/core/
│   │   └── storage.ts          # ← 需要替换为 better-sqlite3 版本
│   ├── scripts/                # 批量工具
│   ├── data/causal.db          # 数据库（better-sqlite3 格式）
│   └── dist/                   # 编译输出
├── data/swebench/              # SWE-bench 数据集
├── visualization/              # 可视化输出
└── docs/                       # 所有文档
```

---

## 🎯 首次运行完整流程（5 分钟）

```bash
# 复制粘贴执行
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner

# 环境准备
cd mcp-server && rm -rf node_modules dist && \
npm install better-sqlite3 @types/better-sqlite3 && \
npm install && npm run build && cd ..

# 下载数据
python3 scripts/download-swebench.py

# 运行测试
cd mcp-server && \
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 50 && \
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50 && \
node scripts/visualize.mjs data/causal.db

# 查看结果
cat ../data/evaluation_metrics.json | jq .summary
```

**完成！** 🎉

---

## 📚 文档索引

| 文档 | 用途 |
|------|------|
| `MIGRATE-TO-WSL.md` | 详细迁移指南 |
| `WSL-QUICK-REF.md` | 本文档 - 快速参考 |
| `docs/WSL-OPTIMIZATIONS.md` | 性能优化技巧 |
| `QUICKSTART.md` | 功能使用指南 |
| `STATUS.md` | 当前实现状态 |

---

**保存这个文件，WSL 中随时查阅！** 📌
