// Dual-dialect database layer. Uses PostgreSQL when DATABASE_URL is set,
// otherwise falls back to a local SQLite file (node:sqlite). Both back ends are
// exposed through one small async API so the rest of the app is dialect-neutral.
//
//   q.all(sql, params)    -> rows[]
//   q.get(sql, params)    -> row | undefined
//   q.run(sql, params)    -> { changes }
//   q.insert(sql, params) -> { id }        (append RETURNING id on Postgres)
//   q.tx(async (t) => {})  -> runs the callback in a transaction; `t` has the
//                            same four methods bound to a single connection.
//
// Conventions callers must follow:
//   * placeholders are always `?` (translated to $1..$n for Postgres);
//   * timestamps are TEXT ISO-8601 strings in both dialects;
//   * camelCase output aliases must be double-quoted in SQL so Postgres does
//     not fold them to lower case.

import fs from 'node:fs';
import path from 'node:path';

export const dialect = process.env.DATABASE_URL ? 'pg' : 'sqlite';

function normalizeError(err) {
  const unique = dialect === 'pg'
    ? err && err.code === '23505'
    : /UNIQUE/i.test(String(err && err.message));
  if (unique) {
    const e = new Error('UNIQUE_VIOLATION');
    e.code = 'UNIQUE_VIOLATION';
    return e;
  }
  return err;
}

// ---- Postgres ------------------------------------------------------------
async function makePg() {
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });

  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

  const exec = async (runner, sql, params = []) => {
    try {
      return await runner(toPg(sql), params);
    } catch (err) {
      throw normalizeError(err);
    }
  };

  const wrap = (runner) => ({
    all: async (sql, params) => (await exec(runner, sql, params)).rows,
    get: async (sql, params) => (await exec(runner, sql, params)).rows[0],
    run: async (sql, params) => ({ changes: (await exec(runner, sql, params)).rowCount }),
    insert: async (sql, params) => {
      const r = await exec(runner, `${sql} RETURNING id`, params);
      return { id: Number(r.rows[0].id) };
    },
  });

  const base = wrap((text, params) => pool.query(text, params));

  return {
    ...base,
    exec: async (sql) => { await pool.query(sql); },
    tx: async (fn) => {
      const client = await pool.connect();
      const t = wrap((text, params) => client.query(text, params));
      try {
        await client.query('BEGIN');
        const result = await fn(t);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw normalizeError(err);
      } finally {
        client.release();
      }
    },
  };
}

// ---- SQLite --------------------------------------------------------------
async function makeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const databasePath = path.resolve(process.env.DATABASE_PATH || './data/shiftflow.db');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const call = (method, sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt[method](...params);
    } catch (err) {
      throw normalizeError(err);
    }
  };

  const base = {
    all: async (sql, params) => call('all', sql, params),
    get: async (sql, params) => call('get', sql, params),
    run: async (sql, params) => {
      const r = call('run', sql, params);
      return { changes: Number(r.changes) };
    },
    insert: async (sql, params) => {
      const r = call('run', sql, params);
      return { id: Number(r.lastInsertRowid) };
    },
  };

  return {
    ...base,
    exec: async (sql) => { db.exec(sql); },
    // SQLite (DatabaseSync) is a single connection; emulate a transaction with
    // BEGIN/COMMIT and hand the same base API to the callback.
    tx: async (fn) => {
      db.exec('BEGIN');
      try {
        const result = await fn(base);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw normalizeError(err);
      }
    },
  };
}

export const q = dialect === 'pg' ? await makePg() : await makeSqlite();
