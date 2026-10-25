import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlStore } from '../session/jsonl-store';
import { createSessionManager } from '../session/session';

const appModulePromise = import('./app').catch(() => null);

describe('Agent Service health endpoints', () => {
  let directory: string;
  let sessions: ReturnType<typeof createSessionManager>;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aula-health-'));
    sessions = createSessionManager(await createJsonlStore(directory));
  });
  afterEach(async () => rm(directory, { recursive: true, force: true }));
  it('returns a minimal healthy status without exposing configuration', async () => {
    const appModule = await appModulePromise;
    expect(appModule).not.toBeNull();
    if (!appModule) return;

    const app = appModule.createApp({
      sessions,
      token: 'test-token',
      allowedOrigin: 'app://obsidian.md',
      generateStream: () => {
        throw new Error('Health check must not invoke the model');
      },
    });
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('requires the per-launch token and allowed Origin for readiness', async () => {
    const appModule = await appModulePromise;
    expect(appModule).not.toBeNull();
    if (!appModule) return;

    const app = appModule.createApp({
      sessions,
      token: 'test-token',
      allowedOrigin: 'app://obsidian.md',
      generateStream: () => {
        throw new Error('Health check must not invoke the model');
      },
    });
    const missingToken = await app.request('/health/ready', {
      headers: { Origin: 'app://obsidian.md' },
    });
    const wrongToken = await app.request('/health/ready', {
      headers: {
        Authorization: 'Bearer wrong-token',
        Origin: 'app://obsidian.md',
      },
    });
    const wrongOrigin = await app.request('/health/ready', {
      headers: {
        Authorization: 'Bearer test-token',
        Origin: 'https://untrusted.example',
      },
    });
    const ready = await app.request('/health/ready', {
      headers: {
        Authorization: 'Bearer test-token',
        Origin: 'app://obsidian.md',
      },
    });

    expect(missingToken.status).toBe(401);
    expect(wrongToken.status).toBe(401);
    expect(wrongOrigin.status).toBe(403);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready' });
  });
});
