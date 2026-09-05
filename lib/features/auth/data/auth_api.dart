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
  }) async {
    final res = await ApiClient.post('/auth/google', {
      'email': email,
      'name': name,
      'googleId': googleId,
      'picture': picture,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> guestLogin() async {
    final res = await ApiClient.post('/auth/guest', {});
    return res as Map<String, dynamic>;
  }
}
