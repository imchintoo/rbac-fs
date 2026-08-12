---
title: Permissions in the browser, without a filesystem
date: 2026-07-16
excerpt: rbac-fs's Node core never belongs in a browser bundle — here's how RBACClient gives the frontend the same can() call without any filesystem dependency.
tags: browser-client, architecture
---

The Node `rbac-fs` package reads and writes `.rbac/` on disk. That's obviously wrong to ship into a browser bundle — no `fs`, no `path`, no server-side secrets about *every* user's permissions, just the current user's. `RBACClient` is the deliberately separate answer to "how does the frontend check permissions."

## The snapshot model

```ts
import { RBACClient } from 'rbac-fs/client';

const client = new RBACClient(snapshotFromYourApi);
client.can('invoice', 'approve'); // synchronous, no await
```

`RBACClient` doesn't talk to `.rbac/` files, doesn't make its own network calls, and doesn't know about roles by name. It's constructed from a **snapshot** — the already-resolved output of a backend endpoint you build, typically something like `GET /me/permissions`:

```ts
interface RBACClientSnapshot {
  user?: Partial<RbacUser>;      // only needed if a condition references user.*
  permissions: Permission[];
  conditions?: Condition[];
}
```

Deliberately not the full `RoleDefinition` — no `name`, no `inherits`, no `meta`. The browser has no business knowing your role hierarchy; it only needs the flattened result of resolving it.

## Why synchronous matters

```ts
client.can('invoice', 'approve'); // no await
```

The Node `RBAC.can()` is async because it might need to read a file. `RBACClient.can()` is synchronous because the snapshot is already in memory — nothing to wait on. This matters in practice: it means you can call `client.can()` directly inside a render function or a route guard without wrapping it in loading states just to check a permission.

## No close(), and that's not an oversight

Unlike the Node `RBAC` class, `RBACClient` holds no OS-level resources — no file watcher, no log write stream — so there's nothing to release. This asymmetry between the two classes is intentional, not an inconsistency: they genuinely have different resource lifecycles because they're solving different problems (full read/write on the server vs. read-only evaluation in the browser).

<div class="related-link"><span class="related-label">Related</span><a href="/docs/api-reference.html#rbacclient-browser-core-import-rbacclient-from-rbac-fsclient">Full RBACClient API reference →</a></div>

## The one rule that matters most

Fetch and hydrate the snapshot server-side (or via a dedicated endpoint) — never attempt to read `.rbac/` files directly from a browser context, including during SSR render. Every framework adapter built on `RBACClient` (React, Vue, Angular, Svelte) inherits this same rule. See [Building a permission-aware UI without a framework](/blog/tutorial-rbacclient-without-a-framework.html) for the vanilla-JS version, before you reach for a framework adapter.
