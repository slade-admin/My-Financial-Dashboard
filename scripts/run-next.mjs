const [, , command, ...args] = process.argv;

if (command !== 'dev' && command !== 'start') {
  console.error('Usage: npm run dev | npm run start');
  process.exit(1);
}

const port = process.env.PORT || '3000';
const nextArgs = [command, '-p', port, ...args];

const child = Bun
  ? null
  : undefined;

const { spawn } = await import('node:child_process');
const subprocess = spawn(process.platform === 'win32' ? 'next.cmd' : 'next', nextArgs, {
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

subprocess.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
