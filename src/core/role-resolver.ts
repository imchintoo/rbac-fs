/**
 * Role hierarchy resolution: walks a role's `inherits` chain, detects
 * cycles, and flattens permissions/conditions. Pure — takes a `loadRole`
 * accessor rather than touching storage itself, so it works against any
 * StorageAdapter (or a plain in-memory map in tests) without change.
 */
import { CircularInheritanceError, RoleNotFoundError, type Condition, type Permission, type RoleDefinition } from './types.js';
import { validateConditionField } from './condition-tree.js';

/** Flattened result of walking a role's `inherits` chain — see {@link resolveRole}. */
export interface ResolvedRole {
  name: string;
  /** Every role name that contributed permissions, target included, each once. */
  ancestry: string[];
  permissions: Permission[];
  conditions: Condition[];
  /**
   * `permissions` grouped by `resource` (built once, alongside the arrays
   * above). Lets {@link hasUnconditionalGrant} do an O(1)-average `Map.get`
   * instead of an O(P) scan over every permission the role holds, across
   * every resource — the difference matters once a role's grants span many
   * resource types. See {@link indexByResource}.
   */
  permissionsByResource: Map<string, Permission[]>;
  /** Same grouping as `permissionsByResource`, for `conditions` — see {@link matchingConditions}. */
  conditionsByResource: Map<string, Condition[]>;
}

/**
 * Groups `entries` by their `resource` field — the shared indexing step
 * behind `ResolvedRole.permissionsByResource`/`conditionsByResource` and
 * `RBACClient`'s equivalent snapshot index (`src/client/index.ts`), so both
 * sides build the index the same way. One O(n) pass up front turns repeated
 * per-`resource` lookups into O(1)-average `Map.get` instead of an O(n) scan
 * each time.
 */
export function indexByResource<T extends { resource: string }>(entries: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const entry of entries) {
    const bucket = index.get(entry.resource);
    if (bucket) {
      bucket.push(entry);
    } else {
      index.set(entry.resource, [entry]);
    }
  }
  return index;
}

/**
 * Storage-agnostic role loader passed to {@link resolveRole}. Typically a
 * closure over a `StorageAdapter.loadRole` call for one fixed tenant, but
 * can be backed by anything (e.g. a plain in-memory map in tests).
 */
export type LoadRoleFn = (roleName: string) => Promise<RoleDefinition | null>;

/**
 * Resolve `roleName`'s full permission set by walking `inherits`.
 * Throws RoleNotFoundError if the target or any ancestor is missing, and
 * CircularInheritanceError (with the exact cycle path) if the chain cycles
 * back on itself. Diamond inheritance (a role reachable via two different
 * parents) is fine — it's merged once, not treated as a cycle.
 */
export async function resolveRole(roleName: string, loadRole: LoadRoleFn): Promise<ResolvedRole> {
  const stack: string[] = []; // current DFS path only — used for cycle-path reporting
  const onStack = new Set<string>();
  const merged = new Set<string>(); // roles already merged into the result (diamond dedup)
  const ancestry: string[] = [];
  const permissions: Permission[] = [];
  const conditions: Condition[] = [];

  async function walk(name: string): Promise<void> {
    if (onStack.has(name)) {
      const cycleStart = stack.indexOf(name);
      throw new CircularInheritanceError([...stack.slice(cycleStart), name]);
    }
    if (merged.has(name)) {
      return; // reached again via a different branch — already merged, not a cycle
    }
    const role = await loadRole(name);
    if (!role) {
      throw new RoleNotFoundError(name);
    }

    stack.push(name);
    onStack.add(name);
    for (const parent of role.inherits ?? []) {
      await walk(parent);
    }
    onStack.delete(name);
    stack.pop();

    merged.add(name);
    ancestry.push(name);
    for (const permission of role.permissions ?? []) {
      permissions.push(permission);
    }
    for (const condition of role.conditions ?? []) {
      validateConditionField(condition);
      conditions.push(condition);
    }
  }

  await walk(roleName);
  return {
    name: roleName,
    ancestry,
    permissions,
    conditions,
    permissionsByResource: indexByResource(permissions),
    conditionsByResource: indexByResource(conditions),
  };
}

/** True if `resolved` grants `action` on `resource` unconditionally. */
export function hasUnconditionalGrant(resolved: ResolvedRole, resource: string, action: string): boolean {
  const candidates = resolved.permissionsByResource.get(resource);
  return candidates !== undefined && candidates.some((permission) => permission.actions.includes(action));
}

/** All conditional grants matching `resource`/`action`, checked in order. */
export function matchingConditions(resolved: ResolvedRole, resource: string, action: string): Condition[] {
  const candidates = resolved.conditionsByResource.get(resource);
  return candidates === undefined ? [] : candidates.filter((condition) => condition.actions.includes(action));
}
