import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { q } from './database.js';

// VAPID keys identify this server to browser push services. They must be stable
// across restarts (otherwise existing subscriptions stop working), so we read
// them from the environment, fall back to a persisted file, and only generate a
// fresh pair the first time.
const keyFile = path.resolve(process.env.DATABASE_PATH
  ? path.join(path.dirname(process.env.DATABASE_PATH), 'vapid.json')
  : './data/vapid.json');

function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  try {
    return JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  } catch {
    const keys = webpush.generateVAPIDKeys();
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    fs.writeFileSync(keyFile, JSON.stringify(keys));
    return keys;
  }
}

const keys = loadKeys();
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@shiftflow.local';
webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

export const vapidPublicKey = keys.publicKey;

// Push endpoints are attacker-controlled, and the server later makes an HTTP
// request to them (web-push). Restrict to https on a public host so a client
// cannot turn notifications into a blind SSRF against internal services.
export function isSafePushEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  // Block IP-literal hosts pointing at private / link-local / loopback ranges.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 10 || a === 0 || a === 169 && b === 254 ||
        a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31) return false;
  }
  if (host === '::1' || host.startsWith('fd') || host.startsWith('fe80') || host === '[::1]') return false;
  return true;
}

export async function saveSubscription(userId, subscription) {
  if (!subscription || !subscription.endpoint || !subscription.keys) return false;
  if (!isSafePushEndpoint(subscription.endpoint)) return false;
  await q.run(
    `INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth) VALUES(?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,
       p256dh=excluded.p256dh, auth=excluded.auth`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
  return true;
}

export async function removeSubscription(endpoint) {
  await q.run('DELETE FROM push_subscriptions WHERE endpoint=?', [endpoint]);
}

/**
 * Best-effort push to every device a user has registered. Failures (offline,
 * expired subscription) are swallowed; a 404/410 means the subscription is dead
 * and is pruned. Never throws so callers can fire-and-forget.
 */
export async function sendToUser(userId, payload) {
  const subs = await q.all('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?', [userId]);
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await removeSubscription(s.endpoint);
      }
    }
  }));
}

export function sendToUsers(userIds, payload) {
  return Promise.all(userIds.map((id) => sendToUser(id, payload)));
}
