const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TTS_URL = process.env.POCKET_TTS_URL || 'http://localhost:8000';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const POCKET_TTS_DIR = path.join(__dirname, '..', '..', 'services', 'pocket-tts');
const UV_BIN = '/Users/aashutoshdahal/.local/bin/uv';

let pocketTtsProc = null;

function startPocketTts() {
  if (pocketTtsProc && !pocketTtsProc.killed) return;
  console.log('[pocket-tts] Starting automatically…');
  pocketTtsProc = spawn(
    UV_BIN,
    ['run', '--project', POCKET_TTS_DIR, 'pocket-tts', 'serve', '--host', 'localhost', '--port', '8000'],
    { cwd: POCKET_TTS_DIR, stdio: 'pipe', detached: false }
  );
  pocketTtsProc.stdout.on('data', d => process.stdout.write(`[pocket-tts] ${d}`));
  pocketTtsProc.stderr.on('data', d => process.stderr.write(`[pocket-tts] ${d}`));
  pocketTtsProc.on('exit', code => {
    console.log(`[pocket-tts] exited (${code})`);
    pocketTtsProc = null;
  });
}

async function waitForPocketTts(retries = 20, intervalMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(`${TTS_URL}/health`, { timeout: 1000 });
      return; // up
    } catch {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  throw new Error(`pocket-tts did not become ready after ${(retries * intervalMs / 1000).toFixed(0)}s`);
}

async function ensurePocketTts() {
  try {
    await axios.get(`${TTS_URL}/health`, { timeout: 1000 });
  } catch {
    startPocketTts();
    await waitForPocketTts();
  }
}

async function ttsPost(form) {
  await ensurePocketTts();
  try {
    return await axios.post(`${TTS_URL}/tts`, form, {
      headers: form.getHeaders(),
      responseType: 'arraybuffer',
      timeout: 180000,
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || !err.message) {
      throw new Error(`pocket-tts is not responding at ${TTS_URL}`);
    }
    if (err.response) {
      const body = Buffer.isBuffer(err.response.data)
        ? err.response.data.toString('utf8')
        : (err.response.data?.toString?.() || '');
      throw new Error(`pocket-tts error ${err.response.status}: ${body.slice(0, 300)}`);
    }
    throw err;
  }
}

async function generateAudio(text, voiceName = 'alba', jobId) {
  const form = new FormData();
  form.append('text', text);
  form.append('voice_url', voiceName);

  const response = await ttsPost(form);

  const filename = `audio_${jobId}.wav`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, response.data);

  return { audioPath: filepath, audioUrl: `/uploads/${filename}` };
}

// Derive MIME type from file extension so FastAPI's UploadFile accepts it correctly.
function mimeFromName(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = { mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' };
  return map[ext] || 'audio/wav';
}

// Voice clone: send the uploaded audio buffer directly to pocket-tts as voice_wav
async function generateAudioWithClone(text, voiceBuffer, originalName, jobId) {
  const form = new FormData();
  form.append('text', text);
  form.append('voice_wav', voiceBuffer, { filename: originalName || 'clone.wav', contentType: mimeFromName(originalName) });

  const response = await ttsPost(form);

  const filename = `audio_${jobId}.wav`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, response.data);

  return { audioPath: filepath, audioUrl: `/uploads/${filename}` };
}

async function getVoices() {
  try {
    await ensurePocketTts();
    const response = await axios.get(`${TTS_URL}/voices`);
    return response.data;
  } catch {
    return ['alba', 'cosette', 'marius', 'anna', 'vera', 'charles', 'paul', 'eve'];
  }
}

module.exports = { generateAudio, generateAudioWithClone, getVoices };
