/**
 * Node filesystem StorageAdapter. This is the ONLY file in the package
 * allowed to import 'fs'/'fs/promises'/'path' (and, as of v0.3,
 * 'rotating-file-stream'/'node:zlib') — grep-checkable per
 * docs/backlog/adr-v0.1-core-engine.md. Everything else in src/core is
 * isomorphic and never touches disk (or this adapter's dependency) directly.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { createStream, type RotatingFileStream } from 'rotating-file-stream';
import { assertValidIdentifier } from '../core/identifier.js';
import type { AuditEntry, ChangeEvent, GetAuditLogOptions, RoleDefinition, RotationOptions, StorageAdapter } from '../core/types.js';

const gunzipAsync = promisify(gunzip);

export interface LocalJsonAdapterOptions {
  /** Explicit data dir — highest priority. See docs/PLAN.md §4. */
  dataDir?: string;
  /** Rotation config for audit logs (docs/PLAN.md §6). Defaults: 5MB / 90d / gzip / 12. */
  rotation?: RotationOptions;
  /**
   * Cache role reads in memory, invalidated live via chokidar (v0.5).
   * Default `true`. Set `false` for filesystems chokidar can't reliably
   * watch (e.g. some network mounts) — see docs/backlog/adr-v0.5-file-watcher.md.
   */
  cache?: boolean;
}

const DEFAULT_ROTATION: Required<RotationOptions> = {
  maxSize: '5MB',
  maxAge: '90d',
  compress: 'gzip',
  maxBackups: 12,
};

/**
 * Resolve the `.rbac/` data directory per docs/PLAN.md §4 priority order:
 * 1. explicit `dataDir` option
 * 2. `RBAC_DATA_DIR` env var
 * 3. nearest ancestor directory containing a `package.json`, + `/.rbac`
 * 4. `process.cwd()/.rbac`
 */
export function resolveDataDir(explicit?: string): string {
  if (explicit) {
    return resolve(explicit);
  }
  if (process.env.RBAC_DATA_DIR) {
    return resolve(process.env.RBAC_DATA_DIR);
  }
  let dir = process.cwd();
  // Walk up until we hit a package.json or the filesystem root.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, 'package.json'))) {
      return join(dir, '.rbac');
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return join(process.cwd(), '.rbac');
}

function rolesDir(dataDir: string, tenantId: string | null): string {
  return tenantId === null ? join(dataDir, '_shared', 'roles') : join(dataDir, 'tenants', tenantId, 'roles');
}

function logsDir(dataDir: string, tenantId: string | null): string {
  return tenantId === null ? join(dataDir, '_shared', 'logs') : join(dataDir, 'tenants', tenantId, 'logs');
}

/**
 * rotating-file-stream's `size` option wants `'5M'`, not `'5MB'` — PLAN §6
 * writes `'5MB'`. Accept either spelling on our public config; normalize
 * here so the library only ever sees its own format. See
 * docs/backlog/adr-v0.3-audit-logging.md.
 */
function normalizeSize(input: string): string {
  const match = /^(\d+)\s*(B|KB?|MB?|GB?)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid rotation.maxSize: ${JSON.stringify(input)} — expected e.g. "5MB", "5M", "300B"`);
  }
  const [, amount, unitRaw] = match;
  // First letter of the unit is always the size letter the library wants
  // (B/K/M/G) whether the caller wrote "MB" or just "M" — so this covers
  // both spellings without a lookup table.
  const unit = unitRaw!.toUpperCase()[0];
  return `${amount}${unit}`;
}

const MAX_AGE_UNITS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000 };

function parseMaxAgeMs(input: string): number {
  const match = /^(\d+)\s*(d|h|m)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid rotation.maxAge: ${JSON.stringify(input)} — expected e.g. "90d", "12h", "30m"`);
  }
  const [, amount, unit] = match;
  return Number(amount) * MAX_AGE_UNITS[unit!.toLowerCase()]!;
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'ENOENT';
}

export class LocalJsonAdapter implements StorageAdapter {
  readonly dataDir: string;
  private readonly rotation: Required<RotationOptions>;
  private readonly cacheEnabled: boolean;
  private readonly streams = new Map<string, RotatingFileStream>();
  private readonly roleCache = new Map<string, RoleDefinition | null>();
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly changeListeners = new Map<string, Set<(event: ChangeEvent) => void>>();

  constructor(options: LocalJsonAdapterOptions = {}) {
    this.dataDir = resolveDataDir(options.dataDir);
    this.rotation = { ...DEFAULT_ROTATION, ...options.rotation };
    this.cacheEnabled = options.cache ?? true;
  }

  private roleFilePath(tenantId: string | null, roleName: string): string {
    if (tenantId !== null) assertValidIdentifier('tenantId', tenantId);
    assertValidIdentifier('roleName', roleName);
    return join(rolesDir(this.dataDir, tenantId), `${roleName}.json`);
  }

  private tenantKey(tenantId: string | null): string {
    return tenantId ?? '_shared';
  }

  /**
   * One chokidar watcher per tenant, lazily created and shared by both
   * internal cache invalidation and consumer-facing `watch()` callbacks.
   * See docs/backlog/adr-v0.5-file-watcher.md.
   */
  private ensureWatcher(tenantId: string | null): FSWatcher {
    const tenantKey = this.tenantKey(tenantId);
    const existing = this.watchers.get(tenantKey);
    if (existing) return existing;

    const dir = rolesDir(this.dataDir, tenantId);
    const watcher = chokidarWatch(dir, {
      ignoreInitial: true, // don't invalidate the cache entry we're about to populate from this same read
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
    });

    const handleEvent = (filePath: string, type: ChangeEvent['type']) => {
      if (!filePath.endsWith('.json')) return;
      const roleName = basename(filePath, '.json');
      this.roleCache.delete(`${tenantKey}::${roleName}`);
      const event: ChangeEvent = { type, tenantId, roleName };
      for (const listener of this.changeListeners.get(tenantKey) ?? []) {
        listener(event);
      }
    };

    watcher.on('add', (filePath) => handleEvent(filePath, 'role-changed'));
    watcher.on('change', (filePath) => handleEvent(filePath, 'role-changed'));
    watcher.on('unlink', (filePath) => handleEvent(filePath, 'role-deleted'));
    watcher.on('error', () => {
      // best-effort — a broken watcher must not crash the process; worst
      // case, the cache just serves stale data until the next own-write
      // invalidation or process restart
    });

    this.watchers.set(tenantKey, watcher);
    return watcher;
  }

  async loadRole(tenantId: string | null, roleName: string): Promise<RoleDefinition | null> {
    if (tenantId !== null) assertValidIdentifier('tenantId', tenantId);
    assertValidIdentifier('roleName', roleName);

    const cacheKey = `${this.tenantKey(tenantId)}::${roleName}`;
    if (this.cacheEnabled) {
      this.ensureWatcher(tenantId);
      if (this.roleCache.has(cacheKey)) {
        return this.roleCache.get(cacheKey)!;
      }
    }

    const filePath = this.roleFilePath(tenantId, roleName);
    let role: RoleDefinition | null;
    try {
      const raw = await readFile(filePath, 'utf-8');
      role = JSON.parse(raw) as RoleDefinition;
    } catch (error) {
      if (isEnoent(error)) role = null;
      else throw error;
    }

    if (this.cacheEnabled) {
      this.roleCache.set(cacheKey, role);
    }
    return role;
  }

  /**
   * Deliberately uncached — always a fresh `readdir` + reads, so newly
   * added role files are discovered without needing directory-level
   * invalidation logic. See docs/backlog/adr-v0.5-file-watcher.md.
   */
  async loadAllRoles(tenantId: string | null): Promise<RoleDefinition[]> {
    if (tenantId !== null) assertValidIdentifier('tenantId', tenantId);
    const dir = rolesDir(this.dataDir, tenantId);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (error) {
      if (isEnoent(error)) return [];
      throw error;
    }
    const roles: RoleDefinition[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(dir, file), 'utf-8');
      roles.push(JSON.parse(raw) as RoleDefinition);
    }
    return roles;
  }

  /**
   * Writes `roles/<role.name>.json`, 2-space indented (git-diff-friendly —
   * docs/PLAN.md §1). Timestamp/`createdBy` policy lives in `rbac.ts`, not
   * here — this adapter is a dumb I/O layer by design (see
   * docs/backlog/adr-v0.2-dynamic-roles.md). Invalidates the role cache
   * synchronously — never relies on chokidar noticing our own write
   * (story-v0.5 requirement #3).
   */
  async saveRole(tenantId: string | null, role: RoleDefinition): Promise<void> {
    const filePath = this.roleFilePath(tenantId, role.name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(role, null, 2) + '\n', 'utf-8');
    this.roleCache.set(`${this.tenantKey(tenantId)}::${role.name}`, role);
  }

  /** Idempotent — deleting an already-absent role is not an error. Invalidates the cache synchronously (see saveRole). */
  async deleteRole(tenantId: string | null, roleName: string): Promise<void> {
    const filePath = this.roleFilePath(tenantId, roleName);
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isEnoent(error)) throw error;
    }
    this.roleCache.set(`${this.tenantKey(tenantId)}::${roleName}`, null);
  }

  /**
   * Subscribe to role add/change/delete events for a tenant. Independent
   * of the `cache` option — works even with caching disabled, since
   * change notification and caching are separate concerns (see the ADR).
   */
  watch(tenantId: string | null, callback: (event: ChangeEvent) => void): () => void {
    if (tenantId !== null) assertValidIdentifier('tenantId', tenantId);
    this.ensureWatcher(tenantId);
    const tenantKey = this.tenantKey(tenantId);
    if (!this.changeListeners.has(tenantKey)) {
      this.changeListeners.set(tenantKey, new Set());
    }
    const listeners = this.changeListeners.get(tenantKey)!;
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  /**
   * Lazily creates (and caches) one rotating stream per (tenantId, role)
   * pair, per docs/PLAN.md §6. See docs/backlog/adr-v0.3-audit-logging.md
   * for the PLAN-config -> rotating-file-stream option mapping.
   */
  private async getStream(tenantId: string | null, roleName: string): Promise<RotatingFileStream> {
    if (tenantId !== null) assertValidIdentifier('tenantId', tenantId);
    assertValidIdentifier('roleName', roleName);

    const key = `${tenantId ?? '_shared'}::${roleName}`;
    const cached = this.streams.get(key);
    if (cached) return cached;

    const dir = logsDir(this.dataDir, tenantId);
    await mkdir(dir, { recursive: true });

    // With a custom generator function, rotating-file-stream does NOT
    // auto-append `.gz` the way it does for its own default generator
    // (verified directly — see docs/backlog/adr-v0.3-audit-logging.md's
    // "verify, don't assume" note) — the returned name IS the compressed
    // file's destination path, so we append `.gz` ourselves whenever
    // compression is on. This also matches docs/PLAN.md §4's example
    // (`admin.jsonl.1.gz`) instead of leaving compressed files with a
    // misleading extension-less name.
    const suffix = this.rotation.compress ? '.gz' : '';
    const generator = (time: number | Date | null, index?: number): string => (time === null ? `${roleName}.jsonl` : `${roleName}.jsonl.${index}${suffix}`);

    const stream = createStream(generator as (time: number | Date, index?: number) => string, {
      size: normalizeSize(this.rotation.maxSize),
      compress: this.rotation.compress,
      maxFiles: this.rotation.maxBackups,
      path: dir,
      // Without this, the library's bookkeeping "history" file defaults to
      // `<role>.jsonl.txt` (README §history) — indistinguishable from our
      // own log files by any reasonable glob, and it got misidentified as
      // a rotated log during QA. A dot-prefixed name keeps it clearly out
      // of the `<role>.jsonl*` namespace we scan in loadAuditLog/prune.
      history: `.${roleName}.jsonl.history`,
    });

    // REQUIRED: an unhandled 'error' event on a Writable crashes the
    // process. Logging is best-effort (story-v0.3 requirement #5) — a
    // broken log stream must never take down can(). See the ADR.
    stream.on('error', () => {
      // intentionally swallowed — see docs/backlog/adr-v0.3-audit-logging.md
    });

    stream.on('rotated', () => {
      this.pruneOldLogs(dir, roleName).catch(() => {
        // best-effort cleanup; a failed prune isn't worth surfacing anywhere yet
      });
    });

    this.streams.set(key, stream);
    return stream;
  }

  /** Hand-rolled age-based retention — rotating-file-stream has no native equivalent (see ADR). */
  private async pruneOldLogs(dir: string, roleName: string): Promise<void> {
    const maxAgeMs = parseMaxAgeMs(this.rotation.maxAge);
    const prefix = `${roleName}.jsonl.`; // rotated files only — never the active, extension-less file
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (error) {
      if (isEnoent(error)) return;
      throw error;
    }
    const now = Date.now();
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      const filePath = join(dir, file);
      try {
        const stats = await stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await unlink(filePath);
        }
      } catch (error) {
        if (!isEnoent(error)) throw error;
      }
    }
  }

  /** Best-effort: writes are awaited, but a write failure never throws — see the ADR. */
  async appendLog(tenantId: string | null, roleName: string, entry: AuditEntry): Promise<void> {
    const stream = await this.getStream(tenantId, roleName);
    await new Promise<void>((resolvePromise) => {
      stream.write(JSON.stringify(entry) + '\n', 'utf-8', () => resolvePromise());
    });
  }

  /**
   * Reads across the active file + any rotated files still on disk
   * (rotated + gzip-compressed included), skipping any line that fails to
   * parse rather than failing the whole read (docs/PLAN.md §5.2's own
   * rationale for JSONL). Returns entries sorted chronologically.
   */
  async loadAuditLog(tenantId: string | null, roleName: string, options: GetAuditLogOptions = {}): Promise<AuditEntry[]> {
    if (tenantId !== null) assertValidIdentifier('tenantId', tenantId);
    assertValidIdentifier('roleName', roleName);

    const dir = logsDir(this.dataDir, tenantId);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (error) {
      if (isEnoent(error)) return [];
      throw error;
    }

    const logFiles = files.filter((file) => file === `${roleName}.jsonl` || file.startsWith(`${roleName}.jsonl.`));
    const entries: AuditEntry[] = [];

    for (const file of logFiles) {
      const filePath = join(dir, file);
      let text: string;
      try {
        if (file.endsWith('.gz')) {
          const compressed = await readFile(filePath);
          text = (await gunzipAsync(compressed)).toString('utf-8');
        } else {
          text = await readFile(filePath, 'utf-8');
        }
      } catch (error) {
        if (isEnoent(error)) continue; // pruned/rotated away between readdir() and read
        throw error;
      }

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as AuditEntry);
        } catch {
          // malformed line — skip it, don't fail the whole read (§5.2)
        }
      }
    }

    const filtered = options.since ? entries.filter((entry) => entry.ts >= options.since!) : entries;
    return filtered.sort((a, b) => a.ts.localeCompare(b.ts));
  }

  /** Test/tooling convenience — not part of the StorageAdapter interface. */
  async ensureRolesDir(tenantId: string | null): Promise<void> {
    await mkdir(rolesDir(this.dataDir, tenantId), { recursive: true });
  }

  /**
   * Ends all open rotating streams and chokidar watchers, and waits for
   * them to finish flushing/closing. Not part of the StorageAdapter
   * interface (that has no lifecycle concept yet) — call this explicitly
   * before process exit, or between tests, so open file handles don't
   * linger.
   */
  async close(): Promise<void> {
    const streams = [...this.streams.values()];
    this.streams.clear();
    const watchers = [...this.watchers.values()];
    this.watchers.clear();
    this.changeListeners.clear();
    this.roleCache.clear();

    await Promise.all([
      ...streams.map(
        (stream) =>
          new Promise<void>((resolveStream) => {
            stream.end(() => resolveStream());
          }),
      ),
      ...watchers.map((watcher) => watcher.close()),
    ]);
  }
}
