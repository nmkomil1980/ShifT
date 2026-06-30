import 'package:flutter/material.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class TeamTab extends StatefulWidget {
  const TeamTab({super.key});
  @override
  State<TeamTab> createState() => _TeamTabState();
}

class _TeamTabState extends State<TeamTab> {
  List<StaffMember> _staff = [];
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ApiClient.instance.get('/staff');
      setState(() => _staff =
          (data['staff'] as List).map((j) => StaffMember.fromJson(j)).toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  static const _roleLabel = {
    'owner': 'Владелец',
    'manager': 'Менеджер',
    'employee': 'Сотрудник',
  };

  @override
  Widget build(BuildContext context) {
    final filtered = _staff
        .where((s) =>
            s.name.toLowerCase().contains(_query.toLowerCase()) ||
            s.jobTitle.toLowerCase().contains(_query.toLowerCase()))
        .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
          child: Row(
            children: [
              Text('Команда',
                  style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text)),
              const Spacer(),
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.bg,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border),
                ),
                child: const Icon(Icons.search, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: TextField(
            onChanged: (v) => setState(() => _query = v),
            decoration: const InputDecoration(
                hintText: 'Поиск сотрудника…',
                prefixIcon: Icon(Icons.search, size: 20)),
          ),
        ),
        Expanded(
          child: _loading
              ? const LoadingBox()
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: filtered.length,
                  itemBuilder: (context, i) {
                    final s = filtered[i];
                    return Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: const BoxDecoration(
                        border: Border(
                            bottom: BorderSide(color: AppColors.border)),
                      ),
                      child: Row(
                        children: [
                          Stack(
                            children: [
                              Avatar(s.name, size: 48),
                              Positioned(
                                right: 0,
                                bottom: 0,
                                child: Container(
                                  width: 12,
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: s.status == 'active'
                                        ? AppColors.green
                                        : AppColors.textFaint,
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                        color: AppColors.surface, width: 2),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(s.name,
                                    style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700)),
                                const SizedBox(height: 2),
                                Text(
                                    s.jobTitle.isEmpty
                                        ? (_roleLabel[s.role] ?? s.role)
                                        : s.jobTitle,
                                    style: const TextStyle(
                                        color: AppColors.textMuted)),
                              ],
                            ),
                          ),
                          StatusBadge(
                            _roleLabel[s.role] ?? s.role,
                            bg: AppColors.blueBg,
                            fg: AppColors.indigoDark,
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
