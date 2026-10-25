import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

assert.ok(process.env.npm_execpath, 'Run this check through pnpm build:verify');
const files = [
  'apps/agent-service/dist/agent-service.mjs',
  ...['main.js', 'styles.css', 'manifest.json'].map((file) => `apps/obsidian-plugin/dist/${file}`),
];
let reference;
for (const mode of ['production', 'test', 'development']) {
  execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: mode },
  });
  const hashes = files.map((file) => createHash('sha256').update(readFileSync(file)).digest('hex'));
  reference ??= hashes;
  assert.deepEqual(hashes, reference, `Release output changed with NODE_ENV=${mode}`);
}
console.log('Release files are identical under production, test and development environments.');
