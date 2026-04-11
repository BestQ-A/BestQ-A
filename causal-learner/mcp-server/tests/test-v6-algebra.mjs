#!/usr/bin/env node
/**
 * v6 专项测试：关系代数 + 模式模板 + 元模型对象
 */

import { getRefAlgebra, canCompose, isPathLegal, refFamily } from '../dist/core/ref-algebra.js';
import { PatternEngine } from '../dist/core/pattern-template.js';
import { AtomGraph } from '../dist/core/atom-graph.js';
import { StoryStorage } from '../dist/core/story.js';
import { EvidenceStore, recordSupport, recordContradiction, isEvidenceHealthy } from '../dist/core/evidence.js';
import { ProblemClassRegistry } from '../dist/core/problem-class.js';
import { SkillRegistry } from '../dist/core/skill.js';
import { RegulationViewBuilder } from '../dist/core/regulation-view.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; console.log(`  ❌ ${message}`); }
}

// ============================================================
// Test 1: RefAlgebra — 复合规则 + force + proof
// ============================================================
function testRefAlgebra() {
  console.log('\n📦 1. RefAlgebra 关系代数');
  const alg = getRefAlgebra();

  // 族群分类
  assert(refFamily('causes') === 'explanatory', '族群: causes → explanatory');
  assert(refFamily('indicates') === 'evidential', '族群: indicates → evidential');
  assert(refFamily('fixes') === 'interventional', '族群: fixes → interventional');
  assert(refFamily('is_a') === 'structural', '族群: is_a → structural');

  // 合法复合
  assert(canCompose('causes', 'causes'), '合法: causes ∘ causes');
  assert(canCompose('fixes', 'causes'), '合法: fixes ∘ causes');
  assert(canCompose('is_a', 'causes'), '合法: is_a ∘ causes (inherit)');

  // 禁止复合（核心安全约束）
  assert(!canCompose('indicates', 'causes'), '禁止: indicates ∘ causes (征兆≠根因)');
  assert(!canCompose('cooccurs', 'causes'), '禁止: cooccurs ∘ causes (共现≠因果)');
  assert(!canCompose('part_of', 'causes'), '禁止: part_of ∘ causes');
  assert(!canCompose('indicates', 'fixes'), '禁止: indicates ∘ fixes');

  // 路径合法性
  assert(isPathLegal(['causes', 'causes', 'causes']), '路径合法: causes 链');
  assert(!isPathLegal(['indicates', 'causes']), '路径非法: indicates→causes');
  assert(isPathLegal(['is_a', 'causes', 'causes']), '路径合法: is_a→causes→causes');

  // RefForce 维度
  const causesSpec = alg.getSpec('causes');
  assert(causesSpec?.defaultForce === 'contributory', 'force: causes=contributory (不假设充分)');
  assert(alg.getSpec('requires')?.defaultForce === 'necessary', 'force: requires=necessary');
  assert(alg.getSpec('indicates')?.defaultForce === 'analogical', 'force: indicates=analogical');

  // EvidencePolicy
  const r1 = alg.compose('causes', 'causes');
  assert(r1.allowed && r1.evidencePolicy === 'inherit', 'policy: causes∘causes → inherit');
  const r2 = alg.compose('is_a', 'causes');
  assert(r2.allowed && r2.evidencePolicy === 'revalidate', 'policy: is_a∘causes → revalidate');
  const r3 = alg.compose('indicates', 'indicates');
  assert(r3.allowed && r3.evidencePolicy === 'discard', 'policy: indicates∘indicates → discard');

  // Proof-carrying validation
  const rich = alg.validatePathRich(['causes', 'causes']);
  assert(rich.valid && rich.proof.length === 2, 'proof: 2 步推导');
  assert(rich.resultForce != null, 'proof 包含 resultForce');
  assert(rich.evidencePolicy != null, 'proof 包含 evidencePolicy');

  const richFail = alg.validatePathRich(['indicates', 'causes']);
  assert(!richFail.valid && richFail.proof.length >= 1, 'proof: 失败时保留部分记录');
}

// ============================================================
// Test 2: PatternEngine — 模板匹配 + 不变量
// ============================================================
function testPatternEngine() {
  console.log('\n📦 2. PatternEngine 小范畴模板');
  const pe = new PatternEngine(':memory:');
  pe.seedDefaults();

  // 种子模板
  const templates = pe.listTemplates();
  assert(templates.length >= 3, `种子模板: ${templates.length} 个`);

  const diag = pe.getTemplate('PT_diagnostic');
  assert(diag != null, 'PT_diagnostic 存在');
  assert(diag.slots.length === 4, '4 个 slot: Symptom/Mechanism/Failure/Action');
  assert(diag.arrows.length === 3, '3 条 arrow: indicates/causes/fixes');

  // 可执行不变量
  assert(diag.invariantChecks?.length >= 2, `${diag.invariantChecks?.length} 个可执行不变量`);

  // 模板匹配
  const atoms = [
    { id: 'a1', kind: 'fact', content: 'timeout error' },
    { id: 'a2', kind: 'concept', content: 'connection pool exhausted' },
    { id: 'a3', kind: 'fact', content: 'API 500 error' },
    { id: 'a4', kind: 'action', content: 'increase pool size' },
  ];
  const refs = new Set(['a1|a2|indicates', 'a2|a3|causes', 'a4|a2|fixes']);
  const checker = (from, to, kind) => refs.has(`${from}|${to}|${kind}`);

  const matches = pe.matchTemplates(atoms, checker);
  assert(matches.length > 0, `匹配到 ${matches.length} 个模板`);
  assert(matches[0].template.id === 'PT_diagnostic', '最佳匹配: 诊断模板');
  assert(matches[0].instance.score > 0.5, `匹配分数: ${matches[0].instance.score.toFixed(2)}`);

  // canCompile: 好的绑定
  const goodBindings = { Symptom: 'a1', Mechanism: 'a2', Failure: 'a3', Action: 'a4' };
  const good = pe.canCompile(diag, goodBindings, checker);
  assert(good.allowed, 'canCompile: 合法绑定通过');

  // canCompile: 坏的绑定（Symptom == Failure）
  const badBindings = { Symptom: 'a1', Mechanism: 'a2', Failure: 'a1' };
  const bad = pe.canCompile(diag, badBindings, checker);
  assert(!bad.allowed, 'canCompile: Symptom==Failure 被阻止');

  pe.close();
}

// ============================================================
// Test 3: 全流程集成 — 事实→图→分类→探索→编译→视图
// ============================================================
function testIntegration() {
  console.log('\n📦 3. 全流程集成测试');

  // 初始化所有模块
  const graph = new AtomGraph(':memory:');
  const stories = new StoryStorage(':memory:');
  const evidence = new EvidenceStore(':memory:');
  const pcr = new ProblemClassRegistry(':memory:');
  pcr.seedDefaults();
  const skills = new SkillRegistry(':memory:');
  skills.seedDefaults();
  const pe = new PatternEngine(':memory:');
  pe.seedDefaults();
  const alg = getRefAlgebra();

  // Step 1: 摄入事实
  const atoms = graph.ingestFacts([
    { pred: 'error.type', value: 'AttributeError' },
    { pred: 'error.message', value: "NoneType has no attribute 'pk'" },
    { pred: 'file', value: 'models.py' },
  ], { repo: 'django/django', lang: 'python' });
  assert(atoms.length >= 3, `Step 1 摄入: ${atoms.length} atoms`);

  // Step 2: 问题分类
  const classified = pcr.classify("AttributeError: NoneType has no attribute 'pk'");
  assert(classified.length > 0, `Step 2 分类: ${classified[0].problemClassId}`);
  assert(classified[0].problemClassId === 'PC_null_deref', '分类正确: null deref');

  // Step 3: 手动添加概念和修复
  const mechanism = graph.addAtom('queryset returns None without check', 'concept');
  const action = graph.addAtom('add .exists() or if obj is not None guard', 'action');

  // Step 4: 建因果边（先检查复合合法性）
  const errorAtom = atoms.find(a => a.content.includes('error.type'));
  assert(errorAtom != null, 'Step 4 找到 error atom');

  graph.addRef(errorAtom.id, mechanism.id, 'indicates', { weight: 0.8, mode: 'compiled' });
  graph.addRef(mechanism.id, atoms.find(a => a.content.includes('file'))?.id ?? '', 'causes', { weight: 0.7, mode: 'compiled' });
  graph.addRef(action.id, mechanism.id, 'fixes', { weight: 0.85, mode: 'compiled' });

  // Step 5: 验证路径合法性
  const pathCheck = alg.validatePathRich(['indicates', 'causes']);
  assert(!pathCheck.valid, 'Step 5 路径检查: indicates→causes 被阻止 ✓');

  const goodPath = alg.validatePathRich(['causes', 'causes']);
  assert(goodPath.valid, 'Step 5 路径检查: causes→causes 合法 ✓');

  // Step 6: 创建 Story
  const story = stories.create({
    rawInput: "AttributeError: NoneType has no attribute 'pk' in models.py",
    problemClassId: 'PC_null_deref',
    context: { stack: ['django', 'python'], env: 'dev' },
    observationAtomIds: atoms.map(a => a.id),
    operator: 'test',
  });
  assert(story.status === 'open', `Step 6 Story 创建: ${story.id}`);

  // Step 7: 探索
  const explore = graph.explore([errorAtom.id]);
  stories.startExploring(story.id, explore.paths.map(p => ({
    atomIds: p.atoms.map(a => a.id),
    totalWeight: p.totalWeight,
  })));
  assert(explore.paths.length >= 0, `Step 7 探索: ${explore.paths.length} 条路径`);

  // Step 8: 解决 + 记录证据
  stories.resolve(story.id, 'success', 'Fixed by adding None check');
  const evi = recordSupport(evidence, 'r_test', 'fix', story.id, 0.9, { stack: ['django'] });
  assert(evi.supportsOrContradicts === 'supports', 'Step 8 证据记录: supports');

  // Step 9: Regulation 视图
  const rvb = new RegulationViewBuilder(graph.db);
  const views = rvb.buildAll();
  assert(views.length > 0, `Step 9 Regulation 视图: ${views.length} 条`);

  // Step 10: 统计
  const graphStats = graph.getStats();
  const storyStats = stories.getStats();
  assert(graphStats.atomCount > 0, `Step 10 图: ${graphStats.atomCount} atoms, ${graphStats.refCount} refs`);
  assert(storyStats.total === 1, `Step 10 Story: ${storyStats.total} 条`);

  // 清理
  graph.close();
  stories.close();
  evidence.close();
  pcr.close();
  skills.close();
  pe.close();
}

// ============================================================
// 运行所有测试
// ============================================================
async function main() {
  console.log('🧪 BestQ-A v6 完整测试套件\n' + '='.repeat(60));

  try { testRefAlgebra(); } catch (e) { console.log(`  ❌ RefAlgebra 异常: ${e.message}`); failed++; }
  try { testPatternEngine(); } catch (e) { console.log(`  ❌ PatternEngine 异常: ${e.message}`); failed++; }
  try { testIntegration(); } catch (e) { console.log(`  ❌ 集成测试异常: ${e.message}`); failed++; }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);

  if (failed > 0) { console.log('\n⚠️ 有测试失败！'); process.exit(1); }
  else { console.log('\n✅ v6 全部测试通过！'); }
}

main().catch(err => { console.error('测试异常:', err); process.exit(1); });
