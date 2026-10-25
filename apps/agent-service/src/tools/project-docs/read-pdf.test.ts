import { mkdtemp, mkdir, open, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolRegistry } from '@jelly/agent-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectDocTools } from './project-docs';
import { makePdf } from './test-fixtures/pdf';
import { readPdfFile } from './pdf-reader';

describe('PDF tool through the registry', () => {
  let root: string;
  let docs: string;
  let tools: ReturnType<typeof createToolRegistry>;
  const invoke = (input: unknown) => tools.execute('read_pdf', JSON.stringify(input));
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jelly-pdf-'));
    docs = join(root, 'docs');
    await mkdir(docs);
    tools = createToolRegistry(await createProjectDocTools(docs));
    await writeFile(
      join(docs, 'lesson.pdf'),
      makePdf([
        'First page',
        'Second page',
        'Third page',
        'Fourth page',
        'Fifth page',
        'Sixth page',
      ]),
    );
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('discovers PDFs with Markdown and returns the first five numbered pages by default', async () => {
    await writeFile(join(docs, 'note.md'), '# Note');
    await writeFile(join(docs, 'skip.txt'), 'skip');
    expect(await tools.execute('list_project_docs', '{}')).toEqual({
      ok: true,
      data: ['lesson.pdf', 'note.md'],
    });
    expect(await invoke({ path: 'lesson.pdf' })).toMatchObject({
      ok: true,
      data: {
        path: 'lesson.pdf',
        totalPages: 6,
        pages: [
          { page: 1, text: 'First page' },
          { page: 2, text: 'Second page' },
          { page: 3, text: 'Third page' },
          { page: 4, text: 'Fourth page' },
          { page: 5, text: 'Fifth page' },
        ],
      },
    });
  });

  it('reads only the requested physical pages and clamps a default range at the end', async () => {
    expect(await invoke({ path: 'lesson.pdf', startPage: 2, endPage: 3 })).toMatchObject({
      ok: true,
      data: {
        totalPages: 6,
        pages: [
          { page: 2, text: 'Second page' },
          { page: 3, text: 'Third page' },
        ],
      },
    });
    expect(await invoke({ path: 'lesson.pdf', startPage: 6 })).toMatchObject({
      ok: true,
      data: { pages: [{ page: 6, text: 'Sixth page' }] },
    });
  });

  it('extracts Chinese text and identifies a page with no extractable text', async () => {
    await writeFile(join(docs, 'chinese.pdf'), makePdf(['学习资料', null]));
    expect(await invoke({ path: 'chinese.pdf' })).toMatchObject({
      ok: true,
      data: {
        pages: [
          { page: 1, text: '学习资料', noText: false },
          { page: 2, text: '', noText: true },
        ],
        warnings: expect.arrayContaining([expect.stringMatching(/OCR/)]),
      },
    });
  });

  it.each([
    { startPage: 0 },
    { startPage: 1.5 },
    { startPage: 4, endPage: 2 },
    { startPage: 1, endPage: 11 },
    { startPage: 7 },
    { endPage: 7 },
  ])('rejects invalid or unavailable page ranges: %j', async (range) => {
    expect(await invoke({ path: 'lesson.pdf', ...range })).toMatchObject({ ok: false });
  });

  it.each(['../outside.pdf', 'escape/outside.pdf', 'link.pdf', 'note.md'])(
    'rejects unsafe or non-PDF paths: %s',
    async (path) => {
      await writeFile(join(root, 'outside.pdf'), makePdf(['Outside']));
      await symlink(root, join(docs, 'escape'));
      await symlink(join(root, 'outside.pdf'), join(docs, 'link.pdf'));
      await writeFile(join(docs, 'note.md'), makePdf(['not a PDF path']));
      expect(await invoke({ path })).toMatchObject({ ok: false });
    },
  );

  it('rejects an absolute path even when it points to an otherwise valid PDF', async () => {
    expect(await invoke({ path: join(docs, 'lesson.pdf') })).toMatchObject({ ok: false });
  });

  it('reports missing, malformed and oversized files without altering the originals', async () => {
    await writeFile(join(docs, 'broken.pdf'), 'not a PDF');
    await writeFile(join(docs, 'huge.pdf'), Buffer.alloc(20 * 1024 * 1024 + 1));
    expect(await invoke({ path: 'missing.pdf' })).toMatchObject({ ok: false });
    expect(await invoke({ path: 'broken.pdf' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/损坏|解析/),
    });
    expect(await invoke({ path: 'huge.pdf' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/20 MiB/),
    });
    expect(await readFile(join(docs, 'broken.pdf'), 'utf8')).toBe('not a PDF');
    expect(await invoke({ path: 'lesson.pdf', startPage: 1, endPage: 1 })).toMatchObject({
      ok: true,
    });
  });

  it('reports password-protected PDFs without requesting or logging a password', async () => {
    const encrypted = await readFile(new URL('./test-fixtures/encrypted.pdf', import.meta.url));
    await writeFile(join(docs, 'encrypted.pdf'), encrypted);
    expect(await invoke({ path: 'encrypted.pdf' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/加密|密码/),
    });
    expect(await invoke({ path: 'lesson.pdf', endPage: 1 })).toMatchObject({ ok: true });
  });

  it('allows a ten-page range while keeping cancellation scoped to one call', async () => {
    await writeFile(
      join(docs, 'long.pdf'),
      makePdf(Array.from({ length: 12 }, (_, index) => `Page ${index + 1}`)),
    );
    const controller = new AbortController();
    const cancelled = readPdfFile(docs, { path: 'long.pdf' }, controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(cancelled).rejects.toThrow('cancelled');
    const result = await invoke({ path: 'long.pdf', startPage: 2, endPage: 11 });
    expect(result).toMatchObject({
      ok: true,
      data: {
        totalPages: 12,
        pages: expect.arrayContaining([
          { page: 11, text: 'Page 11', noText: false, truncated: false },
        ]),
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect((result.data as { pages: unknown[] }).pages).toHaveLength(10);
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a FIFO named .pdf without waiting for a writer',
    async () => {
      const pipe = join(docs, 'pipe.pdf');
      execFileSync('mkfifo', [pipe]);
      const pending = invoke({ path: 'pipe.pdf' });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          pending,
          new Promise<string>((resolve) => {
            timeout = setTimeout(() => resolve('timed out'), 200);
          }),
        ]);
        expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/普通文件/) });
      } finally {
        clearTimeout(timeout);
        // 即使回归出现阻塞，也用非阻塞双向打开释放被测读端，避免测试进程挂起。
        const unblock = await open(pipe, constants.O_RDWR | constants.O_NONBLOCK);
        await pending;
        await unblock.close();
      }
    },
  );

  it('caps text output and marks the partially returned page explicitly', async () => {
    await writeFile(join(docs, 'dense.pdf'), makePdf(['x'.repeat(70_000)]));
    const result = await invoke({ path: 'dense.pdf' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const data = result.data as {
      pages: { text: string; truncated: boolean }[];
      warnings: string[];
    };
    expect(data.pages[0].text).toHaveLength(60_000);
    expect(data.pages[0].truncated).toBe(true);
    expect(data.warnings.join(' ')).toMatch(/截断/);
  });
});
