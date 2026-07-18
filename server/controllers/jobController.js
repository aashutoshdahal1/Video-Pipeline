const Job = require('../models/Job');
const { generateAudio, generateAudioWithClone } = require('../services/ttsService');
const { transcribeAudio } = require('../services/whisperService');
const { generateImages } = require('../services/imageService');

// POST /api/jobs — create a new job
async function createJob(req, res) {
  const { title, voicePrompt, voiceName } = req.body;
  if (!voicePrompt) return res.status(400).json({ error: 'voicePrompt is required' });

  const job = await Job.create({ title: title || 'Untitled Project', voicePrompt, voiceName: voiceName || 'alba' });
  res.status(201).json(job);
}

// GET /api/jobs — list all jobs
async function listJobs(req, res) {
  const jobs = await Job.find().sort({ createdAt: -1 }).select('title stage status createdAt updatedAt');
  res.json(jobs);
}

// GET /api/jobs/:id — get a single job
async function getJob(req, res) {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}

// POST /api/jobs/:id/tts — run TTS on a job
// Supports optional multipart with voice_wav file for voice cloning
async function runTTS(req, res) {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const io = req.app.get('io');
  job.status = 'processing';
  job.stage = 'tts';
  await job.save();

  io.to(job.id).emit('job:update', { stage: 'tts', status: 'processing', message: 'Generating audio...' });

  try {
    let audioPath, audioUrl;
    const voiceFile = req.file; // multer single('voice_wav')

    if (voiceFile) {
      // Voice clone mode — uploaded audio file as reference
      ({ audioPath, audioUrl } = await generateAudioWithClone(
        job.voicePrompt,
        voiceFile.buffer,
        voiceFile.originalname,
        job._id.toString()
      ));
    } else {
      // Use voice name from request body if provided (UI selection), else fall back to job's stored name
      const voiceName = req.body.voiceName || job.voiceName || 'alba';
      ({ audioPath, audioUrl } = await generateAudio(
        job.voicePrompt,
        voiceName,
        job._id.toString()
      ));
    }

    job.audioPath = audioPath;
    job.audioUrl = audioUrl;
    job.stage = 'transcribing';
    job.status = 'idle';
    await job.save();

    io.to(job.id).emit('job:update', { stage: 'transcribing', status: 'idle', message: 'Audio ready', audioUrl });
    res.json(job);
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
    await job.save();
    io.to(job.id).emit('job:update', { stage: 'tts', status: 'error', message: err.message });
    res.status(500).json({ error: err.message });
  }
}

// POST /api/jobs/:id/transcribe — run Whisper transcription
async function runTranscribe(req, res) {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.audioPath) return res.status(400).json({ error: 'No audio file. Run TTS first.' });

  const io = req.app.get('io');
  job.status = 'processing';
  job.stage = 'transcribing';
  await job.save();

  io.to(job.id).emit('job:update', { stage: 'transcribing', status: 'processing', message: 'Transcribing audio...' });

  // Kick off async so SSE from whisper can stream back
  res.json({ message: 'Transcription started', jobId: job.id });

  try {
    const { transcript, segments } = await transcribeAudio(job.audioPath, req.body.model || 'base');
    job.transcript = transcript;
    job.transcriptSegments = segments;
    job.stage = 'prompts';
    job.status = 'idle';
    await job.save();
    io.to(job.id).emit('job:update', { stage: 'prompts', status: 'idle', message: 'Transcription complete', transcript });
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
    await job.save();
    io.to(job.id).emit('job:update', { stage: 'transcribing', status: 'error', message: err.message });
  }
}

// PUT /api/jobs/:id/prompts — save image prompts
async function savePrompts(req, res) {
  const { prompts } = req.body;
  if (!Array.isArray(prompts)) {
    return res.status(400).json({ error: 'prompts array is required' });
  }

  // Drop empty rows so doodlegen never gets a blank prompt
  const valid = prompts.filter(p => p.prompt && p.prompt.trim());
  if (!valid.length) {
    return res.status(400).json({ error: 'Add at least one non-empty prompt' });
  }

  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  job.imagePrompts = valid.map(p => ({
    prompt: p.prompt.trim(),
    aspect: p.aspect || '16:9',
    count: Math.min(Math.max(parseInt(p.count) || 1, 1), 4),
    status: 'pending'
  }));
  job.stage = 'images';
  await job.save();
  res.json(job);
}

// POST /api/jobs/:id/images/start — reset all prompts to pending, return the list
// Generation now happens client-side (parallel workers, like doodlegen)
async function startImageGen(req, res) {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.imagePrompts || !job.imagePrompts.length) {
    return res.status(400).json({ error: 'No image prompts saved.' });
  }

  const resetFields = Object.fromEntries(
    job.imagePrompts.map((_, i) => [`imagePrompts.${i}.status`, 'pending'])
  );
  const updated = await Job.findByIdAndUpdate(
    job.id,
    { $set: { ...resetFields, status: 'processing', stage: 'images' } },
    { new: true }
  );
  res.json(updated);
}

// PATCH /api/jobs/:id/images/:index — client reports result for one image
async function reportImageResult(req, res) {
  const { id, index } = req.params;
  const i = parseInt(index);
  const { status, urls, error } = req.body;

  const fields = { [`imagePrompts.${i}.status`]: status };
  if (urls) fields[`imagePrompts.${i}.urls`] = urls;
  if (error) fields[`imagePrompts.${i}.error`] = error;

  const job = await Job.findByIdAndUpdate(id, { $set: fields }, { new: true });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // When all prompts are settled, advance the stage
  const allSettled = job.imagePrompts.every(p => p.status === 'done' || p.status === 'failed');
  if (allSettled) {
    const anyFailed = job.imagePrompts.some(p => p.status === 'failed');
    await Job.findByIdAndUpdate(id, {
      stage: 'timeline',
      status: anyFailed ? 'error' : 'idle'
    });
  }

  res.json({ ok: true });
}

// Kept for backward compat (old POST /images) — just delegates to startImageGen
async function runImageGen(req, res) {
  return startImageGen(req, res);
}

// POST /api/jobs/:id/reset — unstick a job whose status got stuck at "processing"
async function resetJob(req, res) {
  const job = await Job.findByIdAndUpdate(
    req.params.id,
    { status: 'idle' },
    { new: true }
  );
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}

// DELETE /api/jobs/:id
async function deleteJob(req, res) {
  await Job.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}

module.exports = { createJob, listJobs, getJob, runTTS, runTranscribe, savePrompts, startImageGen, reportImageResult, runImageGen, resetJob, deleteJob };
