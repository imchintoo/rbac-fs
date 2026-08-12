# NestJS

`@RequirePermission()` decorator + `RbacGuard` + `provideRbac()` — `import ... from 'rbac-fs/nestjs'`.

## Install

```bash
npm install rbac-fs
```

`@nestjs/common` and `@nestjs/core` are optional peer dependencies — already in a NestJS project, nothing extra to add.

## Usage

```ts
import { Controller, Post, UseGuards, Module } from '@nestjs/common';
import { RbacGuard, RequirePermission, provideRbac } from 'rbac-fs/nestjs';

@Controller('invoices')
export class InvoiceController {
  @Post(':id/approve')
  @UseGuards(RbacGuard)
  @RequirePermission('invoice', 'approve')
  approve() {
    return { approved: true };
  }

  @Post(':id/comment') // no @RequirePermission() -> RbacGuard lets it through unchecked
  comment() {
    return { commented: true };
  }
}

@Module({
  controllers: [InvoiceController],
  providers: [provideRbac(rbac)], // binds your RBAC instance to RBAC_TOKEN
})
export class AppModule {}
```

A route with no `@RequirePermission()` is opt-in — `RbacGuard` lets it through unchecked. Pair it with your own auth guard (e.g. `AuthGuard('jwt')`) so `request.user` is populated before `RbacGuard` runs; a guarded route with no `request.user` throws `ForbiddenException`.

<div class="callout tip">RbacGuard's constructor explicitly <code>@Inject()</code>s <code>Reflector</code> instead of relying on implicit type-based DI — esbuild-based builds (this package's own <code>tsup</code> build included) don't reliably emit the <code>design:paramtypes</code> metadata implicit DI needs.</div>

Full runnable verification: [`examples/10-nestjs-guard.ts`](https://github.com/imchintoo/rbac-fs/blob/main/examples/10-nestjs-guard.ts).
