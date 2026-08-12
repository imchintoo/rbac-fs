/**
 * rbac-fs/react — thin React context/component adapter (docs/PLAN.md
 * §3.1, docs/backlog/adr-v0.7-frontend-adapters.md §3).
 *
 * Zero permission logic lives here — `usePermission()` returns
 * `RBACClient.can` directly, and `<Can>` is nothing more than a render
 * branch on top of that same hook. No adapter-local condition evaluation,
 * no second permission cache.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { RBACClient } from '../../client/index.js';

const RbacContext = createContext<RBACClient | null>(null);

/** Props for {@link RbacProvider}. */
export interface RbacProviderProps {
  client: RBACClient;
  children?: ReactNode;
}

/** Supplies one `RBACClient` to a component subtree — required by `<Can>` and `usePermission()`. */
export function RbacProvider({ client, children }: RbacProviderProps): ReactNode {
  return <RbacContext.Provider value={client}>{children}</RbacContext.Provider>;
}

/**
 * Returns the nearest `RbacProvider`'s `client.can` bound function for
 * imperative checks outside JSX. Throws if called outside a `RbacProvider`
 * — a missing provider should fail loudly, not silently make every check
 * return `false` (which would look like "no permissions" instead of
 * "misconfigured").
 */
export function usePermission(): RBACClient['can'] {
  const client = useContext(RbacContext);
  if (!client) {
    throw new Error('usePermission() / <Can> must be used inside a <RbacProvider client={...}>.');
  }
  return client.can.bind(client);
}

/** Props for {@link Can} — `<Can I="approve" a="invoice">...</Can>` (CASL-style naming, docs/PLAN.md §7). */
export interface CanProps {
  /** Action — matches `docs/PLAN.md`'s `<Can I="approve" a="invoice">` (CASL-style) naming. */
  I: string;
  /** Resource. */
  a: string;
  /** Extra context for conditional (`when`) grants. */
  context?: Record<string, unknown>;
  children?: ReactNode;
  /** Rendered instead of `children` when denied. Default: nothing. */
  fallback?: ReactNode;
}

/** Renders `children` when `can(a, I, context)` is true, `fallback` (default nothing) otherwise. */
export function Can({ I: action, a: resource, context, children, fallback = null }: CanProps): ReactNode {
  const can = usePermission();
  return can(resource, action, context) ? children : fallback;
}

export type { RBACClient } from '../../client/index.js';
