import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createApp } from './app/app.js';
import { loadServiceConfig } from './config/config.js';

import { loadAgentConfig } from './config/agent-config.js';
import { createAgentStream } from './agent/agent.js';

if (existsSync('.env')) loadEnvFile('.env');

const config = loadServiceConfig(process.env);

const generateStream = await createAgentStream(loadAgentConfig(process.env));
const app = createApp({ ...config, generateStream, sessions: generateStream.sessions });
const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port });

function shutdown(): void {
  server.close(() => {
    void generateStream.close().finally(() => process.exit(0));
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
