import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ensureFirebaseMessagingServiceWorker } from './lib/pushNotifications';
import { Capacitor } from '@capacitor/core';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register exactly one root-scoped SW on load so DevTools always shows it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (Capacitor.isNativePlatform()) {
      console.info('[ServiceWorker] Disabled on native mobile platform.');
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.info('[ServiceWorker] Unregistered active service worker.');
        }
      } catch (err) {
        console.error('[ServiceWorker] Failed to unregister active service worker:', err);
      }
    } else {
      try {
        const registration = await ensureFirebaseMessagingServiceWorker();
        if (registration) {
          console.info('[FCM SW] Registered:', registration.scope);
        }
      } catch (err) {
        console.error('[FCM SW] Registration failed:', err);
      }
    }
  });
}
