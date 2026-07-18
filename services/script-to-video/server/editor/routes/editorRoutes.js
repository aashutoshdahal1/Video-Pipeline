const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../temp/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

const { exportVideo } = require('../controllers/editorController');
const { timelineExport } = require('../controllers/timelineExportController');
const { previewClip } = require('../controllers/previewClipController');

// Accept multipart/form-data with optional voice "audioFile" + optional bg music "musicFile"
router.post(
  '/export',
  upload.fields([
    { name: 'audioFiles', maxCount: 50 },
    { name: 'audioFile', maxCount: 1 },
    { name: 'musicFile', maxCount: 1 },
  ]),
  exportVideo
);

// Timeline editor: bulk scene files with timestamp-based placement
const timelineUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
});

router.post(
  '/timeline-export',
  (req, res, next) => {
    // No HTTP timeout for long exports — set to 30 minutes
    req.socket.setTimeout(30 * 60 * 1000);
    res.setTimeout(30 * 60 * 1000);
    next();
  },
  timelineUpload.fields([
    { name: 'sceneFiles', maxCount: 200 },
    { name: 'audioFiles', maxCount: 50 },
    { name: 'musicFile', maxCount: 1 },
  ]),
  timelineExport
);

// Single-file preview transcode — converts HEVC/ProRes/etc to H.264 for Chrome playback
const previewUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.post(
  '/preview-clip',
  previewUpload.single('file'),
  previewClip
);

module.exports = router;
