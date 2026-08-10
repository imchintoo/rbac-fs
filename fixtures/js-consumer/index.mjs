import { RBAC } from 'rbac-fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = await mkdtemp(join(tmpdir(), 'rbac-fs-js-fixture-'));
const rbac = new RBAC({ tenantId: 'acme-corp', dataDir });
try {
  await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

  const allowed = await rbac.can({ id: 'u1', role: 'manager' }, 'invoice', 'approve');
  if (allowed !== true) {
    throw new Error(`expected can() to return true, got ${allowed}`);
  }

  console.log('JS-consumer-mode fixture: OK');
} finally {
  await rbac.close();
  await rm(dataDir, { recursive: true, force: true });
}
