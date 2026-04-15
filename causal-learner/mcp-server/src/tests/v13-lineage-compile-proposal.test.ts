/**
 * v13 LineageCompileProposal + LineageCompileProposalStore 直接测试
 * 覆盖：工厂函数、不变量校验、状态机转移、Store CRUD + 统计
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createLineageCompileProposal,
  assertValidLineageCompileProposal,
  challengeProposal,
  approveProposal,
  rejectProposal,
  applyProposal,
  rollbackProposal,
  transitionProposalStatus,
} from '../core/lineage-compile-proposal.js';
import type {
  LineageCompileProposal,
  CreateLineageCompileProposalInput,
} from '../core/lineage-compile-proposal.js';
import { LineageCompileProposalStore } from '../core/lineage-compile-proposal-store.js';

// =============================================================================
// 辅助
// =============================================================================

function makeInput(overrides?: Partial<CreateLineageCompileProposalInput>): CreateLineageCompileProposalInput {
  return {
    targetPresentSliceId: 'PS_test_slice',
    proposedLineageId: 'PL_test_lineage',
    supportingEpisodes: ['ep_001'],
    justification: '测试编译理由',
    ...overrides,
  };
}

// =============================================================================
// 工厂函数 + 不变量
// =============================================================================

describe('LineageCompileProposal 工厂 + 不变量', () => {
  it('createLineageCompileProposal 正常创建', () => {
    const p = createLineageCompileProposal(makeInput());
    assert.ok(p.id.startsWith('LCP_'), 'id 应以 LCP_ 开头');
    assert.strictEqual(p.status, 'draft', '初始状态必须为 draft');
    assert.strictEqual(p.targetPresentSliceId, 'PS_test_slice');
    assert.strictEqual(p.proposedLineageId, 'PL_test_lineage');
    assert.deepStrictEqual(p.supportingEpisodes, ['ep_001']);
    assert.strictEqual(p.justification, '测试编译理由');
    assert.strictEqual(p.reviewDecisionId, null);
    assert.strictEqual(p.counterexampleIds.length, 0);
    assert.strictEqual(p.prunedBranchRefs.length, 0);
    assert.strictEqual(p.branchGovernanceImplications.length, 0);
    assert.strictEqual(p.proposedChanges.length, 0);
  });

  it('可选字段填充', () => {
    const p = createLineageCompileProposal(makeInput({
      counterexampleIds: ['ce_1'],
      prunedBranchRefs: ['FB_pruned'],
      branchGovernanceImplications: ['保留 branch A'],
      proposedChanges: [
        { refId: 'ref_1', changeKind: 'add', beforeValue: null, afterValue: 'new_value' },
      ],
      reconstructionId: 'RC_test',
    }));
    assert.deepStrictEqual(p.counterexampleIds, ['ce_1']);
    assert.deepStrictEqual(p.prunedBranchRefs, ['FB_pruned']);
    assert.strictEqual(p.proposedChanges.length, 1);
    assert.strictEqual(p.reconstructionId, 'RC_test');
  });

  it('LCP-1: targetPresentSliceId 不可为空', () => {
    assert.throws(
      () => createLineageCompileProposal(makeInput({ targetPresentSliceId: '' })),
      /LCP-1/
    );
  });

  it('LCP-2: proposedLineageId 不可为空', () => {
    assert.throws(
      () => createLineageCompileProposal(makeInput({ proposedLineageId: '  ' })),
      /LCP-2/
    );
  });

  it('LCP-3: supportingEpisodes 至少一个', () => {
    assert.throws(
      () => createLineageCompileProposal(makeInput({ supportingEpisodes: [] })),
      /LCP-3/
    );
  });

  it('LCP-4: justification 不可为空', () => {
    assert.throws(
      () => createLineageCompileProposal(makeInput({ justification: '' })),
      /LCP-4/
    );
  });

  it('LCP-6: proposedChanges 中 changeKind 不合法时抛异常', () => {
    assert.throws(
      () => createLineageCompileProposal(makeInput({
        proposedChanges: [
          { refId: 'r', changeKind: 'invalid' as any, beforeValue: null, afterValue: null },
        ],
      })),
      /LCP-6/
    );
  });
});

// =============================================================================
// 状态机
// =============================================================================

describe('LineageCompileProposal 状态机', () => {
  it('draft → challenged', () => {
    const p = createLineageCompileProposal(makeInput());
    const challenged = challengeProposal(p);
    assert.strictEqual(challenged.status, 'challenged');
  });

  it('draft → approved（需 reviewDecisionId）', () => {
    const p = createLineageCompileProposal(makeInput());
    const approved = approveProposal(p, 'RD_001');
    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.reviewDecisionId, 'RD_001');
  });

  it('draft → rejected（需 reviewDecisionId）', () => {
    const p = createLineageCompileProposal(makeInput());
    const rejected = rejectProposal(p, 'RD_002');
    assert.strictEqual(rejected.status, 'rejected');
    assert.strictEqual(rejected.reviewDecisionId, 'RD_002');
  });

  it('challenged → approved', () => {
    const p = challengeProposal(createLineageCompileProposal(makeInput()));
    const approved = approveProposal(p, 'RD_003');
    assert.strictEqual(approved.status, 'approved');
  });

  it('challenged → rejected', () => {
    const p = challengeProposal(createLineageCompileProposal(makeInput()));
    const rejected = rejectProposal(p, 'RD_004');
    assert.strictEqual(rejected.status, 'rejected');
  });

  it('approved → applied', () => {
    const p = approveProposal(createLineageCompileProposal(makeInput()), 'RD_005');
    const applied = applyProposal(p);
    assert.strictEqual(applied.status, 'applied');
  });

  it('approved → rolled_back', () => {
    const p = approveProposal(createLineageCompileProposal(makeInput()), 'RD_006');
    const rolledBack = rollbackProposal(p);
    assert.strictEqual(rolledBack.status, 'rolled_back');
  });

  it('rejected 是终态，不可转移', () => {
    const p = rejectProposal(createLineageCompileProposal(makeInput()), 'RD_007');
    assert.throws(() => transitionProposalStatus(p, 'approved'), /状态转移非法/);
  });

  it('applied 是终态，不可转移', () => {
    const p = applyProposal(
      approveProposal(createLineageCompileProposal(makeInput()), 'RD_008')
    );
    assert.throws(() => transitionProposalStatus(p, 'rolled_back'), /状态转移非法/);
  });

  it('rolled_back 是终态，不可转移', () => {
    const p = rollbackProposal(
      approveProposal(createLineageCompileProposal(makeInput()), 'RD_009')
    );
    assert.throws(() => transitionProposalStatus(p, 'approved'), /状态转移非法/);
  });

  it('draft 不可直接跳到 applied', () => {
    const p = createLineageCompileProposal(makeInput());
    assert.throws(() => transitionProposalStatus(p, 'applied'), /状态转移非法/);
  });

  it('approveProposal 不接受空 reviewDecisionId', () => {
    const p = createLineageCompileProposal(makeInput());
    assert.throws(() => approveProposal(p, ''), /reviewDecisionId 不可为空/);
  });

  it('rejectProposal 不接受空 reviewDecisionId', () => {
    const p = createLineageCompileProposal(makeInput());
    assert.throws(() => rejectProposal(p, '  '), /reviewDecisionId 不可为空/);
  });

  it('不可变更新 — 原对象不变', () => {
    const p = createLineageCompileProposal(makeInput());
    const challenged = challengeProposal(p);
    assert.strictEqual(p.status, 'draft', '原对象状态不变');
    assert.strictEqual(challenged.status, 'challenged');
  });
});

// =============================================================================
// Store CRUD
// =============================================================================

describe('LineageCompileProposalStore', () => {
  it('save + get 往返一致', () => {
    const store = new LineageCompileProposalStore(':memory:');
    const p = createLineageCompileProposal(makeInput());
    store.save(p);
    const loaded = store.get(p.id);
    assert.ok(loaded, 'proposal 应可查询');
    assert.strictEqual(loaded!.id, p.id);
    assert.strictEqual(loaded!.status, 'draft');
    assert.strictEqual(loaded!.targetPresentSliceId, 'PS_test_slice');
    store.close();
  });

  it('get 不存在的 id 返回 null', () => {
    const store = new LineageCompileProposalStore(':memory:');
    assert.strictEqual(store.get('nonexistent'), null);
    store.close();
  });

  it('save 覆盖更新（状态转移后 re-save）', () => {
    const store = new LineageCompileProposalStore(':memory:');
    const p = createLineageCompileProposal(makeInput());
    store.save(p);
    const challenged = challengeProposal(p);
    store.save(challenged);
    const loaded = store.get(p.id);
    assert.strictEqual(loaded!.status, 'challenged');
    store.close();
  });

  it('listByPresentSlice 按 slice 查询', () => {
    const store = new LineageCompileProposalStore(':memory:');
    store.save(createLineageCompileProposal(makeInput({ targetPresentSliceId: 'PS_A' })));
    store.save(createLineageCompileProposal(makeInput({ targetPresentSliceId: 'PS_A' })));
    store.save(createLineageCompileProposal(makeInput({ targetPresentSliceId: 'PS_B' })));
    assert.strictEqual(store.listByPresentSlice('PS_A').length, 2);
    assert.strictEqual(store.listByPresentSlice('PS_B').length, 1);
    assert.strictEqual(store.listByPresentSlice('PS_C').length, 0);
    store.close();
  });

  it('listByLineage 按 lineage 查询', () => {
    const store = new LineageCompileProposalStore(':memory:');
    store.save(createLineageCompileProposal(makeInput({ proposedLineageId: 'PL_X' })));
    store.save(createLineageCompileProposal(makeInput({ proposedLineageId: 'PL_Y' })));
    assert.strictEqual(store.listByLineage('PL_X').length, 1);
    assert.strictEqual(store.listByLineage('PL_Y').length, 1);
    store.close();
  });

  it('listByStatus 按状态查询', () => {
    const store = new LineageCompileProposalStore(':memory:');
    const p1 = createLineageCompileProposal(makeInput());
    store.save(p1);
    const p2 = approveProposal(createLineageCompileProposal(makeInput()), 'RD_test');
    store.save(p2);
    assert.strictEqual(store.listByStatus('draft').length, 1);
    assert.strictEqual(store.listByStatus('approved').length, 1);
    assert.strictEqual(store.listByStatus('rejected').length, 0);
    store.close();
  });

  it('listAll 返回全量', () => {
    const store = new LineageCompileProposalStore(':memory:');
    store.save(createLineageCompileProposal(makeInput()));
    store.save(createLineageCompileProposal(makeInput()));
    store.save(createLineageCompileProposal(makeInput()));
    assert.strictEqual(store.listAll().length, 3);
    store.close();
  });

  it('getStats 统计正确', () => {
    const store = new LineageCompileProposalStore(':memory:');
    store.save(createLineageCompileProposal(makeInput()));
    store.save(createLineageCompileProposal(makeInput()));
    const p3 = approveProposal(createLineageCompileProposal(makeInput()), 'RD_s');
    store.save(p3);

    const stats = store.getStats();
    assert.strictEqual(stats.total, 3);
    assert.strictEqual(stats.byStatus['draft'], 2);
    assert.strictEqual(stats.byStatus['approved'], 1);
    store.close();
  });
});
