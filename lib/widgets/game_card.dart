import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class GameCardData {
  final String title;
  final String category;
  final String imagePath;
  final String playersOnline;
  final Color accentColor;

  const GameCardData({
    required this.title,
    required this.category,
    required this.imagePath,
    required this.playersOnline,
    this.accentColor = Colors.amber,
  });
}

class GameCard extends StatelessWidget {
  final GameCardData data;
  final VoidCallback onTap;

  const GameCard({
    super.key,
    required this.data,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Game Card Image Container
          Container(
            width: 175,
            height: 175,
            margin: const EdgeInsets.only(right: 16.0),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15.0),
              border: Border.all(
                color: AppColors.cardBorder,
                width: 3.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.purple.shade900.withValues(alpha: 0.5),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12.0),
              child: Image.asset(
                data.imagePath,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  final altPath = data.imagePath.startsWith('assets/')
                      ? data.imagePath.replaceFirst('assets/', 'Assets/')
                      : data.imagePath.replaceFirst('Assets/', 'assets/');
                  return Image.asset(
                    altPath,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: Colors.purple.shade900,
                        child: Center(
                          child: Icon(
                            Icons.sports_esports_rounded,
                            size: 60,
                            color: data.accentColor,
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
