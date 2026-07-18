const express = require('express');
const router = express.Router();
const { veoGenerate } = require('../controllers/veoController');

// POST /api/veo/generate
router.post('/generate', veoGenerate);

module.exports = router;
