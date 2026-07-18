const express = require('express');
const router = express.Router();
const { searchVideos, searchSceneVideos } = require('../controllers/videoController');

router.get('/search', searchVideos);
router.post('/search/scenes', searchSceneVideos);

module.exports = router;
