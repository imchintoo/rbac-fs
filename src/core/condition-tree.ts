/**
 * Composable condition-tree evaluator — the single implementation both
 * `rbac.ts` (Node) and `src/client/index.ts` (browser) call, so the two
 * runtime faces can never silently disagree on what a condition means. See
 * docs/backlog/adr-feature-scoped-conditions.md.
 *
 * Still zero `eval()`/`Function()` — "universal" here means open-ended
 * *composition* of a fixed, safe operator vocabulary (12 comparison/
 * membership/existence operators + a named custom-predicate escape hatch),
 * not a string-expression interpreter. See the ADR's "Why 'universal'
 * can't mean 'eval a string'" section.
 *
 * `condition.ts` (the legacy single-clause `when` grammar) is untouched and
 * reused here only for parsing — `legacyWhenToNode()` translates a `when`
 * string into the equivalent leaf once, so evaluation always goes through
 * one code path (`evaluateConditionNode`), not two.
 */
import { parseCondition, resolvePath, validateCondition } from './condition.js';
import {
  InvalidConditionError,
  SchemaValidationError,
  UnknownConditionOperatorError,
  type Condition,
  type ConditionLeaf,
  type ConditionNode,
  type ConditionOperatorFn,
  type JsonPrimitive,
  type RbacUser,
} from './types.js';

const COMPARISON_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith']);
const NUMERIC_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const IN_OPS = new Set(['in', 'notIn']);
const EXISTS_OPS = new Set(['exists', 'notExists']);

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Rejects any object key not in `allowed` — exact field allow-list, caller decides whether `op` is one of them. */
function assertNoExtraFields(obj: Record<string, unknown>, allowed: readonly string[], message: (extra: string) => string): void {
  const known = new Set(allowed);
  const extra = Object.keys(obj).filter((k) => !known.has(k));
  if (extra.length > 0) {
    throw new SchemaValidationError(message(extra.join(', ')));
  }
}

/** Validates an `{ and: [...] }` / `{ or: [...] }` node — shared shape, differs only by key. */
function validateAndOr(obj: Record<string, unknown>, key: 'and' | 'or', context: string): void {
  assertNoExtraFields(obj, [key], (extra) => `${context}.${key}: unexpected additional field(s) ${extra}`);
  const children = obj[key];
  if (!Array.isArray(children) || children.length === 0) {
    throw new SchemaValidationError(`${context}.${key}: must be a non-empty array`);
  }
  children.forEach((child, i) => validateConditionNode(child, `${context}.${key}[${i}]`));
}

/** Validates a `{ not: ... }` node. */
function validateNot(obj: Record<string, unknown>, context: string): void {
  assertNoExtraFields(obj, ['not'], (extra) => `${context}.not: unexpected additional field(s) ${extra}`);
  validateConditionNode(obj.not, `${context}.not`);
}

/** Validates a `{ op: 'custom', name, args? }` leaf. */
function validateCustomLeaf(obj: Record<string, unknown>, context: string): void {
  const { name, args } = obj;
  assertNoExtraFields(obj, ['op', 'name', 'args'], (extra) => `${context}: unknown field(s) on custom leaf: ${extra}`);
  if (typeof name !== 'string' || name.length === 0) {
    throw new SchemaValidationError(`${context}: custom leaf requires a non-empty "name"`);
  }
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    throw new SchemaValidationError(`${context}: custom leaf "args" must be an object if present`);
  }
}

/** Validates an `{ op: 'exists' | 'notExists', path }` leaf. */
function validateExistsLeaf(obj: Record<string, unknown>, op: string, context: string): void {
  const { path } = obj;
  assertNoExtraFields(obj, ['op', 'path'], (extra) => `${context}: unknown field(s) on "${op}" leaf: ${extra}`);
  if (typeof path !== 'string' || path.length === 0) {
    throw new SchemaValidationError(`${context}: "${op}" leaf requires a non-empty "path"`);
  }
}

/** Validates an `{ op: 'in' | 'notIn', path, value[] }` leaf. */
function validateInLeaf(obj: Record<string, unknown>, op: string, context: string): void {
  const { path, value } = obj;
  assertNoExtraFields(obj, ['op', 'path', 'value'], (extra) => `${context}: unknown field(s) on "${op}" leaf: ${extra}`);
  if (typeof path !== 'string' || path.length === 0) {
    throw new SchemaValidationError(`${context}: "${op}" leaf requires a non-empty "path"`);
  }
  if (!Array.isArray(value) || value.length === 0 || !value.every(isJsonPrimitive)) {
    throw new SchemaValidationError(`${context}: "${op}" leaf requires a non-empty array "value" of primitives`);
  }
}

/** Validates a comparison leaf (`eq`/`neq`/`gt`/`gte`/`lt`/`lte`/`contains`/`startsWith`/`endsWith`) — `path` plus exactly one of `value`/`valuePath`. */
function validateComparisonLeaf(obj: Record<string, unknown>, op: string, context: string): void {
  const { path, value, valuePath } = obj;
  assertNoExtraFields(obj, ['op', 'path', 'value', 'valuePath'], (extra) => `${context}: unknown field(s) on "${op}" leaf: ${extra}`);
  if (typeof path !== 'string' || path.length === 0) {
    throw new SchemaValidationError(`${context}: "${op}" leaf requires a non-empty "path"`);
  }
  const hasValue = value !== undefined;
  const hasValuePath = valuePath !== undefined;
  if (hasValue === hasValuePath) {
    throw new SchemaValidationError(`${context}: "${op}" leaf requires exactly one of "value"/"valuePath"`);
  }
  if (hasValue) {
    if (!isJsonPrimitive(value)) {
      throw new SchemaValidationError(`${context}: "${op}" leaf's "value" must be a string, number, or boolean`);
    }
    // Numeric ops with a literal value: catch the type mistake now — we
    // know the literal's type at write time. A `valuePath` operand can't
    // be checked until evaluation (its runtime type isn't known yet); see
    // evaluateLeaf's NaN-on-either-side fail-closed handling for that case.
    if (NUMERIC_OPS.has(op) && typeof value !== 'number') {
      throw new SchemaValidationError(`${context}: "${op}" leaf's literal "value" must be a number`);
    }
  } else if (typeof valuePath !== 'string' || valuePath.length === 0) {
    throw new SchemaValidationError(`${context}: "${op}" leaf's "valuePath" must be a non-empty string`);
  }
}

/**
 * Structural validation only — does this look like a well-formed
 * `ConditionNode`? Cannot (and does not try to) check whether a `custom`
 * leaf's `name` is actually registered — that's a per-`RBAC`-instance
 * runtime concern (the registry isn't part of the role file), checked at
 * evaluation time instead (`evaluateConditionNode` throws
 * `UnknownConditionOperatorError`, not a validation-time error).
 *
 * A thin shape-dispatcher: it only decides *which* leaf/combinator this is
 * and delegates the actual field checks to one of the `validate*` helpers
 * above, so each shape's rules stay independently readable and testable.
 */
export function validateConditionNode(node: unknown, context = 'condition'): asserts node is ConditionNode {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    throw new SchemaValidationError(`${context}: expected an object`);
  }
  const obj = node as Record<string, unknown>;

  if ('and' in obj) return validateAndOr(obj, 'and', context);
  if ('or' in obj) return validateAndOr(obj, 'or', context);
  if ('not' in obj) return validateNot(obj, context);

  const { op } = obj;
  if (typeof op !== 'string') {
    throw new SchemaValidationError(`${context}: leaf node missing a valid "op"`);
  }

  if (op === 'custom') return validateCustomLeaf(obj, context);
  if (EXISTS_OPS.has(op)) return validateExistsLeaf(obj, op, context);
  if (IN_OPS.has(op)) return validateInLeaf(obj, op, context);
  if (COMPARISON_OPS.has(op)) return validateComparisonLeaf(obj, op, context);

  throw new SchemaValidationError(`${context}: unknown operator ${JSON.stringify(op)}`);
}

/**
 * Validates a `Condition` object's `when`/`condition` pair — exactly one
 * must be present. Reused by `schema.ts` (write-time validation of
 * hand-authored `createRole`/`grant` input) and `role-resolver.ts`
 * (defensive re-validation of whatever is already on disk — role files are
 * meant to be hand-edited directly, see docs/backlog/adr-v0.1-core-engine.md,
 * so on-disk content can't be assumed to have gone through the write-time
 * check).
 */
export function validateConditionField(condition: Pick<Condition, 'when' | 'condition'>): void {
  const hasWhen = condition.when !== undefined;
  const hasTree = condition.condition !== undefined;
  if (hasWhen === hasTree) {
    throw new SchemaValidationError('condition: exactly one of "when"/"condition" must be present');
  }
  if (hasWhen) {
    validateCondition(condition.when as string);
  } else {
    validateConditionNode(condition.condition);
  }
}

/**
 * Translate a legacy `when` string into the equivalent tree leaf. Reuses
 * `condition.ts`'s existing parser — not a second grammar implementation.
 */
export function legacyWhenToNode(when: string): ConditionLeaf {
  const { lhs, rhs } = parseCondition(when);
  // lhs is always path-kind — parseCondition's grammar only ever builds it
  // via toOperand(lhsPath); this check is a TS narrowing formality, not a
  // real runtime possibility (a literal LHS can't match CONDITION_PATTERN).
  if (lhs.kind !== 'path') {
    throw new InvalidConditionError(when);
  }
  return rhs.kind === 'literal' ? { op: 'eq', path: lhs.path, value: rhs.value } : { op: 'eq', path: lhs.path, valuePath: rhs.path };
}

// Loose-ish equality on purpose, matching condition.ts's existing rationale:
// role files store everything as JSON, so a numeric id (42) in `context`
// must still match a string "42" written by hand in a role file.
function toComparable(value: unknown): string {
  return String(value);
}

/**
 * Resolves the right-hand operand of a comparison leaf — a literal `value`
 * or another resolved `valuePath`. Only ever called from `case` blocks that
 * have already narrowed `leaf` to one of the comparison-op variants (both
 * share `op: ComparisonOp`, so a flat per-literal `switch` in
 * `evaluateLeaf` is what lets TS narrow between the `value`/`valuePath`
 * shapes here — a combined `if (op === 'gt' || op === 'gte' || ...)` guard
 * does not narrow away the unrelated `exists`/`notExists`/`in`/`notIn`
 * variants the same way, which is why this isn't inlined as one shared
 * pre-computed `rhs` above the switch).
 */
function resolveRhs(leaf: Extract<ConditionLeaf, { op: string }> & ({ value: JsonPrimitive } | { valuePath: string }), user: Record<string, unknown>, context: Record<string, unknown>): unknown {
  return 'value' in leaf ? leaf.value : resolvePath(leaf.valuePath, user, context);
}

/**
 * `gt`/`gte`/`lt`/`lte` dispatch table — O(1) lookup instead of a
 * sequential if-chain, and each comparator is independently trivial to
 * read/test. `NUMERIC_OPS` (used by `validateComparisonLeaf`) must stay in
 * sync with this table's keys.
 */
const NUMERIC_COMPARATORS: Record<'gt' | 'gte' | 'lt' | 'lte', (left: number, right: number) => boolean> = {
  gt: (left, right) => left > right,
  gte: (left, right) => left >= right,
  lt: (left, right) => left < right,
  lte: (left, right) => left <= right,
};

/**
 * Coerces both operands to `Number` and dispatches to `NUMERIC_COMPARATORS`.
 * Fail-closed, not a throw, on either side being `NaN`: a `valuePath`
 * operand's runtime type can't be checked at write time (see
 * `validateComparisonLeaf`), so a bad comparison here denies rather than
 * crashing `can()` mid-call.
 */
function evaluateNumericComparison(op: 'gt' | 'gte' | 'lt' | 'lte', resolved: unknown, rhs: unknown): boolean {
  const left = Number(resolved);
  const right = Number(rhs);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return NUMERIC_COMPARATORS[op](left, right);
}

/** Evaluates the `contains` op: array membership if `resolved` is an array, substring match otherwise. */
function evaluateContains(resolved: unknown, rhs: unknown): boolean {
  if (Array.isArray(resolved)) return resolved.some((item) => toComparable(item) === toComparable(rhs));
  return toComparable(resolved ?? '').includes(toComparable(rhs));
}

/** Evaluates `in`: does `candidates` contain something comparably equal to `resolved`? (`notIn` is this, negated.) */
function isMember(resolved: unknown, candidates: readonly JsonPrimitive[]): boolean {
  return candidates.some((candidate) => toComparable(resolved) === toComparable(candidate));
}

/** Evaluates `startsWith`/`endsWith` against the string forms of `resolved`/`rhs`. */
function evaluateStringEdge(op: 'startsWith' | 'endsWith', resolved: unknown, rhs: unknown): boolean {
  const left = toComparable(resolved ?? '');
  const right = toComparable(rhs);
  return op === 'startsWith' ? left.startsWith(right) : left.endsWith(right);
}

function evaluateLeaf(leaf: ConditionLeaf, user: Record<string, unknown>, context: Record<string, unknown>, operators: Record<string, ConditionOperatorFn>): boolean {
  if (leaf.op === 'custom') {
    const fn = operators[leaf.name];
    if (!fn) {
      throw new UnknownConditionOperatorError(leaf.name);
    }
    return Boolean(fn({ user: user as unknown as RbacUser, context, args: leaf.args ?? {} }));
  }

  const resolved = resolvePath(leaf.path, user, context);

  if (leaf.op === 'gt' || leaf.op === 'gte' || leaf.op === 'lt' || leaf.op === 'lte') {
    return evaluateNumericComparison(leaf.op, resolved, resolveRhs(leaf, user, context));
  }

  switch (leaf.op) {
    case 'exists':
      return resolved !== undefined;
    case 'notExists':
      return resolved === undefined;
    case 'in':
      return isMember(resolved, leaf.value);
    case 'notIn':
      return !isMember(resolved, leaf.value);
    case 'eq':
      return toComparable(resolved) === toComparable(resolveRhs(leaf, user, context));
    case 'neq':
      return toComparable(resolved) !== toComparable(resolveRhs(leaf, user, context));
    case 'contains':
      return evaluateContains(resolved, resolveRhs(leaf, user, context));
    case 'startsWith':
    case 'endsWith':
      return evaluateStringEdge(leaf.op, resolved, resolveRhs(leaf, user, context));
    default:
      // Exhaustiveness guard — validateConditionNode should have rejected
      // anything reaching here at write/load time.
      throw new SchemaValidationError(`condition: unknown operator ${JSON.stringify((leaf as { op: string }).op)}`);
  }
}

/**
 * Evaluate a `ConditionNode` tree. `operators` is the app-registered custom
 * predicate map (`RBACOptions.operators`/`RBACClient`'s equivalent,
 * defaulting to `{}`) — a `custom` leaf referencing an unregistered name
 * throws `UnknownConditionOperatorError`, deliberately, not a silent deny.
 */
export function evaluateConditionNode(
  node: ConditionNode,
  user: Record<string, unknown>,
  context: Record<string, unknown>,
  operators: Record<string, ConditionOperatorFn> = {},
): boolean {
  if ('and' in node) return node.and.every((child) => evaluateConditionNode(child, user, context, operators));
  if ('or' in node) return node.or.some((child) => evaluateConditionNode(child, user, context, operators));
  if ('not' in node) return !evaluateConditionNode(node.not, user, context, operators);
  return evaluateLeaf(node, user, context, operators);
}

/**
 * Evaluate a `Condition` entry (whichever of `when`/`condition` is set) —
 * the one function both `rbac.ts`'s `can()` and `client/index.ts`'s
 * permission check call, so Node and browser can never evaluate the same
 * role file differently.
 */
export function evaluateConditionEntry(
  condition: Pick<Condition, 'when' | 'condition'>,
  user: Record<string, unknown>,
  context: Record<string, unknown>,
  operators: Record<string, ConditionOperatorFn> = {},
): boolean {
  const node = condition.condition ?? legacyWhenToNode(condition.when as string);
  return evaluateConditionNode(node, user, context, operators);
}
