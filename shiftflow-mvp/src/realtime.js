import { WebSocketServer } from 'ws';
import { q } from './database.js';
import { tokenHash } from './security.js';

// In-memory realtime hub for chat. Single-instance only; for a horizontally
// scaled deployment this fan-out would move behind a shared pub/sub (e.g.
// Redis), but the socket contract below would stay the same.
const wss = new WebSocketServer({ noServer: true });
const socketsByUser = new Map(); // userId -> Set<WebSocket>

async function authenticate(token) {
  if (!token) return null;
  return q.get(
    `SELECT u.id, u.organization_id FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`,
    [tokenHash(token), new Date().toISOString()]
  );
}

/** Wire the WebSocket upgrade handler onto an existing http.Server. */
export function attachRealtime(server) {
  server.on('upgrade', async (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    if (!url.pathname.startsWith('/api/ws')) { socket.destroy(); return; }

    let user;
    try { user = await authenticate(url.searchParams.get('token')); } catch { user = null; }
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = user.id;
      if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set());
      socketsByUser.get(user.id).add(ws);

      ws.on('close', () => {
        const set = socketsByUser.get(user.id);
        if (set) { set.delete(ws); if (!set.size) socketsByUser.delete(user.id); }
      });
      // Keep-alive: clients may send pings; we don't expect app messages.
      ws.on('message', () => {});
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  });
}

/** Push a JSON payload to every live socket of the given users. */
export function broadcastToUsers(userIds, payload) {
  const data = JSON.stringify(payload);
  for (const uid of userIds) {
    const set = socketsByUser.get(uid);
    if (!set) continue;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(data); } catch { /* ignore broken socket */ }
      }
    }
  }
}
