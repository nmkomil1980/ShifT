import 'package:flutter/widgets.dart';
import 'api_client.dart';
import '../models/models.dart';

/// Holds the authenticated user and exposes login/logout. Provided to the tree
/// through [AuthScope] (an InheritedNotifier) so screens can read it without a
/// third-party state-management package.
class AuthController extends ChangeNotifier {
  final ApiClient api = ApiClient.instance;

  AppUser? user;
  bool loading = true;

  Future<void> bootstrap() async {
    await api.loadToken();
    if (api.hasToken) {
      try {
        final data = await api.get('/me');
        user = AppUser.fromJson(data['user']);
      } catch (_) {
        await api.setToken(null);
        user = null;
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final data = await api.post('/auth/login', {
      'email': email,
      'password': password,
    });
    await api.setToken(data['token'] as String?);
    user = AppUser.fromJson(data['user']);
    notifyListeners();
  }

  Future<void> register({
    required String name,
    required String company,
    required String email,
    required String password,
  }) async {
    final data = await api.post('/auth/register', {
      'name': name,
      'company': company,
      'email': email,
      'password': password,
    });
    await api.setToken(data['token'] as String?);
    user = AppUser.fromJson(data['user']);
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    await api.setToken(null);
    user = null;
    notifyListeners();
  }

  void updateUser(AppUser updated) {
    user = updated;
    notifyListeners();
  }
}

class AuthScope extends InheritedNotifier<AuthController> {
  const AuthScope({
    super.key,
    required AuthController controller,
    required super.child,
  }) : super(notifier: controller);

  static AuthController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AuthScope>();
    assert(scope != null, 'AuthScope not found in widget tree');
    return scope!.notifier!;
  }
}
