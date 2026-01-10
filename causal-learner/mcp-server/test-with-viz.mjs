import { createStorage } from './dist/core/storage.js';
import { submitObservationTool } from './dist/tools/observation.js';
import { triggerInductionTool } from './dist/tools/induction.js';
import { exec } from 'child_process';

async function testWithVisualization() {
  console.log('🧪 Running test with visualization...\n');

  const storage = createStorage('./data/test_viz.db');

  // Submit 5 similar observations
  for (let i = 1; i <= 5; i++) {
    submitObservationTool(storage, {
      observationId: `test_${i}`,
      timestamp: new Date().toISOString(),
      facts: [
        { pred: 'keyword', value: 'attributeerror' },
        { pred: 'keyword', value: 'nonetype' },
        { pred: 'keyword', value: 'django' },
        { pred: 'test.failed', value: true },
      ],
      context: { repo: 'django/django' },
      focusFacts: [{ pred: 'test.failed', value: true }],
      rawRefs: [`Test ${i} failed with AttributeError on NoneType access`],
    });
  }

  // Different type
  for (let i = 6; i <= 8; i++) {
    submitObservationTool(storage, {
      observationId: `test_${i}`,
      timestamp: new Date().toISOString(),
      facts: [
        { pred: 'keyword', value: 'importerror' },
        { pred: 'keyword', value: 'module' },
        { pred: 'test.failed', value: true },
      ],
      context: { repo: 'requests/requests' },
      focusFacts: [{ pred: 'test.failed', value: true }],
      rawRefs: [`Test ${i} failed with ImportError, module not found`],
    });
  }

  console.log('✅ Submitted 8 observations\n');

  // Trigger induction
  const result = triggerInductionTool(storage, { minClusterSize: 2 });
  console.log(`✅ Induction: ${result.regulationsCreated.length} regulations created\n`);

  // Get stats
  const stats = storage.getStats();
  console.log('📊 Stats:', stats);

  storage.close();

  // Generate visualization
  console.log('\n📊 Generating dashboard...');
  exec('node scripts/visualize.mjs data/test_viz.db', (err, stdout, stderr) => {
    if (err) console.error('Error:', err);
    console.log(stdout);
  });
}

testWithVisualization().catch(console.error);
