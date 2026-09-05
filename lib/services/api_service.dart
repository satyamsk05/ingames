import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../core/api/api_client.dart';

class ApiService {
  static String serverDomain = const String.fromEnvironment(
    'SERVER_DOMAIN',
    defaultValue: kDebugMode ? 'http://localhost:5050' : 'https://ingames.onrender.com',
  );

  static String get baseUrl => '$serverDomain/api';

  static List<String> get _candidateBaseUrls => [
        if (serverDomain.isNotEmpty) '$serverDomain/api',
        'http://localhost:5050/api',
        'http://127.0.0.1:5050/api',
        'http://10.0.2.2:5050/api',
        'https://ingames.onrender.com/api',
      ];

  // 0a. Send OTP via SMS or WhatsApp
  static Future<Map<String, dynamic>?> sendOtp({
    required String phone,
    String channel = 'sms',
  }) async {
    for (final base in _candidateBaseUrls) {
      try {
        final response = await http.post(
          Uri.parse('$base/auth/send-otp'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': phone,
            'channel': channel,
          }),
        ).timeout(const Duration(seconds: 8));

        final data = jsonDecode(response.body);
        if (response.statusCode == 200) {
          serverDomain = base.replaceAll('/api', '');
          return data;
        } else if (data is Map<String, dynamic> && data['message'] != null) {
          return data;
        }
      } catch (_) {}
    }
    return {'status': 'error', 'message': 'Cannot connect to backend server. Check server connection.'};
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
    try {
      final res = await ApiClient.get('/games/bet-history?page=$page&limit=$limit');
      if (res is Map<String, dynamic>) return res['items'] as List<dynamic>? ?? <dynamic>[];
      return res as List<dynamic>;
    } catch (_) { return null; }
  }
}
