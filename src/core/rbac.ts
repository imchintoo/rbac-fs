/**
 * The public RBAC class. This is the only Core Engine file most consumers
 * ever import directly. It depends purely on a StorageAdapter — it never
 * touches `fs`/`path` itself (see docs/backlog/adr-v0.1-core-engine.md).
 */
import { evaluateCondition } from './condition.js';
import { assertValidIdentifier } from './identifier.js';
import { hasUnconditionalGrant, matchingConditions, resolveRole } from './role-resolver.js';
import { validateCreateRoleInput, validatePermission } from './schema.js';
import {
  ReservedNameError,
  RoleAlreadyExistsError,
  RoleHasDependentsError,
  RoleNotFoundError,
  UnsupportedOperationError,
  type AuditEntry,
  type CreateRoleInput,
  type GetAuditLogOptions,
  type MutationOptions,
  type Permission,
  type RBACOptions,
  type RbacUser,
  type RoleDefinition,
  type StorageAdapter,
} from './types.js';

/**
 * §8 guardrail #3 — not config-driven in v0.2 (no story requirement yet).
 * Applies to createRole/deleteRole only — see
 * docs/backlog/adr-v0.2-dynamic-roles.md for why grant/revoke are exempt.
 */
const RESERVED_ROLE_NAMES = new Set(['admin', 'system-admin']);

export class RBAC {
  private readonly tenantId: string | null;
  private readonly adapter: StorageAdapter;

  constructor(options: RBACOptions & { adapter: StorageAdapter }) {
    this.tenantId = options.tenantId ?? null;
    if (this.tenantId !== null) {
      assertValidIdentifier('tenantId', this.tenantId);
    }
    this.adapter = options.adapter;
  }

  /**
   * Graceful shutdown passthrough — calls the wired adapter's `close()` if
   * it has one (optional on `StorageAdapter`; `LocalJsonAdapter` implements
   * it to end audit-log streams (v0.3) and chokidar watchers (v0.5)). A
   * no-op for adapters that don't need cleanup. Call this before process
   * exit, or between tests, so nothing keeps the event loop alive —
   * chokidar watchers in particular will do exactly that if left open.
   */
  async close(): Promise<void> {
    await this.adapter.close?.();
  }

  /**
   * Does `user` have permission to perform `action` on `resource`?
   * `context` is only consulted for conditional grants (`when` clauses) —
   * see docs/PLAN.md §5.1/§7 and src/core/condition.ts.
   *
   * Every call is recorded to the audit log (docs/PLAN.md §5.2/§6), both
   * allow and deny outcomes — logging is best-effort and awaited but never
   * lets a broken log stream change the returned boolean (see
   * docs/backlog/adr-v0.3-audit-logging.md, story-v0.3 requirement #5).
   *
   * ASSUMPTION: the audit entry's `resource` field records the resource
   * *type* passed here (e.g. `"invoice"`), not a specific instance id —
   * §5.2's illustrative example shows an instance id (`"inv-4521"`), which
   * would need a resourceId concept `can()`'s signature doesn't have.
   * Callers needing per-instance audit trails can fold an id into
   * `context` today; revisit only if there's real demand for a dedicated
   * parameter.
   */
  async can(user: RbacUser, resource: string, action: string, context: Record<string, unknown> = {}): Promise<boolean> {
    assertValidIdentifier('roleName', user.role);
    const resolved = await resolveRole(user.role, (roleName) => this.adapter.loadRole(this.tenantId, roleName));

    let allowed = hasUnconditionalGrant(resolved, resource, action);
    if (!allowed) {
      for (const condition of matchingConditions(resolved, resource, action)) {
        if (evaluateCondition(condition.when, user as unknown as Record<string, unknown>, context)) {
          allowed = true;
          break;
        }
      }
    }

    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      user: user.id,
      role: user.role,
      action: `${resource}:${action}`,
      resource,
      result: allowed ? 'allow' : 'deny',
      tenantId: this.tenantId,
    };
    try {
      await this.adapter.appendLog(this.tenantId, user.role, entry);
    } catch {
      // best-effort — see docs/backlog/adr-v0.3-audit-logging.md
    }

    return allowed;
  }

  /**
   * Read the audit log for `roleName`, optionally filtered to entries at/
   * after `options.since`. Throws `UnsupportedOperationError` if the wired
   * adapter doesn't implement `loadAuditLog` (optional on `StorageAdapter`,
   * same pattern as `watch`).
   */
  async getAuditLog(roleName: string, options: GetAuditLogOptions = {}): Promise<AuditEntry[]> {
    assertValidIdentifier('roleName', roleName);
    if (!this.adapter.loadAuditLog) {
      throw new UnsupportedOperationError('loadAuditLog');
    }
    return this.adapter.loadAuditLog(this.tenantId, roleName, options);
  }

  /** All role definitions visible to this RBAC instance's tenant (or `_shared` if none). */
  async listRoles(): Promise<RoleDefinition[]> {
    return this.adapter.loadAllRoles(this.tenantId);
  }

  /**
   * Create a new role. Validates shape (schema.ts), rejects reserved names
   * and existing roles unless `force`, rejects missing `inherits` parents,
   * and rejects anything that would make the role graph cycle — before
   * anything is written to disk. See docs/backlog/adr-v0.2-dynamic-roles.md.
   */
  async createRole(name: string, input: CreateRoleInput = {}, options: MutationOptions = {}): Promise<RoleDefinition> {
    assertValidIdentifier('roleName', name);
    validateCreateRoleInput(input);

    if (RESERVED_ROLE_NAMES.has(name) && !options.force) {
      throw new ReservedNameError(name);
    }

    const existing = await this.adapter.loadRole(this.tenantId, name);
    if (existing && !options.force) {
      throw new RoleAlreadyExistsError(name);
    }

    for (const parent of input.inherits ?? []) {
      if (parent === name) continue; // self-reference — the cycle check below reports this properly
      const parentRole = await this.adapter.loadRole(this.tenantId, parent);
      if (!parentRole) {
        throw new RoleNotFoundError(parent);
      }
    }

    const now = new Date().toISOString();
    const role: RoleDefinition = {
      name,
      label: input.label,
      inherits: input.inherits ?? [],
      permissions: input.permissions ?? [],
      conditions: input.conditions ?? [],
      meta: { createdAt: existing?.meta?.createdAt ?? now, updatedAt: now, createdBy: options.actorId },
    };

    // Cycle check: reuse resolveRole's walk by substituting the hypothetical
    // new/updated role for `name`, deferring to the real adapter for every
    // other role. Throws CircularInheritanceError before we write anything.
    await resolveRole(name, async (roleName) => (roleName === name ? role : this.adapter.loadRole(this.tenantId, roleName)));

    await this.adapter.saveRole(this.tenantId, role);
    return role;
  }

  /**
   * Add a permission grant to an existing role. Merges into an existing
   * `{ resource, actions }` entry (deduping actions) rather than pushing a
   * duplicate entry for the same resource.
   */
  async grant(roleName: string, permission: Permission): Promise<RoleDefinition> {
    assertValidIdentifier('roleName', roleName);
    validatePermission(permission, 'grant');

    const role = await this.adapter.loadRole(this.tenantId, roleName);
    if (!role) {
      throw new RoleNotFoundError(roleName);
    }

    const permissions = role.permissions ?? [];
    const existingEntry = permissions.find((p) => p.resource === permission.resource);
    if (existingEntry) {
      existingEntry.actions = Array.from(new Set([...existingEntry.actions, ...permission.actions]));
    } else {
      permissions.push({ resource: permission.resource, actions: [...permission.actions] });
    }

    const updated: RoleDefinition = {
      ...role,
      permissions,
      meta: { ...role.meta, updatedAt: new Date().toISOString() },
    };
    await this.adapter.saveRole(this.tenantId, updated);
    return updated;
  }

  /**
   * Remove specific actions from a role's grant on `resource`. Idempotent:
   * revoking something that was never granted is not an error. An entry
   * whose actions all get removed is dropped, not left as `actions: []`.
   */
  async revoke(roleName: string, permission: Permission): Promise<RoleDefinition> {
    assertValidIdentifier('roleName', roleName);
    validatePermission(permission, 'revoke');

    const role = await this.adapter.loadRole(this.tenantId, roleName);
    if (!role) {
      throw new RoleNotFoundError(roleName);
    }

    const toRemove = new Set(permission.actions);
    const permissions = (role.permissions ?? [])
      .map((entry) => (entry.resource === permission.resource ? { ...entry, actions: entry.actions.filter((action) => !toRemove.has(action)) } : entry))
      .filter((entry) => entry.actions.length > 0);

    const updated: RoleDefinition = {
      ...role,
      permissions,
      meta: { ...role.meta, updatedAt: new Date().toISOString() },
    };
    await this.adapter.saveRole(this.tenantId, updated);
    return updated;
  }

  /**
   * Delete a role. Reserved-name guarded like createRole. Refuses to
   * delete a role that other roles currently `inherits` from unless
   * `force` — see the ADR for why this isn't just the literal §8 list.
   * Idempotent: deleting an already-absent role is not an error (checked
   * after the reserved-name guard, so that guard's behavior doesn't depend
   * on whether the role happens to exist).
   */
  async deleteRole(name: string, options: MutationOptions = {}): Promise<void> {
    assertValidIdentifier('roleName', name);

    if (RESERVED_ROLE_NAMES.has(name) && !options.force) {
      throw new ReservedNameError(name);
    }

    const existing = await this.adapter.loadRole(this.tenantId, name);
    if (!existing) {
      return; // idempotent no-op
    }

    if (!options.force) {
      const allRoles = await this.adapter.loadAllRoles(this.tenantId);
      const dependents = allRoles.filter((role) => role.inherits?.includes(name)).map((role) => role.name);
      if (dependents.length > 0) {
        throw new RoleHasDependentsError(name, dependents);
      }
    }

    await this.adapter.deleteRole(this.tenantId, name);
  }
}
