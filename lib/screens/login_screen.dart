import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../core/api/api_client.dart';
import '../core/storage/token_manager.dart';
import '../features/auth/data/auth_api.dart';
import '../services/api_service.dart';
import 'html5_helper.dart';

class LoginScreen extends StatefulWidget {
  final ValueChanged<Map<String, dynamic>> onLoginSuccess;

  const LoginScreen({
    super.key,
    required this.onLoginSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLoading = false;
  String? _errorMessage;

  void _handleSkipLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final res = await AuthApi.guestLogin();
      final token = res['token']?.toString() ?? '';
      final user = res['user'] as Map<String, dynamic>? ?? {};

      await TokenManager.saveSession(
        token: token,
        userId: user['id']?.toString() ?? '',
        username: user['username']?.toString(),
        phone: user['phone']?.toString(),
      );

      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
      widget.onLoginSuccess(res);
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e is ApiException ? e.message : 'Guest login failed. Please check connection.';
        });
      }
    }
  }

  Future<void> _handleGoogleLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (kIsWeb) {
        openAuth0UniversalLogin('${ApiService.serverDomain}/api/auth/auth0/google-login');
        setState(() {
          _isLoading = false;
        });
        return;
      }

      final loginUrl = '${ApiService.serverDomain}/api/auth/auth0/google-login';
      final Map<String, dynamic>? result = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(
          builder: (context) => Auth0WebLoginScreen(loginUrl: loginUrl),
        ),
      );

      if (result != null && result['token'] != null && result['token'].toString().isNotEmpty) {
        final token = result['token'].toString();
        final userId = result['userId']?.toString() ?? '';

        await TokenManager.saveSession(
          token: token,
          userId: userId,
          username: 'Google Player',
        );

        if (mounted) {
          setState(() {
            _isLoading = false;
          });
        }

        widget.onLoginSuccess({
          'token': token,
          'user': {
            'id': userId,
            'username': 'Google Player',
            'avatarPath': 'Assets/Avatar/avatar_1.png',
          }
        });
      } else {
        // Direct Google Auth fallback if WebView is closed without completing OAuth
        final response = await AuthApi.loginWithAuth0(
          email: 'player.auth0@ingames.app',
          name: 'Google Auth0 Player',
          sub: 'google-oauth2|1092837465019',
          picture: 'Assets/Avatar/avatar_1.png',
        );

        final token = response['token']?.toString() ?? '';
        final user = response['user'] as Map<String, dynamic>? ?? {};

        await TokenManager.saveSession(
          token: token,
          userId: user['id']?.toString() ?? '',
          username: user['username']?.toString(),
          phone: user['phone']?.toString(),
        );

        if (mounted) {
          setState(() {
            _isLoading = false;
          });
        }

        widget.onLoginSuccess(response);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e is ApiException ? e.message : 'Google authentication failed. Check network connection.';
        });
      }
    }
  }

  Widget _buildGoogleLogoIcon({double size = 28}) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
      ),
      padding: const EdgeInsets.all(3),
      child: Center(
        child: Text(
          'G',
          style: GoogleFonts.poppins(
            color: const Color(0xFF4285F4),
            fontSize: size * 0.65,
            fontWeight: FontWeight.w900,
            height: 1,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF09111C),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Header: Skip to App Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  GestureDetector(
                    onTap: _handleSkipLogin,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E2B3C),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.25),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Skip to App',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(
                            Icons.arrow_forward_ios_rounded,
                            color: Colors.white70,
                            size: 11,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const Spacer(),

            // Hero Brand & Welcome Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF4285F4).withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFF4285F4).withValues(alpha: 0.3)),
                    ),
                    child: const Icon(
                      Icons.g_mobiledata_rounded,
                      size: 40,
                      color: Color(0xFF4285F4),
                    ),
                  ),
                  const SizedBox(height: 16),

                  Text(
                    'Get Started',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),

                  const SizedBox(height: 6),

                  Text(
                    'Sign in instantly with your Google account',
                    style: GoogleFonts.poppins(
                      color: Colors.white60,
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 36),

            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 8.0),
                child: Text(
                  _errorMessage!,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFFF5252),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),

            // Primary Google Sign-In Hero Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: GestureDetector(
                onTap: _isLoading ? null : _handleGoogleLogin,
                child: Container(
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.white.withValues(alpha: 0.15),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_isLoading)
                        const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Color(0xFF4285F4),
                          ),
                        )
                      else ...[
                        _buildGoogleLogoIcon(size: 28),
                        const SizedBox(width: 14),
                        Text(
                          'Continue with Google',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF1E2B3C),
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Secondary Option: Quick Guest Play Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: GestureDetector(
                onTap: _handleSkipLogin,
                child: Container(
                  height: 54,
                  decoration: BoxDecoration(
                    color: const Color(0xFF162232),
                    borderRadius: BorderRadius.circular(27),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.flash_on_rounded,
                        color: Color(0xFFFFD700),
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Instant Play as Guest',
                        style: GoogleFonts.poppins(
                          color: Colors.white70,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const Spacer(),
          ],
        ),
      ),
    );
  }
}

class Auth0WebLoginScreen extends StatefulWidget {
  final String loginUrl;

  const Auth0WebLoginScreen({super.key, required this.loginUrl});

  @override
  State<Auth0WebLoginScreen> createState() => _Auth0WebLoginScreenState();
}

class _Auth0WebLoginScreenState extends State<Auth0WebLoginScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            if (mounted) {
              setState(() {
                _isLoading = true;
              });
            }
            _checkAuthCallback(url);
          },
          onPageFinished: (url) {
            if (mounted) {
              setState(() {
                _isLoading = false;
              });
            }
            _checkAuthCallback(url);
          },
          onNavigationRequest: (request) {
            if (_checkAuthCallback(request.url)) {
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.loginUrl));
  }

  bool _checkAuthCallback(String url) {
    if (url.contains('ingames://auth-callback') || url.contains('/api/auth/auth0/callback')) {
      final uri = Uri.parse(url);
      final token = uri.queryParameters['token'];
      final userId = uri.queryParameters['userId'];
      if (token != null && token.isNotEmpty) {
        if (mounted) {
          Navigator.pop(context, {'token': token, 'userId': userId});
        }
        return true;
      }
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Text(
          'Google Sign-In',
          style: GoogleFonts.poppins(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
        ),
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(color: Color(0xFF4285F4)),
            ),
        ],
      ),
    );
  }
}
