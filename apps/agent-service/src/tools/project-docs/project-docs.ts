import { createDocumentFiles } from './document-files';
import { createWriteProjectDocTools } from './write-project-doc';
import { stat } from 'node:fs/promises';
import { createListProjectDocs } from './list-project-docs';
import { createReadProjectDoc } from './read-project-doc';
import { createReadPdf } from './read-pdf';

/** 注册配置资料目录内的 Markdown CRUD 与 PDF 读取工具，供 Service 注入 Runtime。
 * @param directory - 已存在的资料根目录；所有工具共享同一文件操作实例。
 */
export async function createProjectDocTools(directory: string) {
  if (!(await stat(directory)).isDirectory()) throw new Error('文档路径必须是目录');
  const files = createDocumentFiles(directory);
  return [
    createListProjectDocs(directory),
    createReadProjectDoc(directory, files),
    createReadPdf(directory),
    ...createWriteProjectDocTools(files),
  ];
}
