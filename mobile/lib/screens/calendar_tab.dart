import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class CalendarTab extends StatefulWidget {
  const CalendarTab({super.key});
  @override
  State<CalendarTab> createState() => _CalendarTabState();
}

class _CalendarTabState extends State<CalendarTab> {
  late DateTime _weekStart;
  DateTime _selected = DateTime.now();
  List<Shift> _shifts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _weekStart = _startOfWeek(DateTime.now());
    _load();
  }

  DateTime _startOfWeek(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    return day.subtract(Duration(days: (day.weekday + 6) % 7));
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final from = _weekStart;
    final to = _weekStart.add(const Duration(days: 7));
    try {
      final data = await ApiClient.instance.get(
          '/shifts?from=${from.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}');
      setState(() {
        _shifts =
            (data['shifts'] as List).map((j) => Shift.fromJson(j)).toList();
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final days = List.generate(7, (i) => _weekStart.add(Duration(days: i)));
    final dayShifts = _shifts.where((s) => _sameDay(s.startsAt, _selected)).toList()
      ..sort((a, b) => a.startsAt.compareTo(b.startsAt));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Календарь',
                  style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text)),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left),
                    onPressed: () {
                      setState(() => _weekStart =
                          _weekStart.subtract(const Duration(days: 7)));
                      _load();
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.chevron_right),
                    onPressed: () {
                      setState(() => _weekStart =
                          _weekStart.add(const Duration(days: 7)));
                      _load();
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
        SizedBox(
          height: 78,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: days.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final d = days[i];
              final selected = _sameDay(d, _selected);
              return GestureDetector(
                onTap: () => setState(() => _selected = d),
                child: Container(
                  width: 52,
                  decoration: BoxDecoration(
                    color: selected ? AppColors.indigo : AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        DateFormat('E', 'ru').format(d).toUpperCase(),
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: selected
                                ? Colors.white70
                                : AppColors.textFaint),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${d.day}',
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: selected ? Colors.white : AppColors.text),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _loading
              ? const LoadingBox()
              : dayShifts.isEmpty
                  ? const Center(
                      child: Text('На этот день смен нет',
                          style: TextStyle(color: AppColors.textFaint)))
                  : ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: dayShifts.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, i) =>
                          _ShiftCard(shift: dayShifts[i]),
                    ),
        ),
      ],
    );
  }
}

class _ShiftCard extends StatelessWidget {
  final Shift shift;
  const _ShiftCard({required this.shift});
  @override
  Widget build(BuildContext context) {
    final accent = statusAccent(shift.status);
    return Card(
      child: IntrinsicHeight(
        child: Row(
          children: [
            Container(
              width: 6,
              decoration: BoxDecoration(
                color: accent,
                borderRadius:
                    const BorderRadius.horizontal(left: Radius.circular(16)),
              ),
            ),
            const SizedBox(width: 12),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Avatar(shift.userName ?? 'Открытая', size: 44),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(shift.userName ?? 'Открытая смена',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(shift.jobTitle ?? shift.title,
                        style: const TextStyle(color: AppColors.textMuted)),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Text(timeRange(shift.startsAt, shift.endsAt),
                  style: TextStyle(
                      color: accent, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
