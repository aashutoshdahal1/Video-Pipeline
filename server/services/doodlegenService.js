const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const DOODLEGEN_URL = process.env.DOODLEGEN_URL || 'http://localhost:3000';
const DOODLEGEN_PORT = Number(new URL(DOODLEGEN_URL).port) || 3000;
const DOODLEGEN_DIR = path.join(__dirname, '..', '..', 'services', 'doodlegen');

let proc = null;

function isPortOpen(port) {
  return new Promise(resolve => {
    const req = http.get({ hostname: 'localhost', port, path: '/', timeout: 1000 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function killPort(port) {
  return new Promise(resolve => {
    const { execFile } = require('child_process');
    execFile('lsof', ['-ti', `TCP:${port}`], (err, stdout) => {
      if (err || !stdout.trim()) return resolve();
      for (const pid of stdout.trim().split('\n').filter(Boolean)) {
        try { process.kill(Number(pid)); } catch {}
      }
      setTimeout(resolve, 500);
    });
  });
}

function startDoodlegen() {
  if (proc && !proc.killed) return;
  console.log('[doodlegen] Starting automatically…');
  proc = spawn('node', ['server.js'], { cwd: DOODLEGEN_DIR, stdio: 'pipe', detached: false });
  proc.stdout.on('data', d => process.stdout.write(`[doodlegen] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[doodlegen] ${d}`));
  proc.on('exit', code => { console.log(`[doodlegen] exited (${code})`); proc = null; });
}

async function waitForDoodlegen(retries = 15, intervalMs = 1000) {
  for (let i = 0; i < retries; i++) {
    if (await isPortOpen(DOODLEGEN_PORT)) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`doodlegen did not start after ${retries}s`);
}

async function ensureDoodlegen() {
  if (proc && !proc.killed && await isPortOpen(DOODLEGEN_PORT)) return;
  await killPort(DOODLEGEN_PORT);
  proc = null;
  startDoodlegen();
  await waitForDoodlegen();
}

module.exports = { ensureDoodlegen };
