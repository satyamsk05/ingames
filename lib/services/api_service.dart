import '../core/api/api_client.dart';

class ApiService {
  static String serverDomain = const String.fromEnvironment('SERVER_DOMAIN', defaultValue: 'https://ingames.onrender.com');
  static String get baseUrl => '$serverDomain/api';

  static Future<Map<String, dynamic>?> sendOtp({required String phone, String channel = 'sms'}) async {
    try { return (await ApiClient.post('/auth/send-otp', {'phone': phone, 'channel': channel})) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> verifyOtp({required String phone, required String otp}) async {
    try { return (await ApiClient.post('/auth/verify-otp', {'phone': phone, 'otp': otp})) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> getAppConfig() async {
    try { return (await ApiClient.get('/config')) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> getUserProfile() async {
    try { return (await ApiClient.get('/user/profile')) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> updateUserProfile({String? username, String? avatarPath}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    if (avatarPath != null) body['avatarPath'] = avatarPath;
    try { return (await ApiClient.post('/user/update-profile', body)) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<List<dynamic>?> getGamesList() async {
    try { return (await ApiClient.get('/games')) as List<dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> addCash({required double amount, required String paymentMethod}) async {
    try { return (await ApiClient.post('/wallet/add-cash', {'amount': amount, 'paymentMethod': paymentMethod})) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> withdrawCash({required double amount, required String upiId}) async {
    try { return (await ApiClient.post('/wallet/withdraw', {'amount': amount, 'upiId': upiId})) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<bool> joinGame({required String gameId, required double entryFee}) async {
    try { await ApiClient.post('/games/join', {'gameId': gameId, 'stakeAmount': entryFee}); return true; } catch (_) { return false; }
  }
  static Future<Map<String, dynamic>?> getTransactions({int page = 1, int limit = 20}) async {
    try { return (await ApiClient.get('/wallet/transactions?page=$page&limit=$limit')) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<List<dynamic>?> getBanners() async => null;
  static Future<List<dynamic>?> getBetHistory({int page = 1, int limit = 20}) async {
    try { return (await ApiClient.get('/games/bet-history?page=$page&limit=$limit')) as List<dynamic>; } catch (_) { return null; }
  }
}
