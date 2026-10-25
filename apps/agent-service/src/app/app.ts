import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { RPCHandler } from '@orpc/server/fetch';

import { createRpcRouter, type GenerateText, type GenerateStream } from '../rpc/rpc';
import type { SessionManager } from '../session/session';

export interface AppOptions {
  token: string;
  allowedOrigin: string;
  generateText?: GenerateText;
  generateStream: GenerateStream;
  sessions: SessionManager;
}

export function createApp(options: AppOptions) {
  const app = new Hono();

  const generateStream = options.generateStream;
  const generateText: GenerateText =
    options.generateText ??
    (async (messages, requestOptions) => {
      let text = '';
      for await (const event of generateStream(messages, requestOptions)) {
        if (event.type === 'text-delta') text += event.delta;
      }
      return text;
    });

  const handler = new RPCHandler(createRpcRouter(generateText, generateStream, options.sessions));

  app.use(
    '/rpc/*',
    cors({
      origin: options.allowedOrigin,
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  app.use('/rpc/*', async (context, next) => {
    if (context.req.header('Origin') !== options.allowedOrigin) {
      return context.json({ error: 'Forbidden' }, 403);
    }

    await next();
  });
  app.use('/rpc/*', bearerAuth({ token: options.token }));

  app.all('/rpc/*', async (context) => {
    const { matched, response } = await handler.handle(context.req.raw, { prefix: '/rpc' });
    return matched ? context.newResponse(response.body, response) : context.notFound();
  });

  app.get('/health', (context) => context.json({ status: 'ok' }));

  app.options('/health/ready', (context) => {
    if (context.req.header('Origin') !== options.allowedOrigin) {
      return context.body(null, 403);
    }
    return context.body(null, 204, {
      'Access-Control-Allow-Origin': options.allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      Vary: 'Origin',
    });
  });

  app.get('/health/ready', (context) => {
    const origin = context.req.header('Origin');
    if (origin !== options.allowedOrigin) return context.json({ error: 'Forbidden' }, 403);
    if (context.req.header('Authorization') !== `Bearer ${options.token}`) {
      return context.json({ error: 'Unauthorized' }, 401, {
        'Access-Control-Allow-Origin': options.allowedOrigin,
        Vary: 'Origin',
      });
    }
    return context.json({ status: 'ready' }, 200, {
      'Access-Control-Allow-Origin': options.allowedOrigin,
      Vary: 'Origin',
    });
  });

  return app;
}
