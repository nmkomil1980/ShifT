import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'chat_screen.dart';

class MessagesTab extends StatefulWidget {
  const MessagesTab({super.key});
  @override
  State<MessagesTab> createState() => _MessagesTabState();
}

class _MessagesTabState extends State<MessagesTab> {
  List<Conversation> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await ApiClient.instance.get('/conversations');
      setState(() => _items = (data['conversations'] as List)
          .map((j) => Conversation.fromJson(j))
          .toList());
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _stamp(DateTime? t) {
    if (t == null) return '';
    final now = DateTime.now();
    if (t.year == now.year && t.month == now.month && t.day == now.day) {
      return DateFormat('HH:mm').format(t);
    }
    final diff = now.difference(t).inDays;
    if (diff == 1) return 'Вчера';
    if (diff < 7) return DateFormat('EEE', 'ru').format(t);
    return DateFormat('d MMM', 'ru').format(t);
  }

  Future<void> _openChat(Conversation c) async {
    await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ChatScreen(conversationId: c.id, title: c.title)));
    _load();
  }

  Future<void> _compose() async {
    final staff = await ApiClient.instance.get('/staff').then(
        (d) => (d['staff'] as List).map((j) => StaffMember.fromJson(j)).toList(),
        onError: (_) => <StaffMember>[]);
    if (!mounted) return;
    final picked = await showModalBottomSheet<StaffMember>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.all(12),
        children: [
          const Padding(
            padding: EdgeInsets.all(12),
            child: Text('Новое сообщение',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          ),
          for (final s in staff.where((s) => s.status == 'active'))
            ListTile(
              leading: Avatar(s.name, size: 42),
              title: Text(s.name,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(s.jobTitle.isEmpty ? s.role : s.jobTitle),
              onTap: () => Navigator.pop(ctx, s),
            ),
        ],
      ),
    );
    if (picked == null) return;
    try {
      final res = await ApiClient.instance
          .post('/conversations/direct', {'userId': picked.id});
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
          builder: (_) =>
              ChatScreen(conversationId: res['id'] as int, title: picked.name)));
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
    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Row(
                children: [
                  Text('Сообщения',
                      style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: AppColors.text)),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const LoadingBox()
                  : _items.isEmpty
                      ? const Center(
                          child: Text('Диалогов пока нет',
                              style: TextStyle(color: AppColors.textFaint)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                            itemCount: _items.length,
                            itemBuilder: (context, i) {
                              final c = _items[i];
                              return _ConversationTile(
                                conversation: c,
                                stamp: _stamp(c.lastAt),
                                onTap: () => _openChat(c),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
        Positioned(
          right: 20,
          bottom: 24,
          child: FloatingActionButton(
            backgroundColor: AppColors.indigo,
            foregroundColor: Colors.white,
            onPressed: _compose,
            child: const Icon(Icons.edit_outlined),
          ),
        ),
      ],
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final Conversation conversation;
  final String stamp;
  final VoidCallback onTap;
  const _ConversationTile(
      {required this.conversation, required this.stamp, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final preview = c.isGeneral && c.lastAuthor.isNotEmpty
        ? '${c.lastAuthor.split(' ').first}: ${c.lastBody}'
        : c.lastBody;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: c.unread > 0 ? AppColors.indigoLight : AppColors.border),
        ),
        child: Row(
          children: [
            if (c.isGeneral)
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.blueBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.groups, color: AppColors.indigo),
              )
            else
              Avatar(c.title, size: 48),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(c.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700)),
                      ),
                      Text(stamp,
                          style: TextStyle(
                              fontSize: 12,
                              color: c.unread > 0
                                  ? AppColors.indigo
                                  : AppColors.textFaint,
                              fontWeight: c.unread > 0
                                  ? FontWeight.w700
                                  : FontWeight.w400)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          preview.isEmpty ? 'Нет сообщений' : preview,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppColors.textMuted),
                        ),
                      ),
                      if (c.unread > 0)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          width: 10,
                          height: 10,
                          decoration: const BoxDecoration(
                              color: AppColors.indigo, shape: BoxShape.circle),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
