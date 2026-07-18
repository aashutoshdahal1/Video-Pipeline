const crypto = require('crypto');
const mongoose = require('mongoose');
const SavedVideo = require('../models/SavedVideo');

// Fallback store for local/dev mode when Mongo is unavailable.
const inMemorySaved = [];

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

async function saveVideo(req, res, next) {
  try {
    const { id, _id, ...payload } = req.body || {};
    if (!isDbReady()) {
      const item = {
        _id: crypto.randomUUID(),
        ...payload,
        createdAt: new Date().toISOString(),
      };
      inMemorySaved.unshift(item);
      return res.json({ success: true, item, warning: 'Saved in memory (Mongo unavailable)' });
    }

    const doc = new SavedVideo(payload);
    await doc.save();
    res.json({ success: true, item: doc });
  } catch (err) {
    next(err);
  }
}

async function listSaved(req, res, next) {
  try {
    if (!isDbReady()) {
      return res.json({ success: true, items: inMemorySaved, warning: 'Using in-memory data (Mongo unavailable)' });
    }

    const items = await SavedVideo.find().sort({ createdAt: -1 }).exec();
    res.json({ success: true, items });
  } catch (err) {
    // If Mongoose buffering times out, return an empty list to keep UI responsive.
    if ((err && err.name === 'MongooseError') || /buffering timed out/i.test(String(err?.message))) {
      return res.json({ success: true, items: inMemorySaved, warning: 'Mongo timeout, returned fallback data' });
    }
    next(err);
  }
}

async function deleteSaved(req, res, next) {
  try {
    const { id } = req.params;

    if (!isDbReady()) {
      const idx = inMemorySaved.findIndex(item => String(item._id) === String(id));
      if (idx === -1) return res.status(404).json({ success: false, message: 'Not found' });
      const [item] = inMemorySaved.splice(idx, 1);
      return res.json({ success: true, item, warning: 'Deleted from in-memory data (Mongo unavailable)' });
    }

    const item = await SavedVideo.findByIdAndDelete(id).exec();
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

module.exports = { saveVideo, listSaved, deleteSaved };
