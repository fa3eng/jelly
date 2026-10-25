import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const bootstrap = `import(require('node:url').pathToFileURL(require('node:path').join(__dirname, 'agent-service.mjs')).href).catch(() => {
  console.error('Agent Service failed to start');
  process.exit(1);
});
`;

// This module executes in Electron's main process so cleanup survives renderer reloads.
const hostLauncher = `const { utilityProcess, webContents } = require('electron');
module.exports = (ownerId, entry, args, options) => {
  const owner = webContents.fromId(ownerId);
  if (!owner || owner.isDestroyed?.()) throw new Error('Jelly owner window is unavailable');
  const child = utilityProcess.fork(entry, args, options);
  let timer;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    child.kill();
    timer = setTimeout(() => {
      if (child.pid) {
        try { process.kill(child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') console.error('Jelly child shutdown failed'); }
      }
    }, 2000);
    timer.unref();
  };
  const navigating = (details, _url, isInPlace, isMainFrame) => {
    if ((details.isMainFrame ?? isMainFrame) && !(details.isSameDocument ?? isInPlace)) stop();
  };
  owner.on('did-start-navigation', navigating);
  owner.once('destroyed', stop);
  owner.once('render-process-gone', stop);
  child.once('exit', () => {
    clearTimeout(timer);
    owner.removeListener('did-start-navigation', navigating);
    owner.removeListener('destroyed', stop);
    owner.removeListener('render-process-gone', stop);
  });
  return child;
};
`;

/** 从随插件交付的源码准备独立进程入口，不下载或安装外部依赖。 */
export async function prepareServiceBundle(
  pluginDirectory: string,
  source: string,
): Promise<string> {
  const version = createHash('sha256')
    .update(source)
    .update(bootstrap)
    .update(hostLauncher)
    .digest('hex');
  const directory = join(pluginDirectory, '.runtime', version);
  await mkdir(directory, { recursive: true });
  for (const [name, content] of [
    ['agent-service.mjs', source],
    ['bootstrap.cjs', bootstrap],
    ['host-launcher.cjs', hostLauncher],
  ] as const) {
    const target = join(directory, name);
    if ((await readFile(target, 'utf8').catch(() => null)) === content) continue;
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, target);
  }
  return join(directory, 'bootstrap.cjs');
}
