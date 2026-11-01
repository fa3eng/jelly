import { constants, type Stats } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseSkill } from './skill';

const MAX_SKILL_BYTES = 64 * 1024;

export function fileStamp(info: Stats) {
  return [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':');
}

/** Resolve exactly one named skill without following the root, child or file link. */
export async function resolveSkillFile(directory: string, name: string) {
  if (!name || name === '.' || name === '..' || /[/\\]/.test(name))
    throw new Error('Skill 名称无效');
  const requested = resolve(directory);
  if (!(await lstat(requested)).isDirectory())
    throw new Error('Skill 根目录必须是普通目录，不支持软链接');
  const root = await realpath(requested);
  const child = join(root, name);
  if (!(await lstat(child)).isDirectory()) throw new Error('Skill 目录不支持软链接');
  const path = join(child, 'SKILL.md');
  const info = await lstat(path);
  if (!info.isFile()) throw new Error('SKILL.md 必须是普通文件，不支持软链接');
  const subpath = relative(root, await realpath(path));
  if (subpath === '..' || subpath.startsWith(`..${sep}`) || isAbsolute(subpath))
    throw new Error('Skill 文件越出配置目录');
  return { path, info };
}

/** Discovery hashes changed files but does not retain their instruction bodies. */
export async function readSkillFile(directory: string, name: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const { path } = await resolveSkillFile(directory, name);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('SKILL.md 必须是普通文件');
    if (info.size > MAX_SKILL_BYTES) throw new Error('SKILL.md 超过 64 KiB');
    const buffer = Buffer.alloc(MAX_SKILL_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    signal?.throwIfAborted();
    if (length > MAX_SKILL_BYTES) throw new Error('SKILL.md 超过 64 KiB');
    const bytes = buffer.subarray(0, length);
    const parsed = parseSkill(bytes.toString('utf8'), name);
    return {
      ...parsed,
      path,
      stamp: fileStamp(info),
      revision: createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    await handle.close();
  }
}
