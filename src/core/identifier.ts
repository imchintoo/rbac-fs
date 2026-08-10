/**
 * Pure identifier validation — no fs, no path, safe to import anywhere.
 * This is the single choke point for §8 guardrail #1 (path traversal
 * prevention): any caller that needs a tenantId/roleName to be safe to use
 * in a filesystem path MUST go through here first.
 */
import { InvalidIdentifierError } from './types.js';

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

/**
 * Throws InvalidIdentifierError unless `value` matches ^[a-zA-Z0-9_-]+$.
 * Deliberately does not accept empty string — callers that mean
 * "no tenant" must pass `null`, not `""`, to avoid ambiguity between
 * "unset" and "empty but present".
 */
export function assertValidIdentifier(kind: 'tenantId' | 'roleName', value: string): void {
  if (!isValidIdentifier(value)) {
    throw new InvalidIdentifierError(kind, value);
  }
}
