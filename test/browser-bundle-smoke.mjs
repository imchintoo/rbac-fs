/**
 * §10 "Browser build smoke test: bundle with Vite/Webpack, assert no
 * fs/path node built-ins leak into the bundle" — using esbuild instead
 * (already a transitive tsup dependency, pinned as a direct devDependency;
 * same category of tool). See docs/backlog/adr-v0.4-browser-client.md.
 *
 * Bundles the already-BUILT dist/client/index.js (not src/) for a browser
 * platform target — that's what a real consumer's bundler would resolve —
 * and fails if the output references any Node-only built-in or our
 * Node-only dependency.
 */
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';

const result = await esbuild.build({
  entryPoints: ['dist/client/index.js'],
  bundle: true,
  platform: 'browser',
  write: false,
  format: 'esm',
  logLevel: 'silent',
});

const output = result.outputFiles.map((file) => file.text).join('\n');

const forbidden = ['node:fs', 'node:path', 'rotating-file-stream', 'require("fs")', "require('fs')", 'require("path")', "require('path')"];

const found = forbidden.filter((token) => output.includes(token));
assert.deepEqual(found, [], `browser bundle of rbac-fs/client leaked Node-only reference(s): ${found.join(', ')}`);

console.log(`browser bundle smoke test: OK (${output.length} bytes bundled via esbuild, zero fs/path/rotating-file-stream references)`);
