const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const apiRoutes = require('./src/routes');
const SevenUpDownService = require('./src/modules/game/seven_up_down.service');
const ApiResponse = require('./src/core/api_response');
const { verifyToken } = require('./src/core/auth_middleware');

const app = express();
const server = http.createServer(app);

// Explicit CORS origin configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount Central API Routes
app.use('/api', apiRoutes);

// Root Welcome / Health Route
app.get('/', (req, res) => {
  return ApiResponse.success(res, {
    name: 'InGames Real Money Gaming Backend',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Health Check
app.get('/health', (req, res) => {
  return ApiResponse.success(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Socket.io Realtime Server Initialization & Auth Middleware
SevenUpDownService.setSocketIO(io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    // Allow anonymous socket for public room broadcasts (timers, results)
    return next();
  }
  try {
    const decoded = verifyToken(token);
    if (decoded && decoded.id) {
      socket.user = decoded;
    }
  } catch (_) {}
  next();
});

io.on('connection', (socket) => {
  console.log(`🎮 Client Connected: ${socket.id}`);

  // Automatically join server-derived private room if user is authenticated
  if (socket.user && socket.user.id) {
    socket.join(`user_${socket.user.id}`);
    console.log(`🔒 Socket ${socket.id} bound to server-derived room user_${socket.user.id}`);
  }

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
