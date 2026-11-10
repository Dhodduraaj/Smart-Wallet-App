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
        }

        // 4. Retrieve stored data through standard db layer
        const store = getStoredData();

        // 5. Check authentication state
        if (store && store.isAuthenticated === true && store.data && store.data.profile) {
          const userProfile = buildUserProfile(store);
          setUser(userProfile);

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
      const store = getStoredData();
      
      // If logging in with a new email, reset data safely to prevent cross-contamination
      const isDifferentEmail = store.email && store.email.toLowerCase() !== normalizedEmail;
      if (isDifferentEmail) {
        store.localUserId = generateUUID();
        store.email = normalizedEmail;
        store.lastSync = null;
        store.data = {
          profile: { fullName: normalizedEmail.split('@')[0], email: normalizedEmail, onboardingCompleted: false },
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
      }
      
      store.isAuthenticated = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = normalizedEmail;
      store.data.profile.fullName = normalizedEmail.split('@')[0]; // Simple fallback name
      saveStoredData(store);
      
      const localProfile = buildUserProfile(store);
      setUser(localProfile);

      // Try pulling backup from server if online
      if (navigator.onLine) {
        try {
          const response = await api.get(`/sync/pull?email=${encodeURIComponent(normalizedEmail)}`);
          if (response.status === 200 && response.data) {
            // Restore from sync backup
            await restoreDbFromBackup(response.data);
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
      const store = getStoredData();
      
      // Save details locally and set isAuthenticated to true
      store.email = normalizedEmail;
      store.isAuthenticated = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = normalizedEmail;
      store.data.profile.fullName = fullName;
      saveStoredData(store);
      
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

  const logout = () => {
    const store = getStoredData();
    store.isAuthenticated = false;
    saveStoredData(store);
    setUser(null);
    Preferences.remove({ key: 'token' }).catch(() => {});
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
