/**
 * Core type definitions for rbac-fs. This module has zero runtime
 * dependencies and zero Node-only imports — it is safe to import from any
 * environment (Node, browser, edge runtimes).
 */

/** A single resource + allowed-actions grant. */
export interface Permission {
  resource: string;
  actions: string[];
}

/**
 * A conditional grant. v0.1 supports only equality comparisons in `when`
 * (see {@link ../condition.js}) — e.g. `"owner_id == user.id"`.
 */
export interface Condition {
  resource: string;
  actions: string[];
  when: string;
}

export interface RoleMeta {
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

/** Shape of a role file on disk (`roles/<role>.json`). */
export interface RoleDefinition {
  name: string;
  label?: string;
  inherits?: string[];
  permissions?: Permission[];
  conditions?: Condition[];
  meta?: RoleMeta;
}

/**
 * Input accepted by `RBAC.createRole()` — deliberately narrower than
 * `RoleDefinition` (no `name` — that's the first positional arg; no
 * `meta` — the engine stamps timestamps itself). Validated against exactly
 * these keys by `schema.ts`; anything else throws `SchemaValidationError`.
 */
export interface CreateRoleInput {
  label?: string;
  inherits?: string[];
  permissions?: Permission[];
  conditions?: Condition[];
}

export interface MutationOptions {
  /** Bypass reserved-name / dependents-block guardrails. */
  force?: boolean;
  /** Recorded as `meta.createdBy` on createRole. */
  actorId?: string;
}

/** One line of a `logs/<role>.jsonl` audit log. */
export interface AuditEntry {
  ts: string;
  user: string;
  role: string;
  action: string;
  resource: string;
  result: 'allow' | 'deny';
  tenantId: string | null;
}

export interface GetAuditLogOptions {
  /** ISO date/time string — only entries at/after this are returned. */
  since?: string;
}

/**
 * Rotation config for `logs/<role>.jsonl` (docs/PLAN.md §6). Public naming
 * matches PLAN's illustrative config; `LocalJsonAdapter` translates it to
 * `rotating-file-stream`'s actual option names — see
 * docs/backlog/adr-v0.3-audit-logging.md for the mapping and why `maxAge`
 * is hand-rolled (the library has no native age-based retention).
 */
export interface RotationOptions {
  /** Rotate the active log once it reaches this size. Accepts B/K/KB/M/MB/G/GB. Default '5MB'. */
  maxSize?: string;
  /** Delete rotated files older than this. Accepts `<n>d`/`<n>h`/`<n>m`. Default '90d'. */
  maxAge?: string;
  /** Default 'gzip'. */
  compress?: boolean | 'gzip';
  /** Max rotated files kept per role, oldest pruned first. Default 12. */
  maxBackups?: number;
}

/**
 * Browser-side input to `RBACClient` (`rbac-fs/client`) — the
 * already-resolved permission set for one user, as produced by whatever
 * backend endpoint the consuming app builds. Deliberately narrower than
 * `RoleDefinition`: no `name`/`inherits`/`meta` — inheritance is already
 * flattened by the time this reaches the browser. See
 * docs/backlog/adr-v0.4-browser-client.md.
 */
export interface RBACClientSnapshot {
  /** Only needed if a condition's `when` references `user.*`. */
  user?: Partial<RbacUser>;
  permissions: Permission[];
  conditions?: Condition[];
}

/**
 * Minimal shape rbac-fs needs from a "user" to evaluate permissions.
 *
 * ASSUMPTION (not pinned down in docs/PLAN.md — flagged for product-owner
 * to confirm or override): v0.1 assumes one role per user via `role`.
 * Multi-role (`roles: string[]`) is a plausible future extension but out
 * of scope until there's an actual requirement for it.
 */
export interface RbacUser {
  id: string;
  role: string;
  [key: string]: unknown;
}

export type ChangeEvent = {
  type: 'role-changed' | 'role-deleted';
  tenantId: string | null;
  roleName: string;
};

/**
 * The single seam between the isomorphic Core Engine and any concrete
 * storage backend. Core Engine code (`rbac.ts`, `role-resolver.ts`,
 * `condition.ts`) never imports `fs`/`path` directly — it only ever talks
 * to a `StorageAdapter`. See docs/PLAN.md §3.1 and
 * docs/backlog/adr-v0.1-core-engine.md.
 */
export interface StorageAdapter {
  loadRole(tenantId: string | null, roleName: string): Promise<RoleDefinition | null>;
  loadAllRoles(tenantId: string | null): Promise<RoleDefinition[]>;
  saveRole(tenantId: string | null, role: RoleDefinition): Promise<void>;
  deleteRole(tenantId: string | null, roleName: string): Promise<void>;
  appendLog(tenantId: string | null, roleName: string, entry: AuditEntry): Promise<void>;
  /** Optional — an adapter that can't support audit reads (yet) simply omits this, same pattern as `watch`. */
  loadAuditLog?(tenantId: string | null, roleName: string, options?: GetAuditLogOptions): Promise<AuditEntry[]>;
  watch?(tenantId: string | null, callback: (event: ChangeEvent) => void): () => void;
  /**
   * Optional graceful-shutdown hook. `LocalJsonAdapter` implements this
   * (v0.3: closes rotating audit-log streams; v0.5: also closes chokidar
   * watchers) — a stateless adapter can simply omit it, same pattern as
   * `watch`/`loadAuditLog`. `RBAC.close()` calls this if present.
   */
  close?(): Promise<void>;
}

export interface RBACOptions {
  /** Explicit tenant. Omit (or pass null) to operate against `_shared/`. */
  tenantId?: string | null;
  /** Explicit data dir override — highest priority in the resolution order. */
  dataDir?: string;
  /** Inject a custom StorageAdapter. Defaults to LocalJsonAdapter in Node. */
  adapter?: StorageAdapter;
  /** Audit log rotation config, forwarded to the default LocalJsonAdapter. Ignored if `adapter` is passed explicitly. */
  rotation?: RotationOptions;
}

export class RbacError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'RbacError';
  }
}

export class InvalidIdentifierError extends RbacError {
  constructor(kind: 'tenantId' | 'roleName', value: string) {
    super(`Invalid ${kind}: ${JSON.stringify(value)} — must match ^[a-zA-Z0-9_-]+$`, 'INVALID_IDENTIFIER');
    this.name = 'InvalidIdentifierError';
  }
}

export class CircularInheritanceError extends RbacError {
  constructor(cycle: string[]) {
    super(`Circular role inheritance detected: ${cycle.join(' -> ')}`, 'CIRCULAR_INHERITANCE');
    this.name = 'CircularInheritanceError';
  }
}

export class RoleNotFoundError extends RbacError {
  constructor(roleName: string) {
    super(`Role not found: ${JSON.stringify(roleName)}`, 'ROLE_NOT_FOUND');
    this.name = 'RoleNotFoundError';
  }
}

export class InvalidConditionError extends RbacError {
  constructor(when: string) {
    super(`Invalid condition expression: ${JSON.stringify(when)} — v0.1 supports "<path> == <path|literal>" only`, 'INVALID_CONDITION');
    this.name = 'InvalidConditionError';
  }
}

export class NotImplementedYetError extends RbacError {
  constructor(method: string, availableInVersion: string) {
    super(`${method}() is not implemented until ${availableInVersion}`, 'NOT_IMPLEMENTED_YET');
    this.name = 'NotImplementedYetError';
  }
}

export class SchemaValidationError extends RbacError {
  constructor(reason: string) {
    super(`Invalid role input: ${reason}`, 'SCHEMA_VALIDATION');
    this.name = 'SchemaValidationError';
  }
}

export class ReservedNameError extends RbacError {
  constructor(roleName: string) {
    super(`${JSON.stringify(roleName)} is a reserved role name — pass { force: true } to override`, 'RESERVED_NAME');
    this.name = 'ReservedNameError';
  }
}

export class RoleAlreadyExistsError extends RbacError {
  constructor(roleName: string) {
    super(`Role already exists: ${JSON.stringify(roleName)} — pass { force: true } to overwrite`, 'ROLE_ALREADY_EXISTS');
    this.name = 'RoleAlreadyExistsError';
  }
}

export class UnsupportedOperationError extends RbacError {
  constructor(operation: string) {
    super(`The current StorageAdapter does not implement ${operation}()`, 'UNSUPPORTED_OPERATION');
    this.name = 'UnsupportedOperationError';
  }
}

export class RoleHasDependentsError extends RbacError {
  constructor(roleName: string, dependents: string[]) {
    super(
      `Cannot delete ${JSON.stringify(roleName)} — still inherited by: ${dependents.join(', ')} — pass { force: true } to override`,
      'ROLE_HAS_DEPENDENTS',
    );
    this.name = 'RoleHasDependentsError';
  }
}
