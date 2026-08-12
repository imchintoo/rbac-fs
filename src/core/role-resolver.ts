/**
 * Role hierarchy resolution: walks a role's `inherits` chain, detects
 * cycles, and flattens permissions/conditions. Pure — takes a `loadRole`
 * accessor rather than touching storage itself, so it works against any
 * StorageAdapter (or a plain in-memory map in tests) without change.
 */
import { CircularInheritanceError, RoleNotFoundError, type Condition, type Permission, type RoleDefinition } from './types.js';
import { validateConditionField } from './condition-tree.js';

export interface ResolvedRole {
  name: string;
  /** Every role name that contributed permissions, target included, each once. */
  ancestry: string[];
  permissions: Permission[];
  conditions: Condition[];
}

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
  return { name: roleName, ancestry, permissions, conditions };
}

/** True if `resolved` grants `action` on `resource` unconditionally. */
export function hasUnconditionalGrant(resolved: ResolvedRole, resource: string, action: string): boolean {
  return resolved.permissions.some((permission) => permission.resource === resource && permission.actions.includes(action));
}

/** All conditional grants matching `resource`/`action`, checked in order. */
export function matchingConditions(resolved: ResolvedRole, resource: string, action: string): Condition[] {
  return resolved.conditions.filter((condition) => condition.resource === resource && condition.actions.includes(action));
}
