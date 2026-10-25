import { defineTool } from '@jelly/agent-runtime';
import { z } from 'zod';
import { readPdfFile } from './pdf-reader';

/**
 * 创建 PDF 读取工具，由 createProjectDocTools 注册给 Agent。
 * @param directory - 配置资料目录；与 Markdown 工具使用相同的范围。
 * @returns 只读工具，返回原始文字和页码，不调用模型或自动保存笔记。
 */
export function createReadPdf(directory: string) {
  return defineTool({
    name: 'read_pdf',
    description:
      '读取配置资料目录内 PDF 的指定页面文字。path 是相对路径，可先用 list_project_docs 找文件。页码从 1 开始，默认读取前 5 页，每次最多 10 页。返回总页数、逐页正文和警告；可继续按范围读取。没有文字或截断不能视为已读懂整页；不支持 OCR 和图片/图表理解。',
    inputSchema: z
      .strictObject({
        path: z.string().min(1).describe('相对配置资料目录的 .pdf 路径'),
        startPage: z.number().int().min(1).optional().describe('起始物理页码，包含该页，默认为 1'),
        endPage: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('结束物理页码，包含该页；默认从起始页读 5 页，不足则读到末页'),
      })
      .refine(
        ({ startPage = 1, endPage }) =>
          endPage === undefined || (endPage >= startPage && endPage - startPage < 10),
        '页码范围必须递增，每次最多读取 10 页',
      ),
    run: (input, signal) => readPdfFile(directory, input, signal),
  });
}
