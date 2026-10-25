import { EventEmitter } from 'node:events';
import { dirname, join } from 'node:path';
import type { ServiceChild } from './process';

interface UtilityChild extends EventEmitter {
  readonly pid?: number;
  kill(): boolean;
}

export interface UtilityProcessModule {
  fork(
    entry: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'ignore'; serviceName: string },
  ): UtilityChild;
}

/** 将 Electron 独立进程适配到统一的 readiness、重试与停止流程。 */
export function createUtilityLauncher(utility: UtilityProcessModule, entry: string, cwd: string) {
  return (environment: NodeJS.ProcessEnv): ServiceChild => {
    const child = utility.fork(entry, [], {
      cwd,
      env: environment,
      stdio: 'ignore',
      serviceName: 'Jelly Agent Service',
    });
    const managed = new EventEmitter() as ServiceChild;
    managed.exitCode = null;
    managed.signalCode = null;
    child.once('exit', (code: number) => {
      managed.exitCode = code ?? 1;
      managed.emit('exit', code, null);
    });
    child.once('error', (error: Error) => managed.emit('error', error));
    managed.kill = (signal = 'SIGTERM') => {
      if (managed.exitCode !== null) return false;
      const pid = signal === 'SIGKILL' ? child.pid : undefined;
      if (signal === 'SIGKILL' && pid) {
        try {
          return process.kill(pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          return false;
        }
      }
      return child.kill();
    };
    return managed;
  };
}

/** 宿主应用版本与 Electron 安装程序版本独立更新，需要单独检查 Node。 */
export function assertHostNodeVersion(version: string): void {
  const match = /^(\d+)\.(\d+)\./.exec(version);
  if (!match || Number(match[1]) < 20 || (Number(match[1]) === 20 && Number(match[2]) < 19)) {
    throw new Error('Agent Service 需要 Node 20.19 或更高版本，请更新 Obsidian 桌面版安装程序');
  }
}

/** 只在 Obsidian 桌面宿主中调用；不静默退回外部 Node。 */
export function getHostUtilityProcess(entry: string): UtilityProcessModule {
  assertHostNodeVersion(process.versions.node);
  const remote = require('@electron/remote') as {
    require(id: 'electron'): { utilityProcess?: UtilityProcessModule };
    require(id: string): unknown;
    getCurrentWebContents(): { id: number };
  };
  const utility = remote.require('electron').utilityProcess;
  if (!utility?.fork)
    throw new Error('当前 Obsidian 安装程序不支持独立 Agent 服务，请更新桌面版安装程序');
  const hostFork = remote.require(join(dirname(entry), 'host-launcher.cjs')) as (
    ownerId: number,
    ...args: Parameters<UtilityProcessModule['fork']>
  ) => UtilityChild;
  const ownerId = remote.getCurrentWebContents().id;
  return { fork: (...args) => hostFork(ownerId, ...args) };
}
