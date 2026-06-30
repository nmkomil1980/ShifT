import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});
  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> {
  List<LeaveRequest> _requests = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiClient.instance.get('/requests');
      setState(() => _requests = (data['requests'] as List)
          .map((j) => LeaveRequest.fromJson(j))
          .toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  static const _typeLabel = {
    'time_off': 'Отгул',
    'availability': 'Доступность',
    'swap': 'Замена смены',
  };
  static const _typeIcon = {
    'time_off': Icons.flight_takeoff,
    'availability': Icons.event_available,
    'swap': Icons.swap_horiz,
  };

  Future<void> _createRequest(String type) async {
    final now = DateTime.now();
    DateTimeRange? range = await showDateRangePicker(
      context: context,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
      initialDateRange:
          DateTimeRange(start: now, end: now.add(const Duration(days: 1))),
    );
    if (range == null || !mounted) return;

    final reasonCtl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_typeLabel[type] ?? 'Заявка'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                '${DateFormat('d MMM', 'ru').format(range.start)} – ${DateFormat('d MMM', 'ru').format(range.end)}',
                style: const TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 12),
            TextField(
              controller: reasonCtl,
              decoration:
                  const InputDecoration(labelText: 'Причина (необязательно)'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Отмена')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Отправить')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ApiClient.instance.post('/requests', {
        'type': type,
        'startsAt': range.start.toUtc().toIso8601String(),
        'endsAt': range.end.toUtc().toIso8601String(),
        'reason': reasonCtl.text,
      });
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Заявка отправлена')));
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Запросы'),
        foregroundColor: AppColors.text,
        iconTheme: const IconThemeData(color: AppColors.text),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('Управление сменами и доступностью',
                style: TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 16),
            _ActionCard(
              icon: Icons.event_available,
              title: 'Указать доступность',
              body:
                  'Выберите дни и часы, когда вы готовы взять дополнительные смены.',
              cta: 'Указать время',
              primary: true,
              badge: 'Приоритет',
              onTap: () => _createRequest('availability'),
            ),
            const SizedBox(height: 16),
            _ActionCard(
              icon: Icons.swap_horiz,
              title: 'Запросить замену',
              body: 'Предложите свою смену коллегам, если не можете выйти.',
              cta: 'Найти замену',
              onTap: () => _createRequest('swap'),
            ),
            const SizedBox(height: 16),
            _ActionCard(
              icon: Icons.flight_takeoff,
              title: 'Запросить отгул',
              body: 'Запланируйте отпуск или день за свой счёт заранее.',
              cta: 'Оформить заявку',
              onTap: () => _createRequest('time_off'),
            ),
            const SizedBox(height: 28),
            const SectionLabel('Недавние запросы'),
            const SizedBox(height: 12),
            if (_loading)
              const LoadingBox()
            else if (_requests.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                      child: Text('Заявок пока нет',
                          style: TextStyle(color: AppColors.textFaint))),
                ),
              )
            else
              ..._requests.map((r) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: const BoxDecoration(
                                  color: AppColors.indigoLight,
                                  shape: BoxShape.circle),
                              child: Icon(_typeIcon[r.type],
                                  color: AppColors.indigo, size: 20),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_typeLabel[r.type] ?? r.type,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 15)),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${DateFormat('d MMM', 'ru').format(r.startsAt)} – ${DateFormat('d MMM', 'ru').format(r.endsAt)}',
                                    style: const TextStyle(
                                        color: AppColors.textMuted,
                                        fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                            StatusBadge.forStatus(r.status),
                          ],
                        ),
                      ),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  final String cta;
  final bool primary;
  final String? badge;
  final VoidCallback onTap;
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.body,
    required this.cta,
    required this.onTap,
    this.primary = false,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: primary ? AppColors.indigo : AppColors.indigoLight,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon,
                      color: primary ? Colors.white : AppColors.indigo),
                ),
                const Spacer(),
                if (badge != null)
                  StatusBadge(badge!,
                      bg: AppColors.blueBg, fg: AppColors.indigoDark),
              ],
            ),
            const SizedBox(height: 16),
            Text(title,
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(body, style: const TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: primary
                  ? ElevatedButton(onPressed: onTap, child: Text(cta))
                  : OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.text,
                        side: const BorderSide(color: AppColors.border),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: onTap,
                      child: Text(cta,
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
