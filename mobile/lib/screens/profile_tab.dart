import 'package:flutter/material.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../api/auth_controller.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  static const _roleLabel = {
    'owner': 'Владелец',
    'manager': 'Менеджер',
    'employee': 'Сотрудник',
  };

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final user = auth.user!;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const SizedBox(height: 8),
        Center(child: Avatar(user.name, size: 88)),
        const SizedBox(height: 16),
        Center(
          child: Text(user.name,
              style: const TextStyle(
                  fontSize: 22, fontWeight: FontWeight.w800)),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(
            '${user.jobTitle.isEmpty ? (_roleLabel[user.role] ?? user.role) : user.jobTitle} · ${user.organizationName}',
            style: const TextStyle(color: AppColors.textMuted),
          ),
        ),
        const SizedBox(height: 28),
        Card(
          child: Column(
            children: [
              _InfoRow(Icons.email_outlined, 'Email', user.email),
              const Divider(height: 1, color: AppColors.border),
              _InfoRow(Icons.phone_outlined, 'Телефон',
                  user.phone.isEmpty ? '—' : user.phone),
              const Divider(height: 1, color: AppColors.border),
              _InfoRow(Icons.badge_outlined, 'Роль',
                  _roleLabel[user.role] ?? user.role),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Column(
            children: [
              _ActionRow(Icons.edit_outlined, 'Редактировать профиль',
                  onTap: () => _editProfile(context, auth, user)),
              const Divider(height: 1, color: AppColors.border),
              _ActionRow(Icons.notifications_none, 'Уведомления'),
              const Divider(height: 1, color: AppColors.border),
              _ActionRow(Icons.help_outline, 'Поддержка'),
            ],
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.red,
              side: const BorderSide(color: AppColors.border),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => auth.logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Выйти',
                style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  Future<void> _editProfile(
      BuildContext context, AuthController auth, AppUser user) async {
    final nameCtl = TextEditingController(text: user.name);
    final jobCtl = TextEditingController(text: user.jobTitle);
    final phoneCtl = TextEditingController(text: user.phone);

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        bool busy = false;
        return StatefulBuilder(builder: (ctx, setSheet) {
          return Padding(
            padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Редактировать профиль',
                    style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),
                TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(labelText: 'Имя')),
                const SizedBox(height: 12),
                TextField(
                    controller: jobCtl,
                    decoration:
                        const InputDecoration(labelText: 'Должность')),
                const SizedBox(height: 12),
                TextField(
                    controller: phoneCtl,
                    decoration: const InputDecoration(labelText: 'Телефон')),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: busy
                        ? null
                        : () async {
                            setSheet(() => busy = true);
                            try {
                              final data = await ApiClient.instance
                                  .patch('/me', {
                                'name': nameCtl.text,
                                'jobTitle': jobCtl.text,
                                'phone': phoneCtl.text,
                              });
                              auth.updateUser(
                                  AppUser.fromJson(data['user']));
                              if (ctx.mounted) Navigator.pop(ctx, true);
                            } catch (e) {
                              setSheet(() => busy = false);
                              if (ctx.mounted) {
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                    SnackBar(content: Text('$e')));
                              }
                            }
                          },
                    child: busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Сохранить'),
                  ),
                ),
              ],
            ),
          );
        });
      },
    );

    if (saved == true && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Профиль обновлён')));
    }
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow(this.icon, this.label, this.value);
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.textMuted),
          const SizedBox(width: 14),
          Text(label, style: const TextStyle(color: AppColors.textMuted)),
          const Spacer(),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  const _ActionRow(this.icon, this.label, {this.onTap});
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.indigo),
            const SizedBox(width: 14),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
            const Spacer(),
            const Icon(Icons.chevron_right, color: AppColors.textFaint),
          ],
        ),
      ),
    );
  }
}
