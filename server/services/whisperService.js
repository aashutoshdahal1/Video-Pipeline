const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

const WHISPER_URL = process.env.WHISPER_URL || 'http://localhost:8001';

// Returns a promise that resolves with { transcript, segments } once SSE stream ends
async function transcribeAudio(audioPath, modelName = 'base') {
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
