import api from '../api/axios';
import { env } from '../config/env';

export type PublicConfig = {
  vapidPublicKey: string | null;
};

export type PushRegisterResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no_vapid' | 'permission_denied' | 'permission_blocked' | 'error'; message: string };

export type BrowserNotificationPermissionResult = {
  granted: boolean;
  permission: NotificationPermission;
  /** User previously blocked notifications; browser will not show the prompt again. */
  blocked: boolean;
  unsupported: boolean;
};

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Opens the browser notification permission prompt when still "default".
 * If already denied, returns blocked - user must allow via site settings (lock icon).
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionResult> {
  if (!('Notification' in window)) {
    return { granted: false, permission: 'denied', blocked: false, unsupported: true };
  }

  if (Notification.permission === 'granted') {
    return { granted: true, permission: 'granted', blocked: false, unsupported: false };
  }

  if (Notification.permission === 'denied') {
    return { granted: false, permission: 'denied', blocked: true, unsupported: false };
  }

  const permission = await Notification.requestPermission();
  return {
    granted: permission === 'granted',
    permission,
    blocked: permission === 'denied',
    unsupported: false,
  };
}

export const BROWSER_NOTIFICATION_BLOCKED_HINT =
  'Notifications are turned off for this site. Click the lock icon next to the web address, allow notifications, then refresh the page.';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function subscriptionToBody(sub: PushSubscription) {
  const json = sub.toJSON();
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription');
  }
  return { endpoint, keys: { p256dh, auth } };
}

function storedTokenFromSubscription(sub: PushSubscription): string {
  const body = subscriptionToBody(sub);
  return JSON.stringify(body);
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const res = await fetch(`${env.apiUrl}/config/public`, { credentials: 'omit' });
  if (!res.ok) {
    throw new Error('Settings could not be loaded. Please refresh the page.');
  }
  const data = (await res.json()) as PublicConfig;
  return { vapidPublicKey: data.vapidPublicKey ?? null };
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Request notification permission, subscribe with VAPID, and register on the server.
 */
export async function registerWebPush(): Promise<PushRegisterResult> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: 'unsupported', message: 'Notifications are not available in this browser' };
  }

  const { vapidPublicKey } = await fetchPublicConfig();
  if (!vapidPublicKey) {
    return {
      ok: false,
      reason: 'no_vapid',
      message: 'Notifications are not set up on this server yet.',
    };
  }

  const perm = await requestBrowserNotificationPermission();
  if (perm.unsupported) {
    return { ok: false, reason: 'unsupported', message: 'Notifications are not available in this browser' };
  }
  if (perm.blocked) {
    return { ok: false, reason: 'permission_blocked', message: BROWSER_NOTIFICATION_BLOCKED_HINT };
  }
  if (!perm.granted) {
    return {
      ok: false,
      reason: 'permission_denied',
      message: 'Allow notifications when your browser asks, or use the button below.',
    };
  }

  try {
    const registration = await getServiceWorkerRegistration();
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const body = subscriptionToBody(subscription);
    await api.post('/devices/web', body);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error && err.message && !/vapid|subscription|invalid/i.test(err.message)
        ? err.message
        : "We couldn't turn on notifications. Please try again.";
    return { ok: false, reason: 'error', message };
  }
}

/**
 * Re-subscribe when settings say push is on but the browser subscription was cleared.
 */
export async function ensureWebPushSubscription(): Promise<void> {
  if (!isWebPushSupported()) return;
  if (Notification.permission !== 'granted') return;

  const { vapidPublicKey } = await fetchPublicConfig();
  if (!vapidPublicKey) return;

  const existing = await getActivePushSubscription();
  if (existing) {
    try {
      await api.post('/devices/web', subscriptionToBody(existing));
    } catch {
      /* best-effort refresh */
    }
    return;
  }

  await registerWebPush();
}

/**
 * Unsubscribe locally and revoke the stored device token on the server.
 */
export async function unregisterWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) return;

    const token = storedTokenFromSubscription(subscription);
    await subscription.unsubscribe();
    try {
      await api.post('/devices/tokens/revoke', { token });
    } catch {
      /* token may already be revoked */
    }
  } catch {
    /* best-effort cleanup */
  }
}
