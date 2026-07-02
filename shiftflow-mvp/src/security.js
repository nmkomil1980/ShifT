import crypto from 'node:crypto';

const ITERATIONS = 210_000;

export function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex');
  return `${ITERATIONS}:${salt}:${hash}`;
}

export function passwordMatches(password, stored) {
  const [iterations, salt, expected] = stored.split(':');
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterations), 32, 'sha256');
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').filter(Boolean).map(item => {
    const index = item.indexOf('=');
    const raw = item.slice(index + 1);
    // A malformed value set by another app on the same domain (e.g. a bare '%')
    // must not take down every request — keep it verbatim instead of throwing.
    let value;
    try { value = decodeURIComponent(raw); } catch { value = raw; }
    return [item.slice(0, index).trim(), value];
  }));
}

export function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `sf_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const clearSessionCookie = () =>
  `sf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
