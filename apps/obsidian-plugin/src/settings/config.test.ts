import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readSettings, serviceEnvironment } from './config';

describe('user configuration', () => {
  it('persists only the endpoint and model, never a legacy plain-text key', () => {
    expect(
      readSettings({
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-flash',
        apiKey: 'private-key',
      }),
    ).toEqual({ baseURL: 'https://api.deepseek.com', model: 'deepseek-flash' });
  });

  it('uses DeepSeek defaults for a fresh install', () => {
    expect(readSettings(null)).toEqual({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-flash',
    });
  });

  it('derives directories from the active vault and clears inherited advanced options', () => {
    const vault = join(process.cwd(), 'vault with spaces');
    const env = serviceEnvironment(
      { baseURL: ' https://api.deepseek.com/ ', model: ' deepseek-flash ' },
      ' local-key ',
      vault,
    );
    expect(env.OPENAI_API_KEY).toBe('local-key');
    expect(env.OPENAI_BASE_URL).toBe('https://api.deepseek.com');
    expect(env.OPENAI_MODEL).toBe('deepseek-flash');
    expect(env.JELLY_DOCS_DIRECTORY).toBe(vault);
    expect(env.JELLY_SESSION_DIRECTORY).toBe(join(vault, '.jelly', 'sessions'));
    expect(env.OPENAI_PROXY_URL).toBeUndefined();
    expect(env.OPENAI_PROXY_CA_PATH).toBeUndefined();
    expect(env.JELLY_SYSTEM_PROMPT).toBeUndefined();
  });

  it.each([
    [{ baseURL: 'file:///etc', model: 'x' }, 'key', 'API 地址'],
    [{ baseURL: 'bad', model: 'x' }, 'key', 'API 地址'],
    [{ baseURL: 'https://api.deepseek.com', model: ' ' }, 'key', '模型名称'],
    [{ baseURL: 'https://api.deepseek.com', model: 'x' }, ' ', 'API Key'],
  ])('rejects invalid configuration before launching a service', (settings, key, field) => {
    expect(() =>
      serviceEnvironment(
        settings as { baseURL: string; model: string },
        key as string,
        process.cwd(),
      ),
    ).toThrow(field as string);
  });
});
