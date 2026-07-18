const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverDir   = path.join(__dirname, 'server');
const clientDir   = path.join(__dirname, 'client');
const whisperDir  = '/Users/aashutoshdahal/Desktop/personal-sites/transcript-video-openai-whisper/backend';
const whisperPython = path.join(whisperDir, 'venv/bin/python');
const pocketTtsDir = '/Users/aashutoshdahal/Desktop/personal-sites/Voice-Clone-Generator/pocket-tts';
const uvBin = '/Users/aashutoshdahal/.local/bin/uv';

// Copy .env.example → .env if not already present
const envSrc = path.join(serverDir, '.env.example');
const envDst = path.join(serverDir, '.env');
if (!fs.existsSync(envDst) && fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDst);
  console.log('Created server/.env from example. Edit it to customise service URLs.');
}

function run(cmd, args, cwd, label) {
  const proc = spawn(cmd, args, { cwd, stdio: 'pipe', shell: false });
  proc.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`));
  proc.on('exit', code => {
    if (code !== 0) console.error(`[${label}] exited with code ${code}`);
  });
  return proc;
}

console.log('Starting Video Pipeline...\n');

const pocketTts = run(
  uvBin,
  ['run', '--project', pocketTtsDir, 'pocket-tts', 'serve', '--host', 'localhost', '--port', '8000'],
  pocketTtsDir,
  'pocket-tts'
);
const whisper = run(
  whisperPython,
  ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'],
  whisperDir,
  'whisper'
);
const server = run('node', ['index.js'], serverDir, 'server');
const client = run('npm', ['run', 'dev'], clientDir, 'client');

process.on('SIGINT', () => {
  pocketTts.kill();
  whisper.kill();
  server.kill();
  client.kill();
  process.exit(0);
});
