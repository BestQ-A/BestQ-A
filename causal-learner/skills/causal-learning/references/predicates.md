# 谓词设计参考文档

本文档提供因果学习系统的谓词设计参考，包含通用谓词和 SWE-bench 特定谓词。

---

## 1. 通用谓词

### 1.1 错误类型谓词 (error.*)

```yaml
error.type:
  description: 错误的 Python 类型
  args:
    kind: enum[
      ImportError, ModuleNotFoundError,
      AttributeError, TypeError, ValueError,
      KeyError, IndexError,
      AssertionError, RuntimeError,
      RecursionError, MemoryError,
      SyntaxError, IndentationError,
      FileNotFoundError, PermissionError,
      ConnectionError, TimeoutError,
      Exception  # 通用兜底
    ]
  example:
    {pred: "error.type", args: {kind: "AttributeError"}, value: true}

error.message:
  description: 错误消息的关键片段
  args:
    text: string  # 错误消息的关键部分
  example:
    {pred: "error.message", args: {text: "has no attribute 'pk'"}, value: true}

error.pattern:
  description: 错误消息匹配的正则模式
  args:
    pattern: string  # 正则表达式
  example:
    {pred: "error.pattern", args: {pattern: "NoneType.*attribute"}, value: true}

error.location:
  description: 错误发生的位置
  args:
    file: string
    line: number
    function: string (optional)
  example:
    {pred: "error.location", args: {file: "models/query.py", line: 234}, value: true}
```

### 1.2 测试结果谓词 (test.*)

```yaml
test.failed:
  description: 测试失败
  args:
    name: string  # 测试名称或路径
  example:
    {pred: "test.failed", args: {name: "test_queryset_filter"}, value: true}

test.passed:
  description: 测试通过
  args:
    name: string
  example:
    {pred: "test.passed", args: {name: "test_basic_query"}, value: true}

test.skipped:
  description: 测试被跳过
  args:
    name: string
    reason: string (optional)
  example:
    {pred: "test.skipped", args: {name: "test_async", reason: "no_async_support"}, value: true}

test.timeout:
  description: 测试超时
  args:
    name: string
    duration_seconds: number (optional)
  example:
    {pred: "test.timeout", args: {name: "test_large_query", duration_seconds: 30}, value: true}

test.count:
  description: 测试统计
  args:
    status: enum[passed, failed, error, skipped]
    count: number
  example:
    {pred: "test.count", args: {status: "failed", count: 3}, value: true}
```

### 1.3 代码模式谓词 (code.*)

```yaml
code.missing_import:
  description: 缺少必要的导入
  args:
    module: string (optional)
  example:
    {pred: "code.missing_import", args: {module: "django.utils"}, value: true}

code.undefined_variable:
  description: 使用了未定义的变量
  args:
    name: string
  example:
    {pred: "code.undefined_variable", args: {name: "queryset"}, value: true}

code.type_mismatch:
  description: 类型不匹配
  args:
    expected: string
    actual: string
  example:
    {pred: "code.type_mismatch", args: {expected: "str", actual: "int"}, value: true}

code.null_access:
  description: 访问了可能为 None 的对象
  args:
    attribute: string (optional)
  example:
    {pred: "code.null_access", args: {attribute: "pk"}, value: true}

code.missing_null_check:
  description: 缺少空值检查
  args: {}
  example:
    {pred: "code.missing_null_check", value: true}

code.deprecated_api:
  description: 使用了已弃用的 API
  args:
    api: string
    since_version: string (optional)
  example:
    {pred: "code.deprecated_api", args: {api: "assertRaisesRegexp"}, value: true}

code.circular_import:
  description: 存在循环导入
  args:
    modules: string (optional)  # 涉及的模块
  example:
    {pred: "code.circular_import", args: {modules: "a->b->a"}, value: true}
```

---

## 2. SWE-bench 特定谓词

### 2.1 补丁相关谓词 (patch.*)

```yaml
patch.applied:
  description: 补丁已应用
  args:
    hash: string (optional)  # 补丁内容哈希
  example:
    {pred: "patch.applied", args: {hash: "abc123"}, value: true}

patch.changes_file:
  description: 补丁修改了特定文件
  args:
    file: string
  example:
    {pred: "patch.changes_file", args: {file: "django/db/models/query.py"}, value: true}

patch.adds_method:
  description: 补丁添加了新方法
  args:
    class: string (optional)
    method: string
  example:
    {pred: "patch.adds_method", args: {class: "QuerySet", method: "bulk_update"}, value: true}

patch.modifies_method:
  description: 补丁修改了现有方法
  args:
    class: string (optional)
    method: string
  example:
    {pred: "patch.modifies_method", args: {method: "filter"}, value: true}

patch.adds_import:
  description: 补丁添加了导入语句
  args:
    module: string
  example:
    {pred: "patch.adds_import", args: {module: "functools"}, value: true}

patch.modifies_test:
  description: 补丁修改了测试文件
  args:
    test_file: string (optional)
  example:
    {pred: "patch.modifies_test", args: {test_file: "tests/test_query.py"}, value: true}

patch.lines_added:
  description: 补丁添加的行数范围
  args:
    range: enum[small, medium, large]  # 1-10, 11-50, 50+
  example:
    {pred: "patch.lines_added", args: {range: "medium"}, value: true}
```

### 2.2 Issue 相关谓词 (issue.*)

```yaml
issue.category:
  description: Issue 的类别
  args:
    type: enum[bug, feature, regression, performance, security]
  example:
    {pred: "issue.category", args: {type: "bug"}, value: true}

issue.component:
  description: Issue 涉及的组件
  args:
    name: string
  example:
    {pred: "issue.component", args: {name: "ORM"}, value: true}

issue.difficulty:
  description: Issue 的难度估计
  args:
    level: enum[easy, medium, hard]
  example:
    {pred: "issue.difficulty", args: {level: "medium"}, value: true}
```

### 2.3 解决状态谓词 (resolution.*)

```yaml
resolution.test_pass_delta:
  description: 补丁后通过测试数的变化
  args:
    direction: enum[increased, decreased, unchanged]
    count: number (optional)
  example:
    {pred: "resolution.test_pass_delta", args: {direction: "increased", count: 5}, value: true}

resolution.all_tests_pass:
  description: 所有相关测试都通过
  args: {}
  example:
    {pred: "resolution.all_tests_pass", value: true}

resolution.introduces_regression:
  description: 补丁引入了新的回归
  args:
    affected_tests: string (optional)
  example:
    {pred: "resolution.introduces_regression", args: {affected_tests: "test_other_*"}, value: true}
```

---

## 3. 环境谓词 (env.*)

```yaml
env.python_version:
  description: Python 版本
  args:
    version: string  # 如 "3.9", "3.10", "3.11"
  example:
    {pred: "env.python_version", args: {version: "3.10"}, value: true}

env.os:
  description: 操作系统
  args:
    name: enum[linux, macos, windows]
  example:
    {pred: "env.os", args: {name: "linux"}, value: true}

env.framework_version:
  description: 框架版本
  args:
    name: string
    version: string
  example:
    {pred: "env.framework_version", args: {name: "django", version: "4.2"}, value: true}
```

---

## 4. 示例规则

### 规则 1：缺少导入导致 ImportError

```json
{
  "regulation_id": "reg_import_001",
  "name": "Missing Import Causes ImportError",
  "status": "confirmed",
  "pattern": {
    "pre": [
      {"pred": "code.missing_import", "value": true}
    ],
    "eff": [
      {"pred": "error.type", "args": {"kind": "ImportError"}, "value": true}
    ]
  },
  "scope": {},
  "evidence": {
    "support": {"count": 47},
    "contradiction": {"count": 2}
  }
}
```

### 规则 2：空值访问导致 AttributeError

```json
{
  "regulation_id": "reg_null_001",
  "name": "Null Access Causes AttributeError",
  "status": "confirmed",
  "pattern": {
    "pre": [
      {"pred": "code.null_access", "value": true},
      {"pred": "code.missing_null_check", "value": true}
    ],
    "eff": [
      {"pred": "error.type", "args": {"kind": "AttributeError"}, "value": true},
      {"pred": "error.pattern", "args": {"pattern": "NoneType.*attribute"}, "value": true}
    ]
  },
  "scope": {},
  "evidence": {
    "support": {"count": 23},
    "contradiction": {"count": 1}
  }
}
```

### 规则 3：补丁修复测试

```json
{
  "regulation_id": "reg_patch_001",
  "name": "Correct Patch Fixes Failing Test",
  "status": "hypothesis",
  "pattern": {
    "pre": [
      {"pred": "test.failed", "args": {"name": "?test"}, "value": true},
      {"pred": "patch.applied", "value": true},
      {"pred": "patch.changes_file", "args": {"file": "?src_file"}, "value": true}
    ],
    "eff": [
      {"pred": "test.passed", "args": {"name": "?test"}, "value": true}
    ]
  },
  "scope": {},
  "evidence": {
    "support": {"count": 8},
    "contradiction": {"count": 3}
  }
}
```

### 规则 4：循环导入导致 ImportError

```json
{
  "regulation_id": "reg_circular_001",
  "name": "Circular Import Causes ImportError",
  "status": "confirmed",
  "pattern": {
    "pre": [
      {"pred": "code.circular_import", "value": true}
    ],
    "eff": [
      {"pred": "error.type", "args": {"kind": "ImportError"}, "value": true},
      {"pred": "error.pattern", "args": {"pattern": "cannot import name"}, "value": true}
    ]
  },
  "scope": {},
  "evidence": {
    "support": {"count": 15},
    "contradiction": {"count": 0}
  }
}
```

---

## 5. 谓词设计原则

### 5.1 粒度选择

- **太细**：`error.message.word_3` - 过于具体，难以泛化
- **太粗**：`has_error` - 信息量不足，无法区分
- **合适**：`error.type` + `error.pattern` - 既能区分又能泛化

### 5.2 可观测性

所有谓词都应该能从实际数据中提取：
- 从日志提取：`error.type`, `error.message`, `error.location`
- 从代码分析提取：`code.missing_import`, `code.null_access`
- 从补丁 diff 提取：`patch.changes_file`, `patch.adds_method`

### 5.3 因果可分性

设计谓词时考虑因果关系的可能方向：
- 原因谓词（通常在 pre 中）：`code.*`, `patch.*`
- 结果谓词（通常在 eff 中）：`error.*`, `test.*`, `resolution.*`

### 5.4 扩展建议

当发现 Event Pool 中积累了大量相似但无法归纳的 Events 时，考虑：
1. 是否需要更细粒度的谓词来区分
2. 是否缺少关键的上下文谓词
3. 是否需要添加中间状态的谓词
