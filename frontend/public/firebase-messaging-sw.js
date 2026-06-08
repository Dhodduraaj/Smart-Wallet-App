/* eslint-disable no-undef */
/**
 * FCM + PWA service worker.
 * Firebase MUST be initialized at load time (no postMessage) for Web Push to work.
 * Config must match src/config/firebasePublicConfig.js
 */

importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyC-nOtINho0WVFyBmSYt1HhVWtvR1QmgZs',
  authDomain: 'smart-wallet-32e00.firebaseapp.com',
  projectId: 'smart-wallet-32e00',
  storageBucket: 'smart-wallet-32e00.firebasestorage.app',
  messagingSenderId: '598271239130',
  appId: '1:598271239130:web:d5acf6688ad1482779d6e3',
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || 'Smart Wallet';
  const body = payload.data?.body || '';
  const options = {
    body,
    icon: '/icon-round.png',
    badge: '/icon-round.png',
    data: payload.data || {},
    tag: payload.data?.type || 'smart-wallet-notification',
    renotify: true,
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.location.origin + '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

/* --- PWA offline cache (merged from sw.js; single root-scoped worker) --- */
const CACHE_NAME = 'smart-wallet-cache-v2';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json', '/icon-round.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  const url = new URL(event.request.url);
  if (url.pathname === '/exit.html') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate' && url.pathname !== '/exit.html') {
        return caches.match('/index.html');
      }
    })
  );
});
