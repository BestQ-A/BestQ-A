import { createStorage } from '../dist/core/storage.js';
import { submitObservationTool } from '../dist/tools/observation.js';
import { clusterEvents, induceRegulation } from '../dist/core/inducer.js';

async function debug() {
  const storage = createStorage(':memory:');
  
  // Submit 3 similar observations
  for (let i = 1; i <= 3; i++) {
    submitObservationTool(storage, {
      observationId: `obs_${i}`,
      timestamp: new Date().toISOString(),
      facts: [
        { pred: 'test.failed', value: true },
        { pred: 'error.type', value: 'AttributeError' },
        { pred: 'error.message', value: 'NoneType has no attribute pk' },
      ],
      context: { repo: 'django/django' },
      focusFacts: [{ pred: 'test.failed', value: true }],
    });
  }
  
  // Get events
  const events = storage.listEvents({ status: 'open' });
  console.log(`Events: ${events.length}`);
  console.log('Event 0 unexplained aspects:', events[0].unexplainedAspects);
  
  // Try clustering
  const clusters = clusterEvents(events, { minEvents: 2 });
  console.log(`Clusters: ${clusters.length}`);
  
  if (clusters.length > 0) {
    console.log(`Cluster 0 size: ${clusters[0].length}`);
    const reg = induceRegulation(clusters[0]);
    console.log('Induced regulation:');
    console.log('  Pre:', reg.pre);
    console.log('  Eff:', reg.eff);
  }
  
  storage.close();
}

debug().catch(console.error);
