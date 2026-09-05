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

const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN;
if (isProduction && (!corsOrigin || corsOrigin === '*')) {
  throw new Error('CORS_ORIGIN must be an explicit origin in production');
}
const allowedOrigin = corsOrigin || 'http://localhost:3000';

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 5050;

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  return ApiResponse.success(res, {
    name: 'InGames Real Money Gaming Backend',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

app.get('/health', (req, res) => {
  return ApiResponse.success(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

SevenUpDownService.setSocketIO(io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') {
    return next(new Error('UNAUTHORIZED'));
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return next(new Error('UNAUTHORIZED'));
    }
    socket.user = decoded;
    return next();
  } catch (_) {
    return next(new Error('UNAUTHORIZED'));
  }
});

io.on('connection', (socket) => {
  console.log(`🎮 Client Connected: ${socket.id}`);
  socket.join(`user_${socket.user.id}`);

  // Send current active round to newly connected socket
  try {
    const currentRound = SevenUpDownService.getCurrentRound();
    if (currentRound) {
      const closeAt = new Date(currentRound.betting_close_at).getTime();
      const timeRemainingSeconds = Math.max(0, Math.floor((closeAt - Date.now()) / 1000));
      socket.emit('ROUND_CREATED', {
        roundId: currentRound.id,
        roundNumber: currentRound.round_number,
        seedHash: currentRound.seed_hash,
        fairnessVersion: 1,
        bettingCloseAt: currentRound.betting_close_at,
        timeRemainingSeconds,
      });
    }
  } catch (_) {}

  socket.on('disconnect', () => {
    console.log(`🔌 Client Disconnected: ${socket.id}`);
  });
});

SevenUpDownService.getCurrentRound();

app.use((req, res) => {
  return ApiResponse.error(res, 'NOT_FOUND', `Route ${req.originalUrl} not found`, 404);
});

app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err);
  return ApiResponse.error(res, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred', 500);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 InGames Backend Server listening on 0.0.0.0:${PORT}`);
});
