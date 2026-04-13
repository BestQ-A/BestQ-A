// ---
// kind: code
// implements: docs/current/legacy-scaffolds-contract.md
// ---
import { createStorage } from './dist/core/storage.js';

const storage = createStorage('../data/causal.db');

const open = storage.listEvents({ status: 'open' });
console.log('📊 未解决 Events 分析 (' + open.length + ' 个)\n');

// 按仓库分组
const byRepo = {};
open.forEach(e => {
  const repo = e.context?.repo || 'unknown';
  if (!byRepo[repo]) byRepo[repo] = [];
  byRepo[repo].push(e);
});

// 计算相似度
function extractPredicates(facts) {
  return new Set(facts.map(f => `${f.pred}|${JSON.stringify(f.value)}`));
}

function jaccardSimilarity(set1, set2) {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// 分析每个仓库
for (const [repo, events] of Object.entries(byRepo).sort((a,b) => b[1].length - a[1].length)) {
  console.log('━━━ ' + repo + ' (' + events.length + ' 个) ━━━');

  // 提取所有关键词
  const keywordCounts = {};
  events.forEach(e => {
    const keywords = e.unexplainedAspects.filter(f => f.pred === 'keyword');
    keywords.forEach(k => {
      keywordCounts[k.value] = (keywordCounts[k.value] || 0) + 1;
    });
  });

  // 显示高频关键词
  const topKeywords = Object.entries(keywordCounts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8);

  if (topKeywords.length > 0) {
    console.log('  高频关键词: ' + topKeywords.map(([k,v]) => k + '(' + v + ')').join(', '));
  }

  // 计算 events 之间的最大相似度
  if (events.length >= 2) {
    const preds = events.map(e => extractPredicates(e.unexplainedAspects));
    let maxSim = 0;
    let maxPair = null;

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const sim = jaccardSimilarity(preds[i], preds[j]);
        if (sim > maxSim) {
          maxSim = sim;
          maxPair = [i, j];
        }
      }
    }

    console.log('  最高相似度: ' + maxSim.toFixed(3));
    if (maxSim < 0.25) {
      console.log('  ⚠️ 相似度低于阈值 0.25，无法聚类');
    }
  }

  // 显示 instance_id
  console.log('  样本:');
  events.slice(0, 3).forEach(e => {
    const instanceId = e.context?.instance_id || e.eventId;
    console.log('    - ' + instanceId);
  });
  console.log('');
}

// 分析为什么不能聚类
console.log('━━━ 聚类失败原因分析 ━━━\n');

// 检查是否有任何两个 open event 相似度 >= 0.25
const allPreds = open.map(e => ({
  id: e.context?.instance_id || e.eventId,
  repo: e.context?.repo,
  preds: extractPredicates(e.unexplainedAspects)
}));

let pairsAboveThreshold = 0;
for (let i = 0; i < allPreds.length; i++) {
  for (let j = i + 1; j < allPreds.length; j++) {
    const sim = jaccardSimilarity(allPreds[i].preds, allPreds[j].preds);
    if (sim >= 0.25) {
      pairsAboveThreshold++;
      if (pairsAboveThreshold <= 3) {
        console.log('发现可聚类配对 (sim=' + sim.toFixed(2) + '):');
        console.log('  ' + allPreds[i].id);
        console.log('  ' + allPreds[j].id);
      }
    }
  }
}

if (pairsAboveThreshold === 0) {
  console.log('没有任何两个 event 的相似度 >= 0.25');
  console.log('这些 events 特征太独特，无法与其他 events 聚类');
} else {
  console.log('\n共有 ' + pairsAboveThreshold + ' 对 events 相似度 >= 0.25');
}

storage.close();
