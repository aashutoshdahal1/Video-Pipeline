const mongoose = require('mongoose');

const CacheSchema = new mongoose.Schema({
  query: { type: String, required: true, unique: true, index: true },
  results: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cache', CacheSchema);
