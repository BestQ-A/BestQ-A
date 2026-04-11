#!/usr/bin/env node
/**
 * 新模块综合测试
 * 测试模糊匹配、知识聚类、蒙特卡洛采样、ReAct 搜索、MCP 搜索工具
 */

import { createStorage } from '../dist/core/storage.js';
import { submitObservationTool } from '../dist/tools/observation.js';
import { triggerInductionTool } from '../dist/tools/induction.js';

// 新模块导入
import {
  levenshteinDistance,
  tokenSetRatio,
  FuzzyMatcher,
  calculateRelevanceScore,
  fuzzyMatchRegulations,
  fuzzyMatchEvents,
} from '../dist/core/fuzzy-matcher.js';

import {
  ClusterLifecycle,
  AbstractionLevel,
  KnowledgeClusterStorage,
  buildClusterFromRegulations,
  buildClusterFromEvidence,
} from '../dist/core/knowledge-cluster.js';

import {
  MonteCarloSampler,
  keywordScorer,
} from '../dist/core/monte-carlo-sampler.js';

import {
  createSearchContext,
  ToolRegistry,
  RegulationSearchTool,
  EventSearchTool,
  ReActSearchAgent,
  parseToolCall,
  extractAnswer,
  ruleBasedReasoner,
} from '../dist/core/react-search.js';

import {
  causalSearchTool,
  fuzzySearchRegulationsTool,
  fuzzySearchEventsTool,
  buildKnowledgeClusterTool,
  searchKnowledgeClustersTool,
  sampleEvidenceTool,
} from '../dist/tools/search.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

// ============================================================
// 准备测试数据
// ============================================================
function setupTestData() {
  const storage = createStorage(':memory:');

  // 提交一批 observations 来生成 events 和 regulations
  const observations = [
    {
      observationId: 'obs_1', timestamp: new Date().toISOString(),
      facts: [
        { pred: 'test.failed', value: true, args: { name: 'test_api' } },
        { pred: 'error.type', value: 'AttributeError' },
        { pred: 'error.message', value: 'NoneType has no attribute pk' },
      ],
      context: { repo: 'django/django', file: 'test_models.py' },
    },
    {
      observationId: 'obs_2', timestamp: new Date().toISOString(),
      facts: [
        { pred: 'test.failed', value: true, args: { name: 'test_query' } },
        { pred: 'error.type', value: 'AttributeError' },
        { pred: 'error.message', value: 'NoneType has no attribute id' },
      ],
      context: { repo: 'django/django', file: 'test_queryset.py' },
    },
    {
      observationId: 'obs_3', timestamp: new Date().toISOString(),
      facts: [
        { pred: 'test.failed', value: true, args: { name: 'test_timeout' } },
        { pred: 'error.type', value: 'TimeoutError' },
        { pred: 'error.message', value: 'Connection timed out after 30s' },
      ],
      context: { repo: 'requests/requests', file: 'test_adapters.py' },
    },
    {
      observationId: 'obs_4', timestamp: new Date().toISOString(),
      facts: [
        { pred: 'test.failed', value: true, args: { name: 'test_ssl' } },
        { pred: 'error.type', value: 'TimeoutError' },
        { pred: 'error.message', value: 'SSL handshake timed out' },
      ],
      context: { repo: 'requests/requests', file: 'test_ssl.py' },
    },
  ];

  for (const obs of observations) {
    submitObservationTool(storage, obs);
  }

  // 触发归纳生成 regulations
  triggerInductionTool(storage, { minClusterSize: 2, minSimilarity: 0.3 });

  return storage;
}

// ============================================================
// Test 1: 模糊匹配器
// ============================================================
function testFuzzyMatcher() {
  console.log('\n📦 Test 1: 模糊匹配器 (fuzzy-matcher.ts)');

  // Levenshtein 距离
  assert(levenshteinDistance('kitten', 'sitting') === 3, 'levenshtein("kitten","sitting") = 3');
  assert(levenshteinDistance('', 'abc') === 3, 'levenshtein("","abc") = 3');
  assert(levenshteinDistance('abc', 'abc') === 0, 'levenshtein("abc","abc") = 0');

  // Token Set Ratio
  const score1 = tokenSetRatio('AttributeError NoneType', 'NoneType has no attribute pk AttributeError');
  assert(score1 > 50, `tokenSetRatio 包含关系: ${score1.toFixed(1)} > 50`);

  const score2 = tokenSetRatio('hello world', 'completely different text');
  assert(score2 < 30, `tokenSetRatio 无关文本: ${score2.toFixed(1)} < 30`);

  // FuzzyMatcher
  const matcher = new FuzzyMatcher([
    { id: 'r1', text: 'AttributeError NoneType has no attribute pk' },
    { id: 'r2', text: 'TimeoutError connection timed out after 30 seconds' },
    { id: 'r3', text: 'ImportError no module named django' },
  ]);
  const results = matcher.search('attribute error nonetype');
  assert(results.length > 0, `FuzzyMatcher 搜索结果: ${results.length} 条`);
  assert(results[0].id === 'r1', `FuzzyMatcher 最佳匹配: ${results[0].id} (期望 r1)`);

  // Relevance Score
  const relScore = calculateRelevanceScore(
    'This is a test with AttributeError and NoneType issues',
    ['AttributeError', 'NoneType']
  );
  assert(relScore > 0, `相关性评分: ${relScore.toFixed(4)} > 0`);

  // Regulation 模糊搜索
  const regs = [
    { regulationId: 'reg1', description: 'NoneType attribute error in Django models', pre: [], eff: [] },
    { regulationId: 'reg2', description: 'Timeout error in network connections', pre: [], eff: [] },
  ];
  const regResults = fuzzyMatchRegulations('attribute error', regs);
  assert(regResults.length > 0, `Regulation 模糊搜索: ${regResults.length} 条`);
}

// ============================================================
// Test 2: 知识聚类
// ============================================================
function testKnowledgeCluster() {
  console.log('\n📦 Test 2: 知识聚类 (knowledge-cluster.ts)');

  // 枚举值检查
  assert(ClusterLifecycle.EMERGING === 'emerging', `ClusterLifecycle.EMERGING = "${ClusterLifecycle.EMERGING}"`);
  assert(AbstractionLevel.PATTERN === 2, `AbstractionLevel.PATTERN = ${AbstractionLevel.PATTERN}`);

  // 内存 SQLite 存储
  const kcStorage = new KnowledgeClusterStorage(':memory:');

  // 从 regulations 构建 cluster
  const testRegs = [
    {
      regulationId: 'reg_test1', status: 'confirmed',
      pre: [{ pred: 'error.type', value: 'AttributeError' }],
      eff: [{ pred: 'test.failed', value: true }],
      description: 'AttributeError causes test failure',
      supportN: 5, counterexampleN: 0, tags: ['django'],
    },
  ];
  const testEvents = [
    {
      eventId: 'evt_test1', timestamp: new Date().toISOString(),
      observation: {
        observationId: 'obs_test1', timestamp: new Date().toISOString(),
        facts: [{ pred: 'error.type', value: 'AttributeError' }],
      },
      attemptedExplanations: [], unexplainedAspects: [],
      status: 'resolved', notes: 'Fixed by adding null check',
    },
  ];

  const cluster = buildClusterFromRegulations(testRegs, testEvents, 'Django AttributeError Pattern');
  assert(cluster.id.startsWith('KC_'), `Cluster ID 格式: ${cluster.id}`);
  assert(cluster.name === 'Django AttributeError Pattern', `Cluster 名称正确`);
  assert(cluster.regulationIds.includes('reg_test1'), 'Cluster 关联 regulation');
  assert(cluster.eventIds.includes('evt_test1'), 'Cluster 关联 event');

  // 存储和检索
  kcStorage.insert(cluster);
  const retrieved = kcStorage.get(cluster.id);
  assert(retrieved !== null, `存储后检索成功`);
  assert(retrieved?.name === cluster.name, `检索名称匹配`);

  // 关键词搜索
  const searchResults = kcStorage.findByKeyword('AttributeError');
  assert(searchResults.length > 0, `关键词搜索: ${searchResults.length} 条`);

  // 统计
  const stats = kcStorage.getStats();
  assert(stats.total >= 1, `统计: total=${stats.total}`);

  // 从证据构建
  const evidenceCluster = buildClusterFromEvidence('timeout issue', [
    { docId: 'doc1', summary: 'Connection timeout', snippets: [], extractedAt: new Date().toISOString(), isRelevant: true },
  ], ['reg_timeout1']);
  assert(evidenceCluster.id.startsWith('KC_'), `Evidence cluster ID: ${evidenceCluster.id}`);

  kcStorage.close();
}

// ============================================================
// Test 3: 蒙特卡洛采样
// ============================================================
async function testMonteCarloSampler() {
  console.log('\n📦 Test 3: 蒙特卡洛采样 (monte-carlo-sampler.ts)');

  // 小文档快速路径
  const smallDoc = 'This is a small document about AttributeError in Django models.';
  const smallSampler = new MonteCarloSampler(smallDoc);
  const scorer = keywordScorer(new Map([['AttributeError', 2.0], ['Django', 1.5]]));
  const smallResult = await smallSampler.getRoi('AttributeError Django', new Map([['AttributeError', 2.0]]), scorer);
  assert(smallResult.isFound === true, '小文档快速路径: isFound=true');
  assert(smallResult.snippets.length > 0, `小文档返回 ${smallResult.snippets.length} 个片段`);

  // 大文档采样
  const lines = [];
  for (let i = 0; i < 500; i++) {
    if (i === 200) {
      lines.push('ERROR: AttributeError - NoneType object has no attribute pk in Django model layer');
    } else if (i === 350) {
      lines.push('DEBUG: TimeoutError occurred during database connection attempt, retrying...');
    } else {
      lines.push(`Line ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.`);
    }
  }
  const largeDoc = lines.join('\n');

  const largeSampler = new MonteCarloSampler(largeDoc, {
    maxRounds: 2,
    probeWindow: 300,
    fuzzCandidatesNum: 3,
  });
  const keywords = new Map([['AttributeError', 3.0], ['NoneType', 2.0], ['Django', 1.0]]);
  const largeResult = await largeSampler.getRoi(
    'AttributeError NoneType Django',
    keywords,
    keywordScorer(keywords),
    3
  );
  assert(largeResult.isFound === true || largeResult.snippets.length > 0,
    `大文档采样: isFound=${largeResult.isFound}, snippets=${largeResult.snippets.length}`);

  // 关键词评分器
  const testScorer = keywordScorer(new Map([['error', 2.0], ['timeout', 1.5]]));
  const scoreResult = await testScorer('This error caused a timeout in production', 'error timeout');
  assert(scoreResult.score > 0, `关键词评分器: score=${scoreResult.score.toFixed(2)}`);
}

// ============================================================
// Test 4: ReAct 搜索代理
// ============================================================
async function testReActSearch() {
  console.log('\n📦 Test 4: ReAct 搜索代理 (react-search.ts)');

  // SearchContext
  const ctx = createSearchContext(10000, 5);
  assert(!ctx.isLoopLimitReached(), 'SearchContext 初始: 未达循环上限');
  assert(!ctx.isBudgetExceeded(), 'SearchContext 初始: 未超预算');
  ctx.addSearch('test query');
  assert(ctx.searchHistory.length === 1, 'SearchContext: 记录搜索历史');

  // parseToolCall
  const call1 = parseToolCall(
    '{"tool": "keyword_search", "arguments": {"keywords": ["error"]}}',
    ['keyword_search', 'file_read']
  );
  assert(call1 !== null && call1.toolName === 'keyword_search', 'parseToolCall JSON 格式');

  const call2 = parseToolCall(
    '```json\n{"tool": "file_read", "arguments": {"paths": ["/a.py"]}}\n```',
    ['keyword_search', 'file_read']
  );
  assert(call2 !== null && call2.toolName === 'file_read', 'parseToolCall Markdown 格式');

  // extractAnswer
  const answer1 = extractAnswer('Some reasoning... <ANSWER>The root cause is X</ANSWER> end');
  assert(answer1 === 'The root cause is X', 'extractAnswer 提取正确');

  const answer2 = extractAnswer('No answer tags here');
  assert(answer2 === null, 'extractAnswer 无标签返回 null');

  // ToolRegistry
  const storage = setupTestData();
  const registry = new ToolRegistry();

  const regTool = new RegulationSearchTool(
    () => storage.listRegulations(),
    (query, items) => items
      .map(item => ({ id: item.id, score: item.text.toLowerCase().includes(query.toLowerCase()) ? 80 : 10 }))
      .filter(r => r.score > 50)
  );
  registry.register(regTool);
  assert(registry.toolNames().includes('regulation_search'), 'ToolRegistry: 注册成功');

  const toolResult = await registry.execute('regulation_search', ctx, { query: 'error' });
  assert(toolResult.text.length > 0, `ToolRegistry execute: ${toolResult.text.length} chars`);

  // ruleBasedReasoner (简易推理器)
  const reasoner = ruleBasedReasoner(registry, true);
  assert(typeof reasoner === 'function', 'ruleBasedReasoner 返回函数');
}

// ============================================================
// Test 5: MCP 搜索工具
// ============================================================
async function testMCPSearchTools() {
  console.log('\n📦 Test 5: MCP 搜索工具 (tools/search.ts)');

  const storage = setupTestData();

  // fuzzy_search_regulations
  const fuzzyRegResult = await fuzzySearchRegulationsTool(storage, {
    query: 'attribute error',
    threshold: 10,
    limit: 5,
  });
  assert(fuzzyRegResult.content[0].type === 'text', 'fuzzySearchRegulations: 返回格式正确');
  const fuzzyRegText = fuzzyRegResult.content[0].text;
  console.log(`    结果预览: ${fuzzyRegText.substring(0, 100)}...`);

  // fuzzy_search_events
  const fuzzyEvtResult = await fuzzySearchEventsTool(storage, {
    query: 'timeout',
    threshold: 10,
    limit: 5,
  });
  assert(fuzzyEvtResult.content[0].type === 'text', 'fuzzySearchEvents: 返回格式正确');

  // build_knowledge_cluster
  const buildResult = await buildKnowledgeClusterTool(storage, {
    name: 'Test Pattern Cluster',
    regulationIds: [],
    eventIds: [],
    description: 'A test cluster for verification',
  });
  assert(buildResult.content[0].type === 'text', 'buildKnowledgeCluster: 返回格式正确');
  const buildText = buildResult.content[0].text;
  assert(buildText.includes('Test Pattern Cluster') || buildText.includes('KC_'), `构建结果: ${buildText.substring(0, 80)}`);

  // search_knowledge_clusters
  const searchResult = await searchKnowledgeClustersTool(storage, {
    query: 'Test',
    limit: 5,
  });
  assert(searchResult.content[0].type === 'text', 'searchKnowledgeClusters: 返回格式正确');

  // sample_evidence
  const sampleResult = await sampleEvidenceTool(storage, {
    document: 'Line 1: Normal code.\nLine 2: ERROR AttributeError - NoneType has no attribute pk.\nLine 3: More normal code.\nLine 4: This is related to Django model layer.\nLine 5: End of log.',
    query: 'AttributeError NoneType',
    keywords: { 'AttributeError': 3.0, 'NoneType': 2.0 },
    topK: 2,
  });
  assert(sampleResult.content[0].type === 'text', 'sampleEvidence: 返回格式正确');
  const sampleText = sampleResult.content[0].text;
  assert(sampleText.includes('AttributeError') || sampleText.includes('snippet'), `采样结果包含关键词`);

  // causal_search
  const causalResult = await causalSearchTool(storage, {
    query: 'What causes test failures?',
    maxDepth: 3,
    strategy: 'regulation_first',
  });
  assert(causalResult.content[0].type === 'text', 'causalSearch: 返回格式正确');
  const causalText = causalResult.content[0].text;
  assert(causalText.length > 50, `因果搜索结果: ${causalText.length} chars`);
}

// ============================================================
// 运行所有测试
// ============================================================
async function main() {
  console.log('🧪 BestQ-A 新模块综合测试\n');
  console.log('='.repeat(60));

  try {
    testFuzzyMatcher();
  } catch (e) {
    console.log(`  ❌ 模糊匹配器异常: ${e.message}`);
    failed++;
  }

  try {
    testKnowledgeCluster();
  } catch (e) {
    console.log(`  ❌ 知识聚类异常: ${e.message}`);
    failed++;
  }

  try {
    await testMonteCarloSampler();
  } catch (e) {
    console.log(`  ❌ 蒙特卡洛采样异常: ${e.message}`);
    failed++;
  }

  try {
    await testReActSearch();
  } catch (e) {
    console.log(`  ❌ ReAct 搜索异常: ${e.message}`);
    failed++;
  }

  try {
    await testMCPSearchTools();
  } catch (e) {
    console.log(`  ❌ MCP 搜索工具异常: ${e.message}`);
    failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);

  if (failed > 0) {
    console.log('\n⚠️ 有测试失败！');
    process.exit(1);
  } else {
    console.log('\n✅ 全部测试通过！');
  }
}

main().catch((err) => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
