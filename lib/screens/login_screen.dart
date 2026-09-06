import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api/api_client.dart';
import '../core/storage/token_manager.dart';
import '../features/auth/data/auth_api.dart';
import '../services/api_service.dart';

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
  int _currentStep = 0; // 0: GetStarted, 1: Phone, 2: Verifying, 3: Age, 4: Name, 5: Welcome
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  final TextEditingController _phoneController = TextEditingController(text: '9876543210');
  final TextEditingController _nameController = TextEditingController(text: 'Player');
  int _selectedAge = 21;

  Map<String, dynamic> _sessionData = {};

  @override
  void dispose() {
    _phoneController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _handleSkipLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _statusMessage = null;
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

      _sessionData = res;
      _nameController.text = user['username']?.toString() ?? 'Guest';

      if (mounted) {
        setState(() {
          _isLoading = false;
          _currentStep = 5; // Move to Welcome Screen directly for guest
        });
      }
      _startWelcomeTransition();
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e is ApiException ? e.message : 'Guest login failed. Please check connection.';
        });
      }
    }
  }

  Future<void> _handlePhoneNext() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _statusMessage = 'Connecting to WhatsApp verification...';
    });

    try {
      // 1. Create Loggin auth token & pre-filled WhatsApp link
      final createRes = await AuthApi.createLogginToken();
      final logginToken = createRes['token']?.toString() ?? '';
      final link = createRes['link']?.toString() ?? '';

      if (logginToken.isEmpty || link.isEmpty) {
        throw Exception('Failed to generate WhatsApp verification link.');
      }

      if (mounted) {
        setState(() {
          _statusMessage = 'Opening WhatsApp...';
        });
      }

      // 2. Open pre-filled WhatsApp message
      final uri = Uri.parse(link);
      bool launched = false;
      try {
        launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      } catch (_) {}

      if (!launched) {
        launched = await launchUrl(uri, mode: LaunchMode.platformDefault);
      }

      if (mounted) {
        setState(() {
          _currentStep = 2; // Move to Auto Verification Screen
          _statusMessage = 'Waiting for WhatsApp verification message...';
        });
      }

      // 3. Server waits for verification identity via Loggin waitForVerify
      final verifyRes = await AuthApi.verifyLogginToken(logginToken);
      final appToken = verifyRes['token']?.toString() ?? '';
      final user = verifyRes['user'] as Map<String, dynamic>? ?? {};

      _sessionData = verifyRes;

      // 4. Save InGames user session locally
      await TokenManager.saveSession(
        token: appToken,
        userId: user['id']?.toString() ?? '',
        username: user['username']?.toString(),
        phone: user['phone']?.toString(),
        avatarPath: user['avatarPath']?.toString(),
      );

      if (user['username'] != null && user['username'].toString().isNotEmpty) {
        _nameController.text = user['username'].toString();
      } else {
        _nameController.text = 'Player';
      }

      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = null;
          _currentStep = 3; // Move to Enter Age Screen
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = null;
          _currentStep = 1; // Stay on phone screen on error
          _errorMessage = e is ApiException ? e.message : 'WhatsApp verification failed. Please try again.';
        });
      }
    }
  }

  void _handleAgeNext() {
    setState(() {
      _currentStep = 4; // Move to Enter Name Screen
    });
  }

  Future<void> _handleNameNext() async {
    FocusScope.of(context).unfocus();
    final name = _nameController.text.trim();
    if (name.isNotEmpty) {
      try {
        await ApiService.updateUserProfile(username: name);
      } catch (_) {}
    }

    if (mounted) {
      setState(() {
        _currentStep = 5; // Move to Welcome Screen
      });
    }

    _startWelcomeTransition();
  }

  void _startWelcomeTransition() {
    Timer(const Duration(milliseconds: 1600), () {
      if (mounted) {
        widget.onLoginSuccess(_sessionData);
      }
    });
  }

  Widget _buildWhatsAppIcon({double size = 28}) {
    try {
      return SvgPicture.asset(
        'Assets/whatsapp-svgrepo-com.svg',
        width: size,
        height: size,
      );
    } catch (_) {
      return Icon(
        Icons.chat_bubble_rounded,
        color: Colors.white,
        size: size,
      );
    }
  }

  Widget _buildStepIndicator(int activeIndex, int totalSteps) {
    return Row(
      children: List.generate(totalSteps, (index) {
        final isActive = index <= activeIndex;
        return Expanded(
          child: Container(
            height: 3,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: BoxDecoration(
              color: isActive ? Colors.white : Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_currentStep == 5) {
      return _buildWelcomeScreen();
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            // Top Navigation & Step Progress Bar (Shown for Steps 1..4)
            if (_currentStep > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        if (_currentStep > 1 && _currentStep != 2)
                          IconButton(
                            icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                            onPressed: () {
                              setState(() {
                                _currentStep--;
                              });
                            },
                          )
                        else
                          const SizedBox(width: 40),
                        _buildWhatsAppIcon(size: 24),
                        const SizedBox(width: 40),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: _buildStepIndicator(_currentStep - 1, 3),
                    ),
                  ],
                ),
              ),

            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                child: _buildCurrentStepView(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentStepView() {
    switch (_currentStep) {
      case 0:
        return _buildGetStartedScreen();
      case 1:
        return _buildPhoneScreen();
      case 2:
        return _buildVerifyingScreen();
      case 3:
        return _buildAgeScreen();
      case 4:
        return _buildNameScreen();
      default:
        return _buildGetStartedScreen();
    }
  }

  // --- STEP 0: Get Started Screen ---
  Widget _buildGetStartedScreen() {
    return Column(
      key: const ValueKey(0),
      children: [
        const Spacer(),
        // Hero Visual Area
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Column(
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white12, width: 2),
                ),
                child: Center(
                  child: Image.asset(
                    'Assets/images/classic_dice.png',
                    width: 60,
                    height: 60,
                    errorBuilder: (context, error, stackTrace) => const Icon(Icons.casino_rounded, color: Colors.white, size: 50),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Fluid Onboarding',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Designed to feel fast, secure and intuitive with buttery smooth transitions.',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),

        const Spacer(),

        // Bottom Action Buttons
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
          child: Column(
            children: [
              GestureDetector(
                onTap: () {
                  setState(() {
                    _currentStep = 1;
                  });
                },
                child: Container(
                  height: 58,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(29),
                  ),
                  child: Center(
                    child: Text(
                      'Get Started',
                      style: GoogleFonts.poppins(
                        color: Colors.black,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              GestureDetector(
                onTap: _handleSkipLogin,
                child: Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Text(
                    'Instant Play as Guest',
                    style: GoogleFonts.poppins(
                      color: Colors.white54,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // --- STEP 1: Enter Phone Number Screen ---
  Widget _buildPhoneScreen() {
    return Column(
      key: const ValueKey(1),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Enter your phone number',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                "We'll send a verification link via WhatsApp to this phone number",
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 13.5,
                ),
              ),
              const SizedBox(height: 32),

              // Phone Number Input Box
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF161F2E),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  children: [
                    Text(
                      '🇮🇳 +91',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(width: 1, height: 24, color: Colors.white24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.5,
                        ),
                        decoration: const InputDecoration(
                          hintText: '9876543210',
                          hintStyle: TextStyle(color: Colors.white30),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              if (_errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12.0),
                  child: Text(
                    _errorMessage!,
                    style: GoogleFonts.poppins(
                      color: const Color(0xFFFF5252),
                      fontSize: 13,
                    ),
                  ),
                ),
            ],
          ),
        ),

        const Spacer(),

        // Bottom Next Button
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
          child: GestureDetector(
            onTap: _isLoading ? null : _handlePhoneNext,
            child: Container(
              height: 58,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(29),
              ),
              child: Center(
                child: _isLoading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2.5),
                      )
                    : Text(
                        'Next',
                        style: GoogleFonts.poppins(
                          color: Colors.black,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // --- STEP 2: Verifying Screen ---
  Widget _buildVerifyingScreen() {
    return Column(
      key: const ValueKey(2),
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Spacer(),
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: const Color(0xFF25D366).withValues(alpha: 0.15),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFF25D366).withValues(alpha: 0.4), width: 2),
          ),
          child: Center(
            child: _buildWhatsAppIcon(size: 40),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Verifying WhatsApp...',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40.0),
          child: Text(
            _statusMessage ?? 'Please send the pre-filled message in WhatsApp to verify your account.',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              color: Colors.white60,
              fontSize: 13.5,
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(height: 32),
        const SizedBox(
          width: 32,
          height: 32,
          child: CircularProgressIndicator(
            color: Color(0xFF25D366),
            strokeWidth: 3,
          ),
        ),
        const Spacer(),
      ],
    );
  }

  // --- STEP 3: Enter Age Screen ---
  Widget _buildAgeScreen() {
    return Column(
      key: const ValueKey(3),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Enter your age',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                "We'll use this to personalize your experience",
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 13.5,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 30),

        // Age Wheel Selector
        SizedBox(
          height: 200,
          child: CupertinoPicker(
            itemExtent: 44,
            scrollController: FixedExtentScrollController(initialItem: 3), // 21
            onSelectedItemChanged: (index) {
              setState(() {
                _selectedAge = 18 + index;
              });
            },
            children: List.generate(80, (index) {
              final age = 18 + index;
              final isSelected = age == _selectedAge;
              return Center(
                child: Text(
                  '$age',
                  style: GoogleFonts.poppins(
                    color: isSelected ? Colors.white : Colors.white38,
                    fontSize: isSelected ? 22 : 17,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
              );
            }),
          ),
        ),

        const Spacer(),

        // Bottom Next Button
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
          child: GestureDetector(
            onTap: _handleAgeNext,
            child: Container(
              height: 58,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(29),
              ),
              child: Center(
                child: Text(
                  'Next',
                  style: GoogleFonts.poppins(
                    color: Colors.black,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // --- STEP 4: Enter Name Screen ---
  Widget _buildNameScreen() {
    return Column(
      key: const ValueKey(4),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 24),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Enter your name',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'This is how you will appear to others',
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 13.5,
                ),
              ),
              const SizedBox(height: 32),

              // Name Input Box
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF161F2E),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: TextField(
                  controller: _nameController,
                  autofocus: true,
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: const InputDecoration(
                    hintText: 'Alex',
                    hintStyle: TextStyle(color: Colors.white30),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ],
          ),
        ),

        const Spacer(),

        // Bottom Next Button
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
          child: GestureDetector(
            onTap: _handleNameNext,
            child: Container(
              height: 58,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(29),
              ),
              child: Center(
                child: Text(
                  'Next',
                  style: GoogleFonts.poppins(
                    color: Colors.black,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // --- STEP 5: Welcome Screen (Final Transition) ---
  Widget _buildWelcomeScreen() {
    final displayName = _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : 'Alex';
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white,
              Color(0xFFF7FEE7),
              Color(0xFFD9F99D),
              Color(0xFFBEF264),
            ],
            stops: [0.0, 0.45, 0.75, 1.0],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 60),
                Text(
                  'Welcome,',
                  style: GoogleFonts.poppins(
                    color: Colors.black87,
                    fontSize: 44,
                    fontWeight: FontWeight.w800,
                    height: 1.1,
                    letterSpacing: -1.0,
                  ),
                ),
                Text(
                  displayName,
                  style: GoogleFonts.poppins(
                    color: Colors.black,
                    fontSize: 44,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                    letterSpacing: -1.0,
                  ),
                ),
                const Spacer(),
                Center(
                  child: Container(
                    width: 38,
                    height: 38,
                    padding: const EdgeInsets.all(4),
                    child: const CircularProgressIndicator(
                      color: Colors.black,
                      strokeWidth: 3.5,
                    ),
                  ),
                ),
                const SizedBox(height: 50),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
