import { lstat, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SkillDescriptor } from './skill';
import { fileStamp, readSkillFile, resolveSkillFile } from './skill-files';

export interface SkillCatalog {
  skills: SkillDescriptor[];
  diagnostics: { path: string; message: string }[];
}

/** Reconcile a one-level directory; metadata is cached, instruction bodies are not. */
export async function discoverSkills(
  directory: string,
  previous?: SkillCatalog,
): Promise<SkillCatalog> {
  const catalog: SkillCatalog = { skills: [], diagnostics: [] };
  const cached = new Map(previous?.skills.map((skill) => [skill.name, skill]));
  const diagnose = (path: string, error: unknown) => {
    catalog.diagnostics.push({
      path,
      message: error instanceof Error ? error.message : String(error),
    });
  };
  try {
    const requested = resolve(directory);
    const info = await lstat(requested).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!info) return catalog;
    if (!info.isDirectory()) throw new Error('Skill 根目录必须是普通目录，不支持软链接');
    const root = await realpath(requested);
    const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        diagnose(join(root, entry.name), new Error('Skill 目录不支持软链接'));
        continue;
      }
      if (!entry.isDirectory()) continue;
      const path = join(root, entry.name, 'SKILL.md');
      try {
        const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        if (!info) continue;
        const resolved = await resolveSkillFile(root, entry.name);
        let descriptor = cached.get(entry.name);
        if (
          !descriptor ||
          descriptor.path !== resolved.path ||
          descriptor.stamp !== fileStamp(resolved.info)
        ) {
          const { skill, warnings, path, revision, stamp } = await readSkillFile(root, entry.name);
          descriptor = {
            name: skill.name,
            description: skill.description,
            path,
            revision,
            stamp,
            warnings,
          };
        }
        catalog.skills.push({ ...descriptor, warnings: [...descriptor.warnings] });
        for (const warning of descriptor.warnings) diagnose(path, new Error(warning));
      } catch (error) {
        diagnose(path, error);
      }
    }
  } catch (error) {
    diagnose(directory, error);
  }
  return catalog;
}
