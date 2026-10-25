import { defineTool } from '@jelly/agent-runtime';
import { z } from 'zod';
import type { DocumentFiles } from './document-files';

/**
 * 创建 Markdown 增改删工具，由 createProjectDocTools 注册给 Runtime。
 * @param files - 与读取工具共用的文件能力；负责范围、版本及同文件并发检查。
 * @returns 三个工具；不包含产品层预览或确认面板。
 */
export function createWriteProjectDocTools(files: DocumentFiles) {
  const path = z.string().min(1).describe('相对配置资料目录的 .md 路径，父目录须已存在');
  const revision = z
    .string()
    .min(1)
    .describe('最近一次 read_project_doc 返回的 revision，必须原样传入');
  return [
    defineTool({
      name: 'create_project_doc',
      description:
        '仅在用户明确要求保存或新建时创建 Markdown 文件。content 是完整正文；已有同名文件时报错，绝不覆盖。',
      inputSchema: z.strictObject({
        path,
        content: z.string().describe('新文件的完整 Markdown 正文'),
      }),
      run: ({ path, content }, signal) => files.create(path, content, signal),
    }),
    defineTool({
      name: 'edit_project_doc',
      description:
        '仅在用户明确要求修改时编辑 Markdown。先用 read_project_doc 读取并取得 revision；oldText 必须非空且唯一匹配，newText 是替换文本，可为空。版本过期或匹配失败时先重新读取，不盲目重试。',
      inputSchema: z.strictObject({
        path,
        revision,
        oldText: z.string().min(1).describe('待替换的完整原文片段，逐字匹配且只能出现一次'),
        newText: z.string().describe('替换后的文字；空字符串表示删除该片段'),
      }),
      run: (input, signal) => files.edit(input, signal),
    }),
    defineTool({
      name: 'delete_project_doc',
      description:
        '仅在用户明确要求删除该文件时使用。先用 read_project_doc 取得 revision，核对版本后永久删除单个 Markdown 文件；不删除目录，也不批量删除。',
      inputSchema: z.strictObject({ path, revision }),
      run: ({ path, revision }, signal) => files.remove(path, revision, signal),
    }),
  ];
}
