/**
 * Package entry point — this is the "Node runtime face" (Layer 2, see
 * docs/PLAN.md §3): it wires the isomorphic Core Engine to the Node-only
 * `LocalJsonAdapter` by default, so `new RBAC({ tenantId })` works out of
 * the box exactly as shown in docs/PLAN.md §7, while the underlying
 * `CoreRBAC` class stays adapter-agnostic and testable without fs.
 */
import { RBAC as CoreRBAC } from './core/rbac.js';
import { LocalJsonAdapter } from './adapters/local-json-adapter.js';
import type { RBACOptions, StorageAdapter } from './core/types.js';

/**
 * Node entry point's `RBAC` — the class most consumers instantiate
 * directly (`import { RBAC } from 'rbac-fs'`). Wraps the isomorphic
 * `CoreRBAC` engine with a default `LocalJsonAdapter`, so `new RBAC({
 * tenantId })` works with zero adapter wiring (docs/PLAN.md §7). Pass a
 * custom `adapter` in `options` to override storage entirely, or import
 * `CoreRBAC` directly for a fully adapter-agnostic instance.
 *
 * @example
 * ```ts
 * import { RBAC } from 'rbac-fs';
 * const rbac = new RBAC({ tenantId: 'acme' }); // uses LocalJsonAdapter
 * await rbac.can({ id: 'u1', role: 'editor' }, 'invoice', 'approve');
 * ```
 */
export class RBAC extends CoreRBAC {
  constructor(options: RBACOptions = {}) {
    const adapter: StorageAdapter = options.adapter ?? new LocalJsonAdapter({ dataDir: options.dataDir, rotation: options.rotation });
    super({ ...options, adapter });
  }
}

export { LocalJsonAdapter, resolveDataDir } from './adapters/local-json-adapter.js';
export { RBAC as CoreRBAC } from './core/rbac.js';

export type {
  AuditEntry,
  ChangeEvent,
  ComparisonOp,
  Condition,
  ConditionLeaf,
  ConditionNode,
  ConditionOperatorFn,
  CreateRoleInput,
  GetAuditLogOptions,
  JsonPrimitive,
  MutationOptions,
  Permission,
  RBACOptions,
  RbacUser,
  RoleDefinition,
  RoleMeta,
  RotationOptions,
  StorageAdapter,
} from './core/types.js';
export {
  CircularInheritanceError,
  InvalidConditionError,
  InvalidIdentifierError,
  NotImplementedYetError,
  RbacError,
  ReservedNameError,
  RoleAlreadyExistsError,
  RoleHasDependentsError,
  RoleNotFoundError,
  SchemaValidationError,
  UnknownConditionOperatorError,
  UnsupportedOperationError,
} from './core/types.js';
