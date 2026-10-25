export interface ServiceConfig {
  host: '127.0.0.1';
  port: number;
  token: string;
  allowedOrigin: string;
}

export function loadServiceConfig(env: Record<string, string | undefined>): ServiceConfig {
  const rawPort = env.AULA_SERVER_PORT ?? '';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('AULA_SERVER_PORT must be a valid TCP port');
  }

  const host = env.AULA_SERVER_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Agent Service must bind to 127.0.0.1');

  const token = env.AULA_SERVER_TOKEN;
  const allowedOrigin = env.AULA_ALLOWED_ORIGIN;
  if (!token) throw new Error('AULA_SERVER_TOKEN is required');
  if (!allowedOrigin) throw new Error('AULA_ALLOWED_ORIGIN is required');

  return { host, port, token, allowedOrigin };
}
