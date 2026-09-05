import '../../../core/api/api_client.dart';

class GameApi {
  static Future<List<dynamic>> getGamesList() async {
    final res = await ApiClient.get('/games');
    return res as List<dynamic>;
  }

  static Future<Map<String, dynamic>> getCurrent7UpDownRound() async {
    final res = await ApiClient.get('/games/7updown/current-round');
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> placeBet({
    required String roundId,
    required String betType,
    required double stakeAmount,
    String? idempotencyKey,
  }) async {
    final res = await ApiClient.post('/games/join', {
      'roundId': roundId,
      'betType': betType,
      'stakeAmount': stakeAmount,
      'idempotencyKey': idempotencyKey,
    });
    return res as Map<String, dynamic>;
  }

  static Future<List<dynamic>> getBetHistory({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/games/bet-history?page=$page&limit=$limit');
    return res as List<dynamic>;
  }
}
