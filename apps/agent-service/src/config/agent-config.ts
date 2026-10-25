import { isAbsolute } from 'node:path';
import { z } from 'zod';

const schema = z
  .object({
    apiKey: z.string().min(1),
    baseURL: z.url().optional(),
    model: z.string().min(1),
    proxyUrl: z.url({ protocol: /^https?$/ }).optional(),
    proxyCaPath: z.string().refine(isAbsolute, 'OPENAI_PROXY_CA_PATH 必须是绝对路径').optional(),
    reasoningEffort: z
      .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
    docsDirectory: z.string().refine(isAbsolute, 'AULA_DOCS_DIRECTORY 必须是绝对路径'),
    systemPrompt: z.string().min(1).optional(),
    sessionDirectory: z.string().refine(isAbsolute, 'AULA_SESSION_DIRECTORY 必须是绝对路径'),
  })
  .refine((config) => !config.proxyCaPath || !!config.proxyUrl, {
    path: ['proxyUrl'],
    message: '设置代理 CA 时必须同时设置 OPENAI_PROXY_URL',
  });

export function loadAgentConfig(env: Record<string, string | undefined>) {
  return schema.parse({
    apiKey: env.OPENAI_API_KEY ?? env.DEEPSEEK_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
    proxyUrl: env.OPENAI_PROXY_URL,
    proxyCaPath: env.OPENAI_PROXY_CA_PATH,
    reasoningEffort: env.OPENAI_REASONING_EFFORT,
    docsDirectory: env.AULA_DOCS_DIRECTORY,
    systemPrompt: env.AULA_SYSTEM_PROMPT,
    sessionDirectory: env.AULA_SESSION_DIRECTORY,
  });
}
