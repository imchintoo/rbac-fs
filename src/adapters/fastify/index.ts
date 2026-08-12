/**
 * rbac-fs/fastify — thin Fastify plugin adapter (docs/PLAN.md §3.1,
 * docs/backlog/adr-v0.8-backend-adapters-batch2.md §2).
 *
 * Zero permission logic lives here — the `onRequest` hook does exactly
 * one real thing: read a route's declared `config.rbac`, call
 * `rbac.can(...)`, and translate the boolean into "let the request
 * through" or a `403` response.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { RbacUser } from '../../core/types.js';

/** The only shape this adapter needs from an `RBAC` instance — structural, matching every other adapter's `RbacLike`. */
export interface RbacLike {
  can(user: RbacUser, resource: string, action: string, context?: Record<string, unknown>): Promise<boolean>;
}

/** Per-route RBAC requirement, declared via `{ config: { rbac: {...} } }` on a Fastify route. */
export interface RouteRbacConfig {
  resource: string;
  action: string;
}

/** Options passed to `app.register(rbacPlugin, options)`. */
export interface RbacPluginOptions {
  rbac: RbacLike;
  /** Extract the acting user from the request. Default: `request.user`. Never assume a specific auth plugin populated it. */
  getUser?: (request: FastifyRequest) => RbacUser | undefined;
  /** Extract extra context for conditional (`when`) grants. Default: `{}`. */
  getContext?: (request: FastifyRequest) => Record<string, unknown>;
}

/** The subset of `request.routeOptions.config` this plugin reads — declared on a route via `{ config: { rbac: {...} } }`. */
interface RouteConfigWithRbac {
  rbac?: RouteRbacConfig;
}

/**
 * `app.register(rbacPlugin, { rbac })`. Registers one `onRequest` hook.
 *
 * Wrapped in `fastify-plugin` (`fp()`) — confirmed necessary by actually
 * running Fastify's encapsulation model, not assumed: a plain plugin
 * function's `addHook()` call only applies within its own encapsulated
 * child context, so a route registered as a *sibling* on the parent app
 * (the overwhelmingly common real-world shape — register the plugin once
 * at the root, declare routes normally elsewhere) never sees the hook at
 * all, silently letting every request through regardless of
 * `config.rbac`. `fastify-plugin` exists precisely to opt a plugin out of
 * that encapsulation for exactly this "this hook must apply app-wide"
 * case — the same tool `@fastify/jwt`/`@fastify/auth` use internally.
 * See docs/backlog/adr-v0.8-backend-adapters-batch2.md's addendum and
 * docs/backlog/lessons.md for the QA finding that caught this.
 *
 * A route with no `config.rbac` is let through unchecked — opt-in
 * per-route, same fail-open-on-missing-config precedent as
 * `rbac-fs/nestjs`'s `RbacGuard`.
 */
export const rbacPlugin = fp(
  async (fastify: FastifyInstance, options: RbacPluginOptions): Promise<void> => {
    const getUser = options.getUser ?? ((request: FastifyRequest): RbacUser | undefined => (request as FastifyRequest & { user?: RbacUser }).user);
    const getContext = options.getContext ?? ((): Record<string, unknown> => ({}));

    fastify.addHook('onRequest', async (request, reply) => {
      const config = (request.routeOptions.config as RouteConfigWithRbac | undefined)?.rbac;
      if (!config) {
        return; // no rbac requirement declared on this route
      }

      const user = getUser(request);
      if (!user) {
        reply.code(403).send({ error: 'Forbidden' });
        return;
      }

      const allowed = await options.rbac.can(user, config.resource, config.action, getContext(request));
      if (!allowed) {
        reply.code(403).send({ error: 'Forbidden' });
      }
    });
  },
  { name: 'rbac-fs' },
);

export default rbacPlugin;
