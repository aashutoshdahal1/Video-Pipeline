const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const TTS_URL = process.env.POCKET_TTS_URL || 'http://localhost:8000';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

async function generateAudio(text, voiceName = 'alba', jobId) {
  const form = new FormData();
  form.append('text', text);
  form.append('voice_url', voiceName);

  const response = await axios.post(`${TTS_URL}/tts`, form, {
    headers: form.getHeaders(),
    responseType: 'arraybuffer',
    timeout: 120000
  });

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

  const response = await axios.post(`${TTS_URL}/tts`, form, {
    headers: form.getHeaders(),
    responseType: 'arraybuffer',
    timeout: 180000
  });

  const filename = `audio_${jobId}.wav`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, response.data);

  return { audioPath: filepath, audioUrl: `/uploads/${filename}` };
}

async function getVoices() {
  try {
    const response = await axios.get(`${TTS_URL}/voices`);
    return response.data;
  } catch {
    // Matches pocket-tts predefined voice names
    return ['alba', 'cosette', 'marius', 'anna', 'vera', 'charles', 'paul', 'eve'];
  }
}

module.exports = { generateAudio, generateAudioWithClone, getVoices };
