import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
assert.equal(manifest.id, 'jelly');
assert.equal(manifest.name, 'Jelly');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.equal(manifest.isDesktopOnly, true);
if (process.argv[2])
  assert.equal(
    process.argv[2],
    manifest.version,
    'Release tag must match manifest version without a v prefix',
  );
const assets = ['main.js', 'manifest.json', 'styles.css'];
const input = 'apps/obsidian-plugin/dist';
assert.deepEqual((await readdir(input)).sort(), assets.slice().sort());
assert.deepEqual(JSON.parse(await readFile(`${input}/manifest.json`, 'utf8')), manifest);
const js = await readFile(`${input}/main.js`, 'utf8');
assert.ok(js.includes('Third-party notices'));
assert.ok(js.includes('Copyright (c) 2026 Jelly contributors'));
assert.ok(!/@aula\/|AULA_|aula-view/.test(js), 'Old runtime identifiers remain');
const release = resolve('dist/release');
await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
const stage = resolve('dist/package');
await rm(stage, { recursive: true, force: true });
await mkdir(`${stage}/jelly`, { recursive: true });
for (const file of assets) {
  await cp(`${input}/${file}`, `${release}/${file}`);
  await cp(`${input}/${file}`, `${stage}/jelly/${file}`);
}
const archive = `jelly-${manifest.version}.zip`;
await rm(`${release}/${archive}`, { force: true });
execFileSync('zip', ['-qr', `${release}/${archive}`, 'jelly'], { cwd: stage });
const sums = [];
for (const file of [...assets, archive])
  sums.push(
    `${createHash('sha256')
      .update(await readFile(`${release}/${file}`))
      .digest('hex')}  ${file}`,
  );
await writeFile(`${release}/SHA256SUMS.txt`, `${sums.join('\n')}\n`);
await cp('docs/release-notes.md', `${release}/release-notes.md`);
console.log(`Prepared Jelly ${manifest.version}: ${release}`);
