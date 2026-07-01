import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = 3997;
const base = `http://127.0.0.1:${port}`;
const dbPath = path.join(os.tmpdir(), `shiftflow-test-${Date.now()}.db`);

let server;

async function waitForHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, CORS_ORIGINS: 'http://localhost:5173' },
    stdio: 'ignore'
  });
  await waitForHealth();
});

test.after(() => {
  server?.kill();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

test('login returns a bearer token and user', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(typeof data.token === 'string' && data.token.length >= 40);
  assert.equal(data.user.role, 'owner');
});

test('bearer token authorizes protected endpoints', async () => {
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };

  const me = await fetch(`${base}/api/me`, { headers: auth });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'demo@shiftflow.local');

  const patched = await fetch(`${base}/api/me`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+7 000 000-00-00' })
  });
  assert.equal((await patched.json()).user.phone, '+7 000 000-00-00');

  const notifications = await (await fetch(`${base}/api/notifications`, { headers: auth })).json();
  assert.ok(Array.isArray(notifications.notifications));
});

test('protected endpoints reject missing credentials', async () => {
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
});

test('team chat: list, read, send and direct conversations', async () => {
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };

  const list = await (await fetch(`${base}/api/conversations`, { headers: auth })).json();
  assert.ok(Array.isArray(list.conversations));
  const general = list.conversations.find((c) => c.isGeneral);
  assert.ok(general, 'general chat should exist');

  const before = await (await fetch(`${base}/api/conversations/${general.id}/messages`, { headers: auth })).json();
  assert.ok(before.messages.length >= 1);

  const sent = await fetch(`${base}/api/conversations/${general.id}/messages`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Привет из теста' })
  });
  assert.equal(sent.status, 201);

  const after = await (await fetch(`${base}/api/conversations/${general.id}/messages`, { headers: auth })).json();
  assert.equal(after.messages.length, before.messages.length + 1);

  const direct = await fetch(`${base}/api/conversations/direct`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  assert.equal(direct.status, 201);
  const directId = (await direct.json()).id;
  // creating the same direct chat again returns the existing one (200)
  const again = await fetch(`${base}/api/conversations/direct`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 })
  });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).id, directId);
});

test('unread count updates after reading and receiving new messages', async () => {
  const owner = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const ivan = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ivan@shiftflow.local', password: 'Demo123!' })
  })).json();
  const oAuth = { Authorization: `Bearer ${owner.token}` };
  const iAuth = { Authorization: `Bearer ${ivan.token}` };

  const generalId = (await (await fetch(`${base}/api/conversations`, { headers: oAuth })).json())
    .conversations.find((c) => c.isGeneral).id;

  const unread = async () => (await (await fetch(`${base}/api/conversations`, { headers: oAuth })).json())
    .conversations.find((c) => c.isGeneral).unread;

  // owner reads the general chat -> unread clears
  await fetch(`${base}/api/conversations/${generalId}/messages`, { headers: oAuth });
  assert.equal(await unread(), 0);

  // a new message from someone else after the read must count again
  // (regression: last_read_at vs created_at timestamp-format mismatch)
  await new Promise((r) => setTimeout(r, 1100));
  await fetch(`${base}/api/conversations/${generalId}/messages`, {
    method: 'POST', headers: { ...iAuth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'после прочтения' })
  });
  assert.equal(await unread(), 1);
});

test('websocket broadcasts a new message to conversation members', async () => {
  const owner = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const ivan = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ivan@shiftflow.local', password: 'Demo123!' })
  })).json();
  const generalId = (await (await fetch(`${base}/api/conversations`, {
    headers: { Authorization: `Bearer ${owner.token}` }
  })).json()).conversations.find((c) => c.isGeneral).id;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?token=${owner.token}`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no ws message')), 4000);
    ws.on('message', (data) => {
      const evt = JSON.parse(data.toString());
      if (evt.type === 'message') { clearTimeout(timer); resolve(evt); }
    });
  });

  await fetch(`${base}/api/conversations/${generalId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ivan.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'через сокет' })
  });

  const evt = await received;
  ws.close();
  assert.equal(evt.conversationId, generalId);
  assert.equal(evt.message.body, 'через сокет');
  assert.equal(evt.message.userName, 'Иван Петров');
});

test('chat membership is enforced', async () => {
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };
  // a conversation id that does not exist / not a member of
  const res = await fetch(`${base}/api/conversations/99999/messages`, { headers: auth });
  assert.equal(res.status, 404);
});

test('a shift can be rescheduled and reassigned via PATCH', async () => {
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };

  const start = new Date(Date.now() + 86400000); start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 3600000);
  const created = await (await fetch(`${base}/api/shifts`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'DnD', startsAt: start.toISOString(), endsAt: end.toISOString() })
  })).json();

  // reassign to user 2 and move one day later
  const moved = new Date(start.getTime() + 86400000);
  const movedEnd = new Date(end.getTime() + 86400000);
  const patch = await fetch(`${base}/api/shifts/${created.id}`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2, startsAt: moved.toISOString(), endsAt: movedEnd.toISOString() })
  });
  assert.equal(patch.status, 200);

  const list = await (await fetch(`${base}/api/shifts?from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date(Date.now() + 5 * 86400000).toISOString()}`, { headers: auth })).json();
  const updated = list.shifts.find((s) => s.id === created.id);
  assert.equal(updated.user_id, 2);
  assert.equal(updated.status, 'scheduled');
});

test('organization settings can be read and updated', async () => {
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };

  const before = await (await fetch(`${base}/api/organization`, { headers: auth })).json();
  assert.equal(before.organization.settings.defaultShiftHours, 8);

  const patch = await fetch(`${base}/api/organization`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Acme Ops', settings: { industry: 'warehouse', autoApproveSwaps: true } })
  });
  assert.equal(patch.status, 200);

  const after = await (await fetch(`${base}/api/organization`, { headers: auth })).json();
  assert.equal(after.organization.name, 'Acme Ops');
  assert.equal(after.organization.settings.industry, 'warehouse');
  assert.equal(after.organization.settings.autoApproveSwaps, true);
  // unspecified keys are preserved
  assert.equal(after.organization.settings.overtimeThreshold, 40);
});

test('web push: exposes a VAPID key and stores subscriptions', async () => {
  const login = await (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@shiftflow.local', password: 'Demo123!' })
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };

  const vapid = await (await fetch(`${base}/api/push/vapid-public-key`, { headers: auth })).json();
  assert.ok(typeof vapid.publicKey === 'string' && vapid.publicKey.length > 20);

  const sub = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } } })
  });
  assert.equal(sub.status, 201);

  // a subscription without an endpoint is rejected
  const bad = await fetch(`${base}/api/push/subscribe`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: {} })
  });
  assert.equal(bad.status, 422);
});

test('CORS preflight is answered for allowed origin', async () => {
  const res = await fetch(`${base}/api/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});
