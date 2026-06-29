import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { getStoredData, saveStoredData, restoreDbFromBackup, clearLocalDb } from '../lib/db';
import { sync } from '../lib/sync';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Bootstrap (Runs once on app startup)
  useEffect(() => {
    const bootstrap = async () => {
      try {
        // This will silently create a local user if none exists
        const store = getStoredData();
        if (store && store.isLoggedIn && store.data && store.data.profile) {
          setUser(store.data.profile);
        }
      } catch (err) {
        console.error('[Auth Bootstrap] Failed to load local profile:', err);
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
      
      // Save email locally and set isLoggedIn to true
      store.email = email;
      store.isLoggedIn = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = email;
      store.data.profile.fullName = email.split('@')[0]; // Fallback name
      saveStoredData(store);
      
      const localProfile = store.data.profile;
      setUser(localProfile);

      // Attempt to pull existing backup in the background (if online)
      if (navigator.onLine) {
        try {
          const response = await api.get(`/sync/pull?email=${encodeURIComponent(email)}`);
          if (response.status === 200 && response.data) {
            // Restore data from backup (Local always wins if client already has transactions, 
            // but for a clean reinstall / fresh boot, restore the backup)
            const localData = store.data;
            const hasLocalTx = (localData.expenses && localData.expenses.length > 0) || 
                               (localData.accounts && localData.accounts.length > 0);
            
            if (!hasLocalTx) {
              await restoreDbFromBackup(response.data);
              const updatedStore = getStoredData();
              setUser(updatedStore.data.profile);
            }
          }
        } catch (pullErr) {
          console.warn('[Auth Login] Failed to pull user backup or user has no backup yet:', pullErr);
        }
      }

      // Trigger sync in background
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
      
      // Save details locally and set isLoggedIn to true
      store.email = email;
      store.isLoggedIn = true;
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = email;
      store.data.profile.fullName = fullName;
      saveStoredData(store);
      
      const localProfile = store.data.profile;
      setUser(localProfile);

      // Trigger sync in background
      setTimeout(() => {
        sync();
      }, 100);

      return localProfile;
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const logout = () => {
    clearLocalDb();
    setUser(null);
    window.dispatchEvent(new Event('auth-logout'));
  };

  const refreshUser = async () => {
    // Backend is dumb storage now, refreshUser just returns local profile
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
