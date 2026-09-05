  Future<void> _handleSkipLogin() async {
    if (_isLoading) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await AuthApi.guestLogin();
      final token = res['token']?.toString() ?? '';
      final user = res['user'] as Map<String, dynamic>? ?? {};
      if (token.isEmpty || user['id'] == null) {
        throw ApiException(code: 'INVALID_SESSION', message: 'Server returned an invalid guest session', statusCode: 500);
      }

      await TokenManager.saveSession(
        token: token,
        userId: user['id'].toString(),
        username: user['username']?.toString(),
        phone: user['phone']?.toString(),
      );

      if (!mounted) return;
      setState(() {
        _isLoading = false;
      });
      widget.onLoginSuccess(res);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = e is ApiException ? e.message : 'Unable to start guest session. Check your connection.';
      });
    }
  }
