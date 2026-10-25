import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { getResolvedPDFJS } from 'unpdf';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 60_000;

export interface PdfReadInput {
  path: string;
  startPage?: number;
  endPage?: number;
}

/**
 * 在配置资料目录内读取普通 PDF 文件；最终文件不跟随软链接。
 * @param directory - 资料根目录，可由 Obsidian 或独立 Service 配置。
 * @param path - 相对资料目录的 .pdf 路径，不接受绝对路径或越界路径。
 * @param signal - 请求取消信号，读取前后及循环中检查。
 * @returns PDF 原始字节；只在本地解析，不上传文件。
 */
async function readPdfBytes(directory: string, path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (isAbsolute(path)) throw new Error('请使用相对资料目录的路径');
  if (!path.toLowerCase().endsWith('.pdf')) throw new Error('请选择 PDF 文件');
  const root = await realpath(directory);
  const requested = resolve(root, path);
  const target = resolve(await realpath(dirname(requested)), basename(requested));
  for (const candidate of [requested, target]) {
    const child = relative(root, candidate);
    if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      throw new Error('文件必须位于资料目录内');
    }
  }
  // 非阻塞打开后再 fstat，避免名为 .pdf 的 FIFO 等待写端而挂起。
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('PDF 目标必须是普通文件');
    if (info.size > MAX_FILE_BYTES) throw new Error('PDF 文件超过 20 MiB 上限');
    // 最多读取上限加一个字节，避免文件在 stat 后增长导致无界读取。
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= MAX_FILE_BYTES) {
      signal.throwIfAborted();
      const chunk = Buffer.alloc(Math.min(64 * 1024, MAX_FILE_BYTES + 1 - size));
      const { bytesRead } = await file.read(chunk);
      if (!bytesRead) break;
      chunks.push(chunk.subarray(0, bytesRead));
      size += bytesRead;
    }
    if (size > MAX_FILE_BYTES) throw new Error('PDF 文件超过 20 MiB 上限');
    signal.throwIfAborted();
    return new Uint8Array(Buffer.concat(chunks, size));
  } finally {
    await file.close();
  }
}

/**
 * 从本地 PDF 提取指定物理页的文字，供 read_pdf 工具消费。
 * @param directory - 配置的资料根目录。
 * @param input - 相对路径与从 1 开始的页码；默认从 startPage 起读 5 页，最多 10 页。
 * @param signal - 取消时销毁 PDF.js 加载任务；退出时始终释放解析资源。
 * @returns 总页数、实际返回的逐页文字和局限提示；不进行 OCR、摘要或持久化索引。
 */
export async function readPdfFile(directory: string, input: PdfReadInput, signal: AbortSignal) {
  const bytes = await readPdfBytes(directory, input.path, signal);
  const { getDocument } = await getResolvedPDFJS();
  signal.throwIfAborted();
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  // 统一持有 destroy Promise，取消和 finally 不会重复销毁任务。
  let destruction: Promise<void> | undefined;
  const destroy = () => (destruction ??= task.destroy());
  const abort = () => {
    void destroy().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    const pdf = await task.promise.catch((cause: unknown) => {
      signal.throwIfAborted();
      if (cause instanceof Error && cause.name === 'PasswordException') {
        throw new Error('PDF 已加密或需要密码，当前不支持读取');
      }
      throw new Error('PDF 解析失败，文件可能已损坏或不是有效 PDF', { cause });
    });
    signal.throwIfAborted();
    const startPage = input.startPage ?? 1;
    const endPage = input.endPage ?? Math.min(startPage + 4, pdf.numPages);
    if (
      !Number.isInteger(startPage) ||
      !Number.isInteger(endPage) ||
      startPage < 1 ||
      endPage < startPage ||
      endPage > pdf.numPages ||
      endPage - startPage >= 10
    ) {
      throw new Error(`页码范围无效：文档共 ${pdf.numPages} 页；页码从 1 开始，每次最多读取 10 页`);
    }
    const pages: { page: number; text: string; noText: boolean; truncated: boolean }[] = [];
    const warnings = [
      '仅提取 PDF 文字层；不包含图片理解、OCR 或可靠的表格与多栏排版还原。页码是 PDF 物理页码。',
    ];
    let remaining = MAX_TEXT_CHARACTERS;
    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        signal.throwIfAborted();
        // PDF.js 的文字块不等同于单词；保留原块文字，按 hasEOL 恢复换行。
        const text = content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
          .join('')
          .trim();
        const truncated = text.length > remaining;
        const returned = text.slice(0, remaining);
        pages.push({ page: pageNumber, text: returned, noText: text.length === 0, truncated });
        remaining -= returned.length;
        if (!text)
          warnings.push(
            `第 ${pageNumber} 页没有提取到文字，可能是空白页、扫描页或无法提取的文字；可能需要 OCR，不能认定页面没有内容。`,
          );
        if (truncated || (remaining === 0 && pageNumber < endPage)) {
          warnings.push(
            `返回正文达到 ${MAX_TEXT_CHARACTERS} 字符上限，内容已截断；未返回的页不代表已读取完毕。可缩小页码范围；单页仍截断时当前工具无法返回该页剩余文字。`,
          );
          break;
        }
      } finally {
        page.cleanup();
      }
    }
    signal.throwIfAborted();
    return { path: input.path, totalPages: pdf.numPages, pages, warnings };
  } finally {
    signal.removeEventListener('abort', abort);
    await destroy();
  }
}
