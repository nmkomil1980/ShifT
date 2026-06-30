import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../api/auth_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'requests_screen.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({super.key});
  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  Map<String, dynamic>? _dashboard;
  Shift? _nextShift;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dash = await ApiClient.instance.get('/dashboard');
      final now = DateTime.now();
      final to = now.add(const Duration(days: 14));
      final shiftsData = await ApiClient.instance.get(
          '/shifts?from=${now.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}');
      final shifts = (shiftsData['shifts'] as List)
          .map((j) => Shift.fromJson(j))
          .where((s) => s.endsAt.isAfter(now) && s.userName != null)
          .toList()
        ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
      setState(() {
        _dashboard = dash;
        _nextShift = shifts.isNotEmpty ? shifts.first : null;
      });
    } catch (_) {
      // keep whatever we have
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _dashboard == null) return const LoadingBox();

    final stats = (_dashboard?['stats'] ?? {}) as Map<String, dynamic>;
    final activity = (_dashboard?['activity'] ?? []) as List;
    final dateStr = toBeginningOfSentenceCase(
        DateFormat('EEEE, d MMMM', 'ru').format(DateTime.now()));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Главная',
              style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text)),
          const SizedBox(height: 4),
          Text(dateStr, style: const TextStyle(color: AppColors.textMuted)),
          const SizedBox(height: 20),
          Row(
            children: [
              _StatCell('Актив', '${stats['activeToday'] ?? 0}',
                  AppColors.indigo),
              const SizedBox(width: 12),
              _StatCell('Открыто', '${stats['openShifts'] ?? 0}',
                  AppColors.text),
              const SizedBox(width: 12),
              _StatCell('Заявки', '${stats['pending'] ?? 0}', AppColors.red),
            ],
          ),
          const SizedBox(height: 24),
          const SectionLabel('Моя следующая смена'),
          const SizedBox(height: 12),
          _NextShiftCard(shift: _nextShift),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const SectionLabel('Активность команды'),
              GestureDetector(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const RequestsScreen())),
                child: const Text('Заявки',
                    style: TextStyle(
                        color: AppColors.indigo, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (activity.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Center(
                    child: Text('Пока пусто',
                        style: TextStyle(color: AppColors.textFaint))),
              ),
            )
          else
            Card(
              child: Column(
                children: [
                  for (final a in activity)
                    _ActivityRow(a as Map<String, dynamic>,
                        last: a == activity.last),
                ],
              ),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const RequestsScreen())),
              icon: const Icon(Icons.add),
              label: const Text('Новая заявка'),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatCell(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18),
          child: Column(
            children: [
              Text(value,
                  style: TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w800, color: color)),
              const SizedBox(height: 4),
              Text(label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextShiftCard extends StatelessWidget {
  final Shift? shift;
  const _NextShiftCard({this.shift});
  @override
  Widget build(BuildContext context) {
    if (shift == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Text('Нет запланированных смен',
              style: TextStyle(color: AppColors.textFaint)),
        ),
      );
    }
    final s = shift!;
    return Card(
      child: IntrinsicHeight(
        child: Row(
          children: [
            Container(
              width: 6,
              decoration: const BoxDecoration(
                color: AppColors.indigo,
                borderRadius: BorderRadius.horizontal(left: Radius.circular(16)),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.access_time,
                            size: 20, color: AppColors.text),
                        const SizedBox(width: 10),
                        Text(timeRange(s.startsAt, s.endsAt),
                            style: const TextStyle(
                                fontSize: 22, fontWeight: FontWeight.w800)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(Icons.location_on_outlined,
                            size: 18, color: AppColors.textMuted),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            s.location.isEmpty
                                ? (s.userName ?? s.title)
                                : s.location,
                            style: const TextStyle(color: AppColors.textMuted),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final Map<String, dynamic> a;
  final bool last;
  const _ActivityRow(this.a, {this.last = false});
  @override
  Widget build(BuildContext context) {
    final name = a['user_name'] ?? 'Система';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Avatar(name, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${a['action']} · ${a['entity_type']}',
                    style: const TextStyle(
                        color: AppColors.textMuted, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
