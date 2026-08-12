import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateConditionEntry, evaluateConditionNode, legacyWhenToNode, validateConditionField, validateConditionNode } from '../src/core/condition-tree.js';
import { SchemaValidationError, UnknownConditionOperatorError, type ConditionNode } from '../src/core/types.js';

// ---------------------------------------------------------------------------
// Individual operators — true and false branch each (story acceptance
// criteria #2, docs/backlog/adr-feature-scoped-conditions.md).
// ---------------------------------------------------------------------------

test('eq: true/false branches, literal and valuePath forms', () => {
  assert.equal(evaluateConditionNode({ op: 'eq', path: 'device', value: 'mobile' }, {}, { device: 'mobile' }), true);
  assert.equal(evaluateConditionNode({ op: 'eq', path: 'device', value: 'mobile' }, {}, { device: 'desktop' }), false);
  assert.equal(evaluateConditionNode({ op: 'eq', path: 'owner_id', valuePath: 'user.id' }, { id: 'u1' }, { owner_id: 'u1' }), true);
  assert.equal(evaluateConditionNode({ op: 'eq', path: 'owner_id', valuePath: 'user.id' }, { id: 'u1' }, { owner_id: 'u2' }), false);
});

test('neq: negation of eq', () => {
  assert.equal(evaluateConditionNode({ op: 'neq', path: 'device', value: 'mobile' }, {}, { device: 'desktop' }), true);
  assert.equal(evaluateConditionNode({ op: 'neq', path: 'device', value: 'mobile' }, {}, { device: 'mobile' }), false);
});

test('gt/gte/lt/lte: numeric comparison against a literal threshold', () => {
  assert.equal(evaluateConditionNode({ op: 'gt', path: 'amount', value: 5000 }, {}, { amount: 5001 }), true);
  assert.equal(evaluateConditionNode({ op: 'gt', path: 'amount', value: 5000 }, {}, { amount: 5000 }), false);
  assert.equal(evaluateConditionNode({ op: 'gte', path: 'amount', value: 5000 }, {}, { amount: 5000 }), true);
  assert.equal(evaluateConditionNode({ op: 'lt', path: 'amount', value: 5000 }, {}, { amount: 4999 }), true);
  assert.equal(evaluateConditionNode({ op: 'lte', path: 'amount', value: 5000 }, {}, { amount: 5000 }), true);
  assert.equal(evaluateConditionNode({ op: 'lte', path: 'amount', value: 5000 }, {}, { amount: 5001 }), false);
});

test('gt/gte/lt/lte: non-numeric valuePath operand fails closed (false), not a throw', () => {
  assert.equal(evaluateConditionNode({ op: 'gt', path: 'amount', valuePath: 'limit' }, {}, { amount: 100, limit: 'not-a-number' }), false);
});

test('in/notIn: literal array membership', () => {
  const node: ConditionNode = { op: 'in', path: 'location', value: ['US', 'IN', 'EU'] };
  assert.equal(evaluateConditionNode(node, {}, { location: 'IN' }), true);
  assert.equal(evaluateConditionNode(node, {}, { location: 'CN' }), false);
  const notIn: ConditionNode = { op: 'notIn', path: 'location', value: ['US', 'IN', 'EU'] };
  assert.equal(evaluateConditionNode(notIn, {}, { location: 'CN' }), true);
  assert.equal(evaluateConditionNode(notIn, {}, { location: 'US' }), false);
});

test('exists/notExists: presence check, no value/valuePath needed', () => {
  assert.equal(evaluateConditionNode({ op: 'exists', path: 'managerOverride' }, {}, { managerOverride: true }), true);
  assert.equal(evaluateConditionNode({ op: 'exists', path: 'managerOverride' }, {}, {}), false);
  assert.equal(evaluateConditionNode({ op: 'notExists', path: 'managerOverride' }, {}, {}), true);
});

test('contains: substring on strings, membership on arrays', () => {
  assert.equal(evaluateConditionNode({ op: 'contains', path: 'note', value: 'urgent' }, {}, { note: 'this is urgent' }), true);
  assert.equal(evaluateConditionNode({ op: 'contains', path: 'note', value: 'urgent' }, {}, { note: 'calm' }), false);
  assert.equal(evaluateConditionNode({ op: 'contains', path: 'tags', value: 'vip' }, {}, { tags: ['vip', 'repeat'] }), true);
  assert.equal(evaluateConditionNode({ op: 'contains', path: 'tags', value: 'vip' }, {}, { tags: ['repeat'] }), false);
});

test('startsWith/endsWith', () => {
  assert.equal(evaluateConditionNode({ op: 'startsWith', path: 'sku', value: 'INV-' }, {}, { sku: 'INV-4521' }), true);
  assert.equal(evaluateConditionNode({ op: 'startsWith', path: 'sku', value: 'INV-' }, {}, { sku: 'PO-4521' }), false);
  assert.equal(evaluateConditionNode({ op: 'endsWith', path: 'email', value: '@acme.com' }, {}, { email: 'a@acme.com' }), true);
});

// ---------------------------------------------------------------------------
// and/or/not nesting — at least 3 levels deep (story acceptance criteria #2).
// ---------------------------------------------------------------------------

test('and/or/not: 3-level nested tree — the scenario from the original request (device AND location, OR a threshold override)', () => {
  const node: ConditionNode = {
    and: [
      { op: 'eq', path: 'device', value: 'mobile' },
      {
        or: [
          { op: 'in', path: 'location', value: ['US', 'IN', 'EU'] },
          {
            and: [{ op: 'gte', path: 'amount', value: 5000 }, { not: { op: 'exists', path: 'blockOverride' } }],
          },
        ],
      },
    ],
  };

  // device mobile + location in list -> allow
  assert.equal(evaluateConditionNode(node, {}, { device: 'mobile', location: 'IN', amount: 10 }), true);
  // device mobile + location NOT in list, but amount over threshold and no block -> allow
  assert.equal(evaluateConditionNode(node, {}, { device: 'mobile', location: 'CN', amount: 6000 }), true);
  // device mobile + location NOT in list, amount over threshold but blocked -> deny
  assert.equal(evaluateConditionNode(node, {}, { device: 'mobile', location: 'CN', amount: 6000, blockOverride: true }), false);
  // wrong device entirely -> deny regardless of the rest
  assert.equal(evaluateConditionNode(node, {}, { device: 'desktop', location: 'IN', amount: 10 }), false);
});

// ---------------------------------------------------------------------------
// custom operator — the named escape hatch for unpredictable future demand.
// ---------------------------------------------------------------------------

test('custom: calls the registered function with {user, context, args}', () => {
  let received: unknown;
  const operators = {
    withinRadius: (ctx: { user: unknown; context: unknown; args?: Record<string, unknown> }) => {
      received = ctx;
      return (ctx.args?.km as number) >= 5;
    },
  };
  const node: ConditionNode = { op: 'custom', name: 'withinRadius', args: { km: 5 } };
  const user = { id: 'u1', role: 'field-agent' };
  const context = { userLocation: [1, 2] };
  assert.equal(evaluateConditionNode(node, user as unknown as Record<string, unknown>, context, operators), true);
  assert.deepEqual(received, { user, context, args: { km: 5 } });
});

test('custom: unregistered name throws UnknownConditionOperatorError', () => {
  const node: ConditionNode = { op: 'custom', name: 'businessHours' };
  assert.throws(() => evaluateConditionNode(node, {}, {}, {}), UnknownConditionOperatorError);
  // Also the no-operators-passed default:
  assert.throws(() => evaluateConditionNode(node, {}, {}), UnknownConditionOperatorError);
});

test('custom: a registered name identical to a built-in op string does not collide — separate namespaces by design', () => {
  // `op` selects the evaluator (built-in dispatch); `name` on a `custom`
  // leaf is looked up in the *operators* registry only when op === 'custom'.
  // There is no shared namespace between the two, so a consumer naming a
  // custom predicate "eq" cannot shadow or be shadowed by the built-in eq.
  const operators = { eq: () => true };
  assert.equal(evaluateConditionNode({ op: 'eq', path: 'a', value: 'b' }, {}, { a: 'not-b' }, operators), false);
  assert.equal(evaluateConditionNode({ op: 'custom', name: 'eq' }, {}, {}, operators), true);
});

// ---------------------------------------------------------------------------
// legacyWhenToNode — backward-compatible translation, story #5.
// ---------------------------------------------------------------------------

test('legacyWhenToNode: literal RHS translates to an eq/value leaf with identical evaluation', () => {
  const node = legacyWhenToNode('status == "approved"');
  assert.deepEqual(node, { op: 'eq', path: 'status', value: 'approved' });
  assert.equal(evaluateConditionNode(node, {}, { status: 'approved' }), true);
});

test('legacyWhenToNode: path RHS translates to an eq/valuePath leaf with identical evaluation', () => {
  const node = legacyWhenToNode('owner_id == user.id');
  assert.deepEqual(node, { op: 'eq', path: 'owner_id', valuePath: 'user.id' });
  assert.equal(evaluateConditionNode(node, { id: 'u1' }, { owner_id: 'u1' }), true);
  assert.equal(evaluateConditionNode(node, { id: 'u1' }, { owner_id: 'u2' }), false);
});

test('evaluateConditionEntry: dispatches on whichever of when/condition is present, same result either way', () => {
  const user = { id: 'u1' };
  const legacyEntry = { resource: 'report', actions: ['view'], when: 'owner_id == user.id' };
  const treeEntry = { resource: 'report', actions: ['view'], condition: { op: 'eq' as const, path: 'owner_id', valuePath: 'user.id' } };
  assert.equal(evaluateConditionEntry(legacyEntry, user, { owner_id: 'u1' }), true);
  assert.equal(evaluateConditionEntry(treeEntry, user, { owner_id: 'u1' }), true);
  assert.equal(evaluateConditionEntry(legacyEntry, user, { owner_id: 'u2' }), false);
  assert.equal(evaluateConditionEntry(treeEntry, user, { owner_id: 'u2' }), false);
});

// ---------------------------------------------------------------------------
// Schema — when/condition mutual exclusivity + malformed tree shapes.
// ---------------------------------------------------------------------------

test('validateConditionField: exactly one of when/condition required', () => {
  assert.throws(() => validateConditionField({}), SchemaValidationError);
  assert.throws(() => validateConditionField({ when: 'a == b', condition: { op: 'exists', path: 'a' } }), SchemaValidationError);
  assert.doesNotThrow(() => validateConditionField({ when: 'a == b' }));
  assert.doesNotThrow(() => validateConditionField({ condition: { op: 'exists', path: 'a' } }));
});

test('validateConditionNode: rejects malformed shapes', () => {
  assert.throws(() => validateConditionNode('not-an-object'), SchemaValidationError);
  assert.throws(() => validateConditionNode({ and: [] }), SchemaValidationError, 'and must be non-empty');
  assert.throws(() => validateConditionNode({ op: 'gt', path: 'a', value: 'not-a-number' }), SchemaValidationError, 'gt literal value must be numeric');
  assert.throws(() => validateConditionNode({ op: 'in', path: 'a', value: 'not-an-array' }), SchemaValidationError, 'in requires an array value');
  assert.throws(() => validateConditionNode({ op: 'eq', path: 'a', value: 'b', valuePath: 'c' }), SchemaValidationError, 'exactly one of value/valuePath');
  assert.throws(() => validateConditionNode({ op: 'eq', path: 'a' }), SchemaValidationError, 'requires exactly one of value/valuePath');
  assert.throws(() => validateConditionNode({ op: 'custom' }), SchemaValidationError, 'custom requires a name');
  assert.throws(() => validateConditionNode({ op: 'unknownOp', path: 'a', value: 'b' }), SchemaValidationError, 'unknown operator');
  assert.throws(() => validateConditionNode({ op: 'exists', path: 'a', extra: true }), SchemaValidationError, 'unknown field on leaf');
});

test('validateConditionNode: accepts well-formed nested trees', () => {
  assert.doesNotThrow(() =>
    validateConditionNode({
      and: [
        { op: 'eq', path: 'device', value: 'mobile' },
        { or: [{ op: 'in', path: 'location', value: ['US', 'IN'] }, { not: { op: 'exists', path: 'blocked' } }] },
      ],
    }),
  );
});
