const router = require('express').Router();
const axios = require('axios');

const TTS_URL = process.env.POCKET_TTS_URL || 'http://localhost:8000';

// Proxy /api/voices to pocket-tts
router.get('/', async (req, res) => {
  try {
    const resp = await axios.get(`${TTS_URL}/voices`);
    res.json(resp.data);
  } catch {
    // pocket-tts may not expose a /voices endpoint — return defaults
    res.json(['alba', 'expresso', 'moshi']);
  }
});

module.exports = router;
