/**
 * 批量 LLM 蒸馏入口：对 SWE-bench Lite 全量提取结构化因果 facts
 * 用法: npx tsx src/benchmark/run-extraction.ts [--count N]
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { batchExtract } from './llm-fact-extractor.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(thisDir, 'data', 'swe-bench-lite.json');
const raw = readFileSync(dataPath, 'utf-8');
const data = JSON.parse(raw) as Array<{ instance_id: string; problem_statement: string }>;

const countIdx = process.argv.indexOf('--count');
const count = countIdx >= 0 ? parseInt(process.argv[countIdx + 1]) : data.length;
const issues = data.slice(0, count).map(d => ({
  issueId: d.instance_id,
  problemStatement: d.problem_statement.substring(0, 2000),
}));

console.log(`[extraction] 开始蒸馏 ${issues.length} 条 issue...`);
const start = Date.now();

batchExtract(issues, (done, total) => {
  if (done % 5 === 0 || done === total) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const rate = (done / (Date.now() - start) * 1000).toFixed(1);
    console.log(`  [${done}/${total}] ${elapsed}s elapsed, ${rate} issues/s`);
  }
}).then(results => {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n完成: ${results.size} 条, ${elapsed}s`);

  // 统计 bug_category 分布
  const cats = new Map<string, number>();
  for (const [, facts] of results) {
    const cat = facts.bug_category;
    cats.set(cat, (cats.get(cat) || 0) + 1);
  }
  console.log('\nbug_category 分布:');
  const sorted = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of sorted) {
    console.log(`  ${cat.padEnd(25)} ${n}`);
  }

  // 展示前 3 条
  console.log('\n样例:');
  let shown = 0;
  for (const [id, facts] of results) {
    if (shown >= 3) break;
    if (facts.root_cause === 'unknown') continue;
    console.log(`  ${id}:`);
    console.log(`    root_cause: ${facts.root_cause.substring(0, 80)}`);
    console.log(`    module: ${facts.affected_module}`);
    console.log(`    category: ${facts.bug_category}`);
    shown++;
  }
});
