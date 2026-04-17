#!/usr/bin/env node
/**
 * bestqa feedback → SimpleMem 长期记忆同步
 *
 * 把 bestqa approved 反馈同步进 SimpleMem，作为审查员元规律的
 * 跨会话检索池（Claude / Codex 两边都能 memory_query 到）。
 *
 * 用法：
 *   node scripts/bestqa-hooks/sync-feedback-to-simplemem.mjs [--dry-run] [--since=<ISO>]
 *
 * 幂等：只同步 metadata.synced_to_simplemem 未标记的条目，
 *      同步成功后写回标记，避免重复入库。
 *
 * 环境变量：
 *   SIMPLEMEM_URL      默认 http://localhost:8000/mcp
 *   SIMPLEMEM_TOKEN    必填（从 ~/.claude.json simplemem.headers.Authorization 取）
 *   FEEDBACK_DIR       默认 <repo>/.bestqa/feedback
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const SIMPLEMEM_URL = process.env.SIMPLEMEM_URL || 'http://localhost:8000/mcp';
const SIMPLEMEM_TOKEN = process.env.SIMPLEMEM_TOKEN || '';
const FEEDBACK_DIR = process.env.FEEDBACK_DIR || join(REPO_ROOT, '.bestqa', 'feedback');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINCE_ARG = args.find((a) => a.startsWith('--since='));
const SINCE = SINCE_ARG ? new Date(SINCE_ARG.split('=')[1]) : null;

function die(msg) {
  console.error(`[sync] ${msg}`);
  process.exit(1);
}

if (!SIMPLEMEM_TOKEN && !DRY_RUN) {
  die('SIMPLEMEM_TOKEN 未设置。从 ~/.claude.json simplemem.headers.Authorization 取 Bearer 后面的值');
}

const APPROVED_DIR = join(FEEDBACK_DIR, 'approved');
if (!existsSync(APPROVED_DIR)) {
  console.log(`[sync] 无 approved 目录（${APPROVED_DIR}），退出`);
  process.exit(0);
}

const files = readdirSync(APPROVED_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => join(APPROVED_DIR, f));

console.log(`[sync] 发现 ${files.length} 条 approved 反馈`);

let synced = 0;
let skipped = 0;

for (const file of files) {
  const entry = JSON.parse(readFileSync(file, 'utf8'));

  if (entry.metadata?.synced_to_simplemem) {
    skipped++;
    continue;
  }

  if (SINCE && entry.approved_at && new Date(entry.approved_at) < SINCE) {
    skipped++;
    continue;
  }

  const speaker = entry.reviewed_by || 'reviewer';
  const content = buildMemoryContent(entry);

  console.log(`[sync] ${entry.id} → simplemem (${entry.type}) ${DRY_RUN ? '[DRY]' : ''}`);
  if (!DRY_RUN) {
    await callMemoryAdd(speaker, content);
    entry.metadata = { ...(entry.metadata || {}), synced_to_simplemem: new Date().toISOString() };
    writeFileSync(file, JSON.stringify(entry, null, 2));
  }
  synced++;
}

console.log(`[sync] 同步 ${synced} 条，跳过 ${skipped} 条`);

function buildMemoryContent(entry) {
  const parts = [
    `[bestqa meta-feedback ${entry.type}]`,
    `target: ${entry.target_code || 'n/a'}`,
    `argument: ${entry.argument || ''}`,
  ];
  if (entry.evidence?.length) {
    parts.push(`evidence: ${entry.evidence.join('; ')}`);
  }
  if (entry.audit_id) {
    parts.push(`audit_id: ${entry.audit_id}`);
  }
  return parts.join('\n');
}

async function callMemoryAdd(speaker, content) {
  const resp = await fetch(SIMPLEMEM_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SIMPLEMEM_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'memory_add',
        arguments: { speaker, content },
      },
    }),
  });
  if (!resp.ok) {
    throw new Error(`SimpleMem HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
  return resp;
}
