const mongoose = require('mongoose');

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/video-pipeline';
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};
