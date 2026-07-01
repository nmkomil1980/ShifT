import 'dart:async';
import 'package:flutter/material.dart';
import '../theme.dart';
import '../api/api_client.dart';
import '../api/realtime_service.dart';
import 'home_tab.dart';
import 'calendar_tab.dart';
import 'messages_tab.dart';
import 'profile_tab.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  int _unread = 0;
  StreamSubscription? _rt;

  @override
  void initState() {
    super.initState();
    RealtimeService.instance.connect();
    _refreshUnread();
    _rt = RealtimeService.instance.events.listen((evt) {
      if (evt['type'] == 'message') _refreshUnread();
    });
  }

  @override
  void dispose() {
    _rt?.cancel();
    RealtimeService.instance.disconnect();
    super.dispose();
  }

  Future<void> _refreshUnread() async {
    try {
      final data = await ApiClient.instance.get('/conversations');
      final total = (data['conversations'] as List)
          .fold<int>(0, (sum, c) => sum + ((c['unread'] as int?) ?? 0));
      if (mounted) setState(() => _unread = total);
    } catch (_) {/* ignore */}
  }

  void _select(int i) {
    setState(() => _index = i);
    if (i == 2) _refreshUnread(); // opening the Team/Messages tab
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      const HomeTab(),
      const CalendarTab(),
      const MessagesTab(),
      const ProfileTab(),
    ];

    Widget teamIcon(IconData icon, Color color) {
      final child = Icon(icon, color: color);
      return _unread > 0
          ? Badge.count(count: _unread, child: child)
          : child;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('ShiftFlow'),
        leading: const Icon(Icons.bubble_chart_outlined),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 12),
            child: Icon(Icons.notifications_none, color: AppColors.text),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: tabs),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: AppColors.surface,
          indicatorColor: Colors.transparent,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? AppColors.indigo : AppColors.textMuted,
            );
          }),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          height: 64,
          onDestinationSelected: _select,
          destinations: [
            const NavigationDestination(
                icon: Icon(Icons.home_outlined, color: AppColors.textMuted),
                selectedIcon: Icon(Icons.home, color: AppColors.indigo),
                label: 'Home'),
            const NavigationDestination(
                icon: Icon(Icons.calendar_today_outlined,
                    color: AppColors.textMuted),
                selectedIcon:
                    Icon(Icons.calendar_today, color: AppColors.indigo),
                label: 'Calendar'),
            NavigationDestination(
                icon: teamIcon(Icons.people_outline, AppColors.textMuted),
                selectedIcon: teamIcon(Icons.people, AppColors.indigo),
                label: 'Team'),
            const NavigationDestination(
                icon: Icon(Icons.person_outline, color: AppColors.textMuted),
                selectedIcon: Icon(Icons.person, color: AppColors.indigo),
                label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
