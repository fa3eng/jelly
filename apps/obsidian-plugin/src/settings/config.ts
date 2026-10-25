import { join } from 'node:path';

export interface JellySettings {
  baseURL: string;
  model: string;
}

export const API_KEY_SECRET = 'jelly-api-key';

/** 普通配置采用白名单读取，密钥不进入 data.json。 */
export function readSettings(data: unknown): JellySettings {
  const value = data as Partial<JellySettings> | null;
  return {
    baseURL: typeof value?.baseURL === 'string' ? value.baseURL : 'https://api.deepseek.com',
    model: typeof value?.model === 'string' ? value.model : 'deepseek-flash',
  };
}

export function serviceEnvironment(
  settings: JellySettings,
  apiKey: string,
  vault: string,
): NodeJS.ProcessEnv {
  const key = apiKey.trim();
  if (!key) throw new Error('请填写 API Key');
  let url: URL;
  try {
    url = new URL(settings.baseURL.trim());
  } catch {
    throw new Error('请输入有效的 API 地址');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('API 地址应为 HTTP 或 HTTPS 服务地址，不包含凭据、查询参数或片段');
  }
  const model = settings.model.trim();
  if (!model) throw new Error('请填写模型名称');
  return {
    OPENAI_API_KEY: key,
    OPENAI_BASE_URL: url.href.replace(/\/+$/, ''),
    OPENAI_MODEL: model,
    JELLY_DOCS_DIRECTORY: vault,
    JELLY_SESSION_DIRECTORY: join(vault, '.jelly', 'sessions'),
    DEEPSEEK_API_KEY: undefined,
    OPENAI_PROXY_URL: undefined,
    OPENAI_PROXY_CA_PATH: undefined,
    OPENAI_REASONING_EFFORT: undefined,
    JELLY_SYSTEM_PROMPT: undefined,
  };
}
