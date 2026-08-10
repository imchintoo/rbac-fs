import { RBAC, type RbacUser } from 'rbac-fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), 'rbac-fs-ts-fixture-'));
  const rbac = new RBAC({ tenantId: 'acme-corp', dataDir });
  try {
    await rbac.createRole('manager', { permissions: [{ resource: 'invoice', actions: ['approve'] }] });

    const user: RbacUser = { id: 'u1', role: 'manager' };
    const allowed: boolean = await rbac.can(user, 'invoice', 'approve');
    if (allowed !== true) {
      throw new Error(`expected can() to return true, got ${allowed}`);
    }

    console.log('TS-consumer-mode fixture: OK');
  } finally {
    await rbac.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

main();
