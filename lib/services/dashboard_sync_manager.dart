import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class DashboardSyncManager {
  static const String _cacheKey = 'cached_dashboard_header_v1';

  static final ValueNotifier<Map<String, dynamic>> dashboardData =
      ValueNotifier<Map<String, dynamic>>({});

  static final ValueNotifier<bool> isSyncing = ValueNotifier<bool>(true);
  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString(_cacheKey);
      if (cachedStr != null && cachedStr.isNotEmpty) {
        final cachedData = jsonDecode(cachedStr) as Map<String, dynamic>;
        if (cachedData.isNotEmpty && cachedData.containsKey('games')) {
          dashboardData.value = cachedData;
          isSyncing.value = false;
        }
      }
    } catch (_) {}

    // Direct Pure Server-Driven Fetch
    syncWithServer();
  }

  static Future<void> syncWithServer() async {
    try {
      final response = await ApiService.getDashboardHeader();

      if (response != null && response.isNotEmpty) {
        final Map<String, dynamic> rawData = (response.containsKey('data') && response['data'] is Map<String, dynamic>)
            ? Map<String, dynamic>.from(response['data'])
            : Map<String, dynamic>.from(response);

        if (rawData.containsKey('games') || rawData.containsKey('profile')) {
          // Save to SharedPreferences for offline-first instant loading next time
          try {
            final prefs = await SharedPreferences.getInstance();
            await prefs.setString(_cacheKey, jsonEncode(rawData));
          } catch (_) {}

          // Update reactive notifier seamlessly
          dashboardData.value = rawData;
        }
      }
    } catch (e) {
      debugPrint('DashboardSyncManager error: $e');
    } finally {
      isSyncing.value = false;
    }
  }

  static void updateLocalBalance(double newBalance) {
    try {
      final currentMap = Map<String, dynamic>.from(dashboardData.value);
      final profileMap = Map<String, dynamic>.from(currentMap['profile'] ?? {});
      profileMap['balance'] = newBalance;
      currentMap['profile'] = profileMap;
      dashboardData.value = currentMap;

      SharedPreferences.getInstance().then((prefs) {
        prefs.setString(_cacheKey, jsonEncode(currentMap));
      });
    } catch (_) {}
  }
}
