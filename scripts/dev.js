const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const server = spawn(npmCmd, ['run', 'dev', '--prefix', 'apps/server'], {
  stdio: 'inherit',
  shell: true,
});

const web = spawn(npmCmd, ['run', 'dev', '--prefix', 'apps/web'], {
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  server.kill();
  web.kill();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
