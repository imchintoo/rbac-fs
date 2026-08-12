/**
 * rbac-fs/svelte — thin Svelte store + action adapter (docs/PLAN.md
 * §3.1, docs/backlog/adr-v0.9-frontend-adapters-batch2.md §3).
 *
 * Zero permission logic lives here — both the permission store and the
 * `can` action call straight into the real `RBACClient.can()`.
 *
 * Both are factory functions closing over an explicit client
 * (`createPermissionStore(client)`, `createCanAction(client)`) rather than
 * Svelte's `setContext`/`getContext` — see the ADR for why the timing
 * guarantees of `getContext()` inside a `use:` action weren't confident
 * enough to build on without dedicated verification this phase didn't
 * scope.
 */
import type { Action, ActionReturn } from 'svelte/action';
import type { RBACClient } from '../../client/index.js';

/**
 * Minimal Svelte store-contract object (`{ subscribe(run) => unsubscribe
 * }`) whose value is `client.can` itself (bound) — call it directly in a
 * template (`$permissions('invoice', 'approve')`), mirroring
 * `rbac-fs/react`'s `usePermission()` / `rbac-fs/vue`'s composable, just
 * delivered through Svelte's `$`-auto-subscription sugar. `RBACClient` is
 * an immutable snapshot (no live-reload for the browser client, v0.4), so
 * the value never changes post-creation and `unsubscribe` is a no-op.
 */
export interface PermissionStore {
  subscribe(run: (can: RBACClient['can']) => void): () => void;
}

/** Builds a {@link PermissionStore} bound to `client` — see the interface doc for usage. */
export function createPermissionStore(client: RBACClient): PermissionStore {
  const boundCan = client.can.bind(client);
  return {
    subscribe(run: (can: RBACClient['can']) => void) {
      run(boundCan); // Svelte's store contract requires a synchronous call on subscribe
      return () => {};
    },
  };
}

/** Params for the `use:can` action built by {@link createCanAction}. */
export interface CanActionParams {
  /** Resource — matches `rbac-fs/react`'s `<Can a="...">` / `rbac-fs/vue`'s `v-can` naming. */
  a: string;
  /** Action — matches `rbac-fs/react`'s `<Can I="...">`. */
  I: string;
  context?: Record<string, unknown>;
}

/** The only DOM surface the `can` action touches — a real `HTMLElement` satisfies this structurally. */
interface StyledElement {
  style?: { display: string };
}

function applyVisibility(el: StyledElement, allowed: boolean): void {
  if (!el.style) return;
  el.style.display = allowed ? '' : 'none';
}

/**
 * Builds the `can` action bound to a specific client:
 * `use:can={{ a: 'invoice', I: 'approve' }}`. Toggles `display` (like
 * `rbac-fs/vue`'s `v-can`) rather than truly unmounting the element —
 * unlike `rbac-fs/angular`'s directive, a Svelte action has no public API
 * equivalent to `ViewContainerRef` to unmount/remount compiled template
 * output with, so this is the same documented trade-off as `v-can`, not
 * an oversight.
 */
export function createCanAction(client: RBACClient): Action<StyledElement, CanActionParams> {
  return function can(node: StyledElement, params: CanActionParams): ActionReturn<CanActionParams> {
    const apply = (p: CanActionParams): void => {
      applyVisibility(node, client.can(p.a, p.I, p.context));
    };
    apply(params);
    return {
      update: apply,
    };
  };
}

export type { RBACClient } from '../../client/index.js';
