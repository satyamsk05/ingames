import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/api/api_client.dart';
import '../core/storage/token_manager.dart';
import '../features/auth/data/auth_api.dart';

enum LoginStep { selectMethod, enterPhone, verifyOtp }

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
  LoginStep _currentStep = LoginStep.selectMethod;
  final String _otpChannel = 'whatsapp'; // 'whatsapp' or 'sms'

  final TextEditingController _phoneController = TextEditingController();
  String _enteredOtp = '';

  bool _isLoading = false;
  String? _errorMessage;

  int _resendTimerSeconds = 30;
  Timer? _timer;

  @override
  void dispose() {
    _phoneController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _startResendTimer() {
    _timer?.cancel();
    setState(() {
      _resendTimerSeconds = 30;
    });
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_resendTimerSeconds > 0) {
        setState(() {
          _resendTimerSeconds--;
        });
      } else {
        timer.cancel();
      }
    });
  }

  Future<void> _handleSendOtp() async {
    final phone = _phoneController.text.trim();
    if (phone.length < 10) {
      setState(() {
        _errorMessage = 'Please enter a valid 10-digit mobile number';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await AuthApi.sendOtp(phone);
      setState(() {
        _isLoading = false;
        _enteredOtp = '';
        _currentStep = LoginStep.verifyOtp;
      });
      _startResendTimer();
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e is ApiException ? e.message : 'Failed to send OTP. Check backend server connection.';
      });
    }
  }

  Future<void> _handleVerifyOtp(String pin) async {
    final phone = _phoneController.text.trim();
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await AuthApi.verifyOtp(phone, pin);
      final token = response['token']?.toString() ?? '';
      final user = response['user'] as Map<String, dynamic>? ?? {};

      await TokenManager.saveSession(
        token: token,
        userId: user['id']?.toString() ?? '',
        username: user['username']?.toString(),
        phone: user['phone']?.toString(),
      );

      setState(() {
        _isLoading = false;
      });

      widget.onLoginSuccess(response);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _enteredOtp = '';
        _errorMessage = e is ApiException ? e.message : 'Invalid OTP code entered. Please try again.';
      });
    }
  }

  void _onKeyPress(String val) {
    if (_enteredOtp.length < 4) {
      setState(() {
        _enteredOtp += val;
        _errorMessage = null;
      });
      if (_enteredOtp.length == 4) {
        _handleVerifyOtp(_enteredOtp);
      }
    }
  }

  void _onKeyBackspace() {
    if (_enteredOtp.isNotEmpty) {
      setState(() {
        _enteredOtp = _enteredOtp.substring(0, _enteredOtp.length - 1);
        _errorMessage = null;
      });
    }
  }

  Widget _buildWhatsAppIcon({double size = 32}) {
    return SvgPicture.asset(
      'Assets/whatsapp-svgrepo-com.svg',
      width: size,
      height: size,
      errorBuilder: (context, error, stackTrace) => Icon(
        Icons.chat_bubble_rounded,
        color: const Color(0xFF25D366),
        size: size,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF09111C), // Consistent Dark Theme for all pages
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _buildCurrentStepView(),
        ),
      ),
    );
  }

  Widget _buildCurrentStepView() {
    switch (_currentStep) {
      case LoginStep.selectMethod:
        return _buildRegisterMethodView();
      case LoginStep.enterPhone:
        return _buildPhoneInputView();
      case LoginStep.verifyOtp:
        return _buildOtpVerificationView();
    }
  }

  void _handleSkipLogin() async {
    const guestToken = 'jwt_guest_token';
    await TokenManager.saveSession(
      token: guestToken,
      userId: 'usr_guest',
      username: 'Guest Player',
      phone: '',
    );
    widget.onLoginSuccess({
      'status': 'success',
      'token': guestToken,
      'data': {
        'id': 'usr_guest',
        'username': 'Guest Player',
        'phoneNumber': '',
        'depositBalance': 0.0,
        'winningsBalance': 0.0,
        'rewardsBalance': 0.0,
        'totalBalance': 0.0,
      }
    });
  }

  Widget _buildTopHeaderBar({VoidCallback? onBackTap}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (onBackTap != null)
            GestureDetector(
              onTap: onBackTap,
              child: Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFF1E2B3C),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: const Icon(
                  Icons.arrow_back_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            )
          else
            const SizedBox(width: 46),

          // Right Side: Skip Button
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
    );
  }

  Future<void> _handleGoogleLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await AuthApi.loginWithGoogle(
        email: 'satyam.gamer@gmail.com',
        name: 'Satyam Kumar',
        googleId: 'g_satyam_1001',
        picture: 'assets/avatar/avatar_1.png',
      );

      final token = response['token']?.toString() ?? '';
      final user = response['user'] as Map<String, dynamic>? ?? {};

      await TokenManager.saveSession(
        token: token,
        userId: user['id']?.toString() ?? '',
        username: user['username']?.toString(),
        phone: user['phone']?.toString(),
      );

      setState(() {
        _isLoading = false;
      });

      widget.onLoginSuccess(response);
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e is ApiException ? e.message : 'Google authentication failed. Please check network connection.';
      });
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

  // ----------------------------------------------------
  // STEP 1: REGISTER METHOD SELECTION SCREEN (Google Sign-In Focus)
  // ----------------------------------------------------
  Widget _buildRegisterMethodView() {
    return Column(
      key: const ValueKey('step_register_method'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0),
          child: _buildTopHeaderBar(onBackTap: null),
        ),

        // Spacer pushes content to bottom
        const Spacer(),

        // Header Section
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.account_circle_rounded,
                size: 44,
                color: Colors.white,
              ),
              const SizedBox(height: 8),

              Text(
                'Welcome to InGames',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                'Sign in with your Google account to start playing',
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 28),

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

        const SizedBox(height: 32),
      ],
    );
  }

  // ----------------------------------------------------
  // STEP 2: ENTER MOBILE NUMBER SCREEN (Dark Mode Theme)
  // ----------------------------------------------------
  Widget _buildPhoneInputView() {
    return Padding(
      key: const ValueKey('step_phone_input'),
      padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildTopHeaderBar(
            onBackTap: () => setState(() => _currentStep = LoginStep.selectMethod),
          ),

          const SizedBox(height: 28),

          Row(
            children: [
              if (_otpChannel == 'whatsapp')
                _buildWhatsAppIcon(size: 22)
              else
                const Icon(
                  Icons.chat_bubble_rounded,
                  color: Color(0xFF007AFF),
                  size: 22,
                ),
              const SizedBox(width: 8),
              Text(
                _otpChannel == 'whatsapp' ? 'WhatsApp Verification' : 'SMS Verification',
                style: GoogleFonts.poppins(
                  color: _otpChannel == 'whatsapp' ? const Color(0xFF25D366) : const Color(0xFF007AFF),
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Main Title: "Enter Mobile Number" (White in Dark Mode)
          Text(
            'Enter Mobile Number',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),

          const SizedBox(height: 8),

          // Subtitle
          Text(
            'We will send a 4-digit code to verify your account',
            style: GoogleFonts.poppins(
              color: Colors.white60,
              fontSize: 14,
              height: 1.3,
            ),
          ),

          const SizedBox(height: 28),

          // Dark Card Input Box with Green Border (#25D366) & 🇮🇳 +91 Prefix
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF162232),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: _otpChannel == 'whatsapp'
                    ? const Color(0xFF25D366)
                    : const Color(0xFF007AFF),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                // 🇮🇳 +91 Country Code Section
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  decoration: BoxDecoration(
                    border: Border(right: BorderSide(color: Colors.white.withValues(alpha: 0.1))),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        '🇮🇳',
                        style: TextStyle(fontSize: 18),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '+91',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),

                // Phone Digits Text Field
                Expanded(
                  child: TextField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    autofocus: true,
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                    ),
                    decoration: InputDecoration(
                      counterText: '',
                      hintText: 'Enter 10 digit number',
                      hintStyle: GoogleFonts.poppins(
                        color: Colors.white38,
                        fontSize: 15,
                        fontWeight: FontWeight.normal,
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
          ),

          if (_errorMessage != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMessage!,
              style: GoogleFonts.poppins(color: Colors.redAccent, fontSize: 13),
            ),
          ],

          const Spacer(),

          // Bottom Green Action Button: SEND OTP
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: _isLoading ? null : _handleSendOtp,
              style: ElevatedButton.styleFrom(
                backgroundColor: _otpChannel == 'whatsapp'
                    ? const Color(0xFF25D366)
                    : const Color(0xFF007AFF),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
                elevation: 4,
              ),
              child: _isLoading
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                    )
                  : Text(
                      'SEND OTP',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.0,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  // ----------------------------------------------------
  // STEP 3: OTP VERIFICATION PAGE (Image 1 EXACT MATCH)
  // ----------------------------------------------------
  Widget _buildOtpVerificationView() {
    final timerFormatted = '00:${_resendTimerSeconds.toString().padLeft(2, '0')}';

    return Column(
      key: const ValueKey('step_otp_verification'),
      children: [
        // Top Section: Back Button, Timer, Instructions & PIN Boxes
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Column(
              children: [
                const SizedBox(height: 16),

                _buildTopHeaderBar(
                  onBackTap: () => setState(() => _currentStep = LoginStep.enterPhone),
                ),

                const Spacer(flex: 1),

                // Large Prominent Timer: 00:23
                Text(
                  timerFormatted,
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 48,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),

                const SizedBox(height: 12),

                // Instruction Subtitle
                Text(
                  "Type the verification code\nwe've sent you",
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: Colors.white70,
                    fontSize: 15,
                    height: 1.4,
                  ),
                ),

                const SizedBox(height: 36),

                // 4 Rounded Square PIN Boxes
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(4, (index) {
                    final hasChar = index < _enteredOtp.length;
                    final char = hasChar ? _enteredOtp[index] : '';

                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 8),
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        color: hasChar
                            ? const Color(0xFF283648)
                            : const Color(0xFF1E2836),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: hasChar
                              ? const Color(0xFF00D2B6)
                              : Colors.white.withValues(alpha: 0.08),
                          width: hasChar ? 2 : 1,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          char,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    );
                  }),
                ),

                const SizedBox(height: 24),

                // Send again Link
                _resendTimerSeconds > 0
                    ? Text(
                        'Send again',
                        style: GoogleFonts.poppins(
                          color: Colors.white38,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      )
                    : GestureDetector(
                        onTap: _handleSendOtp,
                        child: Text(
                          'Send again',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF00D2B6),
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),

                if (_errorMessage != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _errorMessage!,
                    style: GoogleFonts.poppins(color: Colors.redAccent, fontSize: 13),
                  ),
                ],

                if (_isLoading) ...[
                  const SizedBox(height: 14),
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Color(0xFF00D2B6), strokeWidth: 2),
                  ),
                ],

                const Spacer(flex: 2),
              ],
            ),
          ),
        ),

        // Bottom Half: Custom Keypad (1 to 9, 0, Backspace ⌫)
        Container(
          color: const Color(0xFF0E1724),
          padding: const EdgeInsets.only(left: 24, right: 24, top: 20, bottom: 28),
          child: Column(
            children: [
              _buildKeypadRow(['1', '2', '3']),
              const SizedBox(height: 18),
              _buildKeypadRow(['4', '5', '6']),
              const SizedBox(height: 18),
              _buildKeypadRow(['7', '8', '9']),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(child: Container()), // Empty space left
                  Expanded(
                    child: _buildKeypadButton('0', onTap: () => _onKeyPress('0')),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: _onKeyBackspace,
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        height: 52,
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.backspace_outlined,
                          color: Colors.white70,
                          size: 22,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildKeypadRow(List<String> keys) {
    return Row(
      children: keys.map((k) {
        return Expanded(
          child: _buildKeypadButton(k, onTap: () => _onKeyPress(k)),
        );
      }).toList(),
    );
  }

  Widget _buildKeypadButton(String label, {required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 52,
        alignment: Alignment.center,
        child: Text(
          label,
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
