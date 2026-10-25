import { stat } from 'node:fs/promises';
import { createListProjectDocs } from './list-project-docs';
import { createReadProjectDoc } from './read-project-doc';

export async function createProjectDocTools(directory: string) {
  if (!(await stat(directory)).isDirectory()) throw new Error('文档路径必须是目录');
  return [createListProjectDocs(directory), createReadProjectDoc(directory)];
}
