import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.take(2).map((p) => p.isEmpty ? '' : p[0].toUpperCase()).join();
}

String timeRange(DateTime start, DateTime end) {
  final f = DateFormat('HH:mm');
  return '${f.format(start)} - ${f.format(end)}';
}

class Avatar extends StatelessWidget {
  final String name;
  final double size;
  const Avatar(this.name, {super.key, this.size = 44});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: AppColors.indigoLight,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initials(name),
        style: TextStyle(
          color: AppColors.indigoDark,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
        ),
      ),
    );
  }
}

class StatusBadge extends StatelessWidget {
  final String label;
  final Color bg;
  final Color fg;
  const StatusBadge(this.label, {super.key, required this.bg, required this.fg});

  factory StatusBadge.forStatus(String status) {
    switch (status) {
      case 'approved':
        return const StatusBadge('Одобрено',
            bg: AppColors.greenBg, fg: AppColors.green);
      case 'rejected':
        return const StatusBadge('Отклонено',
            bg: AppColors.redBg, fg: AppColors.red);
      case 'pending':
        return const StatusBadge('Ожидает',
            bg: Color(0xFFEEF0F4), fg: AppColors.textMuted);
      default:
        return StatusBadge(status,
            bg: AppColors.blueBg, fg: AppColors.indigoDark);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(
              color: fg, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}

/// Accent colour used for the left bar on shift cards.
Color statusAccent(String status) {
  switch (status) {
    case 'active':
      return AppColors.green;
    case 'cancelled':
    case 'swap':
      return AppColors.red;
    default:
      return AppColors.indigo;
  }
}

class SectionLabel extends StatelessWidget {
  final String text;
  const SectionLabel(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: AppColors.textMuted,
          fontWeight: FontWeight.w700,
          fontSize: 13,
          letterSpacing: 0.5,
        ),
      );
}

class LoadingBox extends StatelessWidget {
  const LoadingBox({super.key});
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(40),
        child: Center(
            child: CircularProgressIndicator(color: AppColors.indigo)),
      );
}
