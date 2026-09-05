const jwt = require('jsonwebtoken');
const ApiResponse = require('./api_response');

const JWT_SECRET = process.env.JWT_SECRET || 'ingames_default_super_secret_jwt_key_32chars_long!';

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

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return ApiResponse.error(res, 'INVALID_TOKEN', 'Invalid or expired token', 401);
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return ApiResponse.error(res, 'INVALID_TOKEN', 'Invalid session payload', 401);
    }
    req.user = decoded;
    next();
  } catch (err) {
    return ApiResponse.error(res, 'INVALID_TOKEN', 'Invalid or expired token', 401);
  }
}

function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        req.user = verifyToken(token);
      } catch (_) {}
    }
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
