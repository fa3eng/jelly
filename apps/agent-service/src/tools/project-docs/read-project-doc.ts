import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

import { defineTool } from '@aula/agent-runtime';

export function createReadProjectDoc(docsDirectory: string) {
  return defineTool({
    name: 'read_project_doc',
    description:
      '读取项目 docs 内指定 Markdown 文件的当前全文。path 是相对 docs 的路径，不知道路径时可先调用 list_project_docs。',
    inputSchema: z.strictObject({ path: z.string().min(1) }),

    run: async ({ path }, signal) => {
      // 文件列表是动态的；docsDirectory 定义这个工具的读取范围。
      if (isAbsolute(path)) throw new Error('请使用相对 docs 的路径');

      const root = await realpath(docsDirectory);
      const target = await realpath(resolve(root, path));
      const child = relative(root, target);

      if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
        throw new Error('文件必须位于 docs 目录内');
      }

      if (!target.toLowerCase().endsWith('.md')) throw new Error('请选择 Markdown 文件');

      const content = await readFile(target, { encoding: 'utf8', signal });
      return { path, content };
    },
  });
}
