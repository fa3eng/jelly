import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

export interface ServiceChild extends EventEmitter {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
}

export type StartAgentServiceOptions = {
  executable?: string;
  args?: string[];
  launch?: (environment: NodeJS.ProcessEnv) => ServiceChild;
  cwd?: string;
  allowedOrigin: string;
  environment?: NodeJS.ProcessEnv;
};

export interface AgentServiceHandle {
  baseUrl: string;
  authorizationToken: string;
  stop(): Promise<void>;
}

const START_ATTEMPTS = 3;
const READY_TIMEOUT_MS = 8_000;

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function waitForExit(child: ServiceChild, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const exited = () => {
      clearTimeout(timer);
      resolve();
    };
    let timer = setTimeout(() => {
      child.kill('SIGKILL');
      timer = setTimeout(() => {
        child.removeListener('exit', exited);
        reject(new Error('Agent Service did not exit after forced shutdown'));
      }, 1_000);
    }, timeoutMs);
    child.once('exit', exited);
  });
}

async function stopChild(child: ServiceChild): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await waitForExit(child, 2_000);
}

export async function startAgentService(
  options: StartAgentServiceOptions,
): Promise<AgentServiceHandle> {
  let lastError: unknown;

  for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
    const port = await reservePort();
    const token = randomBytes(32).toString('hex');
    const environment = Object.fromEntries(
      Object.entries({
        ...process.env,
        ...options.environment,
        JELLY_SERVER_HOST: '127.0.0.1',
        JELLY_SERVER_PORT: String(port),
        JELLY_SERVER_TOKEN: token,
        JELLY_ALLOWED_ORIGIN: options.allowedOrigin,
      }).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    if (!options.launch && !options.executable)
      throw new Error('Agent Service launcher is required');
    const child = options.launch
      ? options.launch(environment)
      : spawn(options.executable!, options.args ?? [], {
          cwd: options.cwd,
          env: environment,
          stdio: 'ignore',
        });
    const baseUrl = `http://127.0.0.1:${port}`;
    let spawnError: Error | undefined;
    child.once('error', (error: unknown) => {
      spawnError = error instanceof Error ? error : new Error('Agent Service spawn failed');
    });
    let exited = false;
    child.once('exit', (code, signal) => {
      exited = true;
      if (code !== 0 && code !== null)
        lastError = new Error(`Agent Service exited with code ${code}`);
      else if (signal) lastError = new Error(`Agent Service exited with signal ${signal}`);
    });

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (spawnError) {
        await stopChild(child);
        throw new Error(`Could not start Agent Service: ${spawnError.message}`);
      }
      if (exited) break;
      try {
        const response = await fetch(`${baseUrl}/health/ready`, {
          headers: { Authorization: `Bearer ${token}`, Origin: options.allowedOrigin },
          signal: AbortSignal.timeout(500),
        });
        if (response.ok) {
          let stopped = false;
          return {
            baseUrl,
            authorizationToken: token,
            stop: async () => {
              if (stopped) return;
              stopped = true;
              await stopChild(child);
            },
          };
        }
      } catch {
        // The service may still be binding its loopback port.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await stopChild(child);
    lastError ??= new Error('Agent Service did not become ready in time');
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(
    `Agent Service exited before becoming ready after ${START_ATTEMPTS} attempts${detail}`,
  );
}
