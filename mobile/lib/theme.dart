import 'package:flutter/material.dart';

/// ShiftFlow brand palette, taken from the Stitch mobile mockups.
class AppColors {
  static const indigo = Color(0xFF4F46E5);
  static const indigoDark = Color(0xFF4338CA);
  static const indigoLight = Color(0xFFEEF0FF);
  static const bg = Color(0xFFF6F7FB);
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE8EAF1);
  static const text = Color(0xFF1E2130);
  static const textMuted = Color(0xFF6B7180);
  static const textFaint = Color(0xFF9AA0AE);
  static const green = Color(0xFF15935A);
  static const greenBg = Color(0xFFD8F7E6);
  static const red = Color(0xFFD6455A);
  static const redBg = Color(0xFFFFE2E4);
  static const blueBg = Color(0xFFE2E8FF);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.indigo,
      primary: AppColors.indigo,
      surface: AppColors.surface,
    ),
    scaffoldBackgroundColor: AppColors.bg,
    fontFamily: 'Roboto',
  );

  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.indigo,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        color: AppColors.indigo,
        fontWeight: FontWeight.w800,
        fontSize: 20,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.indigo, width: 1.6),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.indigo,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
  );
}
