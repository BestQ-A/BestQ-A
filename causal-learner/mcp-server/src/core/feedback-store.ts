/**
 * 反向元评价反馈存储
 *
 * 对应 docs/mvp-llm-reasoning-guard-plan.md §4.4 反向元评价闭环。
 *
 * 三阶段防污染：
 *   pending → 甲方 weekly review → approved → 注入下次 MiniMax prompt
 *
 * 数据格式：JSON 文件，分目录存：
 *   feedback/pending/<id>.json
 *   feedback/approved/<id>.json
 *   feedback/rejected/<id>.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import type { MetaFeedback } from './reasoning-card.js';

export type FeedbackStatus = 'pending' | 'approved' | 'rejected';

export interface FeedbackStoreConfig {
  baseDir: string; // 反馈根目录，典型值：<project>/causal-learner/data/feedback
}

export class FeedbackStore {
  private baseDir: string;

  constructor(config: FeedbackStoreConfig) {
    this.baseDir = config.baseDir;
    for (const s of ['pending', 'approved', 'rejected'] as const) {
      const dir = join(this.baseDir, s);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  }

  private dirFor(status: FeedbackStatus): string {
    return join(this.baseDir, status);
  }

  private filePath(status: FeedbackStatus, id: string): string {
    return join(this.dirFor(status), `${id}.json`);
  }

  /**
   * 提交反馈。默认进 pending。
   */
  submit(fb: Omit<MetaFeedback, 'id' | 'submittedAt' | 'status'> & { submittedBy: 'claude' | 'human' }): MetaFeedback {
    const submittedAt = new Date().toISOString();
    const hash = createHash('sha256')
      .update(submittedAt + fb.argument + (fb.targetIssueCode ?? ''))
      .digest('hex')
      .slice(0, 10);
    const id = `FB_${hash}`;
    const record: MetaFeedback = {
      id,
      submittedAt,
      status: 'pending',
      feedbackType: fb.feedbackType,
      submittedBy: fb.submittedBy,
      targetIssueCode: fb.targetIssueCode,
      argument: fb.argument,
      evidence: fb.evidence ?? [],
    };
    writeFileSync(this.filePath('pending', id), JSON.stringify(record, null, 2));
    return record;
  }

  list(status: FeedbackStatus): MetaFeedback[] {
    const dir = this.dirFor(status);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as MetaFeedback)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  get(id: string): { record: MetaFeedback; status: FeedbackStatus } | null {
    for (const s of ['pending', 'approved', 'rejected'] as const) {
      const p = this.filePath(s, id);
      if (existsSync(p)) {
        return { record: JSON.parse(readFileSync(p, 'utf-8')), status: s };
      }
    }
    return null;
  }

  /** 把 pending 反馈移到 approved/rejected */
  decide(id: string, decision: 'approved' | 'rejected', reviewer: string): MetaFeedback | null {
    const pendingPath = this.filePath('pending', id);
    if (!existsSync(pendingPath)) return null;
    const record = JSON.parse(readFileSync(pendingPath, 'utf-8')) as MetaFeedback;
    record.status = decision;
    record.reviewedBy = reviewer;
    record.reviewedAt = new Date().toISOString();
    const destPath = this.filePath(decision, id);
    writeFileSync(destPath, JSON.stringify(record, null, 2));
    unlinkSync(pendingPath);
    return record;
  }

  stats(): { pending: number; approved: number; rejected: number } {
    return {
      pending: this.list('pending').length,
      approved: this.list('approved').length,
      rejected: this.list('rejected').length,
    };
  }

  /**
   * 把 approved 反馈格式化为 prompt 片段，供 MiniMax 审查时作为元规律注入。
   * 按反馈类型分组，保持精简。
   */
  buildPromptInjection(): string {
    const approved = this.list('approved');
    if (approved.length === 0) return '';

    const byType: Record<string, string[]> = {};
    for (const fb of approved) {
      const key = fb.feedbackType;
      if (!byType[key]) byType[key] = [];
      byType[key].push(fb.argument);
    }

    const lines: string[] = ['## Meta-Rules (from past approved feedback)'];
    if (byType.false_negative) {
      lines.push('You previously MISSED these cases — be sensitive to them:');
      byType.false_negative.forEach((a) => lines.push(`  - ${a}`));
    }
    if (byType.false_positive) {
      lines.push('You previously OVER-WARNED on these cases — do not flag them:');
      byType.false_positive.forEach((a) => lines.push(`  - ${a}`));
    }
    if (byType.overreach) {
      lines.push('Scope limits you previously overstepped:');
      byType.overreach.forEach((a) => lines.push(`  - ${a}`));
    }
    if (byType.insight) {
      lines.push('Prior insights to apply:');
      byType.insight.forEach((a) => lines.push(`  - ${a}`));
    }
    return lines.join('\n');
  }
}
