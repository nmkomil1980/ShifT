import { q, dialect } from './db.js';
import { passwordHash } from './security.js';

// Dialect-specific column fragments. Timestamps are stored as TEXT ISO-8601 in
// both back ends; the Postgres default is formatted to match SQLite's
// CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS') so app-side date parsing is uniform.
const PK = dialect === 'pg' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
const TS = dialect === 'pg'
  ? `TEXT NOT NULL DEFAULT (to_char((now() AT TIME ZONE 'UTC'),'YYYY-MM-DD HH24:MI:SS'))`
  : 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP';
const EMAIL = dialect === 'pg' ? 'TEXT NOT NULL' : 'TEXT NOT NULL COLLATE NOCASE';

await q.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id ${PK}, name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
    locale TEXT NOT NULL DEFAULT 'ru', settings TEXT NOT NULL DEFAULT '{}', created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS users (
    id ${PK}, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, email ${EMAIL}, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','manager','employee')), job_title TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
    created_at ${TS}, UNIQUE(organization_id,email)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id ${PK}, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS shifts (
    id ${PK}, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','open','active','completed','cancelled')),
    created_by INTEGER REFERENCES users(id), created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS requests (
    id ${PK}, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('time_off','availability','swap')),
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reviewed_by INTEGER REFERENCES users(id), created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id ${PK}, organization_id INTEGER NOT NULL, user_id INTEGER, action TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id INTEGER, details TEXT NOT NULL DEFAULT '{}',
    created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id ${PK}, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'direct' CHECK(type IN ('group','direct')),
    title TEXT NOT NULL DEFAULT '', is_general INTEGER NOT NULL DEFAULT 0,
    created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
    PRIMARY KEY(conversation_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id ${PK}, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL, created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id ${PK}, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at ${TS}
  );
  CREATE TABLE IF NOT EXISTS email_tokens (
    id ${PK}, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK(purpose IN ('invite','reset','verify')),
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
    used_at TEXT, created_at ${TS}
  );
  CREATE INDEX IF NOT EXISTS email_tokens_hash_idx ON email_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS push_subs_user_idx ON push_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS shifts_org_start_idx ON shifts(organization_id, starts_at);
  CREATE INDEX IF NOT EXISTS requests_org_status_idx ON requests(organization_id, status);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS conv_members_user_idx ON conversation_members(user_id);
`);

// Additive migration for columns added after a table already exists in the
// wild. `settings` is also in the CREATE above for fresh installs.
async function ensureColumn(table, column, definition) {
  let exists;
  if (dialect === 'pg') {
    exists = await q.get(
      'SELECT 1 FROM information_schema.columns WHERE table_name=? AND column_name=?',
      [table, column]
    );
  } else {
    const cols = await q.all(`PRAGMA table_info(${table})`);
    exists = cols.some((c) => c.name === column);
  }
  if (!exists) await q.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
await ensureColumn('organizations', 'settings', `TEXT NOT NULL DEFAULT '{}'`);
await ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');

/**
 * Ensure the org has a "General Team Chat" group and that `userId` belongs to
 * it. Self-healing for orgs/users created before chat existed. Returns the id.
 */
export async function ensureGeneralChat(organizationId, userId) {
  let conv = await q.get('SELECT id FROM conversations WHERE organization_id=? AND is_general=1', [organizationId]);
  if (!conv) {
    conv = await q.insert(
      `INSERT INTO conversations(organization_id,type,title,is_general) VALUES(?,'group',?,1)`,
      [organizationId, 'Общий чат команды']
    );
  }
  await q.run(
    'INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING',
    [conv.id, userId]
  );
  return conv.id;
}

async function seed() {
  const { count } = await q.get('SELECT COUNT(*) count FROM organizations') || { count: 0 };
  if (Number(count) > 0) return;

  await q.tx(async (t) => {
    const org = (await t.insert('INSERT INTO organizations(name) VALUES (?)', ['ShiftFlow Demo'])).id;
    const addUser = (name, email, role, title, phone = '') =>
      t.insert(
        `INSERT INTO users(organization_id,name,email,password_hash,role,job_title,phone) VALUES(?,?,?,?,?,?,?)`,
        [org, name, email, passwordHash('Demo123!'), role, title, phone]
      ).then((r) => r.id);

    const owner = await addUser('Анна Иванова', 'demo@shiftflow.local', 'owner', 'Управляющая', '+7 999 100-20-30');
    const ids = [];
    for (const [name, email, role, title] of [
      ['Иван Петров', 'ivan@shiftflow.local', 'employee', 'Официант'],
      ['Мария Зайцева', 'maria@shiftflow.local', 'employee', 'Повар'],
      ['Елена Смирнова', 'elena@shiftflow.local', 'manager', 'Менеджер зала'],
      ['Сергей Волков', 'sergey@shiftflow.local', 'employee', 'Бариста'],
    ]) ids.push(await addUser(name, email, role, title));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const iso = (day, hour) => new Date(today.getTime() + day * 86400000 + hour * 3600000).toISOString();
    const addShift = (uid, title, s, e, loc, status) =>
      t.run(`INSERT INTO shifts(organization_id,user_id,title,starts_at,ends_at,location,status,created_by) VALUES(?,?,?,?,?,?,?,?)`,
        [org, uid, title, s, e, loc, status, owner]);
    await addShift(owner, 'Утренняя смена', iso(0, 8), iso(0, 16), 'Главный зал', 'active');
    await addShift(ids[0], 'Дневная смена', iso(0, 10), iso(0, 18), 'Главный зал', 'scheduled');
    await addShift(ids[1], 'Кухня', iso(1, 9), iso(1, 17), 'Кухня', 'scheduled');
    await addShift(null, 'Открытая смена', iso(2, 12), iso(2, 20), 'Главный зал', 'open');

    await t.run(`INSERT INTO requests(organization_id,user_id,type,starts_at,ends_at,reason) VALUES(?,?,?,?,?,?)`,
      [org, ids[3], 'time_off', iso(7, 0), iso(9, 0), 'Семейные обстоятельства']);

    const generalId = (await t.insert(
      `INSERT INTO conversations(organization_id,type,title,is_general) VALUES(?,'group',?,1)`,
      [org, 'Общий чат команды']
    )).id;
    for (const uid of [owner, ...ids]) {
      await t.run('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)', [generalId, uid]);
    }
    const addMessage = (uid, bodyText) =>
      t.run('INSERT INTO messages(conversation_id,user_id,body) VALUES(?,?,?)', [generalId, uid, bodyText]);
    await addMessage(owner, 'Всем привет! Новый график на неделю опубликован.');
    await addMessage(ids[0], 'Спасибо, посмотрю смены.');
    await addMessage(ids[2], 'Напоминаю про собрание в четверг в 10:00.');
  });
}
await seed();

export async function audit(user, action, entityType, entityId, details = {}) {
  await q.run(
    `INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?,?)`,
    [user.organization_id, user.id, action, entityType, entityId, JSON.stringify(details)]
  );
}

export { q };
