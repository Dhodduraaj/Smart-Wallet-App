import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';
import { firebasePublicConfig } from '../config/firebasePublicConfig';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebasePublicConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebasePublicConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebasePublicConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebasePublicConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebasePublicConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebasePublicConfig.appId,
};

export const isFirebaseConfigured = () =>
  Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      import.meta.env.VITE_FIREBASE_VAPID_KEY
  );

export const getFirebaseApp = () => {
  if (!isFirebaseConfigured()) {
    return null;
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
};

export const getFirebaseMessaging = async () => {
  if (!isFirebaseConfigured()) {
    return null;
  }
  const supported = await isSupported();
  console.info('[FCM] Messaging supported =', supported);
  if (!supported) {
    return null;
  }
  return getMessaging(getFirebaseApp());
};
