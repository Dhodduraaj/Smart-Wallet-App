import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { getStoredData, saveStoredData, restoreDbFromBackup, clearLocalDb, generateUUID } from '../lib/db';
import { sync } from '../lib/sync';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Bootstrap (Runs once on app startup)
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const store = getStoredData();
        // Startup logic: IF isAuthenticated == true -> go to home, ELSE -> show login screen
        if (store && store.isAuthenticated === true && store.data && store.data.profile) {
          setUser(store.data.profile);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('[Auth Bootstrap] Failed to load local profile:', err);
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
      const store = getStoredData();
      
      // If logging in with a new email, reset data safely to prevent cross-contamination
      const isDifferentEmail = store.email && store.email.toLowerCase() !== email.toLowerCase();
      if (isDifferentEmail) {
        store.localUserId = generateUUID();
        store.email = email;
        store.lastSync = null;
        store.data = {
          profile: { fullName: email.split('@')[0], email: email, onboardingCompleted: false },
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
        store.email = email;
      }
      
      store.isAuthenticated = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = email;
      store.data.profile.fullName = email.split('@')[0]; // Simple fallback name
      saveStoredData(store);
      
      const localProfile = store.data.profile;
      setUser(localProfile);

      // Try pulling backup from server if online
      if (navigator.onLine) {
        try {
          const response = await api.get(`/sync/pull?email=${encodeURIComponent(email)}`);
          if (response.status === 200 && response.data) {
            // Restore from sync backup
            await restoreDbFromBackup(response.data);
            const updatedStore = getStoredData();
            setUser(updatedStore.data.profile);
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
      const store = getStoredData();
      
      // Save details locally and set isAuthenticated to true
      store.email = email;
      store.isAuthenticated = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = email;
      store.data.profile.fullName = fullName;
      saveStoredData(store);
      
      const localProfile = store.data.profile;
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
    window.dispatchEvent(new Event('auth-logout'));
  };

  const refreshUser = async () => {
    const store = getStoredData();
    const localProfile = store.data?.profile || { fullName: 'Local User', email: '' };
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
