import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCondition, parseCondition, validateCondition } from '../src/core/condition.js';
import { InvalidConditionError } from '../src/core/types.js';

test('parses a bare-path RHS pointing at user.<field>', () => {
  const parsed = parseCondition('owner_id == user.id');
  assert.deepEqual(parsed.lhs, { kind: 'path', path: 'owner_id' });
  assert.deepEqual(parsed.rhs, { kind: 'path', path: 'user.id' });
});

test('parses a quoted-literal RHS', () => {
  const parsed = parseCondition('status == "approved"');
  assert.deepEqual(parsed.rhs, { kind: 'literal', value: 'approved' });
});

test('rejects anything outside the supported grammar (no eval escape hatch)', () => {
  assert.throws(() => parseCondition('process.exit() == 1'), InvalidConditionError);
  assert.throws(() => parseCondition('a == b == c'), InvalidConditionError);
  assert.throws(() => parseCondition('a != b'), InvalidConditionError);
  assert.throws(() => validateCondition('`${process.env}` == 1'), InvalidConditionError);
});

test('evaluates true when context field matches user field', () => {
  const result = evaluateCondition('owner_id == user.id', { id: 'u1' }, { owner_id: 'u1' });
  assert.equal(result, true);
});

test('evaluates false on mismatch', () => {
  const result = evaluateCondition('owner_id == user.id', { id: 'u1' }, { owner_id: 'u2' });
  assert.equal(result, false);
});

test('loose string equality bridges numeric context values against string literals', () => {
  const result = evaluateCondition('owner_id == user.id', { id: '42' }, { owner_id: 42 });
  assert.equal(result, true);
});

test('missing context field resolves to undefined, not a throw', () => {
  const result = evaluateCondition('owner_id == user.id', { id: 'u1' }, {});
  assert.equal(result, false);
});
