import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'theme.dart';
import 'api/auth_controller.dart';
import 'screens/login_screen.dart';
import 'screens/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru', null);
  runApp(const ShiftFlowApp());
}

class ShiftFlowApp extends StatefulWidget {
  const ShiftFlowApp({super.key});
  @override
  State<ShiftFlowApp> createState() => _ShiftFlowAppState();
}

class _ShiftFlowAppState extends State<ShiftFlowApp> {
  final AuthController _auth = AuthController();

  @override
  void initState() {
    super.initState();
    _auth.bootstrap();
  }

  @override
  void dispose() {
    _auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: _auth,
      child: MaterialApp(
        title: 'ShiftFlow',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: AnimatedBuilder(
          animation: _auth,
          builder: (context, _) {
            if (_auth.loading) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            return _auth.user == null ? const LoginScreen() : const HomeShell();
          },
        ),
      ),
    );
  }
}
