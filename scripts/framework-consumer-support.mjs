import { execFileSync } from 'node:child_process';
import process from 'node:process';

export function isolatedConsumerEnvironment(additions = {}) {
  const environment = { ...process.env, ...additions };
  delete environment.NODE_PATH;
  delete environment.NODE_OPTIONS;
  delete environment.INIT_CWD;
  for (const name of Object.keys(environment)) {
    if (/^npm_config_(?:workspace|workspaces|local_prefix|prefix)$/i.test(name)) {
      delete environment[name];
    }
  }
  return environment;
}

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath ?? process.env.NPM_EXEC_PATH;
  if (npmExecPath) return { command: process.execPath, args: [npmExecPath, ...args] };
  if (process.platform === 'win32') {
    throw new Error('Invoke the framework consumer checks with npm run to locate npm on Windows.');
  }
  return { command: 'npm', args };
}

export function runNpm(args, options) {
  const invocation = npmInvocation(args);
  return execFileSync(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: isolatedConsumerEnvironment(options.env),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

export function runNode(args, options) {
  return execFileSync(process.execPath, args, {
    cwd: options.cwd,
    env: isolatedConsumerEnvironment(options.env),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}
