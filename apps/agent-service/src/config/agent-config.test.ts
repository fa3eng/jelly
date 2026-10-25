import { describe, expect, it } from 'vitest';
import { loadAgentConfig } from './agent-config';

const environment = {
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'test-model',
  JELLY_DOCS_DIRECTORY: '/tmp/docs',
  JELLY_SESSION_DIRECTORY: '/tmp/sessions',
};

describe('Agent proxy configuration', () => {
  it('loads an explicit proxy and its client-only CA path', () => {
    const config = loadAgentConfig({
      ...environment,
      OPENAI_PROXY_URL: 'http://127.0.0.1:9900',
      OPENAI_PROXY_CA_PATH: '/tmp/bifrost-ca.pem',
    });
    expect(config.proxyUrl).toBe('http://127.0.0.1:9900');
    expect(config.proxyCaPath).toBe('/tmp/bifrost-ca.pem');
  });

  it('rejects proxy protocols that the HTTP proxy transport cannot use', () => {
    expect(() =>
      loadAgentConfig({ ...environment, OPENAI_PROXY_URL: 'file:///tmp/proxy' }),
    ).toThrow();
  });

  it('rejects a CA configuration without a proxy instead of silently ignoring it', () => {
    expect(() =>
      loadAgentConfig({ ...environment, OPENAI_PROXY_CA_PATH: '/tmp/bifrost-ca.pem' }),
    ).toThrow();
  });
});
