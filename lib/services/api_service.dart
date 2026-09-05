import '../../../core/api/api_client.dart';

class ApiService {
  static String serverDomain = const String.fromEnvironment(
    'SERVER_DOMAIN',
    defaultValue: 'https://ingames.onrender.com',
  );

  static String get baseUrl => '$serverDomain/api';

  static Future<Map<String, dynamic>?> sendOtp({required String phone, String channel = 'sms'}) async {
    try {
      final res = await ApiClient.post('/auth/send-otp', {'phone': phone, 'channel': channel});
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> verifyOtp({required String phone, required String otp}) async {
    try {
      final res = await ApiClient.post('/auth/verify-otp', {'phone': phone, 'otp': otp});
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getAppConfig() async {
    try {
      final res = await ApiClient.get('/config');
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getUserProfile() async {
    try {
      final res = await ApiClient.get('/user/profile');
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> updateUserProfile({String? username, String? avatarPath}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    if (avatarPath != null) body['avatarPath'] = avatarPath;
    try {
      final res = await ApiClient.post('/user/update-profile', body);
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<List<dynamic>?> getGamesList() async {
    try {
      final res = await ApiClient.get('/games');
      return res as List<dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> addCash({required double amount, required String paymentMethod}) async {
    try {
      final res = await ApiClient.post('/wallet/add-cash', {'amount': amount, 'paymentMethod': paymentMethod});
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> withdrawCash({required double amount, required String upiId}) async {
    try {
      final res = await ApiClient.post('/wallet/withdraw', {'amount': amount, 'upiId': upiId});
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> joinGame({required String gameId, required double entryFee}) async {
    try {
      await ApiClient.post('/games/join', {'gameId': gameId, 'stakeAmount': entryFee});
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>?> getTransactions({int page = 1, int limit = 20}) async {
    try {
      final res = await ApiClient.get('/wallet/transactions?page=$page&limit=$limit');
      return res as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<List<dynamic>?> getBanners() async {
    return null;
  }

  static Future<List<dynamic>?> getBetHistory({int page = 1, int limit = 20}) async {
    try {
      final res = await ApiClient.get('/games/bet-history?page=$page&limit=$limit');
      return res as List<dynamic>;
    } catch (_) {
      return null;
    }
  }
}
