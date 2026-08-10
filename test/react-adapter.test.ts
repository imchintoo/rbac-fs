/**
 * rbac-fs/react — exercised against a real `RBACClient` (docs/backlog/
 * adr-v0.7-frontend-adapters.md §7): rendered with `react-test-renderer`
 * (no DOM needed), using `React.createElement` instead of JSX so this file
 * can stay `.ts` (see ADR §8). No `can()` mock anywhere in this file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { RBACClient } from '../src/client/index.js';
import { Can, RbacProvider, usePermission } from '../src/adapters/react/index.js';

function makeClient(): RBACClient {
  return new RBACClient({
    user: { id: 'u1' },
    permissions: [{ resource: 'invoice', actions: ['approve'] }],
    conditions: [{ resource: 'report', actions: ['view'], when: 'owner_id == user.id' }],
  });
}

test('<Can> renders children when the real client allows it', () => {
  const client = makeClient();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(RbacProvider, { client }, createElement(Can, { I: 'approve', a: 'invoice' }, createElement('span', null, 'Approve button'))));
  });
  const tree = renderer.toJSON();
  assert.ok(JSON.stringify(tree).includes('Approve button'));
});

test('<Can> renders nothing (default) when denied', () => {
  const client = makeClient();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(RbacProvider, { client }, createElement(Can, { I: 'delete', a: 'invoice' }, createElement('span', null, 'Delete button'))));
  });
  assert.equal(renderer.toJSON(), null);
});

test('<Can> renders fallback when denied and fallback is provided', () => {
  const client = makeClient();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(
        RbacProvider,
        { client },
        createElement(Can, { I: 'delete', a: 'invoice', fallback: createElement('span', null, 'Not allowed') }, createElement('span', null, 'Delete button')),
      ),
    );
  });
  const tree = renderer.toJSON();
  assert.ok(JSON.stringify(tree).includes('Not allowed'));
  assert.ok(!JSON.stringify(tree).includes('Delete button'));
});

test('<Can> context is threaded through to conditional (`when`) grants', () => {
  const client = makeClient();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(RbacProvider, { client }, createElement(Can, { I: 'view', a: 'report', context: { owner_id: 'u1' } }, createElement('span', null, 'Own report'))));
  });
  assert.ok(JSON.stringify(renderer.toJSON()).includes('Own report'));

  let deniedRenderer!: ReturnType<typeof create>;
  act(() => {
    deniedRenderer = create(createElement(RbacProvider, { client }, createElement(Can, { I: 'view', a: 'report', context: { owner_id: 'someone-else' } }, createElement('span', null, 'Other report'))));
  });
  assert.equal(deniedRenderer.toJSON(), null);
});

test('usePermission() returns a working can() bound to the provided client', () => {
  const client = makeClient();
  let observed: boolean | undefined;
  function Probe(): null {
    const can = usePermission();
    observed = can('invoice', 'approve');
    return null;
  }
  act(() => {
    create(createElement(RbacProvider, { client }, createElement(Probe)));
  });
  assert.equal(observed, true);
});

test('usePermission() throws when used outside a RbacProvider', () => {
  function Probe(): null {
    usePermission();
    return null;
  }
  assert.throws(() => {
    act(() => {
      create(createElement(Probe));
    });
  }, /RbacProvider/);
});
