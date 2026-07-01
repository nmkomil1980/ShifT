import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api_client.dart';

/// Singleton WebSocket client for live chat updates. Connects to /api/ws with
/// the current bearer token, exposes a broadcast stream of decoded events, and
/// transparently reconnects if the socket drops.
class RealtimeService {
  RealtimeService._();
  static final RealtimeService instance = RealtimeService._();

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  bool _closed = false;

  Stream<Map<String, dynamic>> get events => _controller.stream;

  void connect() {
    _closed = false;
    _open();
  }

  void _open() {
    final token = ApiClient.instance.token;
    if (token == null) return;
    // http -> ws, https -> wss
    final wsBase = apiBase.replaceFirst('http', 'ws');
    final uri = Uri.parse('$wsBase/api/ws?token=$token');
    try {
      _channel = WebSocketChannel.connect(uri);
      _sub = _channel!.stream.listen(
        (data) {
          try {
            final decoded = jsonDecode(data as String);
            if (decoded is Map<String, dynamic>) _controller.add(decoded);
          } catch (_) {/* ignore malformed frame */}
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _sub?.cancel();
    _channel = null;
    if (_closed) return;
    Future.delayed(const Duration(seconds: 3), () {
      if (!_closed) _open();
    });
  }

  void disconnect() {
    _closed = true;
    _sub?.cancel();
    _channel?.sink.close();
    _channel = null;
  }
}
