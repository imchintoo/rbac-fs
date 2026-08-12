/**
 * Hand-rolled schema validation — no Zod, no runtime dependency. See
 * docs/backlog/adr-v0.2-dynamic-roles.md for why: the shape is small and
 * fixed, and the core engine explicitly promises zero dependencies
 * (docs/PLAN.md §1, §2.1).
 */
import { validateConditionField } from './condition-tree.js';
import { isValidIdentifier } from './identifier.js';
import { SchemaValidationError, type Condition, type CreateRoleInput, type Permission } from './types.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates a raw permission-shaped value: `resource` a non-empty string,
 * `actions` a non-empty array of non-empty strings, no unknown fields.
 * Throws `SchemaValidationError` (prefixed with `context`, e.g.
 * `"permissions[0]"`) on the first violation found; narrows `permission` to
 * `Permission` on success via the `asserts` return type.
 */
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

/**
 * Validates a raw condition-entry-shaped value: the base `Permission`
 * shape plus exactly one of `when`/`condition` (delegated to
 * `condition-tree.ts`'s `validateConditionField`). Throws
 * `SchemaValidationError` (prefixed with `context`) on the first violation.
 */
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

/** Validates `createRole()`'s optional `label` field. */
function validateLabelField(label: unknown): void {
  if (label !== undefined && typeof label !== 'string') {
    throw new SchemaValidationError('"label" must be a string');
  }
}

/** Validates `createRole()`'s optional `inherits` field: an array of valid role identifiers. */
function validateInheritsField(inherits: unknown): void {
  if (inherits === undefined) return;
  if (!Array.isArray(inherits) || !inherits.every(isNonEmptyString)) {
    throw new SchemaValidationError('"inherits" must be an array of non-empty strings');
  }
  for (const parent of inherits) {
    if (!isValidIdentifier(parent)) {
      throw new SchemaValidationError(`"inherits" entry ${JSON.stringify(parent)} is not a valid role identifier`);
    }
  }
}

/** Validates `createRole()`'s optional `permissions` field, delegating each entry to `validatePermission`. */
function validatePermissionsField(permissions: unknown): void {
  if (permissions === undefined) return;
  if (!Array.isArray(permissions)) {
    throw new SchemaValidationError('"permissions" must be an array');
  }
  permissions.forEach((permission, i) => validatePermission(permission, `permissions[${i}]`));
}

/** Validates `createRole()`'s optional `conditions` field, delegating each entry to `validateConditionEntry`. */
function validateConditionsField(conditions: unknown): void {
  if (conditions === undefined) return;
  if (!Array.isArray(conditions)) {
    throw new SchemaValidationError('"conditions" must be an array');
  }
  conditions.forEach((condition, i) => validateConditionEntry(condition, `conditions[${i}]`));
}

/**
 * Validates a `createRole()` input object: allow-listed keys only, correct
 * per-field shapes, valid `inherits` identifiers (existence against the
 * stored role graph is checked separately, in rbac.ts — this function has
 * no storage access, by design). A thin dispatcher over the four
 * `validate*Field` helpers above — each field's rules stay independently
 * readable and testable.
 */
export function validateCreateRoleInput(input: unknown): asserts input is CreateRoleInput {
  if (typeof input !== 'object' || input === null) {
    throw new SchemaValidationError('input must be an object');
  }
  const { label, inherits, permissions, conditions, ...rest } = input as Record<string, unknown>;
  const unknownKeys = Object.keys(rest);
  if (unknownKeys.length > 0) {
    throw new SchemaValidationError(`unknown field(s): ${unknownKeys.join(', ')}`);
  }

  validateLabelField(label);
  validateInheritsField(inherits);
  validatePermissionsField(permissions);
  validateConditionsField(conditions);
}
