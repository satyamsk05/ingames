const ApiResponse = require('./api_response');
const { verifyToken } = require('./auth_middleware');

function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'UNAUTHORIZED', 'Admin authorization token required', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    if (!decoded || (!decoded.isAdmin && decoded.role !== 'admin')) {
      return ApiResponse.error(res, 'FORBIDDEN', 'Admin access privileges required', 403);
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return ApiResponse.error(res, 'UNAUTHORIZED', 'Invalid or expired admin token', 401);
  }
}

module.exports = adminMiddleware;
