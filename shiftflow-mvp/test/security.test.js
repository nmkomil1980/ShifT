import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, passwordMatches, randomToken, tokenHash, parseCookies } from '../src/security.js';

test('password hashes are salted and verifiable', () => {
  const first = passwordHash('Correct horse battery staple');
  const second = passwordHash('Correct horse battery staple');
  assert.notEqual(first, second);
  assert.equal(passwordMatches('Correct horse battery staple', first), true);
  assert.equal(passwordMatches('wrong password', first), false);
});

test('session tokens have sufficient entropy and stable hashes', () => {
  const token = randomToken();
  assert.ok(token.length >= 40);
  assert.equal(tokenHash(token), tokenHash(token));
  assert.notEqual(tokenHash(token), tokenHash(randomToken()));
});

test('cookie parser extracts session token', () => {
  assert.deepEqual(parseCookies('theme=dark; sf_session=abc123'), { theme: 'dark', sf_session: 'abc123' });
});
