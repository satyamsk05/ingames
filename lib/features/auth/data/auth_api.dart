import '../../../core/api/api_client.dart';

class AuthApi {
  static Future<void> sendOtp(String phone) async {
    await ApiClient.post('/auth/send-otp', {
      'phone': phone,
      'channel': 'sms',
    });
  }

  static Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final res = await ApiClient.post('/auth/verify-otp', {
      'phone': phone,
      'otp': otp,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> loginWithGoogle({
    required String email,
    required String name,
    required String googleId,
    String? picture,
    String? idToken,
  }) async {
    if (idToken == null || idToken.isEmpty) {
      throw ApiException(
        code: 'GOOGLE_ID_TOKEN_REQUIRED',
        message: 'Google identity verification is not configured in this client',
        statusCode: 401,
      );
    }
    final res = await ApiClient.post('/auth/google', {'idToken': idToken});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> guestLogin() async {
    final res = await ApiClient.post('/auth/guest', {});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> loginWithAuth0({
    String? accessToken,
    String? email,
    String? name,
    String? picture,
    String? sub,
  }) async {
    if (accessToken == null || accessToken.isEmpty) {
      throw ApiException(
        code: 'AUTH0_ACCESS_TOKEN_REQUIRED',
        message: 'Auth0 access token required',
        statusCode: 401,
      );
    }
    final res = await ApiClient.post('/auth/auth0', {'accessToken': accessToken});
    return res as Map<String, dynamic>;
  }
}
