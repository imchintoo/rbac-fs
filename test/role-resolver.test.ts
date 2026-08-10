import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRole } from '../src/core/role-resolver.js';
import type { RoleDefinition } from '../src/core/types.js';
import { CircularInheritanceError, RoleNotFoundError } from '../src/core/types.js';

function fixtureLoader(roles: Record<string, RoleDefinition>) {
  return async (name: string) => roles[name] ?? null;
}

test('resolves a single role with no inheritance', async () => {
  const load = fixtureLoader({
    viewer: { name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] },
  });
  const resolved = await resolveRole('viewer', load);
  assert.deepEqual(resolved.ancestry, ['viewer']);
  assert.equal(resolved.permissions.length, 1);
});

test('flattens a linear inheritance chain', async () => {
  const load = fixtureLoader({
    viewer: { name: 'viewer', permissions: [{ resource: 'invoice', actions: ['view'] }] },
    manager: { name: 'manager', inherits: ['viewer'], permissions: [{ resource: 'invoice', actions: ['approve'] }] },
  });
  const resolved = await resolveRole('manager', load);
  assert.equal(resolved.permissions.length, 2);
  assert.ok(resolved.ancestry.includes('viewer'));
  assert.ok(resolved.ancestry.includes('manager'));
});

test('diamond inheritance merges the shared ancestor once, not a cycle', async () => {
  const load = fixtureLoader({
    base: { name: 'base', permissions: [{ resource: 'doc', actions: ['read'] }] },
    b: { name: 'b', inherits: ['base'], permissions: [] },
    c: { name: 'c', inherits: ['base'], permissions: [] },
    top: { name: 'top', inherits: ['b', 'c'], permissions: [] },
  });
  const resolved = await resolveRole('top', load);
  // base's permission should appear exactly once despite two inheritance paths
  const baseGrants = resolved.permissions.filter((p) => p.resource === 'doc');
  assert.equal(baseGrants.length, 1);
  assert.equal(resolved.ancestry.filter((n) => n === 'base').length, 1);
});

test('direct cycle (A -> B -> A) throws CircularInheritanceError with the real path', async () => {
  const load = fixtureLoader({
    a: { name: 'a', inherits: ['b'], permissions: [] },
    b: { name: 'b', inherits: ['a'], permissions: [] },
  });
  await assert.rejects(() => resolveRole('a', load), (err: unknown) => {
    assert.ok(err instanceof CircularInheritanceError);
    assert.match((err as Error).message, /a -> b -> a/);
    return true;
  });
});

test('cycle reported through an unrelated sibling branch is not polluted by that branch', async () => {
  // A inherits [B, C]; B is a harmless leaf; C inherits A (the real cycle).
  // A naive "all-visited-nodes" cycle message would wrongly include B.
  const load = fixtureLoader({
    a: { name: 'a', inherits: ['b', 'c'], permissions: [] },
    b: { name: 'b', permissions: [] },
    c: { name: 'c', inherits: ['a'], permissions: [] },
  });
  await assert.rejects(() => resolveRole('a', load), (err: unknown) => {
    assert.ok(err instanceof CircularInheritanceError);
    assert.doesNotMatch((err as Error).message, /\bb\b/);
    assert.match((err as Error).message, /a -> c -> a/);
    return true;
  });
});

test('missing role in the chain throws RoleNotFoundError', async () => {
  const load = fixtureLoader({
    manager: { name: 'manager', inherits: ['ghost'], permissions: [] },
  });
  await assert.rejects(() => resolveRole('manager', load), RoleNotFoundError);
});

test('missing target role throws RoleNotFoundError', async () => {
  const load = fixtureLoader({});
  await assert.rejects(() => resolveRole('nope', load), RoleNotFoundError);
});
