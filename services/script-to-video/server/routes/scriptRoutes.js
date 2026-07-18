const express = require('express');
const router = express.Router();
const { processScript } = require('../controllers/scriptController');

router.post('/process', processScript);

module.exports = router;
