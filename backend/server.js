const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const apiRoutes = require('./src/routes');
const SevenUpDownService = require('./src/modules/game/seven_up_down.service');
const ApiResponse = require('./src/core/api_response');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount Central API Routes
app.use('/api', apiRoutes);

// Health Check
app.get('/health', (req, res) => {
  return ApiResponse.success(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Socket.io Realtime Server Initialization
SevenUpDownService.setSocketIO(io);

io.on('connection', (socket) => {
  console.log(`🎮 Client Connected: ${socket.id}`);

  // Allow room subscriptions per user
  socket.on('JOIN_USER_ROOM', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`👤 Socket ${socket.id} joined room user_${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client Disconnected: ${socket.id}`);
  });
});

// Start initial game round engine
SevenUpDownService.getCurrentRound();

// Global 404 Handler
app.use((req, res) => {
  return ApiResponse.error(res, 'NOT_FOUND', `Route ${req.originalUrl} not found`, 404);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err);
  return ApiResponse.error(res, 'INTERNAL_SERVER_ERROR', err.message || 'An unexpected error occurred', 500);
});

server.listen(PORT, () => {
  console.log(`🚀 InGames Server running on http://localhost:${PORT}`);
});
