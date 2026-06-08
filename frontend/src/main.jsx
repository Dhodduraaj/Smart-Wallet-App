import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ensureFirebaseMessagingServiceWorker } from './lib/pushNotifications';
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register exactly one root-scoped SW on load so DevTools always shows it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await ensureFirebaseMessagingServiceWorker();
      if (registration) {
        console.info('[FCM SW] Registered:', registration.scope);
      }
    } catch (err) {
      console.error('[FCM SW] Registration failed:', err);
    }
  });
}
