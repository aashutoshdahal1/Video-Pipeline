const mongoose = require('mongoose');

const imagePromptSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  aspect: { type: String, default: '16:9' },
  count: { type: Number, default: 1 },
  status: { type: String, enum: ['pending', 'generating', 'done', 'failed'], default: 'pending' },
  urls: [String],
  error: String
}, { _id: true });

const jobSchema = new mongoose.Schema({
  title: { type: String, default: 'Untitled Project' },

  // Step 1 — TTS
  voicePrompt: String,
  voiceName: { type: String, default: 'alba' },
  audioPath: String,
  audioUrl: String,

  // Step 2 — Transcript
  transcript: String,
  transcriptSegments: [mongoose.Schema.Types.Mixed],

  // Step 3 — Image generation
  imagePrompts: [imagePromptSchema],

  // Step 4 — Script-to-video handoff
  scriptToVideoProjectId: String,
  exportUrl: String,

  // Overall pipeline status
  stage: {
    type: String,
    enum: ['tts', 'transcribing', 'prompts', 'images', 'timeline', 'done'],
    default: 'tts'
  },
  status: {
    type: String,
    enum: ['idle', 'processing', 'error', 'complete'],
    default: 'idle'
  },
  error: String
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
