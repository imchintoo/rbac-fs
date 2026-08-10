/**
 * Safe, minimal condition evaluator. v0.1 supports exactly one shape:
 *
 *   "<dotted.path> == <dotted.path | 'literal' | "literal">"
 *
 * No eval(), no Function() constructor — deliberately narrow so a role
 * file (which is hand-editable) can never smuggle in arbitrary code
 * execution. See docs/backlog/adr-v0.1-core-engine.md.
 *
 * Path resolution convention (matches docs/PLAN.md §5.1/§7 examples):
 *   - `user.<field>`   → resolved against the `user` object passed to can()
 *   - any other bare path (e.g. `owner_id`) → resolved against `context`,
 *     the object passed as can()'s 4th argument, top-level fields directly
 * A quoted RHS (`'x'` or `"x"`) is always a string literal, never a path.
 */
import { InvalidConditionError } from './types.js';

const CONDITION_PATTERN = /^([\w.]+)\s*==\s*(?:"([^"]*)"|'([^']*)'|([\w.]+))$/;

type Operand = { kind: 'path'; path: string } | { kind: 'literal'; value: string };

interface ParsedCondition {
  lhs: Operand;
  rhs: Operand;
}

function toOperand(pathToken: string): Operand {
  return { kind: 'path', path: pathToken };
}

export function parseCondition(when: string): ParsedCondition {
  const match = CONDITION_PATTERN.exec(when.trim());
  if (!match) {
    throw new InvalidConditionError(when);
  }
  // Group 1 (lhsPath) always captures when `match` is non-null — it's
  // outside the `==` alternation. Exactly one of dq/sq/bare captures too,
  // per the pattern's structure; the `as string` below reflects that
  // regex-level guarantee, not an unchecked assumption.
  const [, lhsPath, dq, sq, bare] = match;
  const rhs: Operand = dq !== undefined ? { kind: 'literal', value: dq } : sq !== undefined ? { kind: 'literal', value: sq } : toOperand(bare as string);
  return { lhs: toOperand(lhsPath as string), rhs };
}

/** Validate a condition string at role-load time (fail fast, no scope needed). */
export function validateCondition(when: string): void {
  parseCondition(when);
}

function resolveOperand(operand: Operand, user: Record<string, unknown>, context: Record<string, unknown>): unknown {
  if (operand.kind === 'literal') return operand.value;
  const parts = operand.path.split('.');
  let root: unknown;
  let rest: string[];
  if (parts[0] === 'user') {
    root = user;
    rest = parts.slice(1);
  } else {
    root = context;
    rest = parts;
  }
  let current: unknown = root;
  for (const part of rest) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate an already-validated condition string against `user`/`context`.
 */
export function evaluateCondition(when: string, user: Record<string, unknown>, context: Record<string, unknown>): boolean {
  const { lhs, rhs } = parseCondition(when);
  const lhsValue = resolveOperand(lhs, user, context);
  const rhsValue = resolveOperand(rhs, user, context);
  // Loose-ish equality on purpose: role files store everything as JSON, so
  // a numeric id (42) in `context` must still match a string "42" written
  // by hand in a role file's `when` clause.
  return String(lhsValue) === String(rhsValue);
}
