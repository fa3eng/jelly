import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

import { defineTool } from '@aula/agent-runtime';

export function createListProjectDocs(docsDirectory: string) {
  return defineTool({
    name: 'list_project_docs',
    description:
      '扫描项目 docs 目录，列出当前 Markdown 文件的相对路径，不返回正文。查找有哪些文档时使用。',
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
          else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) paths.push(path);
        }
      }

      await walk(docsDirectory, '');
      return paths.sort();
    },
  });
}
