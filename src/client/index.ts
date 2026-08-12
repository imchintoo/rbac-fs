/**
 * Browser entry point (`rbac-fs/client`). Isomorphic — imports only from
 * `src/core/*`, never `fs`/`path`/`rotating-file-stream`. Grep-checkable
 * the same way `src/core/` and `src/index.ts` already are, per
 * docs/backlog/adr-v0.1-core-engine.md and
 * docs/backlog/adr-v0.4-browser-client.md.
 */
import { evaluateConditionEntry } from '../core/condition-tree.js';
import { hasUnconditionalGrant, indexByResource, matchingConditions, type ResolvedRole } from '../core/role-resolver.js';
import type { ConditionOperatorFn, RBACClientSnapshot } from '../core/types.js';

/** Constructor options for {@link RBACClient}. */
export interface RBACClientOptions {
  /**
   * Named predicates a `{ op: 'custom' }` condition leaf can call by name —
   * mirrors `RBACOptions.operators` on the Node core. Plain functions, no
   * fs/eval concern in the browser either — see
   * docs/backlog/adr-feature-scoped-conditions.md.
   */
  operators?: Record<string, ConditionOperatorFn>;
}

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
  private readonly operators: Record<string, ConditionOperatorFn>;
  /**
   * Minimal ResolvedRole-shaped view over the snapshot, built once here
   * rather than per `can()` call — `snapshot` is immutable for the
   * lifetime of a client (see the class doc), so its resource index never
   * goes stale. Reuses `hasUnconditionalGrant`/`matchingConditions` from
   * `role-resolver.ts` (single source of truth with `RBAC.can()`'s
   * server-side evaluator, per the ADR).
   */
  private readonly resolved: ResolvedRole;

  constructor(snapshot: RBACClientSnapshot, options: RBACClientOptions = {}) {
    this.snapshot = snapshot;
    this.operators = options.operators ?? {};
    const conditions = snapshot.conditions ?? [];
    this.resolved = {
      name: '(snapshot)',
      ancestry: [],
      permissions: snapshot.permissions,
      conditions,
      permissionsByResource: indexByResource(snapshot.permissions),
      conditionsByResource: indexByResource(conditions),
    };
  }

  /**
   * Does the snapshot grant `action` on `resource`? Purely in-memory —
   * checks unconditional grants first, then evaluates any matching
   * conditional grants against `snapshot.user`/`context` using the same
   * evaluator `RBAC.can()` uses server-side. Unlike the server-side
   * `RBAC.can()`, this does not audit-log and does not return a `Promise`.
   */
  can(resource: string, action: string, context: Record<string, unknown> = {}): boolean {
    const resolved = this.resolved;

    if (hasUnconditionalGrant(resolved, resource, action)) {
      return true;
    }

    const user = this.snapshot.user ?? {};
    for (const condition of matchingConditions(resolved, resource, action)) {
      if (evaluateConditionEntry(condition, user as Record<string, unknown>, context, this.operators)) {
        return true;
      }
    }

    return false;
  }
}

export type { AuditEntry, Condition, ConditionLeaf, ConditionNode, ConditionOperatorFn, Permission, RBACClientSnapshot, RbacUser } from '../core/types.js';
