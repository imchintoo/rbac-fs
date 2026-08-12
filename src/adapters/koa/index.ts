/**
 * rbac-fs/koa — thin Koa middleware adapter (docs/PLAN.md §3.1,
 * docs/backlog/adr-v0.8-backend-adapters-batch2.md §3).
 *
 * Zero permission logic lives here. Async/await native, matching Koa's own
 * convention — no `next(err)` translation layer needed: a thrown error
 * from `rbac.can()` propagates as a real thrown rejection for free.
 */
import type { Context, Middleware, Next } from 'koa';
import type { RbacUser } from '../../core/types.js';

/** The only shape this adapter needs from an `RBAC` instance — structural, matching every other adapter's `RbacLike`. */
export interface RbacLike {
  can(user: RbacUser, resource: string, action: string, context?: Record<string, unknown>): Promise<boolean>;
}

/** A static value, or a function deriving one from the Koa context (e.g. from `ctx.params`). */
export type ContextDerived<T> = T | ((ctx: Context) => T);

/** Options accepted by {@link rbacMiddleware}. */
export interface RbacMiddlewareOptions {
  /** Extract the acting user from the context. Default: `ctx.state.user` — Koa's own documented convention for passing data through middleware. */
  getUser?: (ctx: Context) => RbacUser | undefined;
  /** Extract extra context for conditional (`when`) grants. Default: `{}`. */
  getContext?: (ctx: Context) => Record<string, unknown>;
  /** Called instead of the default `403` response on deny (or a missing user). */
  onDeny?: (ctx: Context) => void;
}

const defaultGetUser = (ctx: Context): RbacUser | undefined => (ctx.state as { user?: RbacUser }).user;

const defaultOnDeny = (ctx: Context): void => {
  ctx.status = 403;
  ctx.body = { error: 'Forbidden' };
};

/**
 * Returns a standard Koa `(ctx, next) => Promise<void>` middleware that
 * calls `await next()` if `rbac.can(...)` resolves `true`, or responds
 * (or defers to `options.onDeny`) otherwise. A context with no resolvable
 * user (per `getUser`) is treated as denied, not as an error —
 * authentication itself is the consumer's own middleware's job.
 */
export function rbacMiddleware(rbac: RbacLike, resource: ContextDerived<string>, action: ContextDerived<string>, options: RbacMiddlewareOptions = {}): Middleware {
  const getUser = options.getUser ?? defaultGetUser;
  const getContext = options.getContext ?? ((): Record<string, unknown> => ({}));
  const onDeny = options.onDeny ?? defaultOnDeny;

  return async (ctx: Context, next: Next): Promise<void> => {
    const user = getUser(ctx);
    if (!user) {
      onDeny(ctx);
      return;
    }

    const resolvedResource = typeof resource === 'function' ? resource(ctx) : resource;
    const resolvedAction = typeof action === 'function' ? action(ctx) : action;
    const allowed = await rbac.can(user, resolvedResource, resolvedAction, getContext(ctx));

    if (allowed) {
      await next();
    } else {
      onDeny(ctx);
    }
  };
}
