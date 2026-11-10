import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { getStoredData, saveStoredData, restoreDbFromBackup, clearLocalDb, generateUUID } from '../lib/db';
import { sync } from '../lib/sync';
import { Preferences } from '@capacitor/preferences';

const AuthContext = createContext(null);

const buildUserProfile = (store) => {
  if (!store || !store.data || !store.data.profile) return null;
  const uid = store.localUserId || store.data.profile.userId || store.data.profile.id;
  return {
    ...store.data.profile,
    userId: uid,
    id: uid
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Bootstrap (Runs once on app startup)
  useEffect(() => {
    const bootstrap = async () => {
      try {
        let prefStoredData = null;
        let prefToken = null;

        // 1. Safely attempt to read native Capacitor Preferences (SharedPreferences on Android)
        try {
          const prefDataRes = await Preferences.get({ key: 'smart_wallet_data' });
          prefStoredData = prefDataRes?.value;
          const prefTokenRes = await Preferences.get({ key: 'token' });
          prefToken = prefTokenRes?.value;
        } catch (prefErr) {
          console.warn('[Auth Bootstrap] Native Preferences read failed or not available:', prefErr);
        }

        // 2. Check local storage
        const localRaw = localStorage.getItem('smart_wallet_data');

        // 3. Hydrate or reconcile between Preferences and localStorage
        if (prefStoredData) {
          try {
            const parsedPref = JSON.parse(prefStoredData);
            if (parsedPref && parsedPref.data) {
              if (!localRaw) {
                localStorage.setItem('smart_wallet_data', prefStoredData);
              } else {
                try {
                  const parsedLocal = JSON.parse(localRaw);
                  // If localStorage is unauthenticated but native Preferences has an active session, restore it
                  if (parsedPref.isAuthenticated === true && parsedLocal.isAuthenticated !== true) {
                    localStorage.setItem('smart_wallet_data', prefStoredData);
                  }
                } catch {
                  localStorage.setItem('smart_wallet_data', prefStoredData);
                }
              }
            }
          } catch {
            // invalid JSON in preferences, ignore
          }
        }

        if (prefToken && !localStorage.getItem('token')) {
          localStorage.setItem('token', prefToken);
        } else if (!prefToken && localStorage.getItem('token')) {
          try {
            await Preferences.set({ key: 'token', value: localStorage.getItem('token') });
          } catch {}
        }

        // 4. Retrieve stored data through standard db layer
        const store = getStoredData();
        const token = localStorage.getItem('token') || prefToken;

        // 5. Check authentication state & validate session
        if (store && store.isAuthenticated === true && store.data && store.data.profile) {
          if (token && navigator.onLine) {
            try {
              // Validate session with backend
              const meRes = await api.get('/api/auth/me');
              if (meRes.data) {
                if (meRes.data.userId) store.localUserId = meRes.data.userId;
                if (store.data.profile) {
                  store.data.profile.userId = meRes.data.userId || store.data.profile.userId;
                  if (meRes.data.fullName) store.data.profile.fullName = meRes.data.fullName;
                }
                saveStoredData(store);
              }
              const userProfile = buildUserProfile(store);
              setUser(userProfile);
            } catch (authErr) {
              if (authErr.response?.status === 401) {
                // Token is revoked or expired - invalidate session
                console.warn('[Auth Bootstrap] Token expired or invalid on backend (401), logging out:', authErr);
                localStorage.removeItem('token');
                try { await Preferences.remove({ key: 'token' }); } catch {}
                store.isAuthenticated = false;
                saveStoredData(store);
                try {
                  await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
                } catch {}
                setUser(null);
                return;
              } else {
                // Server cold starting / network glitch - retain local session
                console.warn('[Auth Bootstrap] Backend unreachable or cold starting, maintaining local session:', authErr);
                setUser(buildUserProfile(store));
              }
            }
          } else {
            // Offline mode or active local session - restore user
            const userProfile = buildUserProfile(store);
            setUser(userProfile);
          }

          // Ensure native Preferences also has the latest stored data
          try {
            await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
          } catch {
            // ignore
          }
        } else {
          // If store is not authenticated, verify if Preferences had authenticated data
          if (prefStoredData) {
            try {
              const parsedPref = JSON.parse(prefStoredData);
              if (parsedPref && parsedPref.isAuthenticated === true && parsedPref.data && parsedPref.data.profile) {
                localStorage.setItem('smart_wallet_data', prefStoredData);
                setUser(buildUserProfile(parsedPref));
                return;
              }
            } catch {
              // ignore
            }
          }
          setUser(null);
        }
      } catch (err) {
        console.error('[Auth Bootstrap] Error in bootstrap:', err);
        // Robust fallback: inspect raw localStorage directly before defaulting to unauthenticated
        try {
          const raw = localStorage.getItem('smart_wallet_data');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.isAuthenticated === true && parsed.data && parsed.data.profile) {
              setUser(buildUserProfile(parsed));
              return;
            }
          }
        } catch {
          // ignore
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();

    // Listen for logout events
    const handleLogoutEvent = () => {
      setUser(null);
    };
    window.addEventListener('auth-logout', handleLogoutEvent);

    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  const login = async (email, password) => {
    window.__isLoggingIn = true;
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // 1. Authenticate against the backend API
      // If password is wrong or user does not exist, the API returns 401 and this throws!
      const response = await api.post('/api/auth/login', {
        email: normalizedEmail,
        password: password
      });

      const { token, userId, fullName } = response.data || {};
      if (!token) {
        throw new Error('Authentication failed: No token received from server');
      }

      // 2. Persist token in localStorage and Capacitor Preferences
      localStorage.setItem('token', token);
      try {
        await Preferences.set({ key: 'token', value: token });
      } catch (prefErr) {
        console.warn('[Auth Login] Failed to save token to Preferences:', prefErr);
      }

      // 3. Initialize or update local data store
      const store = getStoredData();
      const isDifferentEmail = store.email && store.email.toLowerCase() !== normalizedEmail;
      if (isDifferentEmail) {
        store.localUserId = userId || generateUUID();
        store.email = normalizedEmail;
        store.lastSync = null;
        store.data = {
          profile: {
            fullName: fullName || normalizedEmail.split('@')[0],
            email: normalizedEmail,
            userId: userId || store.localUserId,
            onboardingCompleted: true
          },
          accounts: [
            {
              id: generateUUID(),
              accountName: "Cash",
              accountType: "SYSTEM",
              locked: true,
              currentBalance: 0,
              deleted: false
            }
          ],
          expenses: [],
          incomes: [],
          reminders: [],
          transfers: [],
          settings: {
            dailyReminderConfig: { enabled: false, reminderTime: '21:00', reminderZoneId: 'UTC' }
          }
        };
      } else {
        store.email = normalizedEmail;
        if (userId) store.localUserId = userId;
        if (!store.data.profile) {
          store.data.profile = {};
        }
        store.data.profile.email = normalizedEmail;
        store.data.profile.fullName = fullName || store.data.profile.fullName || normalizedEmail.split('@')[0];
        if (userId) store.data.profile.userId = userId;
        store.data.profile.onboardingCompleted = true;
      }
      
      store.isAuthenticated = true;
      saveStoredData(store);
      try {
        await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
      } catch (prefErr) {
        console.warn('[Auth Login] Failed to save store to Preferences:', prefErr);
      }
      
      const localProfile = buildUserProfile(store);
      setUser(localProfile);

      // Try pulling backup from server if online
      if (navigator.onLine) {
        try {
          const syncPullRes = await api.get(`/sync/pull?email=${encodeURIComponent(normalizedEmail)}`);
          if (syncPullRes.status === 200 && syncPullRes.data) {
            await restoreDbFromBackup(syncPullRes.data);
            const updatedStore = getStoredData();
            setUser(buildUserProfile(updatedStore));
          }
        } catch (pullErr) {
          console.warn('[Auth Login] Failed to pull user backup or user has no backup yet:', pullErr);
        }
      }

      // Trigger background sync
      setTimeout(() => {
        sync();
      }, 100);

      return localProfile;
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const register = async (fullName, email, password) => {
    window.__isLoggingIn = true;
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // 1. Register with the backend API
      const response = await api.post('/api/auth/register', {
        fullName: fullName.trim(),
        email: normalizedEmail,
        password: password
      });

      const { token, userId, fullName: resFullName } = response.data || {};
      if (!token) {
        throw new Error('Registration failed: No token received from server');
      }

      // 2. Persist token in localStorage and Capacitor Preferences
      localStorage.setItem('token', token);
      try {
        await Preferences.set({ key: 'token', value: token });
      } catch (prefErr) {
        console.warn('[Auth Register] Failed to save token to Preferences:', prefErr);
      }

      // 3. Save details locally and set isAuthenticated to true
      const store = getStoredData();
      store.localUserId = userId || generateUUID();
      store.email = normalizedEmail;
      store.isAuthenticated = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = normalizedEmail;
      store.data.profile.fullName = resFullName || fullName.trim();
      store.data.profile.userId = userId || store.localUserId;
      store.data.profile.onboardingCompleted = true;
      saveStoredData(store);
      try {
        await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
      } catch (prefErr) {
        console.warn('[Auth Register] Failed to save store to Preferences:', prefErr);
      }
      
      const localProfile = buildUserProfile(store);
      setUser(localProfile);

      // Trigger background sync
      setTimeout(() => {
        sync();
      }, 100);

      return localProfile;
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const logout = async () => {
    const store = getStoredData();
    store.isAuthenticated = false;
    saveStoredData(store);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    try {
      await Preferences.remove({ key: 'token' });
      await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
    } catch (err) {
      console.warn('[Auth Logout] Failed to clear Preferences:', err);
    }
    window.dispatchEvent(new Event('auth-logout'));
  };

  const refreshUser = async () => {
    const store = getStoredData();
    const localProfile = buildUserProfile(store) || { fullName: 'Local User', email: '', userId: store.localUserId, id: store.localUserId };
    setUser(localProfile);
    return localProfile;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
