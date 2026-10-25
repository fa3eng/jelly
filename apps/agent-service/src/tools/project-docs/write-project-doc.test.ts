import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolRegistry } from '@aula/agent-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectDocTools } from './project-docs';
import { createDocumentFiles } from './document-files';

describe('Markdown CRUD through the tool registry', () => {
  let root: string;
  let docs: string;
  let tools: ReturnType<typeof createToolRegistry>;
  const invoke = (name: string, input: unknown) => tools.execute(name, JSON.stringify(input));
  const read = async (path = 'note.md') => {
    const result = await invoke('read_project_doc', { path });
    if (!result.ok) throw new Error(result.error);
    return result.data as { content: string; revision: string };
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'aula-crud-'));
    docs = join(root, 'docs');
    await mkdir(join(docs, 'nested'), { recursive: true });
    tools = createToolRegistry(await createProjectDocTools(docs));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a Markdown file readable and discoverable by existing tools, without overwriting', async () => {
    expect(
      await invoke('create_project_doc', { path: 'nested/new.md', content: '# 新笔记\n' }),
    ).toMatchObject({ ok: true, data: { path: 'nested/new.md', revision: expect.any(String) } });
    expect(await read('nested/new.md')).toMatchObject({ content: '# 新笔记\n' });
    expect(await invoke('list_project_docs', {})).toEqual({ ok: true, data: ['nested/new.md'] });
    expect(
      await invoke('create_project_doc', { path: 'nested/new.md', content: 'overwrite' }),
    ).toMatchObject({ ok: false });
    expect(await readFile(join(docs, 'nested/new.md'), 'utf8')).toBe('# 新笔记\n');
  });

  it('edits exactly one literal fragment and rejects a stale read revision', async () => {
    await writeFile(join(docs, 'note.md'), '# Note\nrough $& text\nrest');
    const { revision } = await read();
    expect(revision).toEqual(expect.any(String));
    expect(
      await invoke('edit_project_doc', {
        path: 'note.md',
        revision,
        oldText: 'rough $& text',
        newText: 'clean $& text',
      }),
    ).toMatchObject({ ok: true, data: { revision: expect.any(String) } });
    expect(await readFile(join(docs, 'note.md'), 'utf8')).toBe('# Note\nclean $& text\nrest');
    expect(
      await invoke('edit_project_doc', {
        path: 'note.md',
        revision,
        oldText: 'rest',
        newText: 'lost',
      }),
    ).toMatchObject({ ok: false });
    expect(await readFile(join(docs, 'note.md'), 'utf8')).toBe('# Note\nclean $& text\nrest');
  });

  it.each(['missing', 'repeat', ''])(
    'rejects absent, ambiguous or empty original text: %s',
    async (oldText) => {
      await writeFile(join(docs, 'note.md'), 'repeat repeat');
      const { revision } = await read();
      expect(
        await invoke('edit_project_doc', {
          path: 'note.md',
          revision,
          oldText,
          newText: 'replacement',
        }),
      ).toMatchObject({ ok: false });
      expect(await readFile(join(docs, 'note.md'), 'utf8')).toBe('repeat repeat');
    },
  );

  it('deletes only the version that was read and returns a real missing-file error on retry', async () => {
    await writeFile(join(docs, 'note.md'), 'original');
    const stale = await read();
    await writeFile(join(docs, 'note.md'), 'user edit');
    expect(
      await invoke('delete_project_doc', { path: 'note.md', revision: stale.revision }),
    ).toMatchObject({ ok: false });
    expect(await readFile(join(docs, 'note.md'), 'utf8')).toBe('user edit');
    const current = await read();
    expect(
      await invoke('delete_project_doc', { path: 'note.md', revision: current.revision }),
    ).toEqual({ ok: true, data: { path: 'note.md', deleted: true } });
    await expect(readFile(join(docs, 'note.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      await invoke('delete_project_doc', { path: 'note.md', revision: current.revision }),
    ).toMatchObject({ ok: false });
  });

  it('serializes concurrent changes using the same revision so only one edit succeeds', async () => {
    await writeFile(join(docs, 'note.md'), 'original');
    const { revision } = await read();
    const results = await Promise.all(
      ['first', 'second'].map((newText) =>
        invoke('edit_project_doc', { path: 'note.md', revision, oldText: 'original', newText }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(['first', 'second']).toContain(await readFile(join(docs, 'note.md'), 'utf8'));
  });

  it('supports removing a fragment without deleting the file', async () => {
    await writeFile(join(docs, 'note.md'), 'keep\nremove\nend');
    const { revision } = await read();
    expect(
      await invoke('edit_project_doc', {
        path: 'note.md',
        revision,
        oldText: 'remove\n',
        newText: '',
      }),
    ).toMatchObject({ ok: true });
    expect(await readFile(join(docs, 'note.md'), 'utf8')).toBe('keep\nend');
    expect(await invoke('list_project_docs', {})).toEqual({ ok: true, data: ['note.md'] });
  });

  it('does not mutate files for already cancelled operations and releases the file lock', async () => {
    const files = createDocumentFiles(docs);
    await writeFile(join(docs, 'note.md'), 'original');
    const { revision } = await read();
    const signal = AbortSignal.abort(new Error('cancelled'));
    await expect(files.create('new.md', 'new', signal)).rejects.toThrow('cancelled');
    await expect(
      files.edit({ path: 'note.md', revision, oldText: 'original', newText: 'changed' }, signal),
    ).rejects.toBeDefined();
    await expect(files.remove('note.md', revision, signal)).rejects.toBeDefined();
    await expect(readFile(join(docs, 'new.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(docs, 'note.md'), 'utf8')).toBe('original');
    expect(await files.read('note.md', new AbortController().signal)).toMatchObject({
      content: 'original',
    });
  });

  it.each(['../outside.md', '/absolute.md', 'file.txt', 'escape/new.md', 'link.md'])(
    'rejects unsafe mutation path %s without changing outside files',
    async (path) => {
      await writeFile(join(root, 'outside.md'), 'outside');
      await symlink(root, join(docs, 'escape'));
      await symlink(join(root, 'outside.md'), join(docs, 'link.md'));
      for (const name of ['create_project_doc', 'edit_project_doc', 'delete_project_doc']) {
        expect(
          await invoke(name, {
            path,
            ...(name === 'create_project_doc'
              ? { content: 'bad' }
              : name === 'edit_project_doc'
                ? { revision: 'invalid', oldText: 'outside', newText: 'bad' }
                : { revision: 'invalid' }),
          }),
        ).toMatchObject({ ok: false });
      }
      expect(await readFile(join(root, 'outside.md'), 'utf8')).toBe('outside');
      await expect(readFile(join(root, 'new.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
