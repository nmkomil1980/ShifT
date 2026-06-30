import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { db } from './database.js';

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

export function saveSubscription(userId, subscription) {
  if (!subscription || !subscription.endpoint || !subscription.keys) return;
  db.prepare(`INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth)
    VALUES(?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,
      p256dh=excluded.p256dh, auth=excluded.auth`)
    .run(userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
}

export function removeSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint);
}

/**
 * Best-effort push to every device a user has registered. Failures (offline,
 * expired subscription) are swallowed; a 404/410 means the subscription is dead
 * and is pruned. Never throws so callers can fire-and-forget.
 */
export async function sendToUser(userId, payload) {
  const subs = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?').all(userId);
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        removeSubscription(s.endpoint);
      }
    }
  }));
}

export function sendToUsers(userIds, payload) {
  return Promise.all(userIds.map((id) => sendToUser(id, payload)));
}
