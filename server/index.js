require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/voices', require('./routes/voiceRoutes'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Socket.io — clients join a room per job ID for real-time updates
io.on('connection', (socket) => {
  socket.on('join:job', (jobId) => socket.join(jobId));
  socket.on('leave:job', (jobId) => socket.leave(jobId));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

connectDB().then(() => {
  const PORT = process.env.PORT || 6000;
  server.listen(PORT, () => console.log(`Pipeline server on port ${PORT}`));
});
