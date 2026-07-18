const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');

dotenv.config({ override: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Connect DB (can be skipped by setting SKIP_DB=1)
if (!process.env.SKIP_DB) {
  connectDB();
} else {
  console.log('SKIP_DB set, skipping MongoDB connection');
}

// Routes
app.use('/api/script', require('./routes/scriptRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/saved', require('./routes/savedRoutes'));
// TTS routes
app.use('/api/tts', require('./routes/ttsRoutes'));
// Veo AI video generation
app.use('/api/veo', require('./routes/veoRoutes'));
// Editor routes
app.use('/api/editor', require('./editor/routes/editorRoutes'));

// Serve generated outputs from editor pipeline
app.use('/outputs', express.static(path.join(__dirname, 'editor', 'outputs')));
// Backward-compatible fallback for older exports saved in /server/outputs
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Health & Debug
app.get('/api/health', (req, res) => res.json({ ok: true, port: PORT }));
app.get('/api/debug/config', (req, res) => {
  res.json({
    mongo: !!process.env.MONGO_URI,
    pexelsKey: !!process.env.PEXELS_API_KEY,
    pixabayKey: !!process.env.PIXABAY_API_KEY,
    port: PORT
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5005;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// Long timeout for video export/render requests (30 min)
server.timeout = 30 * 60 * 1000;
server.keepAliveTimeout = 30 * 60 * 1000;
