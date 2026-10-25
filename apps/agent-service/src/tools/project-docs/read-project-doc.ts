import { z } from 'zod';
import { defineTool } from '@jelly/agent-runtime';
import { createDocumentFiles, type DocumentFiles } from './document-files';

/**
 * 创建资料读取工具，向模型返回当前全文和供修改、删除使用的 revision。
 * @param docsDirectory - 配置的资料根目录。
 * @param files - 由工具工厂注入的共享文件能力，独立使用时自动创建。
 */
export function createReadProjectDoc(
  docsDirectory: string,
  files: DocumentFiles = createDocumentFiles(docsDirectory),
) {
  return defineTool({
    name: 'read_project_doc',
    description:
      '读取配置资料目录内 Markdown 文件的当前全文及 revision。path 是相对路径，不知道路径时先调用 list_project_docs；修改或删除前先读取并原样使用返回的 revision。',
    inputSchema: z.strictObject({ path: z.string().min(1) }),
    run: ({ path }, signal) => files.read(path, signal),
  });
}
