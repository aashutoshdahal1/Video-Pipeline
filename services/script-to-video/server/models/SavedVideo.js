const mongoose = require('mongoose');

const SavedVideoSchema = new mongoose.Schema({
  source: String,
  title: String,
  thumbnail: String,
  videoUrl: String,
  duration: String,
  tags: [String],
  relevanceScore: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SavedVideo', SavedVideoSchema);
