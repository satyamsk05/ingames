import '../../../core/api/api_client.dart';

class AuthApi {
  static Future<Map<String, dynamic>> createLogginToken() async {
    final res = await ApiClient.post('/auth/loggin/create-token', {});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> verifyLogginToken(String token) async {
    final res = await ApiClient.post('/auth/loggin/verify-token', {'token': token});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> guestLogin() async {
    final res = await ApiClient.post('/auth/guest', {});
    return res as Map<String, dynamic>;
  }
}
