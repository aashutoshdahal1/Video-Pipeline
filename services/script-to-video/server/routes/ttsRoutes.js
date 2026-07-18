const express = require('express');
const https = require('https');
const router = express.Router();

const VOICES = [
  { id: "voice-1",  name: "Adam",      gender: "male",    accent: "American" },
  { id: "voice-2",  name: "Alice",     gender: "female",  accent: "British" },
  { id: "voice-3",  name: "Brian",     gender: "male",    accent: "British" },
  { id: "voice-4",  name: "Carla",     gender: "female",  accent: "Italian" },
  { id: "voice-5",  name: "Charlie",   gender: "male",    accent: "Australian" },
  { id: "voice-6",  name: "Charlotte", gender: "female",  accent: "Swedish" },
  { id: "voice-7",  name: "Chris",     gender: "male",    accent: "American" },
  { id: "voice-8",  name: "Daniel",    gender: "male",    accent: "British" },
  { id: "voice-9",  name: "Eric",      gender: "male",    accent: "American" },
  { id: "voice-10", name: "George",    gender: "male",    accent: "British" },
  { id: "voice-11", name: "Jessica",   gender: "female",  accent: "American" },
  { id: "voice-12", name: "Laura",     gender: "female",  accent: "American" },
  { id: "voice-13", name: "Liam",      gender: "male",    accent: "American" },
  { id: "voice-14", name: "Lily",      gender: "female",  accent: "British" },
  { id: "voice-15", name: "Matilda",   gender: "female",  accent: "Australian" },
  { id: "voice-16", name: "Nicole",    gender: "female",  accent: "American" },
  { id: "voice-17", name: "River",     gender: "neutral", accent: "American" },
  { id: "voice-18", name: "Roger",     gender: "male",    accent: "American" },
  { id: "voice-19", name: "Sarah",     gender: "female",  accent: "American" },
  { id: "voice-20", name: "Will",      gender: "male",    accent: "American" },
  { id: "voice-79", name: "Nova",      gender: "female",  accent: "American" },
];

// Get available voices
router.get('/voices', (req, res) => {
  try {
    res.json({ voices: VOICES });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

// Generate text-to-speech audio
router.post('/tts', (req, res) => {
  try {
    const { text, voice = "voice-79", pitch = 0, rate = 0 } = req.body;

    // Validate input
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: "Text too long (max 5000 chars)" });
    }

    // Validate voice exists
    const voiceExists = VOICES.some(v => v.id === voice);
    if (!voiceExists) {
      return res.status(400).json({ error: "Invalid voice ID" });
    }

    const payload = JSON.stringify({ text, voice, pitch, rate });

    const options = {
      hostname: "speechma.com",
      path: "/com.api/tts-api.php",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Accept: "*/*",
        Origin: "https://speechma.com",
        Referer: "https://speechma.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const contentType = proxyRes.headers["content-type"] || "";

      if (proxyRes.statusCode !== 200 || !contentType.includes("audio")) {
        let body = "";
        proxyRes.on("data", (c) => (body += c));
        proxyRes.on("end", () => {
          console.error('TTS Service Error:', body);
          res.status(502).json({ 
            error: "Upstream TTS service error", 
            detail: body.slice(0, 200) 
          });
        });
        return;
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${voice}.mp3"`);
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }

      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err);
      res.status(500).json({ error: "Failed to reach TTS service" });
    });

    proxyReq.write(payload);
    proxyReq.end();

  } catch (error) {
    console.error('TTS Generation Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
