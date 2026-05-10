#!/usr/bin/env node
/**
 * bestqa CLI — MVP 主入口
 *
 * 对应 docs/mvp-llm-reasoning-guard-plan.md W1 T1.3。
 *
 * 用法：
 *   bestqa check <patch-file>            审查一个 patch
 *   bestqa check <patch-file> --force    强制放行（逃生阀）
 *   bestqa check <patch-file> --context <file1,file2,...>
 *   bestqa check <patch-file> --problem <problem-statement-file>
 *
 * 阶段：W1 骨架版——参数解析 + 配置加载 + 空返回 pass。
 *       W1 T1.4 接入 MiniMax；W2 接入分级规则与入库。
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import type { ReasoningCard } from '../core/reasoning-card.js';
import { computeVerdict } from '../core/reasoning-card.js';
import { reviewPatch, mapToReasoningCardFields } from '../core/minimax-reviewer.js';
import { ingestReasoningCard } from '../core/reasoning-card-ingest.js';
import { FeedbackStore } from '../core/feedback-store.js';

interface CheckArgs {
  patchFile: string;
  force: boolean;
  contextFiles: string[];
  problemFile?: string;
}

function printUsage(): void {
  console.error(`Usage:
  bestqa check <patch-file> [options]        Reverse-review a patch with MiniMax
  bestqa feedback [options]                   Submit meta-feedback (false_negative/positive/etc)
  bestqa review [--approve <id> | --reject <id> | --list]  Approve/reject pending feedback
  bestqa stats                                Show store + feedback stats

Check options:
  --force                      Override fatal issues (escape hatch)
  --context <files>            Comma-separated context file paths
  --problem <file>             Problem statement file

Feedback options (W3):
  --type <t>                   false_negative | false_positive | overreach | insight
  --target-code <code>         The issue code this feedback targets (e.g. BROKEN_CHAIN)
  --argument <text>            The feedback argument (REQUIRED)
  --evidence <text>            Supporting evidence (repeatable via comma)
  --by <claude|human>          Submitter (default: claude)

Review options:
  --list                       List all pending feedback
  --approve <id>               Approve a pending feedback (moves to approved/)
  --reject <id>                Reject a pending feedback
  --by <name>                  Reviewer name (default: $USER or "human")
`);
}

function feedbackBaseDir(): string {
  return process.env.BESTQA_FEEDBACK_DIR
    ?? resolve(process.cwd(), 'causal-learner/data/feedback');
}

function parseCheckArgs(argv: string[]): CheckArgs | null {
  if (argv.length < 2) return null;
  const patchFile = argv[1];
  let force = false;
  let contextFiles: string[] = [];
  let problemFile: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') force = true;
    else if (a === '--context') contextFiles = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--problem') problemFile = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      return null;
    }
  }
  return { patchFile, force, contextFiles, problemFile };
}

interface FeedbackArgs {
  type: 'false_negative' | 'false_positive' | 'overreach' | 'insight';
  targetCode?: string;
  argument: string;
  evidence: string[];
  by: 'claude' | 'human';
}

function parseFeedbackArgs(argv: string[]): FeedbackArgs | null {
  let type: any, targetCode: string | undefined, argument = '', evidence: string[] = [];
  let by: 'claude' | 'human' = 'claude';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') type = argv[++i];
    else if (a === '--target-code') targetCode = argv[++i];
    else if (a === '--argument') argument = argv[++i] ?? '';
    else if (a === '--evidence') evidence = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--by') by = (argv[++i] as any) ?? 'claude';
    else {
      console.error(`Unknown argument: ${a}`);
      return null;
    }
  }
  const allowed = ['false_negative', 'false_positive', 'overreach', 'insight'];
  if (!allowed.includes(type)) {
    console.error(`--type must be one of: ${allowed.join(', ')}`);
    return null;
  }
  if (!argument) {
    console.error('--argument is required');
    return null;
  }
  return { type, targetCode, argument, evidence, by };
}

interface ReviewArgs {
  mode: 'list' | 'approve' | 'reject';
  id?: string;
  by?: string;
}

function parseReviewArgs(argv: string[]): ReviewArgs | null {
  let mode: 'list' | 'approve' | 'reject' = 'list';
  let id: string | undefined, by = process.env.USER ?? 'human';
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') mode = 'list';
    else if (a === '--approve') { mode = 'approve'; id = argv[++i]; }
    else if (a === '--reject') { mode = 'reject'; id = argv[++i]; }
    else if (a === '--by') by = argv[++i] ?? 'human';
    else {
      console.error(`Unknown argument: ${a}`);
      return null;
    }
  }
  if ((mode === 'approve' || mode === 'reject') && !id) {
    console.error(`--${mode} requires an ID`);
    return null;
  }
  return { mode, id, by };
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

async function runCheck(args: CheckArgs): Promise<ReasoningCard> {
  const patchPath = resolve(args.patchFile);
  if (!existsSync(patchPath)) {
    throw new Error(`Patch file not found: ${patchPath}`);
  }
  const patch = readFileSync(patchPath, 'utf-8');
  const problem = args.problemFile && existsSync(args.problemFile)
    ? readFileSync(args.problemFile, 'utf-8')
    : undefined;

  const patchDigest = sha256(patch);
  const cardId = `RC_${patchDigest}_${Date.now().toString(36)}`;

  // T1.4 接入 MiniMax 逆向推理
  const contextSnippets = args.contextFiles
    .filter((f) => existsSync(f))
    .map((f) => `# ${f}\n${readFileSync(f, 'utf-8').slice(0, 3000)}`);

  const skipMinimax = process.env.BESTQA_SKIP_MINIMAX === '1';
  // T3.4: 把 approved feedback 构造为 meta-rules prompt 注入
  let metaRulesPrompt = '';
  if (!skipMinimax) {
    try {
      const fs = new FeedbackStore({ baseDir: feedbackBaseDir() });
      metaRulesPrompt = fs.buildPromptInjection();
    } catch { /* feedback dir may not exist yet */ }
  }
  const raw = skipMinimax
    ? { goal: '', chain: [], hypotheses: [], risks: [], issues: [] }
    : await reviewPatch({
        predictedPatch: patch,
        problemStatement: problem,
        contextSnippets,
        metaRulesPrompt,
      });
  const mapped = mapToReasoningCardFields(raw);

  const card: ReasoningCard = {
    id: cardId,
    createdAt: new Date().toISOString(),
    createdBy: skipMinimax ? 'cli-smoke' : 'minimax-coding-plan',
    schemaVersion: 1,
    input: {
      patchDigest,
      problemStatement: problem,
      contextFiles: args.contextFiles,
      predictedPatch: patch,
    },
    goal: mapped.goal,
    derivationTrace: {
      id: `DT_${cardId}`,
      contextKind: 'inference',
      episodeId: null as any,
      reconstructionId: null as any,
      premiseClaimIds: [],
      proof: [],
      supportLinks: [],
      rejectedClaimIds: [],
      totalSteps: 0,
      replayableSteps: 0,
      chainIntegrity: 'complete',
      createdAt: new Date().toISOString(),
      createdBy: 'cli-smoke',
    } as any,
    supportLinks: [],
    hypotheses: raw.hypotheses.map((h, i) => ({
      id: `hyp_${cardId}_${i}`,
      claim: h.claim,
      confidence: h.confidence,
      status: 'candidate',
    } as any)),
    risks: mapped.risks,
    verdict: computeVerdict(mapped.issues, args.force),
    issues: mapped.issues,
    forceOverridden: args.force && mapped.issues.some((i) => i.severity === 'fatal'),
    persistence: {
      supportLinksAdded: 0,
      derivationTraceStored: false,
      causalLearnerNodesAdded: 0,
    },
  };

  // T2.3: pass / warn → 入库 causal-learner（block 仍然落盘审计但不进图谱）
  if (card.verdict !== 'block' && !skipMinimax) {
    const storePath = process.env.BESTQA_STORE_PATH
      ?? resolve(process.cwd(), 'causal-learner/data/mvp-causal-learner.sqlite');
    try {
      const ingest = ingestReasoningCard({
        cardId,
        patchDigest,
        raw,
        storePath,
      });
      card.persistence = {
        supportLinksAdded: ingest.supportLinksAdded,
        derivationTraceStored: ingest.derivationTraceStored,
        causalLearnerNodesAdded: ingest.causalLearnerNodesAdded,
      };
    } catch (err) {
      console.error(`[bestqa] ingest skipped: ${(err as Error).message}`);
    }
  }

  return card;
}

async function runFeedback(args: FeedbackArgs): Promise<number> {
  const store = new FeedbackStore({ baseDir: feedbackBaseDir() });
  const record = store.submit({
    feedbackType: args.type,
    submittedBy: args.by,
    targetIssueCode: args.targetCode,
    argument: args.argument,
    evidence: args.evidence,
  });
  console.log(JSON.stringify(record, null, 2));
  return 0;
}

async function runReview(args: ReviewArgs): Promise<number> {
  const store = new FeedbackStore({ baseDir: feedbackBaseDir() });
  if (args.mode === 'list') {
    const pending = store.list('pending');
    const s = store.stats();
    console.log(JSON.stringify({ stats: s, pending }, null, 2));
    return 0;
  }
  const decision = args.mode === 'approve' ? 'approved' : 'rejected';
  const rec = store.decide(args.id!, decision, args.by ?? 'human');
  if (!rec) {
    console.error(`No pending feedback with id ${args.id}`);
    return 1;
  }
  console.log(JSON.stringify(rec, null, 2));
  return 0;
}

async function runStats(): Promise<number> {
  const store = new FeedbackStore({ baseDir: feedbackBaseDir() });
  const s = store.stats();
  console.log(JSON.stringify({ feedback: s, feedback_dir: feedbackBaseDir() }, null, 2));
  return 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd) {
    printUsage();
    return 2;
  }
  try {
    if (cmd === 'check') {
      const args = parseCheckArgs(argv);
      if (!args) { printUsage(); return 2; }
      const card = await runCheck(args);
      console.log(JSON.stringify(card, null, 2));
      return card.verdict === 'block' ? 1 : 0;
    }
    if (cmd === 'feedback') {
      const args = parseFeedbackArgs(argv);
      if (!args) { printUsage(); return 2; }
      return await runFeedback(args);
    }
    if (cmd === 'review') {
      const args = parseReviewArgs(argv);
      if (!args) { printUsage(); return 2; }
      return await runReview(args);
    }
    if (cmd === 'stats') {
      return await runStats();
    }
    printUsage();
    return 2;
  } catch (err) {
    console.error(`[bestqa] error: ${(err as Error).message}`);
    return 3;
  }
}

main().then((code) => process.exit(code));
