import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const licenses = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8' }),
);
const packages = Object.values(licenses)
  .flat()
  .filter((p) => !p.name.startsWith('@jelly/'))
  .sort((a, b) => a.name.localeCompare(b.name));
let output =
  '# Third-party notices\n\nJelly includes the following production dependencies. Each retains its own license.\n';
for (const dependency of packages) {
  const directory = dependency.paths[0];
  const names = (await readdir(directory))
    .filter((name) => /^(licen[cs]e|copying|notice)(?:[.-]|$)/i.test(name))
    .sort();
  if (!names.length) {
    const vendored = await readFile(
      `licenses/${dependency.name.replaceAll('/', '-')}.LICENSE`,
      'utf8',
    );
    output += `\n## ${dependency.name} ${dependency.versions.join(', ')} (${dependency.license})\n\n${vendored}\n`;
    continue;
  }
  output += `\n## ${dependency.name} ${dependency.versions.join(', ')} (${dependency.license})\n`;
  for (const name of names)
    output += `\n### ${name}\n\n${await readFile(join(directory, name), 'utf8')}\n`;
  if (dependency.name === 'unpdf') {
    const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const version = metadata.devDependencies['pdfjs-dist'].replace(/^[~^]/, '');
    const license = await readFile(`licenses/pdfjs-dist-${version}.LICENSE`, 'utf8');
    const notice = await readFile(`licenses/pdfjs-dist-${version}.NOTICE`, 'utf8').catch(() => '');
    output += `\n### Bundled PDF.js ${version} (Apache-2.0)\n\n${license}\n${notice}\n`;
  }
}
await writeFile('THIRD_PARTY_NOTICES.md', output);
console.log(`Prepared notices for ${packages.length} production dependencies.`);
