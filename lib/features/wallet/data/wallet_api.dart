import '../../../core/api/api_client.dart';

class WalletApi {
  static Future<Map<String, dynamic>> getUserProfile() async {
    final res = await ApiClient.get('/user/profile');
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> addCash({
    required double amount,
    required String paymentMethod,
    String? idempotencyKey,
  }) async {
    final res = await ApiClient.post('/wallet/add-cash', {
      'amount': amount,
      'paymentMethod': paymentMethod,
      'idempotencyKey': idempotencyKey,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> withdrawCash({
    required double amount,
    required String upiId,
    String? idempotencyKey,
  }) async {
    final res = await ApiClient.post('/wallet/withdraw', {
      'amount': amount,
      'upiId': upiId,
      'idempotencyKey': idempotencyKey,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getTransactions({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/wallet/transactions?page=$page&limit=$limit');
    return res as Map<String, dynamic>;
  }
}
