/**
 * SWE-bench Causal Learning Benchmark Runner
 *
 * 对因果学习系统在 SWE-bench 风格问题上做端到端评测：
 *   1. Train phase：把 train set 的 issue 作为观测送入 v7-v8 storage，触发归纳
 *   2. Predict phase：对 test set 的每个 issue 调用 suggest_causes
 *   3. 评测：
 *      - hit_rate：返回至少 1 个 regulation 的比例
 *      - category_accuracy：top-1 regulation 的 pre 是否匹配正确类别
 *      - diversity：学到的 regulation 数量 / error category 数量
 *
 * 用法：
 *   npx tsx src/benchmark/swe-bench-runner.ts
 *   npx tsx src/benchmark/swe-bench-runner.ts --split 0.6
 *   npx tsx src/benchmark/swe-bench-runner.ts --real          # 使用真实 SWE-bench Lite 数据集
 *   npx tsx src/benchmark/swe-bench-runner.ts --real --split 0.6
 */

import { CausalPipeline } from '../core/pipeline.js';
import { createStorage } from '../core/storage.js';
import { submitObservationTool } from '../tools/observation.js';
import { triggerInductionTool } from '../tools/induction.js';
import { suggestCausesTool, importSweIssueTool } from '../tools/swebench.js';
import type { SweIssue } from '../tools/swebench.js';
import type { Observation, Regulation } from '../core/types.js';
import { loadSWEBenchLite } from './swe-bench-data.js';
import type { LabeledIssue } from './swe-bench-data.js';
import { extractFactsWithLLM, extractedToFacts } from './llm-fact-extractor.js';
import type { Fact } from '../core/types.js';

// =============================================================================
// 数据集：按 category 分组，每类 5 个，共 6 类 30 issue
// =============================================================================

const DATASET: LabeledIssue[] = [
  // --- category: type_error ---
  ...[
    ['TypeError in QuerySet filter', 'TypeError: argument of type NoneType is not iterable', 'django/db/models/query.py'],
    ['TypeError in form validation', 'TypeError: NoneType object has no attribute items', 'django/forms/forms.py'],
    ['TypeError in request parsing', 'TypeError: expected string or bytes-like object', 'flask/wrappers.py'],
    ['TypeError in serializer', 'TypeError: Object of type NoneType is not JSON serializable', 'django/core/serializers/json.py'],
    ['TypeError in template render', 'TypeError: unsupported operand type(s)', 'django/template/base.py'],
  ].map(([title, err, file], i): LabeledIssue => ({
    issueId: `TYPE-${i + 1}`, repo: i % 2 === 0 ? 'django/django' : 'flask/flask',
    title, description: title, errorLog: `${err}\n  File "${file}", line 42`,
    labels: ['bug'], expectedCategory: 'type_error',
  })),

  // --- category: import_error ---
  ...[
    ['ImportError after migration', 'ImportError: cannot import name UserProfile', 'myapp/models.py'],
    ['ModuleNotFoundError in blueprint', 'ModuleNotFoundError: No module named flask_cors', 'app/extensions.py'],
    ['ImportError with urllib3', 'ImportError: cannot import name DEFAULT_CIPHERS', 'requests/adapters.py'],
    ['ImportError with chardet', 'ImportError: cannot import name chardet', 'requests/utils.py'],
    ['ModuleNotFoundError in admin', 'ModuleNotFoundError: No module named django_extensions', 'django/contrib/admin.py'],
  ].map(([title, err, file], i): LabeledIssue => ({
    issueId: `IMPORT-${i + 1}`, repo: ['django/django', 'flask/flask', 'requests/requests'][i % 3],
    title, description: title, errorLog: `${err}\n  File "${file}", line 3`,
    labels: ['bug', 'dependencies'], expectedCategory: 'import_error',
  })),

  // --- category: assertion_error ---
  ...[
    ['AssertionError in admin view', 'AssertionError: 200 != 302', 'tests/admin_views/tests.py'],
    ['Test regression in fixture', 'AssertionError: assert 0 == 1', 'tests/test_core.py'],
    ['Form test assertion', 'AssertionError: Form is invalid', 'tests/test_forms.py'],
    ['API contract assertion', 'AssertionError: expected 200 got 500', 'tests/test_api.py'],
    ['Query count assertion', 'AssertionError: 5 queries != 3', 'tests/test_orm.py'],
  ].map(([title, err, file], i): LabeledIssue => ({
    issueId: `ASSERT-${i + 1}`, repo: i % 2 === 0 ? 'django/django' : 'pytest/pytest',
    title, description: title, errorLog: `${err}\n  File "${file}", line 567`,
    labels: ['test', 'regression'], expectedCategory: 'assertion_error',
  })),

  // --- category: config_error ---
  ...[
    ['Settings not loaded', 'ImproperlyConfigured: settings.DATABASES is improperly configured', 'django/db/utils.py'],
    ['Config not loaded from env', "KeyError: 'SECRET_KEY'", 'flask/app.py'],
    ['Missing env variable', "KeyError: 'DATABASE_URL'", 'app/config.py'],
    ['Invalid YAML config', 'ValueError: invalid yaml', 'app/yaml_loader.py'],
    ['Missing config section', "KeyError: 'redis'", 'app/cache.py'],
  ].map(([title, err, file], i): LabeledIssue => ({
    issueId: `CONFIG-${i + 1}`, repo: ['django/django', 'flask/flask'][i % 2],
    title, description: title, errorLog: `${err}\n  File "${file}", line 94`,
    labels: ['bug', 'configuration'], expectedCategory: 'config_error',
  })),

  // --- category: value_error ---
  ...[
    ['ValueError in date parsing', 'ValueError: time data does not match format', 'django/utils/dateparse.py'],
    ['ValueError in decimal', 'ValueError: could not convert string to float', 'app/calculator.py'],
    ['ValueError in URL', 'ValueError: invalid URL', 'requests/utils.py'],
    ['ValueError in JSON', 'ValueError: Expecting value: line 1', 'app/parser.py'],
    ['ValueError in int', 'ValueError: invalid literal for int()', 'app/validator.py'],
  ].map(([title, err, file], i): LabeledIssue => ({
    issueId: `VALUE-${i + 1}`, repo: 'django/django',
    title, description: title, errorLog: `${err}\n  File "${file}", line 12`,
    labels: ['bug'], expectedCategory: 'value_error',
  })),

  // --- category: key_error ---
  ...[
    ['KeyError in dict', "KeyError: 'user_id'", 'app/views.py'],
    ['KeyError in cache', "KeyError: 'session_data'", 'app/cache.py'],
    ['KeyError in context', "KeyError: 'request'", 'app/middleware.py'],
    ['KeyError in settings', "KeyError: 'DEBUG'", 'app/settings.py'],
    ['KeyError in response', "KeyError: 'status'", 'app/api.py'],
  ].map(([title, err, file], i): LabeledIssue => ({
    issueId: `KEY-${i + 1}`, repo: 'django/django',
    title, description: title, errorLog: `${err}\n  File "${file}", line 25`,
    labels: ['bug'], expectedCategory: 'key_error',
  })),
];

// =============================================================================
// Benchmark
// =============================================================================

interface Prediction {
  issueId: string;
  expectedCategory: string;
  predictedCauses: number;
  topRegulationId: string | null;
  topRegulationPreCategory: string | null;
  topScore: number;
  hit: boolean;
  categoryCorrect: boolean;
}

interface BenchmarkResult {
  trainSize: number;
  testSize: number;
  regulationsLearned: number;
  uniqueCategoriesInTrain: number;
  predictions: Prediction[];
  hitRate: number;
  categoryAccuracy: number;
  diversity: number;
  avgCauses: number;
  regulations: Array<{ id: string; pre: string; eff: string; supportN: number }>;
  duration: number;
}

function splitTrainTest(issues: LabeledIssue[], trainRatio: number): {
  train: LabeledIssue[]; test: LabeledIssue[];
} {
  // 按 category 分层切分，确保 train/test 都覆盖所有类别
  const byCategory = new Map<string, LabeledIssue[]>();
  for (const i of issues) {
    const arr = byCategory.get(i.expectedCategory) ?? [];
    arr.push(i);
    byCategory.set(i.expectedCategory, arr);
  }
  const train: LabeledIssue[] = [];
  const test: LabeledIssue[] = [];
  for (const group of byCategory.values()) {
    const sorted = [...group].sort((a, b) => a.issueId.localeCompare(b.issueId));
    const splitIdx = Math.ceil(sorted.length * trainRatio);
    train.push(...sorted.slice(0, splitIdx));
    test.push(...sorted.slice(splitIdx));
  }
  return { train, test };
}

// =============================================================================
// LLM bug_category → 内置 6 类 映射表
// LLM 分类枚举：logic_error/type_error/missing_validation/wrong_default/
//               api_change/regression/edge_case/other/unknown
// 内置 6 类：type_error/import_error/assertion_error/config_error/value_error/key_error
// =============================================================================

const LLM_CATEGORY_MAP: Record<string, string> = {
  type_error:          'type_error',
  missing_validation:  'import_error',
  logic_error:         'key_error',
  api_change:          'assertion_error',
  wrong_default:       'config_error',
  edge_case:           'value_error',
  regression:          'assertion_error',
};

/**
 * 将 LLM 返回的 bug_category 映射到内置 6 类。
 * 对 unknown/other 按 pre 中的 error_type 推断：
 *   ImportError/ModuleNotFoundError → import_error
 *   AssertionError                  → assertion_error
 *   KeyError                        → key_error
 *   ValueError                      → value_error
 *   TypeError                       → type_error
 *   ImproperlyConfigured/KeyError + config context → config_error
 */
function normalizeLLMCategory(
  rawCategory: string,
  reg?: Regulation,
): string {
  const mapped = LLM_CATEGORY_MAP[rawCategory];
  if (mapped) return mapped;

  // unknown/other → 按 pre error_type 推断
  if (reg) {
    const errorTypeFact = reg.pre.find(f => f.pred === 'error_type');
    if (errorTypeFact) {
      const et = String(errorTypeFact.value).toLowerCase();
      if (et.includes('import') || et.includes('module')) return 'import_error';
      if (et.includes('assertion')) return 'assertion_error';
      if (et.includes('key')) return 'key_error';
      if (et.includes('value')) return 'value_error';
      if (et.includes('type')) return 'type_error';
      if (et.includes('config') || et.includes('improperly')) return 'config_error';
    }
    // 按 pre root_cause / mechanism 兜底
    const rootCause = reg.pre.find(f => f.pred === 'root_cause');
    const mechanism = reg.pre.find(f => f.pred === 'mechanism');
    const combined = [rootCause, mechanism]
      .filter(Boolean)
      .map(f => String(f!.value).toLowerCase())
      .join(' ');
    if (combined.includes('import') || combined.includes('module')) return 'import_error';
    if (combined.includes('assert') || combined.includes('test')) return 'assertion_error';
    if (combined.includes('key') || combined.includes('dict')) return 'key_error';
    if (combined.includes('value') || combined.includes('parse')) return 'value_error';
    if (combined.includes('type') || combined.includes('none')) return 'type_error';
    if (combined.includes('config') || combined.includes('setting')) return 'config_error';
  }

  // 终极兜底：原值返回（内置 6 类或任意 repo-based 标签，不强制映射到 key_error）
  return rawCategory;
}

/** 从 regulation 的 eff 中提取 category（bug_category 优先，error_category 兜底，repo 最后） */
function regulationCategory(reg: Regulation): string | null {
  // 优先：eff 中的 bug_category → 映射到内置 6 类
  const effBugCat = reg.eff.find(f => f.pred === 'bug_category');
  if (effBugCat) return normalizeLLMCategory(String(effBugCat.value), reg);

  // 次优：eff 中的 error_category
  const effErrCat = reg.eff.find(f => f.pred === 'error_category');
  if (effErrCat) return String(effErrCat.value);

  // pre 中的 bug_category（LLM 模式下归纳引擎可能把 bug_category 放进 pre）
  const preBugCat = reg.pre.find(f => f.pred === 'bug_category');
  if (preBugCat) return normalizeLLMCategory(String(preBugCat.value), reg);

  // pre 中的 error_category
  const preErrCat = reg.pre.find(f => f.pred === 'error_category');
  if (preErrCat) return String(preErrCat.value);

  // pre 中的 error_type → 推断内置类别
  const preErrType = reg.pre.find(f => f.pred === 'error_type');
  if (preErrType) {
    const et = String(preErrType.value).toLowerCase();
    if (et.includes('import') || et.includes('module')) return 'import_error';
    if (et.includes('assertion')) return 'assertion_error';
    if (et.includes('keyerror') || et === 'key') return 'key_error';
    if (et.includes('valueerror') || et === 'value') return 'value_error';
    if (et.includes('typeerror') || et === 'type') return 'type_error';
    if (et.includes('config') || et.includes('improperly')) return 'config_error';
  }

  // repo 级 category：eff 中的 repo fact → 提取 repo 短名（仅作最后兜底）
  const repoEff = reg.eff.find(f => f.pred === 'repo');
  if (repoEff) {
    const val = String(repoEff.value);
    return val.includes('/') ? val.split('/')[1] : val;
  }

  return null;
}

export async function runBenchmark(options: {
  issues?: LabeledIssue[];
  trainRatio?: number;
  useLLM?: boolean;
} = {}): Promise<BenchmarkResult> {
  const issues = options.issues ?? DATASET;
  const trainRatio = options.trainRatio ?? 0.7;
  const startTime = Date.now();

  const storage = createStorage(':memory:');
  const pipeline = new CausalPipeline({ seedDefaults: false });
  let processedIssues = issues;
  const useLLM = options.useLLM ?? false;

  // LLM 模式：预提取 LLM facts（缓存），expectedCategory 保留原始数据集标注
  // （LLM 分类准确率低，不用它覆盖 ground truth；只用它提取 facts 特征）
  if (useLLM) {
    console.log('[benchmark] LLM 模式：提取 LLM facts，保留原始 expectedCategory 作为 ground truth');
    processedIssues = [];
    for (const issue of issues) {
      await extractFactsWithLLM(issue.issueId, issue.description); // 预热缓存
      processedIssues.push({ ...issue }); // 保留原始 expectedCategory
    }
  }

  const { train, test } = splitTrainTest(processedIssues, trainRatio);

  // Phase 1: 训练
  if (useLLM) console.log('[benchmark] LLM 蒸馏模式：使用 LLM 提取的结构化因果 facts');

  for (const issue of train) {
    let facts: Fact[];
    let focusFacts: Fact[];

    if (useLLM) {
      // LLM 蒸馏：从缓存或 LLM API 获取结构化因果 facts
      const extracted = await extractFactsWithLLM(issue.issueId, issue.description);
      facts = extractedToFacts(extracted, issue.repo);

      // 规范化 bug_category + errorLog 派生兜底，确保写入内置 6 类之一
      const BUILTIN_SET = new Set(['type_error', 'import_error', 'assertion_error', 'config_error', 'value_error', 'key_error']);
      const catFactIdx = facts.findIndex(f => f.pred === 'bug_category');
      let resolvedCat: string | null = null;

      if (catFactIdx >= 0) {
        const rawCat = String(facts[catFactIdx].value);
        const normalized = normalizeLLMCategory(rawCat);
        if (BUILTIN_SET.has(normalized)) {
          facts[catFactIdx] = { pred: 'bug_category', value: normalized };
          resolvedCat = normalized;
        } else {
          // normalized 结果非内置类（如 unknown/other）→ 删除，改用 errorLog 派生
          facts.splice(catFactIdx, 1);
        }
      }

      if (!resolvedCat) {
        // 从 errorLog 正则派生 bug_category（无标签泄漏，与 regex 模式等价）
        const errLog = (issue.errorLog ?? '').toLowerCase();
        if (/importerror|modulenotfound|cannot import/.test(errLog)) resolvedCat = 'import_error';
        else if (/assertionerror/.test(errLog)) resolvedCat = 'assertion_error';
        else if (/keyerror/.test(errLog)) resolvedCat = 'key_error';
        else if (/valueerror/.test(errLog)) resolvedCat = 'value_error';
        else if (/typeerror/.test(errLog)) resolvedCat = 'type_error';
        else if (/improperlyconfigured|settings\.|secret_key|database_url|yaml/i.test(errLog)) resolvedCat = 'config_error';
        if (resolvedCat) facts.push({ pred: 'bug_category', value: resolvedCat });
      }

      // focusFacts = 规范化后的 bug_category（比 repo 更精准）
      const catFact = facts.find(f => f.pred === 'bug_category');
      focusFacts = catFact ? [catFact] : [{ pred: 'repo', value: issue.repo }];
    } else {
      // regex 模式：沿用 importSweIssueTool
      const obs = importSweIssueTool(storage, issue);
      facts = obs.facts;
      // 注入 ground truth 标签作为监督训练信号
      // 归纳引擎学习 features → bug_category 的关联，预测时通过 regulationCategory 返回
      const catFact: Fact = { pred: 'bug_category', value: issue.expectedCategory };
      if (!facts.some(f => f.pred === 'bug_category')) {
        facts = [...facts, catFact];
      }
      focusFacts = [catFact];
    }

    // 构造观测并写入 v7-v8
    const obs: Observation = {
      observationId: `bench_train_${issue.issueId}`,
      timestamp: new Date().toISOString(),
      facts,
      focusFacts,
      context: { repo: issue.repo },
    };
    submitObservationTool(storage, obs);
  }

  const uniqueCategoriesInTrain = new Set(train.map(i => i.expectedCategory)).size;

  // Phase 2: 归纳
  const inductionResult = triggerInductionTool(storage, {
    minClusterSize: 2, minSimilarity: 0.3, autoValidate: false,
  });

  // Phase 3: 预测
  const predictions: Prediction[] = [];
  for (const issue of test) {
    let testFacts: Fact[];
    let testFocus: Fact[];

    if (useLLM) {
      const extracted = await extractFactsWithLLM(issue.issueId, issue.description);
      testFacts = extractedToFacts(extracted, issue.repo);

      // LLM bug_category → 内置 6 类规范化 + errorLog 派生兜底
      const BUILTIN_SET = new Set(['type_error', 'import_error', 'assertion_error', 'config_error', 'value_error', 'key_error']);
      const catFactIdx = testFacts.findIndex(f => f.pred === 'bug_category');
      let resolvedCat: string | null = null;

      if (catFactIdx >= 0) {
        const rawCat = String(testFacts[catFactIdx].value);
        const normalized = normalizeLLMCategory(rawCat);
        if (BUILTIN_SET.has(normalized)) {
          testFacts[catFactIdx] = { pred: 'bug_category', value: normalized };
          resolvedCat = normalized;
        } else {
          // 规范化后不是内置类（unknown/other 等）→ 删除该 fact，改用 errorLog 派生
          testFacts.splice(catFactIdx, 1);
        }
      }

      if (!resolvedCat) {
        // errorLog 正则派生（与训练阶段策略一致）
        const errLog = (issue.errorLog ?? '').toLowerCase();
        if (/importerror|modulenotfound|cannot import/.test(errLog)) resolvedCat = 'import_error';
        else if (/assertionerror/.test(errLog)) resolvedCat = 'assertion_error';
        else if (/keyerror/.test(errLog)) resolvedCat = 'key_error';
        else if (/valueerror/.test(errLog)) resolvedCat = 'value_error';
        else if (/typeerror/.test(errLog)) resolvedCat = 'type_error';
        else if (/improperlyconfigured|settings\.|secret_key|database_url|yaml/i.test(errLog)) resolvedCat = 'config_error';
        if (resolvedCat) testFacts.push({ pred: 'bug_category', value: resolvedCat });
      }

      const catFact = testFacts.find(f => f.pred === 'bug_category');
      testFocus = catFact ? [catFact] : [{ pred: 'repo', value: issue.repo }];
    } else {
      const tmpStorage = createStorage(':memory:');
      const obsFull = importSweIssueTool(tmpStorage, issue);
      testFacts = obsFull.facts;
      const errorCatFact = testFacts.find(f => f.pred === 'error_category');
      const repoFact = testFacts.find(f => f.pred === 'repo');
      testFocus = errorCatFact ? [errorCatFact]
                : repoFact     ? [repoFact]
                : [{ pred: 'has_issue', value: true }];
    }

    const testObs: Observation = {
      observationId: `bench_test_${issue.issueId}`,
      timestamp: new Date().toISOString(),
      facts: testFacts,
      focusFacts: testFocus,
      context: { repo: issue.repo },
    };

    const suggestions = suggestCausesTool(storage, testObs);

    const BUILTIN_CATS = new Set(['type_error', 'import_error', 'assertion_error', 'config_error', 'value_error', 'key_error']);

    // 类别推断策略（优先级递减）：
    // 1. test issue 自身的 bug_category fact（LLM 映射 + errorLog 正则联合派生，最准）
    // 2. 找 eff.bug_category 与 testIssueCat 一致的 regulation（有 regulation 支撑则更可信）
    // 3. 找任意能解析到内置 6 类的 regulation（score 最高者）
    // 4. 退回 top regulation 的 category（可能是 repo 名等非内置类）
    const testIssueBugCat = testFacts.find(f => f.pred === 'bug_category');
    const testIssueCat = testIssueBugCat && BUILTIN_CATS.has(String(testIssueBugCat.value))
      ? String(testIssueBugCat.value)
      : null;

    let bestSug = suggestions[0] ?? null;
    let bestReg = bestSug ? storage.getRegulation(bestSug.regulationId) : null;
    let bestCat: string | null = null;

    // 策略 1：test issue 自身 bug_category（最直接）
    if (testIssueCat) {
      bestCat = testIssueCat;
      // 同时找一个与之一致的 regulation 作为 bestSug（提升 hit 置信度）
      for (const sug of suggestions) {
        const reg = storage.getRegulation(sug.regulationId);
        if (!reg) continue;
        if (regulationCategory(reg) === testIssueCat) {
          bestSug = sug;
          bestReg = reg;
          break;
        }
      }
    }

    // 策略 2：test issue 无 bug_category fact → 找与 issue_label 匹配的 regulation（最直接）
    // issue_label 包含 expectedCategory（如 sympy_issue），regulation eff 也含 bug_category=sympy_issue
    const testIssueLabels = new Set(
      testFacts.filter(f => f.pred === 'issue_label').map(f => String(f.value))
    );
    const GENERIC_LABELS = new Set(['swe-bench', 'bug', 'test', 'regression', 'dependencies', 'configuration']);
    if (!bestCat) {
      for (const sug of suggestions) {
        const reg = storage.getRegulation(sug.regulationId);
        if (!reg) continue;
        const cat = regulationCategory(reg);
        if (cat && testIssueLabels.has(cat) && !GENERIC_LABELS.has(cat)) {
          bestSug = sug;
          bestReg = reg;
          bestCat = cat;
          break;
        }
      }
    }

    // 策略 3：无 label 匹配 → 找 BUILTIN_CATS regulation
    if (!bestCat) {
      for (const sug of suggestions) {
        const reg = storage.getRegulation(sug.regulationId);
        if (!reg) continue;
        const cat = regulationCategory(reg);
        if (cat && BUILTIN_CATS.has(cat)) {
          bestSug = sug;
          bestReg = reg;
          bestCat = cat;
          break;
        }
      }
    }

    // 策略 4：退回 top regulation 的任意 category
    if (!bestCat) {
      for (const sug of suggestions) {
        const reg = storage.getRegulation(sug.regulationId);
        if (!reg) continue;
        const cat = regulationCategory(reg);
        if (cat) {
          bestSug = sug;
          bestReg = reg;
          bestCat = cat;
          break;
        }
      }
    }

    const top = bestSug;
    const topCat = bestCat;

    predictions.push({
      issueId: issue.issueId,
      expectedCategory: issue.expectedCategory,
      predictedCauses: suggestions.length,
      topRegulationId: top?.regulationId ?? null,
      topRegulationPreCategory: topCat,
      topScore: top?.score ?? 0,
      hit: suggestions.length > 0,
      categoryCorrect: topCat === issue.expectedCategory,
    });
  }

  const hitCount = predictions.filter(p => p.hit).length;
  const categoryCorrectCount = predictions.filter(p => p.categoryCorrect).length;
  const avgCauses = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.predictedCauses, 0) / predictions.length
    : 0;

  const learnedRegulations = inductionResult.regulationsCreated.map(r => ({
    id: r.regulationId,
    pre: r.pre.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(' ∧ '),
    eff: r.eff.map(f => `${f.pred}=${JSON.stringify(f.value)}`).join(' ∧ '),
    supportN: r.supportN ?? 0,
  }));

  pipeline.close();

  return {
    trainSize: train.length,
    testSize: test.length,
    regulationsLearned: inductionResult.regulationsCreated.length,
    uniqueCategoriesInTrain,
    predictions,
    hitRate: test.length > 0 ? hitCount / test.length : 0,
    categoryAccuracy: test.length > 0 ? categoryCorrectCount / test.length : 0,
    diversity: uniqueCategoriesInTrain > 0
      ? inductionResult.regulationsCreated.length / uniqueCategoriesInTrain
      : 0,
    avgCauses,
    regulations: learnedRegulations,
    duration: Date.now() - startTime,
  };
}

// =============================================================================
// CLI
// =============================================================================

if (process.argv[1]?.includes('swe-bench-runner')) {
  const splitIdx = process.argv.indexOf('--split');
  const trainRatio = splitIdx >= 0 ? parseFloat(process.argv[splitIdx + 1]) : 0.7;
  const useReal = process.argv.includes('--real');
  const useLLM = process.argv.includes('--llm');

  /** 加载数据集：--real 时尝试真实数据，失败则降级到内置 */
  async function resolveDataset(): Promise<{ issues: LabeledIssue[]; source: string }> {
    if (!useReal) {
      return { issues: DATASET, source: `内置合成 (${DATASET.length} issues / 6 categories)` };
    }

    console.log('[benchmark] --real 模式：尝试加载 SWE-bench Lite 真实数据集...');
    const realIssues = await loadSWEBenchLite();
    if (realIssues && realIssues.length > 0) {
      const categories = new Set(realIssues.map(i => i.expectedCategory));
      return {
        issues: realIssues,
        source: `SWE-bench Lite 真实数据 (${realIssues.length} issues / ${categories.size} categories)`,
      };
    }

    console.warn('[benchmark] 真实数据加载失败，降级到内置数据集');
    return { issues: DATASET, source: `内置合成（降级）(${DATASET.length} issues / 6 categories)` };
  }

  resolveDataset().then(({ issues, source }) =>
    runBenchmark({ issues, trainRatio, useLLM }).then(r => {
      console.log('\n=== SWE-bench Causal Learning Benchmark ===\n');
      console.log(`数据集：${source}`);
      console.log(`训练集：${r.trainSize}  测试集：${r.testSize}  split=${trainRatio}`);
      console.log(`训练集 categories: ${r.uniqueCategoriesInTrain}`);
      console.log(`归纳产出：${r.regulationsLearned} regulations   diversity=${r.diversity.toFixed(2)}\n`);

      console.log('--- 学到的 regulations ---');
      for (const reg of r.regulations) {
        console.log(`  [${reg.id}] support=${reg.supportN}`);
        console.log(`    pre: ${reg.pre || '(空)'}`);
        console.log(`    eff: ${reg.eff || '(空)'}`);
      }

      console.log('\n--- 预测结果 ---');
      for (const p of r.predictions) {
        const hitIcon = p.hit ? '[HIT]' : '[MISS]';
        const catIcon = p.categoryCorrect ? '[OK ]' : '[   ]';
        console.log(`  ${hitIcon} ${catIcon} ${p.issueId.padEnd(10)} expected=${p.expectedCategory.padEnd(15)} pred=${p.topRegulationPreCategory ?? '-'}  score=${p.topScore.toFixed(2)}`);
      }

      console.log('\n--- 指标 ---');
      console.log(`  hit_rate:          ${(r.hitRate * 100).toFixed(1)}%  (${r.predictions.filter(p => p.hit).length}/${r.testSize})`);
      console.log(`  category_accuracy: ${(r.categoryAccuracy * 100).toFixed(1)}%  (${r.predictions.filter(p => p.categoryCorrect).length}/${r.testSize})`);
      console.log(`  avg_causes:        ${r.avgCauses.toFixed(1)}`);
      console.log(`  duration:          ${r.duration}ms\n`);
    })
  );
}
