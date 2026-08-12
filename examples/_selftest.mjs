/**
 * Sanity check: confirms `rbac-fs` resolves correctly and every documented
 * export/subpath is actually present on the built package — run this first
 * if an example below doesn't behave as expected, to rule out an install/
 * build problem before debugging your own code.
 * Run: node examples/_selftest.mjs
 */
import assert from 'node:assert/strict';

const core = await import('rbac-fs');
assert.equal(typeof core.RBAC, 'function', 'rbac-fs should export RBAC');
assert.equal(typeof core.LocalJsonAdapter, 'function', 'rbac-fs should export LocalJsonAdapter');

const client = await import('rbac-fs/client');
assert.equal(typeof client.RBACClient, 'function', 'rbac-fs/client should export RBACClient');

const express = await import('rbac-fs/express');
assert.equal(typeof express.rbacMiddleware, 'function', 'rbac-fs/express should export rbacMiddleware');

const koa = await import('rbac-fs/koa');
assert.equal(typeof koa.rbacMiddleware, 'function', 'rbac-fs/koa should export rbacMiddleware');

const fastify = await import('rbac-fs/fastify');
assert.equal(typeof fastify.rbacPlugin, 'function', 'rbac-fs/fastify should export rbacPlugin');

const nestjs = await import('rbac-fs/nestjs');
assert.equal(typeof nestjs.RbacGuard, 'function', 'rbac-fs/nestjs should export RbacGuard');
assert.equal(typeof nestjs.provideRbac, 'function', 'rbac-fs/nestjs should export provideRbac');

const react = await import('rbac-fs/react');
assert.equal(typeof react.Can, 'function', 'rbac-fs/react should export <Can>');
assert.equal(typeof react.usePermission, 'function', 'rbac-fs/react should export usePermission');

const vue = await import('rbac-fs/vue');
assert.equal(typeof vue.createRbacPlugin, 'function', 'rbac-fs/vue should export createRbacPlugin');

const angular = await import('rbac-fs/angular');
assert.equal(typeof angular.RbacService, 'function', 'rbac-fs/angular should export RbacService');

const svelte = await import('rbac-fs/svelte');
assert.equal(typeof svelte.createCanAction, 'function', 'rbac-fs/svelte should export createCanAction');

console.log('rbac-fs is installed correctly — every documented export/subpath resolves.');
