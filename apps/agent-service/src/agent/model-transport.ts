import { readFile } from 'node:fs/promises';
import { fetch, ProxyAgent } from 'undici';
import type { ModelOptions } from '@jelly/agent-runtime';

export async function createModelTransport(options: {
  proxyUrl?: string;
  proxyCaPath?: string;
}): Promise<{
  client: Pick<ModelOptions['client'], 'fetch' | 'fetchOptions'>;
  close(): Promise<void>;
}> {
  if (!options.proxyUrl) return { client: {}, close: async () => {} };

  const ca = options.proxyCaPath ? await readFile(options.proxyCaPath, 'utf8') : undefined;
  const dispatcher = new ProxyAgent({
    uri: options.proxyUrl,
    // 只扩展这个代理客户端的信任，不关闭证书校验或修改系统信任。
    ...(ca ? { requestTls: { ca } } : {}),
  });

  return {
    client: {
      // SDK 与 undici 的 Web 类型声明不同；运行时使用同一套 fetch/dispatcher。
      fetch: fetch as unknown as NonNullable<ModelOptions['client']['fetch']>,
      fetchOptions: { dispatcher },
    },
    close: () => dispatcher.close(),
  };
}
