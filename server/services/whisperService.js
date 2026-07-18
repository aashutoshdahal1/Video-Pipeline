const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

const WHISPER_URL = process.env.WHISPER_URL || 'http://localhost:8001';

const WHISPER_DIR = path.join(__dirname, '..', '..', 'services', 'whisper');
const WHISPER_PYTHON = path.join(WHISPER_DIR, 'venv', 'bin', 'python');

let whisperProc = null;

function killPort8001() {
  // Kill any stale process on port 8001 (e.g. started with wrong Python)
  return new Promise(resolve => {
    const { execFile } = require('child_process');
    execFile('lsof', ['-ti', 'TCP:8001'], (err, stdout) => {
      if (err || !stdout.trim()) return resolve();
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        try { process.kill(Number(pid)); } catch {}
      }
      setTimeout(resolve, 500);
    });
  });
}

function startWhisper() {
  if (whisperProc && !whisperProc.killed) return;
  console.log('[whisper] Starting automatically…');
  whisperProc = spawn(
    WHISPER_PYTHON,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'],
    { cwd: WHISPER_DIR, stdio: 'pipe', detached: false }
  );
  whisperProc.stdout.on('data', d => process.stdout.write(`[whisper] ${d}`));
  whisperProc.stderr.on('data', d => process.stderr.write(`[whisper] ${d}`));
  whisperProc.on('exit', code => {
    console.log(`[whisper] exited (${code})`);
    whisperProc = null;
  });
}

async function waitForWhisper(retries = 30, intervalMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${WHISPER_URL}/`, { method: 'GET', timeout: 1000 });
      if (r.status < 500) return; // any non-5xx means uvicorn is up
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Whisper did not become ready after ${retries}s`);
}

async function isWhisperHealthy() {
  try {
    const r = await fetch(`${WHISPER_URL}/`, { method: 'GET', timeout: 1000 });
    // Port is open but check that the process actually has whisper loaded:
    // a broken process returns 200 from uvicorn but errors on every request.
    // We verify by hitting /api/transcribe with no body — a healthy whisper
    // returns 422 (validation error), a broken one returns something else or
    // streams an error immediately.
    if (r.status >= 500) return false;
    const probe = await fetch(`${WHISPER_URL}/api/transcribe`, { method: 'POST', timeout: 2000 });
    return probe.status === 422; // FastAPI validation error = whisper is up
  } catch {
    return false;
  }
}

async function ensureWhisper() {
  if (await isWhisperHealthy()) return;
  await killPort8001();
  startWhisper();
  await waitForWhisper();
}

async function transcribeAudio(audioPath, modelName = 'base') {
  await ensureWhisper();

  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model_name', modelName);

  const response = await fetch(`${WHISPER_URL}/api/transcribe`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Whisper error ${response.status}: ${text}`);
  }

  return new Promise((resolve, reject) => {
    const segments = [];
    let fullText = '';

    const decoder = new TextDecoder();
    response.body.on('data', (chunk) => {
      const lines = decoder.decode(chunk).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) { reject(new Error(parsed.error)); return; }
          if (parsed.text) {
            segments.push(parsed.text);
            fullText += parsed.text;
          }
        } catch (_) {}
      }
    });

    response.body.on('end', () => resolve({ transcript: fullText.trim(), segments }));
    response.body.on('error', reject);
  });
}

module.exports = { transcribeAudio };
