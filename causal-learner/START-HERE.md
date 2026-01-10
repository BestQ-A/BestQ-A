# 🚀 从这里开始（WSL 环境）

**最后更新**：2026-01-10
**Git Commit**：0abac6a

---

## ✅ 当前状态

**代码完成度**：100% ✅
- 核心引擎：完整实现
- MCP Tools：16 个全部可用
- 关键词系统：TF-IDF + 聚类
- 测试验证：基础功能通过

**文档完成度**：100% ✅
- 迁移指南：详细步骤
- 快速参考：一页搞定
- 性能优化：技巧汇总
- 哲学文档：谓词演化

**Git 状态**：已同步 ✅
- 3 个 commits 已 push
- 所有文档已提交

---

## 🎯 WSL 中第一次运行（5 分钟）

### 复制粘贴执行

```bash
# 1. 进入项目
cd /mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner

# 2. 查看快速参考
cat WSL-QUICK-REF.md

# 3. 初始化环境（仅第一次）
cd mcp-server
rm -rf node_modules dist package-lock.json
npm uninstall sql.js @types/sql.js
npm install better-sqlite3 @types/better-sqlite3
npm install
npm run build

# 4. 验证安装
node test-basic.mjs
# 预期：✅ All tests passed!

# 5. 下载数据
cd ..
pip3 install datasets huggingface_hub
python3 scripts/download-swebench.py

# 6. 运行评估
cd mcp-server
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 50
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50
node scripts/visualize.mjs data/causal.db
```

---

## 📚 关键文档（按阅读顺序）

### 第一次运行

1. **[WSL-QUICK-REF.md](WSL-QUICK-REF.md)** ⭐⭐⭐
   - 一页搞定所有命令
   - 最常用，放在手边

2. **[MIGRATE-TO-WSL.md](MIGRATE-TO-WSL.md)** ⭐⭐
   - 详细迁移步骤
   - 包含完整代码示例
   - 遇到问题时查阅

3. **[README.md](README.md)** ⭐
   - 项目总览
   - 功能特性
   - 文档导航

### 理解系统

4. **[docs/predicate-evolution-philosophy.md](docs/predicate-evolution-philosophy.md)** ⭐⭐⭐
   - **核心理念**：谓词如何涌现
   - 从关键词到结构化的完整路径
   - 必读！

5. **[QUICKSTART.md](QUICKSTART.md)** ⭐⭐
   - 完整工作流
   - 使用示例
   - MCP Tools 说明

6. **[docs/causal-learner-design.md](docs/causal-learner-design.md)** ⭐
   - 原始设计
   - 系统架构

### 优化和进阶

7. **[docs/WSL-OPTIMIZATIONS.md](docs/WSL-OPTIMIZATIONS.md)**
   - 性能优化技巧
   - Worker threads
   - LSH 快速聚类

8. **[STATUS.md](STATUS.md)**
   - 功能清单
   - 已完成 vs 规划中

9. **[skills/causal-learning/SKILL.md](skills/causal-learning/SKILL.md)**
   - MCP 使用详解
   - 谓词设计指南

---

## 🔑 关键概念速查

### 异常驱动

```
能解释的 → 只更新证据（不记录）
无法解释 → Event Pool（记录边界）
新规则 → 消解 Events（填补知识缺口）
```

### 谓词演化

```
Phase 0: 自然语言描述（原始输入）
Phase 1: 关键词提取（TF-IDF）✅ 已实现
Phase 2: 统计聚类（发现模式）✅ 已实现
Phase 3: 候选谓词（抽象涌现）✅ 已实现
Phase 4: 结构化谓词（待验证）
```

### 三层数据流

```
Regulations ← 归纳 ← Events ← 检测 ← Observations
    ↓ 解释         ↓ 消解
```

---

## ⚡ 常用命令

```bash
# 编译
cd mcp-server && npm run build

# 测试
node test-basic.mjs

# 导入数据
node scripts/import-swebench.mjs ../data/swebench/swebench_verified.json 50

# 评估
node scripts/evaluate.mjs ../data/swebench/swebench_verified.json 50

# 可视化
node scripts/visualize.mjs data/causal.db

# 查看数据库
sqlite3 data/causal.db "SELECT COUNT(*) FROM events"

# 清理
rm -rf data/*.db
```

---

## 🎯 预期结果（50 samples）

| 指标 | 值 |
|------|-----|
| 导入时间 | 2-3 秒（WSL）|
| Events Created | 45-48 |
| Clusters Found | 10-15 |
| Regulations | 8-12 |
| Resolution Rate | 60-80% |

---

## 🐛 故障速查

### 编译失败
```bash
sudo apt install build-essential python3
npm rebuild better-sqlite3
```

### 数据下载失败
```bash
export HF_ENDPOINT=https://hf-mirror.com
python3 scripts/download-swebench.py
```

### 测试失败
```bash
npm run build  # 重新编译
rm data/*.db   # 清理旧数据库
```

---

## 📞 支持

- 📖 文档问题：查看对应 .md 文件
- 🐛 Bug：检查 docs/history/ 开发记录
- 💡 优化：参考 WSL-OPTIMIZATIONS.md

---

**在 WSL 中，一切都会更顺畅！** 🐧✨

**下一步**：打开 WSL 终端，执行上面的命令！
