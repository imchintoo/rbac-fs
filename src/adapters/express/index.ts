/**
 * rbac-fs/express — thin Express middleware adapter (docs/PLAN.md §3.1,
 * docs/backlog/adr-v0.6-backend-adapters.md §2).
 *
 * Deliberately a factory function, `rbacMiddleware(rbac, resource, action,
 * options?)`, not a `.middleware()` method on the `RBAC` class itself — see
 * the ADR for why putting an Express-shaped method on the Core Engine would
 * violate §3.1's "adapters are thin, Core Engine stays framework-agnostic"
 * rule. This file contains zero permission logic of its own: every request
 * is decided by calling straight into `rbac.can(...)`.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RbacUser } from '../../core/types.js';

/**
 * The only shape this adapter actually needs from an `RBAC` instance —
 * structural, not the concrete class, so it works against `RBAC` (Node),
 * `CoreRBAC` (adapter-agnostic), or any test double with a matching
 * `can()`, without importing anything Node-specific into this file.
 */
export interface RbacLike {
  can(user: RbacUser, resource: string, action: string, context?: Record<string, unknown>): Promise<boolean>;
}

/** A static resource/action name, or a function deriving one from the request (e.g. from `req.params`). */
export type RequestDerived<T> = T | ((req: Request) => T);

/** Options accepted by {@link rbacMiddleware}. */
export interface RbacMiddlewareOptions {
  /** Extract the acting user from the request. Default: `req.user`. Never assume a specific auth middleware populated it. */
  getUser?: (req: Request) => RbacUser | undefined;
  /** Extract extra context for conditional (`when`) grants. Default: `{}`. */
  getContext?: (req: Request) => Record<string, unknown>;
  /** Called instead of the default `403 { error: 'Forbidden' }` response on deny (or on a missing user). */
  onDeny?: (req: Request, res: Response, next: NextFunction) => void;
}

const defaultGetUser = (req: Request): RbacUser | undefined => (req as Request & { user?: RbacUser }).user;

const defaultOnDeny = (_req: Request, res: Response): void => {
  res.status(403).json({ error: 'Forbidden' });
};

/**
 * Returns a standard Express `(req, res, next)` handler that allows the
 * request through on `next()` if `rbac.can(...)` resolves `true`, or
 * responds (or defers to `options.onDeny`) otherwise. A request with no
 * resolvable user (per `getUser`) is treated as denied, not as an error —
 * authentication itself is the consumer's own middleware's job.
 */
export function rbacMiddleware(rbac: RbacLike, resource: RequestDerived<string>, action: RequestDerived<string>, options: RbacMiddlewareOptions = {}): RequestHandler {
  const getUser = options.getUser ?? defaultGetUser;
  const getContext = options.getContext ?? ((): Record<string, unknown> => ({}));
  const onDeny = options.onDeny ?? defaultOnDeny;

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async (): Promise<void> => {
      try {
        const user = getUser(req);
        if (!user) {
          onDeny(req, res, next);
          return;
        }

        const resolvedResource = typeof resource === 'function' ? resource(req) : resource;
        const resolvedAction = typeof action === 'function' ? action(req) : action;
        const allowed = await rbac.can(user, resolvedResource, resolvedAction, getContext(req));

        if (allowed) {
          next();
        } else {
          onDeny(req, res, next);
        }
      } catch (err) {
        next(err);
      }
    })();
  };
}
