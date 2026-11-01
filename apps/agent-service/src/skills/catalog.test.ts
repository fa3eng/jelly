import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills } from './catalog';

const directories: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'jelly-skills-')));
  directories.push(root);
  return root;
}
async function skill(root: string, name: string, content: string) {
  await mkdir(join(root, name), { recursive: true });
  await writeFile(join(root, name, 'SKILL.md'), content);
}
const valid = '---\nname: organize-notes\ndescription: 整理笔记\n---\n保留原意。';
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Skill startup catalog', () => {
  it('parses multiline YAML and accepts standard optional fields without exposing bodies in metadata', async () => {
    const root = await fixture();
    await skill(
      root,
      'organize-notes',
      [
        '---',
        'name: organize-notes',
        'description: >-',
        '  整理口述',
        '  与笔记',
        'license: MIT',
        'compatibility: Jelly',
        'metadata:',
        '  author: example',
        '---',
        '# 整理笔记',
        '',
        '保留原意。',
      ].join('\r\n'),
    );
    const catalog = await discoverSkills(root);
    expect(catalog).toMatchObject({
      skills: [
        {
          name: 'organize-notes',
          description: '整理口述 与笔记',
          path: join(root, 'organize-notes', 'SKILL.md'),
          revision: expect.any(String),
        },
      ],
      diagnostics: [],
    });
    expect(catalog.skills[0]).not.toHaveProperty('instructions');
  });

  it('treats missing directories as empty but diagnoses an invalid root', async () => {
    const root = await fixture();
    expect(await discoverSkills(join(root, 'missing'))).toEqual({ skills: [], diagnostics: [] });
    await writeFile(join(root, 'file'), 'not a directory');
    expect((await discoverSkills(join(root, 'file'))).diagnostics).toHaveLength(1);
  });

  it.each([
    ['no-frontmatter', '# Plain Markdown'],
    ['bad-yaml', '---\nname: [\n---\nBody'],
    ['missing-description', '---\nname: missing-description\n---\nBody'],
    ['empty-description', '---\nname: empty-description\ndescription: " "\n---\nBody'],
    ['mismatch', valid],
    ['Bad-Name', '---\nname: Bad-Name\ndescription: test\n---\nBody'],
    ['double--dash', '---\nname: double--dash\ndescription: test\n---\nBody'],
    ['duplicate-key', '---\nname: duplicate-key\nname: other\ndescription: test\n---\nBody'],
  ])('isolates invalid %s from valid skills', async (name, content) => {
    const root = await fixture();
    await skill(root, name, content);
    await skill(root, 'organize-notes', valid);
    const catalog = await discoverSkills(root);
    expect(catalog.skills.map((entry) => entry.name)).toEqual(['organize-notes']);
    expect(catalog.diagnostics).toHaveLength(1);
    expect(catalog.diagnostics[0]?.path).toBe(join(root, name, 'SKILL.md'));
  });

  it('warns that allowed-tools is unsupported without rejecting valid instructions', async () => {
    const root = await fixture();
    await skill(
      root,
      'organize-notes',
      valid.replace('description:', 'allowed-tools: Read\ndescription:'),
    );
    const catalog = await discoverSkills(root);
    expect(catalog.skills).toHaveLength(1);
    expect(catalog.diagnostics[0]?.message).toContain('allowed-tools');
  });

  it('skips oversized files, nested skills and unrelated files', async () => {
    const root = await fixture();
    await skill(root, 'organize-notes', valid + '文'.repeat(30_000));
    await skill(join(root, 'nested'), 'organize-notes', valid);
    await writeFile(join(root, 'README.md'), valid);
    const catalog = await discoverSkills(root);
    expect(catalog.skills).toEqual([]);
    expect(catalog.diagnostics).toHaveLength(1);
  });

  it('never follows root, skill directory or SKILL.md symlinks', async () => {
    const root = await fixture();
    const external = await fixture();
    await skill(external, 'organize-notes', valid);
    await symlink(external, join(root, 'root-link'));
    expect((await discoverSkills(join(root, 'root-link'))).skills).toEqual([]);
    expect((await discoverSkills(`${join(root, 'root-link')}/`)).skills).toEqual([]);
    await symlink(join(external, 'organize-notes'), join(root, 'organize-notes'));
    expect((await discoverSkills(root)).skills).toEqual([]);
    const fileRoot = await fixture();
    await mkdir(join(fileRoot, 'organize-notes'));
    await symlink(
      join(external, 'organize-notes', 'SKILL.md'),
      join(fileRoot, 'organize-notes', 'SKILL.md'),
    );
    expect((await discoverSkills(fileRoot)).skills).toEqual([]);
  });

  it('does not preserve stale descriptors when files become invalid', async () => {
    const root = await fixture();
    await skill(root, 'organize-notes', valid);
    const catalog = await discoverSkills(root);
    await writeFile(join(root, 'organize-notes', 'SKILL.md'), 'changed');
    expect((await discoverSkills(root, catalog)).skills).toEqual([]);
  });
});
