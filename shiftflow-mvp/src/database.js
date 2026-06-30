import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { passwordHash } from './security.js';

const databasePath = path.resolve(process.env.DATABASE_PATH || './data/shiftflow.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
    locale TEXT NOT NULL DEFAULT 'ru', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','manager','employee')), job_title TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id,email)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, title TEXT NOT NULL, starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','open','active','completed','cancelled')),
    created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('time_off','availability','swap')),
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reviewed_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER, action TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id INTEGER, details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS shifts_org_start_idx ON shifts(organization_id, starts_at);
  CREATE INDEX IF NOT EXISTS requests_org_status_idx ON requests(organization_id, status);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) count FROM organizations').get().count) return;
  db.exec('BEGIN');
  try {
    const org = db.prepare('INSERT INTO organizations(name) VALUES (?)').run('ShiftFlow Demo').lastInsertRowid;
    const addUser = db.prepare(`INSERT INTO users(organization_id,name,email,password_hash,role,job_title,phone)
      VALUES(?,?,?,?,?,?,?)`);
    const owner = addUser.run(org, 'Анна Иванова', 'demo@shiftflow.local', passwordHash('Demo123!'), 'owner', 'Управляющая', '+7 999 100-20-30').lastInsertRowid;
    const staff = [
      ['Иван Петров','ivan@shiftflow.local','employee','Официант'],
      ['Мария Зайцева','maria@shiftflow.local','employee','Повар'],
      ['Елена Смирнова','elena@shiftflow.local','manager','Менеджер зала'],
      ['Сергей Волков','sergey@shiftflow.local','employee','Бариста']
    ];
    const ids = staff.map(([name,email,role,title]) =>
      addUser.run(org,name,email,passwordHash('Demo123!'),role,title,'').lastInsertRowid);
    const today = new Date(); today.setHours(0,0,0,0);
    const iso = (day,hour) => new Date(today.getTime()+day*86400000+hour*3600000).toISOString();
    const addShift = db.prepare(`INSERT INTO shifts(organization_id,user_id,title,starts_at,ends_at,location,status,created_by)
      VALUES(?,?,?,?,?,?,?,?)`);
    addShift.run(org,owner,'Утренняя смена',iso(0,8),iso(0,16),'Главный зал','active',owner);
    addShift.run(org,ids[0],'Дневная смена',iso(0,10),iso(0,18),'Главный зал','scheduled',owner);
    addShift.run(org,ids[1],'Кухня',iso(1,9),iso(1,17),'Кухня','scheduled',owner);
    addShift.run(org,null,'Открытая смена',iso(2,12),iso(2,20),'Главный зал','open',owner);
    db.prepare(`INSERT INTO requests(organization_id,user_id,type,starts_at,ends_at,reason)
      VALUES(?,?,?,?,?,?)`).run(org,ids[3],'time_off',iso(7,0),iso(9,0),'Семейные обстоятельства');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK'); throw error;
  }
}
seed();

export function audit(user, action, entityType, entityId, details = {}) {
  db.prepare(`INSERT INTO audit_log(organization_id,user_id,action,entity_type,entity_id,details)
    VALUES(?,?,?,?,?,?)`).run(user.organization_id,user.id,action,entityType,entityId,JSON.stringify(details));
}
