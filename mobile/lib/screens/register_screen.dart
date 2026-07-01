import 'package:flutter/material.dart';
import '../theme.dart';
import '../api/auth_controller.dart';

/// Company sign-up for directors on mobile. On success the user is
/// authenticated and the app swaps to the main shell automatically.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _company = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _company.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _valid =>
      _name.text.trim().isNotEmpty &&
      _company.text.trim().isNotEmpty &&
      _email.text.trim().contains('@') &&
      _password.text.length >= 8;

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    try {
      await AuthScope.of(context).register(
        name: _name.text.trim(),
        company: _company.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
      );
      // Auth state swaps the app root to HomeShell; pop this pushed screen so
      // the new root is revealed underneath.
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        foregroundColor: AppColors.text,
        iconTheme: const IconThemeData(color: AppColors.text),
        title: const Text('Регистрация компании',
            style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w700)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Создайте рабочее пространство',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            const Text('Директор создаёт компанию и приглашает команду.',
                style: TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 24),
            if (_error != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.redBg, borderRadius: BorderRadius.circular(10)),
                child: Text(_error!, style: const TextStyle(color: AppColors.red)),
              ),
            _label('Ваше имя'),
            TextField(controller: _name, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Иван Директоров')),
            const SizedBox(height: 16),
            _label('Название компании'),
            TextField(controller: _company, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Кофейня на Петровке')),
            const SizedBox(height: 16),
            _label('Электронная почта'),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'director@company.com')),
            const SizedBox(height: 16),
            _label('Пароль'),
            TextField(controller: _password, obscureText: true, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Минимум 8 символов')),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: (_busy || !_valid) ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Создать и войти'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(t.toUpperCase(),
            style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600, fontSize: 12, letterSpacing: 0.5)),
      );
}
