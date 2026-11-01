import { parseDocument } from 'yaml';
import { z } from 'zod';

const metadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u),
  description: z
    .string()
    .min(1)
    .max(1024)
    .refine((value) => value.trim().length > 0),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});

export interface Skill {
  name: string;
  description: string;
  instructions: string;
}

export interface SkillDescriptor {
  name: string;
  description: string;
  path: string;
  revision: string;
  stamp: string;
  warnings: string[];
}

/** Parse the standard frontmatter, leaving Markdown instructions unchanged. */
export function parseSkill(source: string, directoryName: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(
    source.replace(/^\uFEFF/, ''),
  );
  if (!match) throw new Error('SKILL.md 必须以 YAML frontmatter 开头');
  const document = parseDocument(match[1]!);
  if (document.errors.length)
    throw new Error(document.errors.map((error) => error.message).join('; '));
  const metadata = metadataSchema.parse(document.toJS({ maxAliasCount: 0 }));
  if (metadata.name !== directoryName) throw new Error('name 必须与 Skill 目录名一致');
  return {
    skill: {
      name: metadata.name,
      description: metadata.description,
      instructions: match[2]!.trim(),
    } satisfies Skill,
    warnings:
      metadata['allowed-tools'] === undefined
        ? []
        : ['当前不执行 allowed-tools；Skill 不改变工具权限'],
  };
}
