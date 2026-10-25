import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

import { defineTool } from '@jelly/agent-runtime';

/** 创建只列举普通 Markdown/PDF 文件的工具，不跟随子目录软链接。
 * @param docsDirectory - 配置的资料根目录；供 Agent 发现可读资料。
 */
export function createListProjectDocs(docsDirectory: string) {
  return defineTool({
    name: 'list_project_docs',
    description:
      '扫描配置资料目录，列出当前 Markdown 和 PDF 文件的相对路径，不返回正文。Markdown 用 read_project_doc 读取，PDF 用 read_pdf 读取。',
    inputSchema: z.strictObject({}),
    run: async (_, signal) => {
      const paths: string[] = [];

      async function walk(directory: string, prefix: string) {
        signal.throwIfAborted();

        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          signal.throwIfAborted();
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;

          if (entry.isDirectory()) await walk(resolve(directory, entry.name), path);
          else if (entry.isFile() && /\.(md|pdf)$/i.test(entry.name)) paths.push(path);
        }
      }

      await walk(docsDirectory, '');
      return paths.sort();
    },
  });
}
