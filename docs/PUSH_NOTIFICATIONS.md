# Firebase Push Notifications (FCM Web)

## Critical: one service worker at `/`

Use **`public/firebase-messaging-sw.js` only**. Do not register `sw.js` at the same scope — that breaks FCM with `AbortError: push service error`.

Firebase is initialized **statically at the top** of the service worker (no `postMessage`).

## File locations

| File | Purpose |
|------|---------|
| `frontend/public/firebase-messaging-sw.js` | Static Firebase compat + background push + PWA cache |
| `frontend/src/config/firebasePublicConfig.js` | Same config for React (must match SW) |
| `frontend/src/lib/pushNotifications.js` | Token + permission after login |
| `frontend/src/components/PushNotificationBridge.jsx` | Runs after auth |
| `backend/.../FirebasePushNotificationServiceImpl.java` | Sends via Admin SDK HTTP v1 |
| `backend/.../FcmTokenController.java` | `POST /api/notifications/fcm/register` |

## Frontend `.env`

```env
VITE_FIREBASE_VAPID_KEY=BG7iGCSOL6X7ZeYZocjHLxdPXmlw57kFK9_x7_JDFNu3sdxTJ90kxcTcJbSkaYYC580TthFNQD_4IOvCYYoj2sI
```

Other `VITE_FIREBASE_*` vars optional if using `firebasePublicConfig.js` defaults.

## Backend `.env`

```env
FIREBASE_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_PATH=C:/path/to/smart-wallet-32e00-firebase-adminsdk-....json
```

## After changing the service worker

1. DevTools → Application → Service Workers → Unregister old workers  
2. Hard refresh (Ctrl+Shift+R)  
3. Log in again and allow notifications  

## Test

1. Login → allow notifications  
2. Network: `POST /api/notifications/fcm/register`  
3. Close tab; trigger reminder from scheduler → system notification appears  
