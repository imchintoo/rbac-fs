/**
 * Browser entry point (`rbac-fs/client`). Isomorphic — imports only from
 * `src/core/*`, never `fs`/`path`/`rotating-file-stream`. Grep-checkable
 * the same way `src/core/` and `src/index.ts` already are, per
 * docs/backlog/adr-v0.1-core-engine.md and
 * docs/backlog/adr-v0.4-browser-client.md.
 */
import { evaluateCondition } from '../core/condition.js';
import { hasUnconditionalGrant, matchingConditions, type ResolvedRole } from '../core/role-resolver.js';
import type { RBACClientSnapshot } from '../core/types.js';

/**
 * Synchronous, in-memory permission check against an already-resolved
 * snapshot — no filesystem, no network, no `await`. See docs/PLAN.md §7.
 *
 * ```ts
 * import { RBACClient } from 'rbac-fs/client';
 * const client = new RBACClient(snapshotFromApi);
 * client.can('invoice', 'approve'); // synchronous, in-memory only
 * ```
 */
export class RBACClient {
  private readonly snapshot: RBACClientSnapshot;

  constructor(snapshot: RBACClientSnapshot) {
    this.snapshot = snapshot;
  }

  can(resource: string, action: string, context: Record<string, unknown> = {}): boolean {
    // RBACClient has no role/inheritance concept — the snapshot IS the
    // already-flattened result — so we build a minimal ResolvedRole-shaped
    // object to reuse the exact same evaluator functions RBAC.can() uses
    // server-side (single source of truth, per the ADR).
    const resolved: ResolvedRole = {
      name: '(snapshot)',
      ancestry: [],
      permissions: this.snapshot.permissions,
      conditions: this.snapshot.conditions ?? [],
    };

    if (hasUnconditionalGrant(resolved, resource, action)) {
      return true;
    }

    const user = this.snapshot.user ?? {};
    for (const condition of matchingConditions(resolved, resource, action)) {
      if (evaluateCondition(condition.when, user as Record<string, unknown>, context)) {
        return true;
      }
    }

    return false;
  }
}

export type { AuditEntry, Condition, Permission, RBACClientSnapshot, RbacUser } from '../core/types.js';
