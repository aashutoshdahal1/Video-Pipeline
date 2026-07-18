const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const SVC  = path.join(ROOT, 'services');

// ── Service definitions ────────────────────────────────────────────────────
const SERVICES = [
  {
    label: 'pocket-tts',
    cmd: path.join(SVC, 'pocket-tts', '.venv', 'bin', 'python'),
    args: ['-m', 'pocket_tts', 'serve', '--host', 'localhost', '--port', '8000'],
    cwd: path.join(SVC, 'pocket-tts'),
  },
  {
    label: 'whisper',
    cmd: path.join(SVC, 'whisper', 'venv', 'bin', 'python'),
    args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'],
    cwd: path.join(SVC, 'whisper'),
  },
  {
    label: 'doodlegen',
    cmd: 'node',
    args: ['server.js'],
    cwd: path.join(SVC, 'doodlegen'),
  },
  {
    label: 'script-to-video:api',
    cmd: 'node',
    args: ['server.js'],
    cwd: path.join(SVC, 'script-to-video', 'server'),
  },
  {
    label: 'script-to-video:ui',
    cmd: 'npm',
    args: ['run', 'dev'],
    cwd: path.join(SVC, 'script-to-video'),
  },
  {
    label: 'pipeline:server',
    cmd: 'node',
    args: ['index.js'],
    cwd: path.join(ROOT, 'server'),
  },
  {
    label: 'pipeline:client',
    cmd: 'npm',
    args: ['run', 'dev'],
    cwd: path.join(ROOT, 'client'),
  },
];

// ── Bootstrap server/.env if missing ──────────────────────────────────────
const envSrc = path.join(ROOT, 'server', '.env.example');
const envDst = path.join(ROOT, 'server', '.env');
if (!fs.existsSync(envDst) && fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDst);
  console.log('Created server/.env from .env.example');
}

// ── Spawn helper ───────────────────────────────────────────────────────────
const procs = [];

function run({ label, cmd, args, cwd }) {
  const proc = spawn(cmd, args, { cwd, stdio: 'pipe', shell: false });
  proc.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`));
  proc.on('exit', code => {
    if (code !== 0 && code !== null) console.error(`[${label}] exited with code ${code}`);
  });
  procs.push(proc);
  return proc;
}

// ── Start everything ───────────────────────────────────────────────────────
console.log('Starting all services...\n');
for (const svc of SERVICES) run(svc);

// ── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown() {
  console.log('\nShutting down…');
  for (const p of procs) { try { p.kill(); } catch {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
