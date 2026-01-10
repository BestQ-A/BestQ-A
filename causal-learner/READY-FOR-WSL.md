# ✅ WSL 迁移准备完成

**日期**：2026-01-10
**状态**：所有文档已就绪，可以安全迁移到 WSL

---

## 📋 迁移前检查清单

### ✅ 代码已完成

- [x] 核心引擎：7 个模块全部实现并测试通过
- [x] MCP Tools：16 个工具完整实现
- [x] 关键词系统：TF-IDF + 聚类 + 谓词发现
- [x] 测试脚本：基础测试、可视化、评估
- [x] TypeScript 编译：无错误

### ✅ 文档已完备

- [x] **MIGRATE-TO-WSL.md** - 详细迁移步骤（包含完整 better-sqlite3 代码）
- [x] **WSL-QUICK-REF.md** - 一页快速参考卡片
- [x] **docs/WSL-OPTIMIZATIONS.md** - 性能优化建议
- [x] **docs/predicate-evolution-philosophy.md** - 谓词演化哲学
- [x] **README.md** - 更新为最新状态
- [x] **QUICKSTART.md** - 完整使用指南
- [x] **STATUS.md** - 功能清单

### ✅ 工具脚本已创建

- [x] `scripts/download-swebench.py` - 数据下载
- [x] `scripts/import-swebench.mjs` - 批量导入
- [x] `scripts/evaluate.mjs` - 性能评估
- [x] `scripts/visualize.mjs` - 可视化生成

### ✅ Git 已提交

- [x] Commit 1: 基础实现 (7f20c4f)
- [x] Commit 2: SWE-bench + 关键词 + 可视化 (97438aa)
- [x] 待提交: 迁移文档 + 优化指南

---

## 🎯 WSL 中的首次运行（复制粘贴）

```bash
# ========================================
# Step 1: 进入项目
# ========================================
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner

# ========================================
# Step 2: 清理 Windows 构建产物
# ========================================
cd mcp-server
rm -rf node_modules dist package-lock.json
cd ..

# ========================================
# Step 3: 切换到 better-sqlite3
# ========================================
cd mcp-server
npm uninstall sql.js @types/sql.js
npm install better-sqlite3 @types/better-sqlite3

# ========================================
# Step 4: 替换 storage.ts
# ========================================
# 打开 MIGRATE-TO-WSL.md，复制 better-sqlite3 版本代码
# 粘贴到 src/core/storage.ts

# 或使用 sed 快速替换关键部分（需要手动验证）
# 建议手动替换以确保准确性

# ========================================
# Step 5: 更新 src/index.ts (移除 async)
# ========================================
# 将 "await createStorage(...)" 改为 "createStorage(...)"
sed -i 's/await createStorage/createStorage/g' src/index.ts

# 同样更新测试脚本
sed -i 's/await createStorage/createStorage/g' test-*.mjs
sed -i 's/await createStorage/createStorage/g' scripts/*.mjs

# ========================================
# Step 6: 安装依赖和构建
# ========================================
npm install
npm run build

# 应该看到：编译成功，无错误

# ========================================
# Step 7: 验证基础功能
# ========================================
node test-basic.mjs

# 预期输出：
# ✅ 8 observations → 2 regulations → 8 events resolved
# ✅ All tests passed!

# ========================================
# Step 8: 下载 SWE-bench 数据
# ========================================
cd ..
pip3 install datasets huggingface_hub
python3 scripts/download-swebench.py

# 等待 2-5 分钟下载
# 数据保存到：data/swebench/swebench_verified.json

# ========================================
# Step 9: 运行完整评估
# ========================================
cd mcp-server

# 导入 50 个样本
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 50

# 性能评估
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50

# 生成可视化
node scripts/visualize.mjs data/causal.db

# ========================================
# 完成！查看结果
# ========================================
# 1. Dashboard: visualization/dashboard.html
# 2. Metrics: ../data/evaluation_metrics.json
# 3. Database: data/causal.db
```

---

## 🔧 关键修改点

### 必须修改的文件

#### 1. `package.json`

```diff
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
-   "sql.js": "^1.13.0",
+   "better-sqlite3": "^11.0.0",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
+   "@types/better-sqlite3": "^7.6.8",
```

#### 2. `src/core/storage.ts`

**完整替换**（见 MIGRATE-TO-WSL.md 附件）

关键变化：
- `import initSqlJs` → `import Database from 'better-sqlite3'`
- `async init()` → 构造函数中直接初始化
- `db.exec()` → `db.prepare().run()/get()/all()`
- 所有异步方法 → 同步方法

#### 3. `src/index.ts`

```diff
  async function main() {
-   storage = await createStorage(DB_PATH);
+   storage = createStorage(DB_PATH);  // 同步调用
```

#### 4. 所有测试脚本

```bash
# 批量移除 await createStorage
find mcp-server -name "*.mjs" -exec sed -i 's/await createStorage/createStorage/g' {} \;
```

---

## 📊 预期改进

### 性能对比

| 操作 | sql.js (Windows) | better-sqlite3 (WSL) | 提升 |
|------|------------------|----------------------|------|
| 插入 1000 observations | 2-3 秒 | 0.2-0.3 秒 | **10x** |
| 查询 1000 events | 1 秒 | 0.05-0.1 秒 | **10x** |
| 归纳 50 events | 0.5 秒 | 0.2 秒 | **2.5x** |
| 完整评估 (50 samples) | 15 秒 | 3-4 秒 | **4x** |

### 开发体验改进

| 方面 | Windows | WSL |
|------|---------|-----|
| npm install | 偶尔失败 | 稳定 ✅ |
| 编译原生模块 | 需要 VS Build Tools | 一行命令 ✅ |
| Python 编码 | GBK/UTF-8 混乱 | UTF-8 原生 ✅ |
| 工具链 | 部分不兼容 | 完全兼容 ✅ |

---

## 🐛 可能遇到的问题和解决方案

### 问题 1: better-sqlite3 编译失败

```bash
# 安装编译工具
sudo apt update
sudo apt install build-essential python3

# 重新安装
cd mcp-server
npm rebuild better-sqlite3
```

### 问题 2: Python datasets 下载慢

```bash
# 使用国内镜像
export HF_ENDPOINT=https://hf-mirror.com
python3 scripts/download-swebench.py
```

### 问题 3: 文件权限问题

```bash
# WSL 访问 Windows 文件，确保路径正确
pwd  # 应该是 /mnt/e/...

# 如果权限问题
chmod +x scripts/*.py
chmod +x mcp-server/scripts/*.mjs
```

### 问题 4: Node.js 版本

```bash
# 检查版本
node --version  # 需要 >= 18.x

# 使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

---

## 📦 备份当前状态

在迁移前，当前 Windows 实现已完整工作：

```
✅ 编译通过
✅ 测试通过（8 observations → 2 regulations）
✅ 可视化正常
✅ 所有脚本就绪
```

**备份位置**：
- Git commit: 97438aa
- 数据库可删除重建（无关键数据）

---

## 🎯 迁移后验证清单

### 必须通过的测试

```bash
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner/mcp-server

# 1. 编译测试
npm run build
# ✅ 无错误

# 2. 基础功能测试
node test-basic.mjs
# ✅ 8 observations → 2 regulations → 8 events resolved

# 3. 性能测试
node benchmark.mjs  # (需创建，见 WSL-OPTIMIZATIONS.md)
# ✅ Insert 1000 obs < 300ms
# ✅ Query 1000 obs < 100ms

# 4. SWE-bench 测试（需先下载数据）
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 10
# ✅ 成功导入 10 个 issues

# 5. 可视化测试
node scripts/visualize.mjs data/causal.db
# ✅ 生成 dashboard.html
```

### 所有测试通过 → 迁移成功！

---

## 📂 关键文档位置

**在 WSL 中查阅**：

```bash
# 快速参考（最常用）
cat WSL-QUICK-REF.md

# 详细迁移步骤
cat MIGRATE-TO-WSL.md

# 性能优化技巧
cat docs/WSL-OPTIMIZATIONS.md

# 谓词演化理念
cat docs/predicate-evolution-philosophy.md

# 使用指南
cat QUICKSTART.md
```

---

## 🎉 总结

**Windows 阶段**：
- ✅ 完整实现所有功能
- ✅ 使用 sql.js 绕过原生编译问题
- ✅ 验证核心逻辑正确性
- ✅ 创建完整文档

**WSL 阶段**（下一步）：
- 🚀 切换到 better-sqlite3（5-10x 性能）
- 🚀 下载真实 SWE-bench 数据
- 🚀 运行大规模评估（500 samples）
- 🚀 验证谓词演化效果

**所有准备就绪，可以开始 WSL 迁移！** 🐧

---

## 📞 迁移后第一步

```bash
# 在 WSL 终端中执行
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner

# 查看快速参考
cat WSL-QUICK-REF.md

# 开始迁移
# 按照 MIGRATE-TO-WSL.md 的步骤执行
```

**祝迁移顺利！** 🎯
