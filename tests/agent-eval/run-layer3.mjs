#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const patchDir = join(__dirname, 'layer3-patches');
const cliPath = join(root, 'causal-learner', 'mcp-server', 'dist', 'cli', 'bestqa.js');

const caseConfig = {
  A01: { trap_type: 'PHANTOM_API', accepted_verdicts: ['block'], expected_codes: ['PHANTOM_API'] },
  A02: { trap_type: 'COARSE_CHAIN', accepted_verdicts: ['warn', 'block'], expected_codes: ['COARSE_CHAIN'] },
  A03: { trap_type: 'BROKEN_CHAIN', accepted_verdicts: ['block'], expected_codes: ['BROKEN_CHAIN'] },
  A04: { trap_type: 'GOLD_PATCH', accepted_verdicts: ['pass', 'warn'], expected_codes: [] },
  A05: { trap_type: 'IMPORT_TYPO', accepted_verdicts: ['block'], expected_codes: ['PHANTOM_API', 'BROKEN_CHAIN'] },
};

const parseJson = (rawText) => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    return null;
  }
};

const ids = readdirSync(patchDir)
  .filter((name) => /^A\d{2}\.patch$/.test(name))
  .map((name) => name.replace(/\.patch$/, ''))
  .sort();

const cases = [];
for (const id of ids) {
  const patchFile = join(patchDir, `${id}.patch`);
  const problemFile = join(patchDir, `${id}-problem.txt`);
  const proc = spawnSync('node', [cliPath, 'check', patchFile, '--problem', problemFile], {
    cwd: root,
    env: process.env,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 4,
  });
  const combined = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
  const resultFile = join(patchDir, `${id}-result.json`);
  writeFileSync(resultFile, combined);

  const parsed = parseJson(combined);
  const actualVerdict = parsed?.verdict ?? (proc.status === 1 ? 'block' : 'error');
  const actualCodes = Array.isArray(parsed?.issues) ? parsed.issues.map((issue) => issue.code).filter(Boolean) : [];
  const config = caseConfig[id];
  const trapCaught = config.accepted_verdicts.includes(actualVerdict);
  const expectedCodesHit = config.expected_codes.length === 0
    ? actualCodes.length === 0
    : config.expected_codes.some((code) => actualCodes.includes(code));

  cases.push({
    id,
    trap_type: config.trap_type,
    expected_verdict: config.accepted_verdicts.join('/'),
    actual_verdict: actualVerdict,
    expected_codes: config.expected_codes,
    actual_codes: actualCodes,
    trap_caught: trapCaught,
    expected_codes_hit: expectedCodesHit,
    exit_code: proc.status,
  });
}

const trapCases = cases.filter((item) => item.id !== 'A04');
const a04 = cases.find((item) => item.id === 'A04');
const trapsCaught = trapCases.filter((item) => item.trap_caught).length;
const falsePositiveOnCorrect = !a04 || a04.actual_verdict === 'block';
const expectedCodesHitRate = cases.length
  ? Number((cases.filter((item) => item.expected_codes_hit).length / cases.length).toFixed(3))
  : 0;

const summary = {
  cases,
  summary: {
    traps_caught: trapsCaught,
    false_positive_on_correct: falsePositiveOnCorrect,
    expected_codes_hit_rate: expectedCodesHitRate,
  },
};

summary.agent_verdict = trapsCaught >= 3 && !falsePositiveOnCorrect
  ? 'adversarial_robust'
  : (trapsCaught <= 1 ? 'random' : 'brittle');

const outPath = join(__dirname, 'layer3-adversarial.json');
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`Layer 3 written: ${outPath}`);
