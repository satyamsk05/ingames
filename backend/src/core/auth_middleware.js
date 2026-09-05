const jwt = require('jsonwebtoken');
const ApiResponse = require('./api_response');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ingames_jwt_key_2026_production';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'UNAUTHORIZED', 'Authentication token required', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return ApiResponse.error(res, 'INVALID_TOKEN', 'Invalid or expired token', 401);
  }
}

function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = verifyToken(token);
    } catch (_) {}
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  optionalAuthMiddleware,
  JWT_SECRET,
};
