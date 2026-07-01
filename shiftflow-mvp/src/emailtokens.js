import crypto from 'node:crypto';
import { q } from './database.js';
import { tokenHash } from './security.js';

const TTL = { invite: 7 * 86400, reset: 3600, verify: 3 * 86400 };

/** Create a single-use email token, returning the raw token to embed in a link. */
export async function createEmailToken(userId, purpose) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + (TTL[purpose] || 3600) * 1000).toISOString();
  await q.run(
    'INSERT INTO email_tokens(user_id,purpose,token_hash,expires_at) VALUES(?,?,?,?)',
    [userId, purpose, tokenHash(raw), expires]
  );
  return raw;
}

/**
 * Validate and consume a token. Returns the owning user's id, or null if the
 * token is unknown, of the wrong purpose, already used or expired. Marks the
 * token used on success so it cannot be replayed.
 */
export async function consumeEmailToken(raw, purpose) {
  if (!raw) return null;
  const row = await q.get(
    `SELECT id, user_id FROM email_tokens
     WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?`,
    [tokenHash(raw), purpose, new Date().toISOString()]
  );
  if (!row) return null;
  await q.run('UPDATE email_tokens SET used_at=? WHERE id=?', [new Date().toISOString(), row.id]);
  return row.user_id;
}
