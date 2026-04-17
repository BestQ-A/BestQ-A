#!/usr/bin/env node
// W1 T1.1: 从 predictions.json + swe-bench-lite.json 抽取 MVP 测试集
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const preds = JSON.parse(readFileSync(join(root, 'predictions.json'), 'utf-8'));
const goldList = JSON.parse(readFileSync(
  join(root, 'causal-learner/mcp-server/src/benchmark/data/swe-bench-lite.json'),
  'utf-8',
));
const goldMap = new Map(goldList.map(g => [g.instance_id, g]));

const normalized = (s) => (s || '').replace(/\s+/g, ' ').trim();
const hammingLike = (a, b) => {
  const na = normalized(a);
  const nb = normalized(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  let same = 0;
  const len = Math.min(na.length, nb.length);
  for (let i = 0; i < len; i++) if (na[i] === nb[i]) same++;
  return same / Math.max(na.length, nb.length);
};

const rows = [];
for (const [id, predPatch] of Object.entries(preds)) {
  // 过滤：空预测对 MiniMax 审查无意义
  if (!predPatch || !predPatch.trim() || predPatch.trim().length < 50) continue;
  const gold = goldMap.get(id);
  if (!gold) continue;
  const goldPatch = gold.patch;
  const sim = hammingLike(predPatch, goldPatch);
  let verdict;
  if (sim >= 0.95) verdict = 'correct';
  else if (sim <= 0.3) verdict = 'wrong';
  else verdict = 'partial';
  rows.push({
    instance_id: id,
    problem_statement: gold.problem_statement,
    predicted_patch: predPatch,
    gold_patch: goldPatch,
    similarity: Number(sim.toFixed(3)),
    verdict,
  });
}

// wrong 按相似度升序（越不像越典型）；partial 按相似度降序，前 3 作为 correct_candidate
const wrongSorted = rows.filter(r => r.verdict === 'wrong').sort((a, b) => a.similarity - b.similarity);
const partialSorted = rows.filter(r => r.verdict === 'partial').sort((a, b) => b.similarity - a.similarity);

const wrong = wrongSorted.slice(0, 8);
const correctCandidate = partialSorted.slice(0, 3).map(r => ({ ...r, verdict: 'correct_candidate' }));
const partial = partialSorted.slice(3, 7);
const selected = [...wrong, ...correctCandidate, ...partial];

const index = {
  generated_at: new Date().toISOString(),
  total_pairs: rows.length,
  buckets: {
    wrong: rows.filter(r => r.verdict === 'wrong').length,
    correct: rows.filter(r => r.verdict === 'correct').length,
    partial: rows.filter(r => r.verdict === 'partial').length,
  },
  selected: [],
};

selected.forEach((row, i) => {
  const sid = `S${String(i + 1).padStart(3, '0')}`;
  const sample = {
    id: sid,
    source: 'predictions.json + swe-bench-lite.json',
    instance_id: row.instance_id,
    problem_statement: row.problem_statement,
    predicted_patch: row.predicted_patch,
    gold_patch: row.gold_patch,
    similarity: row.similarity,
    verdict: row.verdict,
    notes: '',
  };
  writeFileSync(join(__dirname, `${sid}.json`), JSON.stringify(sample, null, 2));
  index.selected.push({ id: sid, instance_id: row.instance_id, verdict: row.verdict, similarity: row.similarity });
});

writeFileSync(join(__dirname, 'index.json'), JSON.stringify(index, null, 2));
console.log(`Extracted ${selected.length} samples.`);
console.log(`Buckets: wrong=${wrong.length}, correct_candidate=${correctCandidate.length}, partial=${partial.length}`);
console.log(`Total pool: ${rows.length} (wrong=${index.buckets.wrong}, correct=${index.buckets.correct}, partial=${index.buckets.partial})`);
