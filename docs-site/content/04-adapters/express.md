# Express

`rbacMiddleware(rbac, resource, action, options?)` — `import { rbacMiddleware } from 'rbac-fs/express'`.

## Usage

```js
import express from 'express';
import { RBAC } from 'rbac-fs';
import { rbacMiddleware } from 'rbac-fs/express';

const rbac = new RBAC({ tenantId: 'acme-corp' });
await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

const app = express();

// Your real auth middleware attaches req.user before this runs —
// rbac-fs never assumes how the user got there, only that it's present.
app.use((req, _res, next) => {
  const role = req.header('x-user-role');
  if (role) req.user = { id: 'demo-user', role };
  next();
});

app.post(
  '/invoices/:id/approve',
  rbacMiddleware(rbac, 'invoice', 'approve'),
  (req, res) => res.json({ approved: req.params.id }),
);
```

A denied check returns a plain `403` by default. Full runnable version: [`examples/07-express-middleware.mjs`](https://github.com/imchintoo/rbac-fs/blob/main/examples/07-express-middleware.mjs).
