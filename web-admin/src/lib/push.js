import { api } from './api.js';

// Browser Web Push helpers: register the service worker, subscribe via the
// server's VAPID key, and report the subscription to the backend.

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'enabled' : 'disabled';
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Push не поддерживается в этом браузере');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано');

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const { publicKey } = await api.get('/push/vapid-public-key');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return 'enabled';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return 'disabled';
}
