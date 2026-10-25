import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Release builds must not inherit a test runner's or shell's development mode.
// Invoke the installed CLI directly so npm and pnpm use the same build path.
const cli = fileURLToPath(import.meta.resolve('vite-plus/bin'));
for (const workspace of ['apps/agent-service', 'apps/obsidian-plugin']) {
  execFileSync(process.execPath, [cli, '-C', workspace, 'build'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
}
