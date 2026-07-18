const router = require('express').Router();
const multer = require('multer');
const {
  createJob, listJobs, getJob,
  runTTS, runTranscribe, savePrompts,
  startImageGen, reportImageResult, runImageGen,
  resetJob, deleteJob
} = require('../controllers/jobController');

// Keep voice clone WAV in memory (typically < 10 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/', listJobs);
router.post('/', createJob);
router.get('/:id', getJob);
router.delete('/:id', deleteJob);

router.post('/:id/tts', upload.single('voice_wav'), runTTS);
router.post('/:id/transcribe', runTranscribe);
router.put('/:id/prompts', savePrompts);
router.post('/:id/images', runImageGen);           // compat
router.post('/:id/images/start', startImageGen);   // new client-driven flow
router.patch('/:id/images/:index', reportImageResult);
router.post('/:id/reset', resetJob);

module.exports = router;
