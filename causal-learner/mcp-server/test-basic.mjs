#!/usr/bin/env node
/**
 * Basic functionality test for Causal Learner
 * Tests storage, observation submission, and induction
 */

import { createStorage } from './dist/core/storage.js';
import { submitObservationTool } from './dist/tools/observation.js';
import { triggerInductionTool } from './dist/tools/induction.js';
import { getStatsTool } from './dist/tools/query.js';

async function test() {
  console.log('🧪 Testing Causal Learner MCP Server...\n');

  // 1. Create storage
  console.log('1️⃣ Creating in-memory storage...');
  const storage = await createStorage(':memory:');
  console.log('✅ Storage created\n');

  // 2. Submit test observations
  console.log('2️⃣ Submitting test observations...');

  const obs1 = {
    observationId: 'test_obs_1',
    timestamp: new Date().toISOString(),
    facts: [
      { pred: 'test.failed', value: true, args: { name: 'test_api' } },
      { pred: 'error.type', value: 'AttributeError' },
      { pred: 'error.message', value: 'NoneType has no attribute pk' },
    ],
    context: { repo: 'django/django', file: 'test_models.py' },
    focusFacts: [{ pred: 'test.failed', value: true }],
  };

  const result1 = submitObservationTool(storage, obs1);
  console.log(`   Observation 1: ${result1.explained ? '✅ Explained' : '⚠️ Event created'}`);
  console.log(`   Message: ${result1.message}\n`);

  // Similar observation 2
  const obs2 = {
    observationId: 'test_obs_2',
    timestamp: new Date().toISOString(),
    facts: [
      { pred: 'test.failed', value: true, args: { name: 'test_queryset' } },
      { pred: 'error.type', value: 'AttributeError' },
      { pred: 'error.message', value: 'NoneType has no attribute pk' },
    ],
    context: { repo: 'django/django', file: 'test_query.py' },
    focusFacts: [{ pred: 'test.failed', value: true }],
  };

  const result2 = submitObservationTool(storage, obs2);
  console.log(`   Observation 2: ${result2.explained ? '✅ Explained' : '⚠️ Event created'}`);
  console.log(`   Message: ${result2.message}\n`);

  // Similar observation 3
  const obs3 = {
    observationId: 'test_obs_3',
    timestamp: new Date().toISOString(),
    facts: [
      { pred: 'test.failed', value: true, args: { name: 'test_filter' } },
      { pred: 'error.type', value: 'AttributeError' },
      { pred: 'error.message', value: 'NoneType has no attribute pk' },
    ],
    context: { repo: 'django/django', file: 'test_filters.py' },
    focusFacts: [{ pred: 'test.failed', value: true }],
  };

  const result3 = submitObservationTool(storage, obs3);
  console.log(`   Observation 3: ${result3.explained ? '✅ Explained' : '⚠️ Event created'}`);
  console.log(`   Message: ${result3.message}\n`);

  // 3. Check stats
  console.log('3️⃣ Getting system statistics...');
  const stats = getStatsTool(storage);
  console.log(`   Observations: ${stats.observationCount}`);
  console.log(`   Events: ${stats.eventCount} (open: ${stats.eventsByStatus.open})`);
  console.log(`   Regulations: ${stats.regulationCount}\n`);

  // 4. Trigger induction
  console.log('4️⃣ Triggering induction...');
  const inductionResult = triggerInductionTool(storage, {
    minClusterSize: 2,
    minSimilarity: 0.5,
  });
  console.log(`   Clusters found: ${inductionResult.clustersFound}`);
  console.log(`   Regulations created: ${inductionResult.regulationsCreated.length}`);
  console.log(`   Events resolved: ${inductionResult.eventsResolved.length}`);
  console.log(`   Message: ${inductionResult.message}\n`);

  // 5. Final stats
  console.log('5️⃣ Final statistics...');
  const finalStats = getStatsTool(storage);
  console.log(`   Regulations: ${finalStats.regulationCount}`);
  console.log(`   Events: ${finalStats.eventCount} (open: ${finalStats.eventsByStatus.open}, closed: ${finalStats.eventsByStatus.resolved})`);

  if (inductionResult.regulationsCreated.length > 0) {
    console.log('\n📋 Induced regulation preview:');
    const reg = inductionResult.regulationsCreated[0];
    console.log(`   ID: ${reg.regulationId}`);
    console.log(`   Status: ${reg.status}`);
    console.log(`   Pre: ${reg.pre.length} conditions`);
    console.log(`   Eff: ${reg.eff.length} effects`);
    console.log(`   Support: ${reg.supportN}`);
  }

  console.log('\n✅ All tests passed!');
  storage.close();
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
