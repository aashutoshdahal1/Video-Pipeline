# Video Pipeline

End-to-end MERN pipeline: voice prompt → audio → transcript → bulk image generation → timeline editor.

## Pipeline stages

```
1. Voice (pocket-tts)     — text → .wav audio
2. Transcript (Whisper)   — audio → timestamped transcript
3. Prompts                — user adds bulk image generation prompts
4. Images (doodlegen)     — bulk AI image generation
5. Timeline               — hand-off to script-to-video with all assets
```

## Prerequisites — start these first

| Service | Directory | Command | Port |
|---|---|---|---|
| pocket-tts (TTS) | `Voice-Clone-Generator/` | `npm run dev` | 8000 |
| Whisper (transcription) | `transcript-video-openai-whisper/` | see below | **8001** |
| doodlegen (images) | `doodlegen-full/` | `node server.js` | 3000 |
| script-to-video | `script-to-video/` | `npm run dev` | 5173 |

> **Whisper port conflict:** pocket-tts also uses port 8000. Start Whisper on 8001:
> ```bash
> cd transcript-video-openai-whisper/backend
> source venv/bin/activate
> uvicorn main:app --port 8001
> ```

## Installation

```bash
cd video-pipeline
npm run install:all
```

## Running

```bash
npm run dev
```

Opens:
- Pipeline UI → http://localhost:5173
- Pipeline API → http://localhost:6000

## Environment

Copy `server/.env.example` to `server/.env` (done automatically on first run).

```env
MONGO_URI=mongodb://localhost:27017/video-pipeline
PORT=6000
POCKET_TTS_URL=http://localhost:8000
WHISPER_URL=http://localhost:8001
DOODLEGEN_URL=http://localhost:3000
SCRIPT_TO_VIDEO_URL=http://localhost:5173
```

## Architecture

```
video-pipeline/
├── server/           Express + MongoDB + Socket.io orchestrator (port 6000)
│   ├── models/Job.js         Pipeline job state
│   ├── controllers/          Route handlers
│   ├── services/             ttsService, whisperService, imageService
│   └── routes/
└── client/           React + Vite + TailwindCSS (port 5173)
    └── src/pages/
        ├── ProjectList.tsx   Job dashboard
        ├── NewProject.tsx    Create job + pick voice
        ├── StepVoice.tsx     TTS generation
        ├── StepTranscript.tsx Whisper transcription
        ├── StepPrompts.tsx   Bulk image prompt editor
        ├── StepImages.tsx    Real-time image generation
        └── StepTimeline.tsx  Hand-off + asset download
```
