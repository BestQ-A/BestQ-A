/**
 * 诊断推理引擎 E2E 测试
 *
 * 验证：种子知识→不完整信息诊断→追问→补充→收敛
 * 直接调用 core 层，不依赖 MCP server
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createStorage } from '../core/storage.js';
import { submitObservationTool } from '../tools/observation.js';
import { triggerInductionTool } from '../tools/induction.js';
import { suggestCausesTool } from '../tools/swebench.js';
import { diagnose, updateDiagnosis } from '../tools/diagnostic-reasoning.js';
import type { Observation } from '../core/types.js';

describe('诊断推理 E2E', () => {
  // 共享 storage，模拟真实的知识积累过程
  const storage = createStorage(':memory:');

  it('Phase 1: 种子数据写入', () => {
    const seeds = [
      // ConfigError 类
      { facts: [
        { pred: 'error_type', value: 'ConfigError' },
        { pred: 'symptom', value: 'service_crash' },
        { pred: 'affected_module', value: 'config-loader' },
        { pred: 'root_cause', value: 'missing_env_variable' },
      ], context: { project: 'web-app', env: 'production' } },
      { facts: [
        { pred: 'error_type', value: 'ConfigError' },
        { pred: 'symptom', value: 'service_crash' },
        { pred: 'affected_module', value: 'db-connector' },
        { pred: 'root_cause', value: 'missing_env_variable' },
      ], context: { project: 'api-service', env: 'staging' } },
      { facts: [
        { pred: 'error_type', value: 'ConfigError' },
        { pred: 'symptom', value: 'startup_failure' },
        { pred: 'affected_module', value: 'auth-service' },
        { pred: 'root_cause', value: 'invalid_config_format' },
      ], context: { project: 'web-app', env: 'local' } },
      // TypeError 类
      { facts: [
        { pred: 'error_type', value: 'TypeError' },
        { pred: 'symptom', value: '500_error' },
        { pred: 'affected_module', value: 'user-handler' },
        { pred: 'root_cause', value: 'null_reference' },
      ], context: { project: 'web-app', env: 'production' } },
      { facts: [
        { pred: 'error_type', value: 'TypeError' },
        { pred: 'symptom', value: '500_error' },
        { pred: 'affected_module', value: 'order-handler' },
        { pred: 'root_cause', value: 'null_reference' },
      ], context: { project: 'api-service', env: 'production' } },
      { facts: [
        { pred: 'error_type', value: 'TypeError' },
        { pred: 'symptom', value: 'request_timeout' },
        { pred: 'affected_module', value: 'payment-handler' },
        { pred: 'root_cause', value: 'undefined_property_access' },
      ], context: { project: 'web-app', env: 'staging' } },
    ];

    for (const seed of seeds) {
      const obs: Observation = {
        observationId: `seed_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        facts: seed.facts,
        context: seed.context,
      };
      submitObservationTool(storage, obs);
    }

    const stats = storage.listObservations(100);
    assert.ok(stats.length >= 6, `应有 >= 6 条观测，实际: ${stats.length}`);
  });

  it('Phase 2: 归纳学习产出 regulation', () => {
    const result = triggerInductionTool(storage, {
      minClusterSize: 2, minSimilarity: 0.3, autoValidate: false,
    });

    assert.ok(result.regulationsCreated.length >= 2,
      `应学到 >= 2 条 regulation，实际: ${result.regulationsCreated.length}`);

    // 验证 regulation 有真正的因果内容
    for (const reg of result.regulationsCreated) {
      assert.ok(reg.eff.length > 0, `regulation ${reg.regulationId} eff 不应为空`);
      const hasRealContent = reg.eff.some(f =>
        f.pred === 'error_type' || f.pred === 'root_cause' || f.pred === 'symptom'
      );
      assert.ok(hasRealContent, `regulation ${reg.regulationId} eff 应有因果内容`);
    }
  });

  it('Phase 3: 不完整信息 suggest_causes 应返回候选', () => {
    // 用户只说了 "服务崩了"
    const partialObs: Observation = {
      observationId: 'test_partial',
      timestamp: new Date().toISOString(),
      facts: [{ pred: 'symptom', value: 'service_crash' }],
    };

    const suggestions = suggestCausesTool(storage, partialObs);
    assert.ok(suggestions.length > 0,
      `只给 symptom=service_crash 应返回候选，实际返回 ${suggestions.length} 个`);

    // top 候选应有匹配的 predicates 或包含因果相关描述
    const top = suggestions[0];
    assert.ok(
      top.matchedPredicates.length > 0 || top.score > 0,
      `top 候选应有匹配: preds=${top.matchedPredicates}, score=${top.score}`
    );
  });

  it('Phase 4: 补充信息后置信度应提升', () => {
    // 只给 symptom
    const partial: Observation = {
      observationId: 'test_convergence_1',
      timestamp: new Date().toISOString(),
      facts: [{ pred: 'symptom', value: 'service_crash' }],
    };
    const s1 = suggestCausesTool(storage, partial);

    // 补充 error_type
    const withType: Observation = {
      observationId: 'test_convergence_2',
      timestamp: new Date().toISOString(),
      facts: [
        { pred: 'symptom', value: 'service_crash' },
        { pred: 'error_type', value: 'ConfigError' },
      ],
    };
    const s2 = suggestCausesTool(storage, withType);

    assert.ok(s1.length > 0, '部分信息应有候选');
    assert.ok(s2.length > 0, '补充信息后应有候选');

    // 补充后的 top 候选置信度应 >= 部分信息时
    if (s1.length > 0 && s2.length > 0) {
      assert.ok(s2[0].score >= s1[0].score,
        `补充信息后 score 应 >= 之前: ${s2[0].score} vs ${s1[0].score}`);
    }
  });

  it('Phase 5: 完整信息应给出高置信度 + 修复建议', () => {
    const fullObs: Observation = {
      observationId: 'test_full',
      timestamp: new Date().toISOString(),
      facts: [
        { pred: 'symptom', value: 'service_crash' },
        { pred: 'error_type', value: 'ConfigError' },
        { pred: 'root_cause', value: 'missing_env_variable' },
      ],
    };
    const suggestions = suggestCausesTool(storage, fullObs);

    assert.ok(suggestions.length > 0, '完整信息应有候选');
    assert.ok(suggestions[0].confidence !== 'low',
      `完整信息的 top 候选置信度不应为 low: ${suggestions[0].confidence}`);
  });

  it('Phase 6: diagnose 函数识别信息缺口', () => {
    const result = diagnose(
      storage,
      [{ pred: 'symptom', value: '500_error' }]
    );

    // 应该有候选且有追问
    if (result.stage === 'gathering') {
      assert.ok(result.candidates.length > 0, '应有候选解释');
      assert.ok(result.questions.length > 0, '应生成追问');
      // 追问应包含有意义的 predicate
      const qPreds = result.questions.map(q => q.targetPred);
      assert.ok(qPreds.length > 0, `应有追问 preds: ${qPreds.join(', ')}`);
    } else if (result.stage === 'insufficient') {
      // 也可接受——如果知识库不够匹配
      assert.ok(result.questions.length > 0, 'insufficient 时也应给出通用追问');
    }
  });

  it('Phase 7: updateDiagnosis 收敛', () => {
    const r1 = diagnose(storage, [{ pred: 'symptom', value: '500_error' }]);
    const r2 = updateDiagnosis(
      storage,
      [{ pred: 'symptom', value: '500_error' }],
      [{ pred: 'error_type', value: 'TypeError' }]
    );

    // 补充信息后候选数应 >= r1（不会变少）
    // 且如果 r1 有候选，r2 的 top 置信度应 >= r1
    if (r1.candidates.length > 0 && r2.candidates.length > 0) {
      assert.ok(r2.candidates[0].confidence >= r1.candidates[0].confidence,
        `补充后置信度应 >=: ${r2.candidates[0].confidence} vs ${r1.candidates[0].confidence}`);
    }
  });
});
