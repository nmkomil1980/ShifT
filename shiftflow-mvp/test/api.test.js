import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

test('CORS preflight is answered for allowed origin', async () => {
  const res = await fetch(`${base}/api/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});
