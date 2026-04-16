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

/** 从 regulation 的 eff 中提取 category（repo 优先，error_category 兜底） */
function regulationCategory(reg: Regulation): string | null {
  // repo 级 category：eff 中的 repo fact → 提取 repo 短名
  const repoEff = reg.eff.find(f => f.pred === 'repo');
  if (repoEff) {
    const val = String(repoEff.value);
    return val.includes('/') ? val.split('/')[1] : val;
  }
  // 兜底：error_category
  const effCat = reg.eff.find(f => f.pred === 'error_category');
  if (effCat) return String(effCat.value);
  const preCat = reg.pre.find(f => f.pred === 'error_category');
  return preCat ? String(preCat.value) : null;
}

export async function runBenchmark(options: {
  issues?: LabeledIssue[];
  trainRatio?: number;
} = {}): Promise<BenchmarkResult> {
  const issues = options.issues ?? DATASET;
  const trainRatio = options.trainRatio ?? 0.7;
  const startTime = Date.now();

  const storage = createStorage(':memory:');
  const pipeline = new CausalPipeline({ seedDefaults: false });
  const { train, test } = splitTrainTest(issues, trainRatio);

  // Phase 1: 训练
  // 关键：importSweIssueTool 用 has_issue=true 作为 focusFacts，所有 issue 聚为一类
  // 改用 error_category 作为 focusFact，让归纳按 category 分桶产生差异化 regulation
  for (const issue of train) {
    const obs = importSweIssueTool(storage, issue);
    // 覆盖 focusFacts：用 error_category 替代通用 has_issue
    // focusFacts = repo fact，让归纳按 repo 聚类（对齐 repo 级 category）
    const repoFact = obs.facts.find(f => f.pred === 'repo');
    if (repoFact) {
      obs.focusFacts = [repoFact];
    }
    submitObservationTool(storage, obs);
    // pipeline（v9-v11）写入用 try/catch 容错——真实数据可能触发 atom-graph edge case
    try {
      pipeline.submitObservation({
        rawInput: `[${issue.repo}] ${issue.title}`,
        facts: obs.facts.slice(0, 10),
        context: { custom: { repo: issue.repo, issueId: issue.issueId } },
      });
    } catch { /* benchmark 核心路径是 v7-v8，pipeline crash 不阻塞 */ }
  }

  const uniqueCategoriesInTrain = new Set(train.map(i => i.expectedCategory)).size;

  // Phase 2: 归纳
  const inductionResult = triggerInductionTool(storage, {
    minClusterSize: 2, minSimilarity: 0.3, autoValidate: false,
  });

  // Phase 3: 预测
  const predictions: Prediction[] = [];
  for (const issue of test) {
    const tmpStorage = createStorage(':memory:');
    const obsFull = importSweIssueTool(tmpStorage, issue);
    const testRepoFact = obsFull.facts.find(f => f.pred === 'repo');
    const testObs: Observation = {
      observationId: `bench_test_${issue.issueId}`,
      timestamp: new Date().toISOString(),
      facts: obsFull.facts,
      focusFacts: testRepoFact ? [testRepoFact] : obsFull.focusFacts,
      context: { repo: issue.repo },
    };

    const suggestions = suggestCausesTool(storage, testObs);
    const top = suggestions[0] ?? null;
    const topReg = top ? storage.getRegulation(top.regulationId) : null;
    const topCat = topReg ? regulationCategory(topReg) : null;

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
    runBenchmark({ issues, trainRatio }).then(r => {
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
