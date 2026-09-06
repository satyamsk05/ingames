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
    String? idToken,
    String? email,
    String? name,
    String? picture,
    String? sub,
  }) async {
    final payload = <String, dynamic>{};
    if (accessToken != null && accessToken.isNotEmpty) payload['accessToken'] = accessToken;
    if (idToken != null && idToken.isNotEmpty) payload['idToken'] = idToken;
    if (email != null) payload['email'] = email;
    if (name != null) payload['name'] = name;
    if (picture != null) payload['picture'] = picture;
    if (sub != null) payload['sub'] = sub;

    final res = await ApiClient.post('/auth/auth0', payload);
    return res as Map<String, dynamic>;
  }
}
