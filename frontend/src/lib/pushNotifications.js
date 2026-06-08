import { getToken, onMessage } from 'firebase/messaging';
import toast from 'react-hot-toast';
import api from './api';
import { getFirebaseMessaging, isFirebaseConfigured } from './firebase';

const FCM_SW_PATH = '/firebase-messaging-sw.js';
const TOKEN_STORAGE_KEY = 'fcm_device_token';
const TOKEN_SYNCED_KEY = 'fcm_token_synced';
const SESSION_REGISTERED_PREFIX = 'fcm_session_registered_';

let foregroundListenerAttached = false;
let tokenRefreshHandlersAttached = false;

/**
 * Registers the single root-scoped service worker for FCM.
 * Called on app load and reused by token registration.
 */
export async function ensureFirebaseMessagingServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active?.scriptURL?.includes(FCM_SW_PATH)) {
    return existing;
  }
  const registration = await navigator.serviceWorker.register(FCM_SW_PATH, {
    scope: '/',
    updateViaCache: 'none',
  });
  console.info('[FCM SW] register() called for', FCM_SW_PATH);
  await navigator.serviceWorker.ready;
  console.info('[FCM SW] ready at scope', registration.scope);
  return registration;
}

/**
 * Registers the FCM service worker (static Firebase init inside the file).
 * Must be the only service worker at scope '/' — do not register sw.js separately.
 */
async function getFcmServiceWorkerRegistration() {
  return ensureFirebaseMessagingServiceWorker();
}

function attachForegroundListener(messaging) {
  if (foregroundListenerAttached) {
    return;
  }
  onMessage(messaging, (payload) => {
    const title = payload.data?.title || 'Smart Wallet';
    const body = payload.data?.body || '';
    toast(`${title}${body ? `: ${body}` : ''}`, { icon: '🔔' });
  });
  foregroundListenerAttached = true;
}

/**
 * Register/sync FCM token once per browser session per user (avoids duplicate register calls on re-render).
 */
export async function registerPushNotificationsForUser(userId) {
  if (!userId) {
    return registerPushNotifications();
  }
  const sessionKey = `${SESSION_REGISTERED_PREFIX}${userId}`;
  if (sessionStorage.getItem(sessionKey) === '1') {
    const existing = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (existing) {
      return existing;
    }
  }
  const token = await registerPushNotifications();
  if (token) {
    sessionStorage.setItem(sessionKey, '1');
  }
  return token;
}

export async function registerPushNotifications() {
  if (!isFirebaseConfigured()) {
    console.warn('FCM: set VITE_FIREBASE_VAPID_KEY in .env');
    return null;
  }

  if (!('Notification' in window)) {
    console.warn('[FCM] Notification API not supported in this browser');
    return null;
  }

  const permission = await Notification.requestPermission();
  console.info('[FCM] Notification permission =', permission);
  if (permission !== 'granted') {
    return null;
  }

  const swRegistration = await getFcmServiceWorkerRegistration();
  const messaging = await getFirebaseMessaging();
  if (!messaging || !swRegistration) {
    return null;
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });
  console.info('[FCM] Token generated:', fcmToken ? `${fcmToken.slice(0, 16)}...` : 'none');

  if (!fcmToken) {
    return null;
  }

  const previous = localStorage.getItem(TOKEN_STORAGE_KEY);
  const alreadySynced = localStorage.getItem(TOKEN_SYNCED_KEY) === fcmToken;

  if (previous && previous !== fcmToken) {
    try {
      await api.delete('/api/notifications/fcm/unregister', { params: { token: previous } });
    } catch {
      /* stale token */
    }
    localStorage.removeItem(TOKEN_SYNCED_KEY);
  }

  if (!alreadySynced) {
    await api.post('/api/notifications/fcm/register', {
      token: fcmToken,
      deviceLabel: /Mobile|Android/i.test(navigator.userAgent) ? 'Mobile browser' : 'Desktop browser',
    });
    console.info('[FCM] Token synced to backend');
    localStorage.setItem(TOKEN_SYNCED_KEY, fcmToken);
  }

  localStorage.setItem(TOKEN_STORAGE_KEY, fcmToken);
  attachForegroundListener(messaging);
  return fcmToken;
}

/**
 * Web FCM does not expose a dedicated onTokenRefresh callback in modular SDK.
 * Re-sync token on visibility/focus and on a long interval to handle refresh rotation.
 */
export function attachTokenRefreshSync() {
  if (tokenRefreshHandlersAttached) {
    return;
  }
  tokenRefreshHandlersAttached = true;
  const sync = async () => {
    try {
      await registerPushNotifications();
    } catch (err) {
      console.warn('[FCM] Token refresh sync skipped:', err?.message || err);
    }
  };
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sync();
    }
  });
  window.setInterval(sync, 6 * 60 * 60 * 1000);
}

export async function unregisterPushNotifications() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    return;
  }
  try {
    await api.delete('/api/notifications/fcm/unregister', { params: { token } });
  } finally {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_SYNCED_KEY);
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(SESSION_REGISTERED_PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
  }
}
