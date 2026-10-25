import { describe, expect, it } from 'vitest';

const configModulePromise = import('./config').catch(() => null);

describe('Agent Service configuration', () => {
  it('binds only to loopback and rejects an unsafe host override', async () => {
    const configModule = await configModulePromise;
    expect(configModule).not.toBeNull();
    if (!configModule) return;

    expect(
      configModule.loadServiceConfig({
        AULA_SERVER_PORT: '43127',
        AULA_SERVER_TOKEN: 'test-token',
        AULA_ALLOWED_ORIGIN: 'app://obsidian.md',
      }),
    ).toEqual({
      host: '127.0.0.1',
      port: 43127,
      token: 'test-token',
      allowedOrigin: 'app://obsidian.md',
    });
    expect(() =>
      configModule.loadServiceConfig({
        AULA_SERVER_PORT: '43127',
        AULA_SERVER_TOKEN: 'test-token',
        AULA_ALLOWED_ORIGIN: 'app://obsidian.md',
        AULA_SERVER_HOST: '0.0.0.0',
      }),
    ).toThrow('Agent Service must bind to 127.0.0.1');

    expect(() =>
      configModule.loadServiceConfig({
        AULA_SERVER_PORT: '70000',
        AULA_SERVER_TOKEN: 'test-token',
        AULA_ALLOWED_ORIGIN: 'app://obsidian.md',
      }),
    ).toThrow('AULA_SERVER_PORT must be a valid TCP port');
  });
});
