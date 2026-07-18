const express = require('express');
const router = express.Router();
const { saveVideo, listSaved, deleteSaved } = require('../controllers/savedController');

router.post('/', saveVideo);
router.get('/', listSaved);
router.delete('/:id', deleteSaved);

module.exports = router;
