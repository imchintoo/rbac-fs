import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertValidIdentifier, isValidIdentifier } from '../src/core/identifier.js';
import { InvalidIdentifierError } from '../src/core/types.js';

test('accepts alphanumeric, underscore, hyphen', () => {
  assert.equal(isValidIdentifier('acme-corp'), true);
  assert.equal(isValidIdentifier('tenant_01'), true);
  assert.equal(isValidIdentifier('AcmeCorp123'), true);
});

test('rejects path traversal attempts', () => {
  assert.equal(isValidIdentifier('../../etc'), false);
  assert.equal(isValidIdentifier('..'), false);
  assert.equal(isValidIdentifier('a/b'), false);
  assert.equal(isValidIdentifier('a\\b'), false);
});

test('rejects empty string, dots, spaces, null bytes', () => {
  assert.equal(isValidIdentifier(''), false);
  assert.equal(isValidIdentifier('.'), false);
  assert.equal(isValidIdentifier('a b'), false);
  assert.equal(isValidIdentifier('a\0b'), false);
});

test('assertValidIdentifier throws InvalidIdentifierError on bad input', () => {
  assert.throws(() => assertValidIdentifier('tenantId', '../../etc'), InvalidIdentifierError);
});

test('assertValidIdentifier passes through valid input silently', () => {
  assert.doesNotThrow(() => assertValidIdentifier('roleName', 'manager'));
});
