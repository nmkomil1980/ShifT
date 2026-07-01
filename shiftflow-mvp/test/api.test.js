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
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, CORS_ORIGINS: 'http://localhost:5173', MAIL_DEV_RETURN_TOKEN: '1', APP_URL: 'http://localhost:5173', AUTH_RATE_LIMIT: '200' },
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

const json = (r) => r.json();
const post = (path, body, auth) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  body: JSON.stringify(body)
});

test('staff invitation flow: invite -> accept -> login', async () => {
  const owner = await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }));

  // invite (no password supplied) returns a dev token standing in for the email link
  const created = await json(await post('/api/staff', { name: 'Гость Приглашённый', email: 'invitee@shiftflow.local' }, owner.token));
  assert.equal(created.invited, true);
  assert.ok(created.devToken);

  // cannot log in before accepting (random password)
  assert.equal((await post('/api/auth/login', { email: 'invitee@shiftflow.local', password: 'Demo123!' })).status, 401);

  const accepted = await post('/api/auth/accept-invite', { token: created.devToken, password: 'Invitee123!' });
  assert.equal(accepted.status, 200);
  const acceptedBody = await accepted.json();
  assert.ok(acceptedBody.token);
  assert.equal(acceptedBody.user.emailVerified, true);

  // now the credentials work
  assert.equal((await post('/api/auth/login', { email: 'invitee@shiftflow.local', password: 'Invitee123!' })).status, 200);

  // an invite token is single-use
  assert.equal((await post('/api/auth/accept-invite', { token: created.devToken, password: 'Whatever123!' })).status, 400);
});

test('password reset flow', async () => {
  // forgot-password never reveals existence, always 200
  const unknown = await post('/api/auth/forgot-password', { email: 'nobody@nowhere.test' });
  assert.equal(unknown.status, 200);

  const forgot = await json(await post('/api/auth/forgot-password', { email: 'invitee@shiftflow.local' }));
  assert.ok(forgot.devToken);

  const reset = await post('/api/auth/reset-password', { token: forgot.devToken, password: 'BrandNew123!' });
  assert.equal(reset.status, 200);

  assert.equal((await post('/api/auth/login', { email: 'invitee@shiftflow.local', password: 'BrandNew123!' })).status, 200);
  // old invite-set password no longer works
  assert.equal((await post('/api/auth/login', { email: 'invitee@shiftflow.local', password: 'Invitee123!' })).status, 401);
  // reset token cannot be replayed
  assert.equal((await post('/api/auth/reset-password', { token: forgot.devToken, password: 'Another123!' })).status, 400);
});

test('email verification flow', async () => {
  const reg = await json(await post('/api/auth/register', {
    name: 'Верифи Тест', company: 'Verify Co', email: 'verify@shiftflow.local', password: 'Verify123!'
  }));
  assert.ok(reg.devToken);
  assert.equal(reg.user.emailVerified, false);

  assert.equal((await post('/api/auth/verify-email', { token: reg.devToken })).status, 200);

  const me = await json(await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${reg.token}` } }));
  assert.equal(me.user.emailVerified, true);

  // bad token is rejected
  assert.equal((await post('/api/auth/verify-email', { token: 'garbage' })).status, 400);
});

test('exports schedule as CSV and PDF, and staff as CSV', async () => {
  const owner = await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }));
  const auth = { Authorization: `Bearer ${owner.token}` };

  const csv = await fetch(`${base}/api/export/shifts.csv`, { headers: auth });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /shifts\.csv/);
  const csvText = await csv.text();
  assert.ok(csvText.includes('Сотрудник')); // header row present, UTF-8 intact

  const staff = await fetch(`${base}/api/export/staff.csv`, { headers: auth });
  assert.equal(staff.status, 200);
  assert.ok((await staff.text()).includes('demo@shiftflow.local'));

  const pdf = await fetch(`${base}/api/export/shifts.pdf`, { headers: auth });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('latin1'), '%PDF'); // valid PDF magic
});

test('billing: trial, subscribe and invoice history', async () => {
  const owner = await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }));
  const auth = owner.token;

  const before = await json(await fetch(`${base}/api/billing`, { headers: { Authorization: `Bearer ${auth}` } }));
  assert.equal(before.billing.plan, null);
  assert.equal(before.billing.status, 'trialing');
  assert.ok(before.plans.length === 3);
  assert.equal(before.invoices.length, 0);

  assert.equal((await post('/api/billing/subscribe', { plan: 'nope' }, auth)).status, 422);
  assert.equal((await post('/api/billing/subscribe', { plan: 'sixmonth' }, auth)).status, 200);
  await post('/api/billing/payment-method', { brand: 'VISA', last4: '4242', exp: '12/25' }, auth);

  const after = await json(await fetch(`${base}/api/billing`, { headers: { Authorization: `Bearer ${auth}` } }));
  assert.equal(after.billing.plan, 'sixmonth');
  assert.equal(after.billing.status, 'active');
  assert.equal(after.billing.paymentMethod.last4, '4242');
  assert.equal(after.invoices.length, 1);
  assert.equal(after.invoices[0].amountCents, 14900);
});

test('auth endpoints are rate limited per IP', async () => {
  // Use a spoofed X-Forwarded-For so this does not consume the shared 127.0.0.1
  // budget the other tests rely on. Limit in tests is 200.
  const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' };
  let sawLimit = false;
  for (let i = 0; i < 205; i++) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers, body: JSON.stringify({ email: 'x@x', password: 'bad' })
    });
    if (res.status === 429) { sawLimit = true; break; }
  }
  assert.ok(sawLimit, 'expected a 429 after exceeding the limit');
});

test('logout-all revokes every session for the user', async () => {
  const a = await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }));
  const b = await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }));
  // both tokens work
  assert.equal((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${a.token}` } })).status, 200);

  assert.equal((await post('/api/auth/logout-all', {}, a.token)).status, 200);
  // both are now invalid
  assert.equal((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${a.token}` } })).status, 401);
  assert.equal((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${b.token}` } })).status, 401);
});

test('RBAC: owner-only billing and role assignment', async () => {
  const owner = (await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }))).token;
  const mgr = (await json(await post('/api/auth/login', { email: 'elena@shiftflow.local', password: 'Demo123!' }))).token;

  // a manager cannot touch billing
  assert.equal((await post('/api/billing/subscribe', { plan: 'monthly' }, mgr)).status, 403);

  // a manager creating staff with role=manager is forced to employee
  const made = await json(await post('/api/staff', { name: 'RBAC One', email: 'rbac1@shiftflow.local', role: 'manager' }, mgr));
  const list1 = await json(await fetch(`${base}/api/staff`, { headers: { Authorization: `Bearer ${mgr}` } }));
  assert.equal(list1.staff.find((s) => s.id === made.id).role, 'employee');

  // a manager cannot promote that employee to manager
  await fetch(`${base}/api/staff/${made.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mgr}` },
    body: JSON.stringify({ role: 'manager' })
  });
  const list2 = await json(await fetch(`${base}/api/staff`, { headers: { Authorization: `Bearer ${mgr}` } }));
  assert.equal(list2.staff.find((s) => s.id === made.id).role, 'employee');

  // the owner can create a manager
  const mgrMade = await json(await post('/api/staff', { name: 'RBAC Two', email: 'rbac2@shiftflow.local', role: 'manager' }, owner));
  const list3 = await json(await fetch(`${base}/api/staff`, { headers: { Authorization: `Bearer ${owner}` } }));
  assert.equal(list3.staff.find((s) => s.id === mgrMade.id).role, 'manager');
});

test('security: CSV export neutralizes formula injection', async () => {
  const owner = (await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }))).token;
  await post('/api/staff', { name: '=1+2', email: 'csvi@shiftflow.local' }, owner);
  const csv = await (await fetch(`${base}/api/export/staff.csv`, { headers: { Authorization: `Bearer ${owner}` } })).text();
  assert.ok(csv.includes(`'=1+2`), 'leading = should be prefixed with a quote');
  assert.ok(!/(^|,)=1\+2/.test(csv), 'raw =1+2 formula must not appear unescaped');
});

test('security: unsafe push endpoints are rejected (SSRF guard)', async () => {
  const owner = (await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }))).token;
  const bad = await post('/api/push/subscribe', { subscription: { endpoint: 'http://169.254.169.254/latest/meta-data', keys: { p256dh: 'k', auth: 'a' } } }, owner);
  assert.equal(bad.status, 422);
  const alsoBad = await post('/api/push/subscribe', { subscription: { endpoint: 'https://localhost/x', keys: { p256dh: 'k', auth: 'a' } } }, owner);
  assert.equal(alsoBad.status, 422);
  const ok = await post('/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/abc', keys: { p256dh: 'k', auth: 'a' } } }, owner);
  assert.equal(ok.status, 201);
});

test('security: employees do not see colleagues contact details or exports', async () => {
  const emp = (await json(await post('/api/auth/login', { email: 'ivan@shiftflow.local', password: 'Demo123!' }))).token;
  const staff = (await json(await fetch(`${base}/api/staff`, { headers: { Authorization: `Bearer ${emp}` } }))).staff;
  const others = staff.filter((s) => s.email !== undefined);
  assert.ok(others.every((s) => s.email === '' && s.phone === ''), 'email/phone must be hidden from employees');
  // bulk export is manager-only
  assert.equal((await fetch(`${base}/api/export/staff.csv`, { headers: { Authorization: `Bearer ${emp}` } })).status, 403);
});

test('security: org settings PATCH cannot grant a subscription', async () => {
  const owner = (await json(await post('/api/auth/login', { email: 'demo@shiftflow.local', password: 'Demo123!' }))).token;
  const mgr = (await json(await post('/api/auth/login', { email: 'elena@shiftflow.local', password: 'Demo123!' }))).token;
  const getBilling = async () => (await json(await fetch(`${base}/api/billing`, { headers: { Authorization: `Bearer ${owner}` } }))).billing;

  const before = await getBilling();
  // manager tries to inject a plan through the settings blob (bypassing owner-only billing)
  await fetch(`${base}/api/organization`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mgr}` },
    body: JSON.stringify({ settings: { billing: { plan: 'yearly', status: 'active', currentPeriodEnd: '2099-01-01T00:00:00.000Z' } } })
  });
  const after = await getBilling();
  // billing is unchanged by the settings merge, and the injected value is ignored
  assert.equal(after.plan, before.plan);
  assert.equal(after.currentPeriodEnd, before.currentPeriodEnd);
  assert.notEqual(after.currentPeriodEnd, '2099-01-01T00:00:00.000Z');
});

test('CORS preflight is answered for allowed origin', async () => {
  const res = await fetch(`${base}/api/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});
