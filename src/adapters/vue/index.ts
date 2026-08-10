/**
 * rbac-fs/vue — thin Vue plugin + directive + composable adapter
 * (docs/PLAN.md §3.1, docs/backlog/adr-v0.7-frontend-adapters.md §4/§5).
 *
 * Zero permission logic lives here — both the `v-can` directive and
 * `usePermission()` call straight into the real `RBACClient.can()`.
 */
import { inject, type App, type InjectionKey, type ObjectDirective, type Plugin } from 'vue';
import type { RBACClient } from '../../client/index.js';

export const RBAC_CLIENT_KEY: InjectionKey<RBACClient> = Symbol('rbac-fs client');

export interface CanDirectiveBinding {
  /** Resource — matches `rbac-fs/react`'s `<Can a="...">` naming for a consistent mental model across frameworks. */
  a: string;
  /** Action — matches `rbac-fs/react`'s `<Can I="...">`. */
  I: string;
  context?: Record<string, unknown>;
}

/** The only DOM surface `v-can` touches — a real `HTMLElement` satisfies this structurally. */
interface StyledElement {
  style?: { display: string };
}

function applyVisibility(el: StyledElement, allowed: boolean): void {
  if (!el.style) return;
  el.style.display = allowed ? '' : 'none';
}

/**
 * Builds the `v-can` directive bound to a specific client. `v-can`
 * toggles `display` (like `v-show`) rather than truly unmounting the
 * element (like `v-if`) — reimplementing Vue's own conditional-rendering
 * internals is out of scope for a thin adapter; see the ADR for the full
 * rationale. A consumer needing true unmount-on-deny can compose
 * `usePermission()` with `v-if` directly.
 */
export function makeCanDirective(client: RBACClient): ObjectDirective<StyledElement, CanDirectiveBinding> {
  const evaluate = (binding: { value: CanDirectiveBinding }): boolean => client.can(binding.value.a, binding.value.I, binding.value.context);

  return {
    mounted(el, binding) {
      applyVisibility(el, evaluate(binding));
    },
    updated(el, binding) {
      applyVisibility(el, evaluate(binding));
    },
  };
}

/**
 * Returns the installed `RBACClient`'s bound `can` function, for
 * imperative checks (or `v-if="can(...)"`) inside `setup()`. Throws if
 * called without the plugin installed — same fail-loud reasoning as
 * `rbac-fs/react`'s `usePermission()`.
 */
export function usePermission(): RBACClient['can'] {
  const client = inject(RBAC_CLIENT_KEY);
  if (!client) {
    throw new Error('usePermission() / v-can require app.use(createRbacPlugin(client)) to have run first.');
  }
  return client.can.bind(client);
}

/**
 * `app.use(createRbacPlugin(client))` — provides the client for
 * `usePermission()` and registers the global `v-can` directive in one
 * step. Not a dynamic-module-style config object (no story requirement
 * for one) — a single required argument, matching how thin this adapter
 * is meant to stay.
 */
export function createRbacPlugin(client: RBACClient): Plugin {
  return {
    install(app: App) {
      app.provide(RBAC_CLIENT_KEY, client);
      app.directive('can', makeCanDirective(client));
    },
  };
}

export type { RBACClient } from '../../client/index.js';
