/**
 * Predicate unification module for the Causal Learner
 * Implements pattern matching and variable binding for facts
 */
import type { Fact } from './types.js';
import { factSignature } from './types.js';
export type Bindings = Record<string, unknown>;
/**
 * Check if a value is a variable (starts with '?')
 */
export function isVar(x: unknown): boolean {
  return typeof x === 'string' && x.startsWith('?');
}
/**
 * Check if a value is a wildcard ('*')
 */
export function isWildcard(x: unknown): boolean {
  return x === '*';
}
/**
 * Unify pattern args with fact args under current bindings.
 * Returns updated bindings or null if unification fails.
 */
export function unifyArgs(
  patternArgs: Record<string, unknown> | undefined,
  factArgs: Record<string, unknown> | undefined,
  bindings: Bindings
): Bindings | null {
  const b: Bindings = { ...bindings };
  const pArgs = patternArgs || {};
  const fArgs = factArgs || {};
  for (const [k, pv] of Object.entries(pArgs)) {
    if (!(k in fArgs)) {
      return null;
    }
    const fv = fArgs[k];
    if (isWildcard(pv)) {
      continue;
    }
    if (isVar(pv)) {
      const varName = pv as string;
      if (varName in b && b[varName] !== fv) {
        return null;
      }
      b[varName] = fv;
    } else {
      if (pv !== fv) {
        return null;
      }
    }
  }
  return b;
}
/**
 * Unify a (possibly variable) pattern fact with a concrete target fact.
 * Returns bindings if successful, null otherwise.
 */
export function unifyFact(
  pattern: Fact,
  target: Fact,
  bindings: Bindings = {}
): Bindings | null {
  if (pattern.pred !== target.pred) {
    return null;
  }
  if (pattern.value !== target.value && !isWildcard(pattern.value)) {
    return null;
  }
  return unifyArgs(pattern.args, target.args, bindings);
}
/**
 * Replace variables in a fact using bindings.
 * Returns a new fact with variables substituted.
 */
export function substituteFact(f: Fact, bindings: Bindings): Fact {
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f.args || {})) {
    if (isVar(v) && (v as string) in bindings) {
      args[k] = bindings[v as string];
    } else {
      args[k] = v;
    }
  }
  let value = f.value;
  if (isVar(value) && (value as string) in bindings) {
    value = bindings[value as string];
  }
  return {
    pred: f.pred,
    args,
    value,
  };
}
/**
 * Check if known facts entail a goal under bindings.
 * Returns updated bindings if successful, null otherwise.
 */
export function factEntails(
  known: Fact[],
  goal: Fact,
  bindings: Bindings = {}
): Bindings | null {
  for (const k of known) {
    const b2 = unifyFact(goal, k, bindings);
    if (b2 !== null) {
      return b2;
    }
  }
  return null;
}
/**
 * Generate a signature for a fact (pred, value) tuple
 */
export function signaturePredValue(f: Fact): string {
  return `${f.pred}|${JSON.stringify(f.value)}`;
}
/**
 * Generate a full signature for a fact including args
 */
export function signatureFull(f: Fact): string {
  return factSignature(f, true);
}
/**
 * Remove duplicate facts based on full signature
 */
export function dedupFacts(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const f of facts) {
    const sig = signatureFull(f);
    if (seen.has(sig)) {
      continue;
    }
    seen.add(sig);
    out.push(f);
  }
  return out;
}
