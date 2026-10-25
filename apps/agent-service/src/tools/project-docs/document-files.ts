import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** 返回正文的内容版本；供读取结果及后续修改、删除的乐观校验使用。 */
function revisionOf(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 创建配置资料目录的文件操作能力；供 Markdown 工具调用，不依赖 Obsidian。
 * @param directory - 已存在的资料根目录；不自动创建目录。
 * @returns 带路径检查和同文件串行保护的读、新建、修改、删除操作。
 */
export function createDocumentFiles(directory: string) {
  const locks = new Map<string, Promise<void>>();

  /** 检查规范化路径是否仍在资料根目录中，阻止 ../ 和目录软链接越界。 */
  function assertInside(root: string, target: string) {
    const child = relative(root, target);
    if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      throw new Error('文件必须位于资料目录内');
    }
  }

  /**
   * 将相对 Markdown 路径转换为根目录内的真实父目录路径。
   * @param path - 模型提供的相对路径；父目录必须存在。
   * @returns 用于锁和实际文件操作的规范路径；最终文件禁止为软链接。
   */
  async function resolvePath(path: string) {
    if (isAbsolute(path)) throw new Error('请使用相对资料目录的路径');
    if (!path.toLowerCase().endsWith('.md')) throw new Error('请选择 Markdown 文件');
    const root = await realpath(directory);
    const requested = resolve(root, path);
    assertInside(root, requested);
    const target = resolve(await realpath(dirname(requested)), basename(requested));
    assertInside(root, target);
    return target;
  }

  /**
   * 同一工具集合内，同文件的检查与修改串行执行；失败后仍释放锁。
   * @param path - 相对 Markdown 路径。
   * @param action - 持锁后执行的文件操作；signal 由各操作检查。
   * @returns 本次操作的真实结果，错误交给 defineTool 转换为工具失败。
   */
  async function withFile<T>(path: string, action: (target: string) => Promise<T>) {
    const target = await resolvePath(path);
    while (locks.has(target)) await locks.get(target);
    let release!: () => void;
    locks.set(
      target,
      new Promise<void>((resolveLock) => {
        release = resolveLock;
      }),
    );
    try {
      const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (info && !info.isFile()) throw new Error('目标必须是普通文件，不支持软链接');
      return await action(target);
    } finally {
      locks.delete(target);
      release();
    }
  }

  /** 核对调用方从 read_project_doc 取得的内容版本；不匹配时不修改文件。 */
  async function readVersion(target: string, revision: string, signal: AbortSignal) {
    const content = await readFile(target, { encoding: 'utf8', signal });
    if (revisionOf(content) !== revision) throw new Error('文件已变化，请重新读取后再操作');
    return content;
  }

  return {
    /** @param path - 相对路径。 @param signal - 取消信号。 @returns 当前全文及内容版本。 */
    read: (path: string, signal: AbortSignal) =>
      withFile(path, async (target) => {
        const content = await readFile(target, { encoding: 'utf8', signal });
        return { path, content, revision: revisionOf(content) };
      }),

    /** @param path - 新文件路径。 @param content - Markdown 全文。 @param signal - 取消信号。 */
    create: (path: string, content: string, signal: AbortSignal) =>
      withFile(path, async (target) => {
        signal.throwIfAborted();
        await writeFile(target, content, { encoding: 'utf8', flag: 'wx', signal });
        return { path, revision: revisionOf(content) };
      }),

    /**
     * 替换唯一匹配的原文，先写同目录临时文件，再 rename，避免半写正文。
     * @param input - 相对路径、读取版本、非空原文和替换文本（可为空）。
     * @param signal - 取消信号；提交 rename 前再次检查。
     * @returns 保存后的路径和内容版本；无需 Loop 重新组装消息。
     */
    edit: (
      input: { path: string; revision: string; oldText: string; newText: string },
      signal: AbortSignal,
    ) =>
      withFile(input.path, async (target) => {
        const content = await readVersion(target, input.revision, signal);
        const index = content.indexOf(input.oldText);
        if (!input.oldText || index < 0 || content.indexOf(input.oldText, index + 1) >= 0) {
          throw new Error('oldText 必须在文件中唯一匹配，请重新读取并提供更完整的原文');
        }
        const updated =
          content.slice(0, index) + input.newText + content.slice(index + input.oldText.length);
        const temporary = resolve(dirname(target), `.jelly-${randomUUID()}.tmp`);
        const info = await lstat(target);
        try {
          await writeFile(temporary, updated, {
            encoding: 'utf8',
            flag: 'wx',
            mode: info.mode,
            signal,
          });
          // 用户可能在写临时文件期间编辑；提交前再次核对已读取的版本。
          await readVersion(target, input.revision, signal);
          signal.throwIfAborted();
          await rename(temporary, target);
        } finally {
          await rm(temporary, { force: true });
        }
        return { path: input.path, revision: revisionOf(updated) };
      }),

    /** @param path - 要删除的文件。 @param revision - 读取时的版本。 @param signal - 取消信号。 */
    remove: (path: string, revision: string, signal: AbortSignal) =>
      withFile(path, async (target) => {
        await readVersion(target, revision, signal);
        signal.throwIfAborted();
        await unlink(target);
        return { path, deleted: true };
      }),
  };
}

export type DocumentFiles = ReturnType<typeof createDocumentFiles>;
