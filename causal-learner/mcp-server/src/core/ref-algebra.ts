/**
 * RefAlgebra — BestQ-A v6 关系代数引擎
 *
 * 给 Ref（态射）定义签名、族群分类和复合规则，
 * 让系统从 typed graph 升级为有组合律的关系范畴。
 *
 * 核心约束：indicates ∘ causes 不能压成 causes（征兆≠根因）
 *
 * 注意：故意不 import atom-graph.ts 以避免循环依赖。
 * RefKind 用字符串字面量重复声明。
 */

// =============================================================================
// 类型定义
// =============================================================================

/** Ref 族群分类 */
export type RefFamily =
  | 'structural'      // 结构层：is_a, part_of — 稳定闭包
  | 'explanatory'     // 解释层：causes, requires — 候选机制链
  | 'evidential'      // 证据层：indicates, cooccurs, similar_to — 召回，不是因果
  | 'interventional'; // 干预层：fixes, prevents — 与解释层配对

/** 关系强度 — 区分 A→B 的语义力度 */
export type RefForce = 'necessary' | 'sufficient' | 'contributory' | 'analogical';

/** 复合结果类型 */
export type ComposeResult =
  | { allowed: true; resultKind: string; mode: 'direct' | 'inherit' | 'candidate' | 'weak'; resultForce?: RefForce; evidencePolicy: EvidencePolicy }
  | { allowed: false; reason: string };

/** 推导步骤（proof-carrying） */
export interface DerivationStep {
  refKind: string;
  force: RefForce;
  position: number;              // 在路径中的位置
}

/** 证据策略 */
export type EvidencePolicy = 'inherit' | 'revalidate' | 'discard';

/** RefType 规格声明 */
export interface RefTypeSpec {
  kind: string;
  family: RefFamily;
  /** 是否有方向（A→B 与 B→A 不同） */
  directional: boolean;
  /** A→B 是否蕴含 B→A */
  symmetric: boolean;
  /** 自传递性：true 表示严格传递，false 表示不传递，'candidate' 表示弱传递（需验证） */
  transitive: boolean | 'candidate';
  defaultForce: RefForce;          // 该类型边的默认强度
}

/** 复合规则条目 */
export interface ComposeRule {
  first: string;
  second: string;
  result: ComposeResult;
}

// =============================================================================
// mode 降级顺序（direct > inherit > candidate > weak）
// =============================================================================

/** 各 mode 的优先级权重，数值越小越强 */
const MODE_PRIORITY: Record<string, number> = {
  direct: 0,
  inherit: 1,
  candidate: 2,
  weak: 3,
};

/**
 * 两个 mode 取较弱的那个（优先级数值较大）
 */
function degradeMode(
  a: string,
  b: string
): 'direct' | 'inherit' | 'candidate' | 'weak' {
  const pa = MODE_PRIORITY[a] ?? 3;
  const pb = MODE_PRIORITY[b] ?? 3;
  const winner = pa >= pb ? a : b;
  return winner as 'direct' | 'inherit' | 'candidate' | 'weak';
}

// =============================================================================
// RefAlgebra 主类
// =============================================================================

export class RefAlgebra {
  /** RefType 规格表：kind → RefTypeSpec */
  private specs: Map<string, RefTypeSpec> = new Map();
  /** 复合规则查找表：key = "first|second" → ComposeResult */
  private rules: Map<string, ComposeResult> = new Map();

  constructor() {
    this.registerDefaults();
    this.registerComposeRules();
  }

  // ---------------------------------------------------------------------------
  // 内部注册辅助
  // ---------------------------------------------------------------------------

  private addSpec(spec: RefTypeSpec): void {
    this.specs.set(spec.kind, spec);
  }

  private addRule(first: string, second: string, result: ComposeResult): void {
    this.rules.set(`${first}|${second}`, result);
  }

  // ---------------------------------------------------------------------------
  // 默认规格注册
  // ---------------------------------------------------------------------------

  private registerDefaults(): void {
    // 结构层
    this.addSpec({ kind: 'is_a',       family: 'structural',     directional: true,  symmetric: false, transitive: true,        defaultForce: 'necessary' });
    this.addSpec({ kind: 'part_of',    family: 'structural',     directional: true,  symmetric: false, transitive: true,        defaultForce: 'necessary' });

    // 解释层
    this.addSpec({ kind: 'causes',     family: 'explanatory',    directional: true,  symmetric: false, transitive: true,        defaultForce: 'contributory' });
    this.addSpec({ kind: 'requires',   family: 'explanatory',    directional: true,  symmetric: false, transitive: true,        defaultForce: 'necessary' });

    // 证据层
    this.addSpec({ kind: 'indicates',  family: 'evidential',     directional: true,  symmetric: false, transitive: 'candidate', defaultForce: 'analogical' });
    this.addSpec({ kind: 'cooccurs',   family: 'evidential',     directional: false, symmetric: true,  transitive: 'candidate', defaultForce: 'analogical' });
    this.addSpec({ kind: 'similar_to', family: 'evidential',     directional: false, symmetric: true,  transitive: 'candidate', defaultForce: 'analogical' });

    // 干预层
    this.addSpec({ kind: 'fixes',      family: 'interventional', directional: true,  symmetric: false, transitive: false,       defaultForce: 'contributory' });
    this.addSpec({ kind: 'prevents',   family: 'interventional', directional: true,  symmetric: false, transitive: false,       defaultForce: 'contributory' });
  }

  // ---------------------------------------------------------------------------
  // 复合规则注册
  // ---------------------------------------------------------------------------

  private registerComposeRules(): void {
    // === 解释层内部 ===
    this.addRule('causes',   'causes',   { allowed: true, resultKind: 'causes',   mode: 'direct',    evidencePolicy: 'inherit' });
    this.addRule('requires', 'causes',   { allowed: true, resultKind: 'requires', mode: 'direct',    evidencePolicy: 'inherit' });
    this.addRule('requires', 'requires', { allowed: true, resultKind: 'requires', mode: 'direct',    evidencePolicy: 'inherit' });

    // === 干预层 × 解释层 ===
    this.addRule('fixes',    'causes',   { allowed: true, resultKind: 'fixes',    mode: 'direct',    evidencePolicy: 'inherit' });
    this.addRule('prevents', 'causes',   { allowed: true, resultKind: 'prevents', mode: 'direct',    evidencePolicy: 'inherit' });

    // === 结构层 × 解释层（继承）===
    this.addRule('is_a', 'causes',   { allowed: true, resultKind: 'causes',   mode: 'inherit',   evidencePolicy: 'revalidate' });
    this.addRule('is_a', 'fixes',    { allowed: true, resultKind: 'fixes',    mode: 'inherit',   evidencePolicy: 'revalidate' });
    this.addRule('is_a', 'requires', { allowed: true, resultKind: 'requires', mode: 'inherit',   evidencePolicy: 'revalidate' });
    this.addRule('is_a', 'prevents', { allowed: true, resultKind: 'prevents', mode: 'inherit',   evidencePolicy: 'revalidate' });

    // === 结构层内部 ===
    this.addRule('is_a',    'is_a',    { allowed: true, resultKind: 'is_a',    mode: 'direct',    evidencePolicy: 'inherit' });
    this.addRule('part_of', 'part_of', { allowed: true, resultKind: 'part_of', mode: 'direct',    evidencePolicy: 'inherit' });

    // === 证据层 × 证据层（弱传递）===
    this.addRule('indicates',  'indicates',  { allowed: true, resultKind: 'indicates',  mode: 'weak',      evidencePolicy: 'discard' });
    this.addRule('cooccurs',   'cooccurs',   { allowed: true, resultKind: 'cooccurs',   mode: 'weak',      evidencePolicy: 'discard' });
    this.addRule('similar_to', 'similar_to', { allowed: true, resultKind: 'similar_to', mode: 'weak',      evidencePolicy: 'discard' });

    // === 证据层 × 解释/干预层（candidate，需验证）===
    this.addRule('similar_to', 'fixes',   { allowed: true, resultKind: 'fixes',   mode: 'candidate', evidencePolicy: 'revalidate' });
    this.addRule('similar_to', 'causes',  { allowed: true, resultKind: 'causes',  mode: 'candidate', evidencePolicy: 'revalidate' });

    // === 禁止规则（核心安全约束）===
    this.addRule('indicates', 'causes',   { allowed: false, reason: '征兆不能压缩为根因：indicates ∘ causes → forbidden' });
    this.addRule('cooccurs',  'causes',   { allowed: false, reason: '共现不是因果：cooccurs ∘ causes → forbidden' });
    this.addRule('indicates', 'fixes',    { allowed: false, reason: '征兆不能直接导出修复：indicates ∘ fixes → forbidden' });
    this.addRule('cooccurs',  'fixes',    { allowed: false, reason: '共现不能直接导出修复：cooccurs ∘ fixes → forbidden' });
    this.addRule('part_of',   'causes',   { allowed: false, reason: '部分不等于整体的因果：part_of ∘ causes → forbidden' });
    this.addRule('indicates', 'prevents', { allowed: false, reason: '征兆不能导出预防：indicates ∘ prevents → forbidden' });
    this.addRule('cooccurs',  'prevents', { allowed: false, reason: '共现不能导出预防：cooccurs ∘ prevents → forbidden' });
  }

  // ---------------------------------------------------------------------------
  // 公共 API
  // ---------------------------------------------------------------------------

  /** 获取 Ref 的族群 */
  getFamily(kind: string): RefFamily | null {
    return this.specs.get(kind)?.family ?? null;
  }

  /** 获取 RefType 规格 */
  getSpec(kind: string): RefTypeSpec | null {
    return this.specs.get(kind) ?? null;
  }

  /**
   * 检查两条边能否复合，返回复合结果。
   * 若规则表中没有显式记录，返回默认禁止（关闭世界假设）。
   */
  compose(first: string, second: string): ComposeResult {
    const key = `${first}|${second}`;
    const rule = this.rules.get(key);
    if (rule !== undefined) {
      return rule;
    }
    // 关闭世界假设：未注册的复合默认禁止
    return {
      allowed: false,
      reason: `未定义的复合规则：${first} ∘ ${second}`,
    };
  }

  /**
   * 检查一条路径（多个 RefKind 序列）是否全部合法复合。
   * failedAt 为 0-based 的步骤索引（第几对边失败）。
   */
  validatePath(kinds: string[]): {
    valid: boolean;
    resultKind?: string;
    resultMode?: string;
    failedAt?: number;
    reason?: string;
  } {
    if (kinds.length === 0) {
      return { valid: false, reason: '空路径' };
    }
    if (kinds.length === 1) {
      return { valid: true, resultKind: kinds[0], resultMode: 'direct' };
    }

    let current = kinds[0];
    let currentMode: string = 'direct';

    for (let i = 1; i < kinds.length; i++) {
      const result = this.compose(current, kinds[i]);
      if (!result.allowed) {
        return { valid: false, failedAt: i - 1, reason: result.reason };
      }
      current = result.resultKind;
      currentMode = degradeMode(currentMode, result.mode);
    }

    return { valid: true, resultKind: current, resultMode: currentMode };
  }

  /**
   * 从一条路径计算最终复合结果（如果合法）。
   * 路径不合法时返回 allowed: false。
   */
  reducePath(kinds: string[]): ComposeResult {
    const validation = this.validatePath(kinds);
    if (!validation.valid) {
      return {
        allowed: false,
        reason: validation.reason ?? '路径无效',
      };
    }
    return {
      allowed: true,
      resultKind: validation.resultKind!,
      mode: validation.resultMode as 'direct' | 'inherit' | 'candidate' | 'weak',
      evidencePolicy: 'inherit',
    };
  }

  /** 列出所有合法的复合规则 */
  listRules(): ComposeRule[] {
    const result: ComposeRule[] = [];
    for (const [key, composeResult] of this.rules.entries()) {
      if (composeResult.allowed) {
        const [first, second] = key.split('|');
        result.push({ first, second, result: composeResult });
      }
    }
    return result;
  }

  /** 列出所有禁止的复合 */
  listForbidden(): Array<{ first: string; second: string; reason: string }> {
    const result: Array<{ first: string; second: string; reason: string }> = [];
    for (const [key, composeResult] of this.rules.entries()) {
      if (!composeResult.allowed) {
        const [first, second] = key.split('|');
        result.push({ first, second, reason: composeResult.reason });
      }
    }
    return result;
  }

  /**
   * 获取指定 kind 能与哪些 kind 合法复合（作为第一条边）。
   */
  getComposableWith(kind: string): Array<{ kind: string; result: ComposeResult }> {
    const result: Array<{ kind: string; result: ComposeResult }> = [];
    for (const [key, composeResult] of this.rules.entries()) {
      if (composeResult.allowed) {
        const [first, second] = key.split('|');
        if (first === kind) {
          result.push({ kind: second, result: composeResult });
        }
      }
    }
    return result;
  }

  /**
   * 判断从 family A 到 family B 的跨族复合是否被允许。
   * 通过枚举各族代表 kind 的显式规则来推断。
   */
  isCrossFamilyAllowed(familyA: RefFamily, familyB: RefFamily): boolean {
    // 收集各族的 kind 列表
    const kindsA = this.getKindsByFamily(familyA);
    const kindsB = this.getKindsByFamily(familyB);

    for (const a of kindsA) {
      for (const b of kindsB) {
        const r = this.compose(a, b);
        if (r.allowed) return true;
      }
    }
    return false;
  }

  /** 内部辅助：按族群获取所有 kind */
  private getKindsByFamily(family: RefFamily): string[] {
    const result: string[] = [];
    for (const spec of this.specs.values()) {
      if (spec.family === family) result.push(spec.kind);
    }
    return result;
  }

  /** 验证路径并返回完整推导记录（proof-carrying） */
  validatePathRich(kinds: string[]): {
    valid: boolean;
    resultKind?: string;
    resultMode?: string;
    resultForce?: RefForce;
    evidencePolicy?: EvidencePolicy;
    proof: DerivationStep[];
    failedAt?: number;
    reason?: string;
  } {
    const proof: DerivationStep[] = [];
    if (kinds.length === 0) return { valid: false, reason: '空路径', proof };

    const firstSpec = this.specs.get(kinds[0]);
    proof.push({ refKind: kinds[0], force: firstSpec?.defaultForce ?? 'contributory', position: 0 });

    if (kinds.length === 1) {
      return { valid: true, resultKind: kinds[0], resultMode: 'direct', resultForce: firstSpec?.defaultForce, evidencePolicy: 'inherit', proof };
    }

    let current = kinds[0];
    let currentMode = 'direct';
    let currentForce: RefForce = firstSpec?.defaultForce ?? 'contributory';
    let currentEvidencePolicy: EvidencePolicy = 'inherit';

    for (let i = 1; i < kinds.length; i++) {
      const result = this.compose(current, kinds[i]);
      if (!result.allowed) {
        return { valid: false, failedAt: i - 1, reason: result.reason, proof };
      }

      const nextSpec = this.specs.get(kinds[i]);
      proof.push({ refKind: kinds[i], force: nextSpec?.defaultForce ?? 'contributory', position: i });

      current = result.resultKind;
      currentMode = this.degradeMode(currentMode, result.mode);
      currentForce = this.degradeForce(currentForce, nextSpec?.defaultForce ?? 'contributory');
      currentEvidencePolicy = this.degradeEvidencePolicy(currentEvidencePolicy, result.evidencePolicy);
    }

    return { valid: true, resultKind: current, resultMode: currentMode, resultForce: currentForce, evidencePolicy: currentEvidencePolicy, proof };
  }

  /** mode 降级：direct > inherit > candidate > weak */
  private degradeMode(a: string, b: string): 'direct' | 'inherit' | 'candidate' | 'weak' {
    return degradeMode(a, b);
  }

  /** force 降级：necessary > sufficient > contributory > analogical */
  private degradeForce(a: RefForce, b: RefForce): RefForce {
    const order: RefForce[] = ['necessary', 'sufficient', 'contributory', 'analogical'];
    return order[Math.max(order.indexOf(a), order.indexOf(b))];
  }

  /** evidencePolicy 降级：inherit > revalidate > discard */
  private degradeEvidencePolicy(a: EvidencePolicy, b: EvidencePolicy): EvidencePolicy {
    const order: EvidencePolicy[] = ['inherit', 'revalidate', 'discard'];
    return order[Math.max(order.indexOf(a), order.indexOf(b))];
  }
}

// =============================================================================
// 模块级单例 + 便捷函数
// =============================================================================

let _instance: RefAlgebra | null = null;

/** 单例访问（全局共享一个 RefAlgebra 实例） */
export function getRefAlgebra(): RefAlgebra {
  if (!_instance) {
    _instance = new RefAlgebra();
  }
  return _instance;
}

/** 快速检查两条边能否复合 */
export function canCompose(first: string, second: string): boolean {
  return getRefAlgebra().compose(first, second).allowed;
}

/** 快速检查路径合法性 */
export function isPathLegal(kinds: string[]): boolean {
  return getRefAlgebra().validatePath(kinds).valid;
}

/** 获取 Ref 的族群 */
export function refFamily(kind: string): RefFamily | null {
  return getRefAlgebra().getFamily(kind);
}
