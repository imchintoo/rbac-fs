/**
 * Hand-rolled schema validation — no Zod, no runtime dependency. See
 * docs/backlog/adr-v0.2-dynamic-roles.md for why: the shape is small and
 * fixed, and the core engine explicitly promises zero dependencies
 * (docs/PLAN.md §1, §2.1).
 */
import { validateConditionField } from './condition-tree.js';
import { isValidIdentifier } from './identifier.js';
import { SchemaValidationError, type Condition, type CreateRoleInput, type Permission } from './types.js';

const ALLOWED_CREATE_ROLE_KEYS = new Set(['label', 'inherits', 'permissions', 'conditions']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validatePermission(permission: unknown, context: string): asserts permission is Permission {
  if (typeof permission !== 'object' || permission === null) {
    throw new SchemaValidationError(`${context}: expected an object`);
  }
  const { resource, actions, ...rest } = permission as Record<string, unknown>;
  const extraKeys = Object.keys(rest);
  if (extraKeys.length > 0) {
    throw new SchemaValidationError(`${context}: unknown field(s) ${extraKeys.join(', ')}`);
  }
  if (!isNonEmptyString(resource)) {
    throw new SchemaValidationError(`${context}: "resource" must be a non-empty string`);
  }
  if (!Array.isArray(actions) || actions.length === 0 || !actions.every(isNonEmptyString)) {
    throw new SchemaValidationError(`${context}: "actions" must be a non-empty array of non-empty strings`);
  }
}

export function validateConditionEntry(condition: unknown, context: string): asserts condition is Condition {
  if (typeof condition !== 'object' || condition === null) {
    throw new SchemaValidationError(`${context}: expected an object`);
  }
  const { resource, actions, when, condition: conditionNode, ...rest } = condition as Record<string, unknown>;
  const extraKeys = Object.keys(rest);
  if (extraKeys.length > 0) {
    throw new SchemaValidationError(`${context}: unknown field(s) ${extraKeys.join(', ')}`);
  }
  validatePermission({ resource, actions }, context);
  if (when !== undefined && typeof when !== 'string') {
    throw new SchemaValidationError(`${context}: "when" must be a string if present`);
  }
  // Delegates to condition-tree.ts's shared checker (when-XOR-condition +
  // whichever grammar applies) — single source of truth, not a second copy
  // of the pattern, and shared with role-resolver.ts's on-disk re-check.
  validateConditionField({ when: when as string | undefined, condition: conditionNode as Condition['condition'] });
}

/**
 * Validates a `createRole()` input object: allow-listed keys only, correct
 * per-field shapes, valid `inherits` identifiers (existence against the
 * stored role graph is checked separately, in rbac.ts — this function has
 * no storage access, by design).
 */
export function validateCreateRoleInput(input: unknown): asserts input is CreateRoleInput {
  if (typeof input !== 'object' || input === null) {
    throw new SchemaValidationError('input must be an object');
  }
  const keys = Object.keys(input as Record<string, unknown>);
  const unknownKeys = keys.filter((key) => !ALLOWED_CREATE_ROLE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new SchemaValidationError(`unknown field(s): ${unknownKeys.join(', ')}`);
  }

  const { label, inherits, permissions, conditions } = input as Record<string, unknown>;

  if (label !== undefined && typeof label !== 'string') {
    throw new SchemaValidationError('"label" must be a string');
  }

  if (inherits !== undefined) {
    if (!Array.isArray(inherits) || !inherits.every(isNonEmptyString)) {
      throw new SchemaValidationError('"inherits" must be an array of non-empty strings');
    }
    for (const parent of inherits) {
      if (!isValidIdentifier(parent)) {
        throw new SchemaValidationError(`"inherits" entry ${JSON.stringify(parent)} is not a valid role identifier`);
      }
    }
  }

  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) {
      throw new SchemaValidationError('"permissions" must be an array');
    }
    permissions.forEach((permission, i) => validatePermission(permission, `permissions[${i}]`));
  }

  if (conditions !== undefined) {
    if (!Array.isArray(conditions)) {
      throw new SchemaValidationError('"conditions" must be an array');
    }
    conditions.forEach((condition, i) => validateConditionEntry(condition, `conditions[${i}]`));
  }
}
