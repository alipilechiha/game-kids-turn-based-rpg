import { spawnSync } from 'node:child_process';
import process from 'node:process';

process.env.PLAYWRIGHT_USE_SYSTEM_CHROME = '1';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'test:e2e', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});

process.exit(result.status ?? 1);
