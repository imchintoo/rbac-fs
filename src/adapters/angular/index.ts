/**
 * rbac-fs/angular — thin Angular DI + structural directive adapter
 * (docs/PLAN.md §3.1, docs/backlog/adr-v0.9-frontend-adapters-batch2.md
 * §2).
 *
 * Zero permission logic lives here — `RbacService.can()` calls straight
 * into the real `RBACClient.can()`, and `RbacCanDirective` is nothing
 * more than a render branch (via Angular's own `ViewContainerRef`) on top
 * of that same service.
 */
import { Directive, Inject, Injectable, InjectionToken, Input, TemplateRef, ViewContainerRef, type OnChanges, type Provider } from '@angular/core';
import type { RBACClient } from '../../client/index.js';

/** DI token a consumer binds their `RBACClient` instance to — see `provideRbacClient`. */
export const RBAC_CLIENT = new InjectionToken<RBACClient>('rbac-fs client');

/**
 * One-line provider helper for a consumer's `bootstrapApplication(...,
 * { providers: [...] })` (or an `NgModule`'s `providers`) — binds their
 * `RBACClient` instance to `RBAC_CLIENT` so `RbacService` can inject it.
 * Same pattern as `rbac-fs/nestjs`'s `provideRbac()` and `rbac-fs/vue`'s
 * `createRbacPlugin()`, adapted to Angular's own DI idiom.
 */
export function provideRbacClient(client: RBACClient): Provider {
  return { provide: RBAC_CLIENT, useValue: client };
}

/**
 * Thin wrapper exposing the injected `RBACClient`'s `can()` as an
 * Angular-injectable service. Uses classic constructor injection
 * (`@Inject(RBAC_CLIENT)`), not the newer field-initializer `inject()`
 * style — deliberately, so this class can also be constructed directly
 * (`new RbacService(client)`) without an active Angular injection
 * context, e.g. in tests that don't spin up a full `Injector`.
 */
@Injectable()
export class RbacService {
  constructor(@Inject(RBAC_CLIENT) private readonly client: RBACClient) {}

  can(resource: string, action: string, context?: Record<string, unknown>): boolean {
    return this.client.can(resource, action, context);
  }
}

/**
 * `*rbacCan="'invoice'; action: 'approve'"` — Angular structural-directive
 * microsyntax, same convention `*ngIf`/`*ngFor` use (`rbacCan` = main
 * binding = resource, `action:` key → `rbacCanAction` input). Uses
 * `ViewContainerRef.createEmbeddedView`/`.clear()` — the framework's own
 * public API for conditional rendering, the same one `*ngIf` itself is
 * built on — so this is real DOM unmount/remount, not a `display:none`
 * compromise (contrast `rbac-fs/vue`'s `v-can`, which had no equivalent
 * public API available to it).
 */
@Directive({
  selector: '[rbacCan]',
  standalone: true,
})
export class RbacCanDirective implements OnChanges {
  @Input({ required: true }) rbacCan!: string;
  @Input({ required: true }) rbacCanAction!: string;
  @Input() rbacCanContext?: Record<string, unknown>;

  private hasView = false;

  constructor(
    private readonly templateRef: TemplateRef<unknown>,
    private readonly viewContainer: ViewContainerRef,
    private readonly rbac: RbacService,
  ) {}

  ngOnChanges(): void {
    const allowed = this.rbac.can(this.rbacCan, this.rbacCanAction, this.rbacCanContext);
    if (allowed && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!allowed && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}

export type { RBACClient } from '../../client/index.js';
