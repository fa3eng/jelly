import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolRegistry } from '@jelly/agent-runtime';
import { describe, expect, it } from 'vitest';
import { createProjectDocTools } from './project-docs';

describe('Project document tools', () => {
  it('observes filesystem changes and rejects paths or symlinks outside the configured directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jelly-doc-tools-'));
    const docs = join(root, 'docs');
    await mkdir(join(docs, 'nested'), { recursive: true });
    try {
      const tools = createToolRegistry(await createProjectDocTools(docs));
      const invoke = (path: string) => tools.execute('read_project_doc', JSON.stringify({ path }));
      expect(await tools.execute('list_project_docs', '{}')).toEqual({ ok: true, data: [] });
      await writeFile(join(docs, 'nested/note.md'), 'first');
      expect(await tools.execute('list_project_docs', '{}')).toEqual({
        ok: true,
        data: ['nested/note.md'],
      });
      await writeFile(join(docs, 'nested/note.md'), 'updated');
      expect(await invoke('nested/note.md')).toEqual({
        ok: true,
        data: { path: 'nested/note.md', content: 'updated', revision: expect.any(String) },
      });
      await writeFile(join(root, 'outside.md'), 'outside');
      await symlink(join(root, 'outside.md'), join(docs, 'link.md'));
      expect(await invoke('../outside.md')).toMatchObject({ ok: false });
      expect(await invoke('link.md')).toMatchObject({ ok: false });
      await rm(join(docs, 'nested/note.md'));
      expect(await tools.execute('list_project_docs', '{}')).toEqual({ ok: true, data: [] });
      expect(await invoke('nested/note.md')).toMatchObject({ ok: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
