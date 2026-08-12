# Fastify

`rbacPlugin`, registered once, declared per-route via `config: { rbac: { resource, action } }` — `import { rbacPlugin } from 'rbac-fs/fastify'`.

## Usage

```js
import Fastify from 'fastify';
import { RBAC } from 'rbac-fs';
import { rbacPlugin } from 'rbac-fs/fastify';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

const app = Fastify();

app.addHook('onRequest', async (request) => {
  const role = request.headers['x-user-role'];
  if (role) request.user = { id: 'demo-user', role };
});

await app.register(rbacPlugin, { rbac });

app.post(
  '/invoices/:id/approve',
  { config: { rbac: { resource: 'invoice', action: 'approve' } } },
  async (request) => ({ approved: request.params.id }),
);
```

<div class="callout security">Register <code>rbacPlugin</code> at the root app, not inside an encapsulated sub-plugin. Fastify's plugin encapsulation means a hook registered inside a child context never reaches sibling routes registered elsewhere — <code>rbacPlugin</code> is wrapped in <code>fastify-plugin</code> specifically to opt out of that and apply app-wide, the same approach <code>@fastify/jwt</code> uses internally.</div>

Full runnable version: [`examples/09-fastify-plugin.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/09-fastify-plugin.mjs).
