const crypto = require('crypto');

class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
      error: null,
      requestId: crypto.randomUUID(),
    });
  }

  static error(res, code = 'INTERNAL_ERROR', message = 'An error occurred', statusCode = 400, details = null) {
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: {
        code,
        message,
        details,
      },
      requestId: crypto.randomUUID(),
    });
  }
}

module.exports = ApiResponse;
