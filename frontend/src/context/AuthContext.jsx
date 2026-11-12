import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { getStoredData, saveStoredData, restoreDbFromBackup, clearLocalDb, generateUUID } from '../lib/db';
import { sync } from '../lib/sync';
import { Preferences } from '@capacitor/preferences';

const AuthContext = createContext(null);

export const hasLocalFinancialData = (store) => {
  if (!store || !store.data) return false;
  const d = store.data;
  const hasExpenses = Array.isArray(d.expenses) && d.expenses.length > 0;
  const hasIncomes = Array.isArray(d.incomes) && d.incomes.length > 0;
  const hasTransfers = Array.isArray(d.transfers) && d.transfers.length > 0;
  const hasPeople = Array.isArray(d.people) && d.people.length > 0;
  const hasPeopleLedger = Array.isArray(d.peopleLedger) && d.peopleLedger.length > 0;
  const hasReminders = Array.isArray(d.reminders) && d.reminders.length > 0;
  const hasCustomAccounts = Array.isArray(d.accounts) && d.accounts.some(
    a => a.accountType !== 'SYSTEM' || (a.currentBalance && Number(a.currentBalance) !== 0)
  );
  return hasExpenses || hasIncomes || hasTransfers || hasPeople || hasPeopleLedger || hasReminders || hasCustomAccounts;
};

export const createLocalDataBackup = async () => {
  try {
    const raw = localStorage.getItem('smart_wallet_data');
    if (raw) {
      const timestamp = new Date().toISOString();
      localStorage.setItem('smart_wallet_backup_pre_recovery', raw);
      localStorage.setItem('smart_wallet_backup_timestamp', timestamp);
      try {
        await Preferences.set({ key: 'smart_wallet_backup_pre_recovery', value: raw });
        await Preferences.set({ key: 'smart_wallet_backup_timestamp', value: timestamp });
      } catch (prefErr) {
        console.warn('[Backup] Preferences backup error:', prefErr);
      }
      return true;
    }
  } catch (err) {
    console.error('[Backup] Failed to create local safety backup:', err);
  }
  return false;
};

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

  const recoverAndSyncLocalAccount = async (email, password, onProgress = null) => {
    window.__isLoggingIn = true;
    try {
      const normalizedEmail = email.trim().toLowerCase();
      
      // Step 1: Pre-recovery backup & data identification
      onProgress?.({
        step: 1,
        title: 'Local account detected',
        detail: 'Scanning local financial data and creating safety backup...'
      });
      await createLocalDataBackup();

      const store = getStoredData();
      const localUserId = store.localUserId || generateUUID();
      const fullName = store.data?.profile?.fullName || normalizedEmail.split('@')[0];

      // Assemble full payload
      const rawExpenses = store.data?.expenses || [];
      const rawIncomes = store.data?.incomes || [];
      const transactions = [
        ...rawExpenses.map(e => ({ ...e, transactionType: 'expense' })),
        ...rawIncomes.map(i => ({ ...i, transactionType: 'income' }))
      ];

      const payloadData = {
        accounts: store.data?.accounts || [],
        expenses: rawExpenses,
        incomes: rawIncomes,
        transactions,
        transfers: store.data?.transfers || [],
        reminders: store.data?.reminders || [],
        people: store.data?.people || [],
        peopleLedger: store.data?.peopleLedger || [],
        profile: store.data?.profile || {},
        settings: store.data?.settings || {}
      };

      // Step 2: Cloud Account Check
      onProgress?.({
        step: 2,
        title: 'Cloud account checked',
        detail: 'Connecting to Neon cloud database...'
      });

      // Step 3 & 4: Call backend recover-and-sync endpoint
      onProgress?.({
        step: 3,
        title: 'Records identified & account recovering',
        detail: `Preparing ${rawExpenses.length} expenses, ${rawIncomes.length} incomes, ${(store.data?.peopleLedger || []).length} ledger entries...`
      });

      const response = await api.post('/api/auth/recover-and-sync', {
        localUserId: localUserId,
        email: normalizedEmail,
        password: password,
        fullName: fullName,
        payload: payloadData
      });

      const { token, userId, fullName: resFullName, syncedCounts } = response.data || {};
      if (!token) {
        throw new Error('Recovery failed: No token received from server');
      }

      onProgress?.({
        step: 4,
        title: 'Records synchronized',
        detail: `Uploaded ${syncedCounts?.expenses ?? rawExpenses.length} expenses, ${syncedCounts?.incomes ?? rawIncomes.length} incomes, ${syncedCounts?.accounts ?? (store.data?.accounts || []).length} accounts to Neon PostgreSQL.`
      });

      // Save token in dual storage
      localStorage.setItem('token', token);
      try {
        await Preferences.set({ key: 'token', value: token });
      } catch (prefErr) {
        console.warn('[Recovery] Failed to save token to Preferences:', prefErr);
      }

      // Preserve all existing local data while updating identity and authentication state
      store.email = normalizedEmail;
      store.localUserId = userId || localUserId;
      store.isAuthenticated = true;
      store.lastSync = new Date().toISOString();
      if (!store.data.profile) {
        store.data.profile = {};
      }
      store.data.profile.email = normalizedEmail;
      store.data.profile.fullName = resFullName || fullName;
      store.data.profile.userId = userId || localUserId;
      store.data.profile.onboardingCompleted = true;

      saveStoredData(store);
      try {
        await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
      } catch (prefErr) {
        console.warn('[Recovery] Failed to save store to Preferences:', prefErr);
      }

      const localProfile = buildUserProfile(store);
      setUser(localProfile);

      onProgress?.({
        step: 5,
        title: 'Migration completed',
        detail: 'All financial data is safely recovered and synchronized.'
      });

      return localProfile;
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const login = async (email, password, onProgress = null) => {
    window.__isLoggingIn = true;
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Ensure safety snapshot before any login attempt
      await createLocalDataBackup();

      const store = getStoredData();
      const hasData = hasLocalFinancialData(store);

      // 1. Authenticate against the backend API
      try {
        if (hasData && onProgress) {
          onProgress({
            step: 2,
            title: 'Cloud account checked',
            detail: 'Authenticating with cloud database...'
          });
        }

        const response = await api.post('/api/auth/login', {
          email: normalizedEmail,
          password: password
        });

        const { token, userId, fullName } = response.data || {};
        if (!token) {
          throw new Error('Authentication failed: No token received from server');
        }

        // Persist token in localStorage and Capacitor Preferences
        localStorage.setItem('token', token);
        try {
          await Preferences.set({ key: 'token', value: token });
        } catch (prefErr) {
          console.warn('[Auth Login] Failed to save token to Preferences:', prefErr);
        }

        // If local data exists, preserve it completely
        store.email = normalizedEmail;
        if (userId) store.localUserId = userId;
        if (!store.data.profile) {
          store.data.profile = {};
        }
        store.data.profile.email = normalizedEmail;
        store.data.profile.fullName = fullName || store.data.profile.fullName || normalizedEmail.split('@')[0];
        if (userId) store.data.profile.userId = userId;
        store.data.profile.onboardingCompleted = true;
        store.isAuthenticated = true;

        saveStoredData(store);
        try {
          await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
        } catch (prefErr) {
          console.warn('[Auth Login] Failed to save store to Preferences:', prefErr);
        }

        const localProfile = buildUserProfile(store);
        setUser(localProfile);

        if (hasData && onProgress) {
          onProgress({
            step: 5,
            title: 'Migration completed',
            detail: 'Welcome back! Session successfully established.'
          });
        }

        // If user has local data that was never backed up to cloud, trigger sync
        setTimeout(() => {
          sync();
        }, 300);

        return localProfile;
      } catch (loginErr) {
        // If login failed because the account was not found in Neon cloud (userNotFound: true),
        // and we have local financial data on this device, automatically recover and sync!
        const isUserNotFound = loginErr.response?.data?.userNotFound === true;
        if (isUserNotFound && hasData) {
          console.info('[Auth Login] User not found in Neon cloud but local financial data exists. Initiating automatic recovery and sync...');
          return await recoverAndSyncLocalAccount(normalizedEmail, password, onProgress);
        }

        // If it's a genuine password mismatch for an existing account, rethrow
        throw loginErr;
      }
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const register = async (fullName, email, password, onProgress = null) => {
    window.__isLoggingIn = true;
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Ensure safety snapshot before registration
      await createLocalDataBackup();

      const store = getStoredData();
      const hasData = hasLocalFinancialData(store);

      // If local financial data already exists on this device, recover and sync it
      // so existing records are uploaded to Neon rather than creating an empty account
      if (hasData) {
        console.info('[Auth Register] Local financial data detected during registration. Recovering and syncing local records to cloud account...');
        return await recoverAndSyncLocalAccount(normalizedEmail, password, onProgress);
      }

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
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      recoverAndSyncLocalAccount,
      createLocalDataBackup,
      hasLocalFinancialData,
      logout,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
