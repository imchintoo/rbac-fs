import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateConditionEntry, validateCreateRoleInput, validatePermission } from '../src/core/schema.js';
import { InvalidConditionError, SchemaValidationError } from '../src/core/types.js';

test('validateCreateRoleInput accepts a minimal valid input', () => {
  assert.doesNotThrow(() => validateCreateRoleInput({ inherits: ['viewer'] }));
  assert.doesNotThrow(() => validateCreateRoleInput({}));
});

test('validateCreateRoleInput rejects unknown top-level fields', () => {
  assert.throws(() => validateCreateRoleInput({ name: 'sneaky' }), SchemaValidationError);
  assert.throws(() => validateCreateRoleInput({ meta: {} }), SchemaValidationError);
});

test('validateCreateRoleInput rejects a non-object input', () => {
  assert.throws(() => validateCreateRoleInput('nope'), SchemaValidationError);
  assert.throws(() => validateCreateRoleInput(null), SchemaValidationError);
});

test('validateCreateRoleInput rejects invalid inherits entries', () => {
  assert.throws(() => validateCreateRoleInput({ inherits: ['../../etc'] }), SchemaValidationError);
  assert.throws(() => validateCreateRoleInput({ inherits: [123] }), SchemaValidationError);
});

test('validateCreateRoleInput rejects malformed permissions', () => {
  assert.throws(() => validateCreateRoleInput({ permissions: [{ resource: 'x', actions: [] }] }), SchemaValidationError);
  assert.throws(() => validateCreateRoleInput({ permissions: [{ actions: ['view'] }] }), SchemaValidationError);
  assert.throws(() => validateCreateRoleInput({ permissions: [{ resource: 'x', actions: ['view'], extra: true }] }), SchemaValidationError);
});

test('validateCreateRoleInput rejects malformed conditions', () => {
  // Grammar violations in `when` surface as InvalidConditionError, not
  // SchemaValidationError — condition.ts stays the single source of truth
  // for that grammar (schema.ts delegates rather than re-validating), so a
  // consumer catching either specific type or the RbacError base still
  // gets a rejection either way.
  assert.throws(
    () => validateCreateRoleInput({ conditions: [{ resource: 'report', actions: ['view'], when: 'process.exit() == 1' }] }),
    InvalidConditionError,
  );
  assert.throws(() => validateCreateRoleInput({ conditions: [{ resource: 'report', actions: ['view'] }] }), SchemaValidationError);
});

test('validatePermission accepts a well-formed permission', () => {
  assert.doesNotThrow(() => validatePermission({ resource: 'invoice', actions: ['view'] }, 'test'));
});

test('validateConditionEntry accepts a well-formed condition', () => {
  assert.doesNotThrow(() => validateConditionEntry({ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }, 'test'));
});
