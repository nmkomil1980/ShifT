import 'package:flutter/material.dart';
import '../theme.dart';
import 'home_tab.dart';
import 'calendar_tab.dart';
import 'team_tab.dart';
import 'profile_tab.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _titles = ['ShiftFlow', 'ShiftFlow', 'ShiftFlow', 'ShiftFlow'];

  @override
  Widget build(BuildContext context) {
    final tabs = [
      const HomeTab(),
      const CalendarTab(),
      const TeamTab(),
      const ProfileTab(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
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
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined, color: AppColors.textMuted),
                selectedIcon: Icon(Icons.home, color: AppColors.indigo),
                label: 'Home'),
            NavigationDestination(
                icon: Icon(Icons.calendar_today_outlined,
                    color: AppColors.textMuted),
                selectedIcon:
                    Icon(Icons.calendar_today, color: AppColors.indigo),
                label: 'Calendar'),
            NavigationDestination(
                icon: Icon(Icons.people_outline, color: AppColors.textMuted),
                selectedIcon: Icon(Icons.people, color: AppColors.indigo),
                label: 'Team'),
            NavigationDestination(
                icon: Icon(Icons.person_outline, color: AppColors.textMuted),
                selectedIcon: Icon(Icons.person, color: AppColors.indigo),
                label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
