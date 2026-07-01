import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shiftflow_mobile/api/auth_controller.dart';
import 'package:shiftflow_mobile/screens/login_screen.dart';

void main() {
  testWidgets('LoginScreen renders the sign-in form', (tester) async {
    await tester.pumpWidget(
      AuthScope(
        controller: AuthController(),
        child: const MaterialApp(home: LoginScreen()),
      ),
    );

    expect(find.text('Вход в систему'), findsOneWidget);
    expect(find.text('Войти'), findsOneWidget);
    expect(find.text('Зарегистрировать компанию'), findsOneWidget);
    // email + password fields are prefilled with the demo credentials
    expect(find.text('demo@shiftflow.local'), findsOneWidget);
  });
}
