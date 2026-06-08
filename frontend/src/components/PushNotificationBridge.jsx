import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  attachTokenRefreshSync,
  registerPushNotificationsForUser,
  unregisterPushNotifications,
} from '../lib/pushNotifications';

/**
 * After login, registers FCM token with backend and sets up foreground/background handlers.
 */
const PushNotificationBridge = () => {
  const { user, loading } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    if (!user) {
      registeredRef.current = false;
      unregisterPushNotifications().catch(() => {});
      return undefined;
    }

    if (registeredRef.current) {
      return undefined;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        console.info('[FCM Bridge] Starting push setup for authenticated user');
        await registerPushNotificationsForUser(user.userId ?? user.id);
        attachTokenRefreshSync();
        if (!cancelled) {
          registeredRef.current = true;
        }
      } catch (err) {
        console.error('Push notification setup failed:', err);
      }
    };

    setup();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return null;
};

export default PushNotificationBridge;
