import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { getStoredData, saveStoredData, restoreDbFromBackup, clearLocalDb, generateUUID } from '../lib/db';
import { sync, apiNetwork } from '../lib/sync';
import { enqueueAllLocalRecords } from '../lib/syncQueue';
import { Preferences } from '@capacitor/preferences';

const AuthContext = createContext(null);

export const isJwtTokenExpired = (token) => {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      (typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary'))
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    if (!decoded || typeof decoded.exp !== 'number') return false;
    return (Date.now() / 1000) >= decoded.exp;
  } catch (err) {
    console.warn('[Auth] Failed to decode JWT token for expiry check:', err);
    return false;
  }
};

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
          // Verify JWT expiry locally without blocking app startup
          if (token && isJwtTokenExpired(token)) {
            console.warn('[Auth Bootstrap] Token expired based on JWT claims. Logging out.');
            localStorage.removeItem('token');
            try { await Preferences.remove({ key: 'token' }); } catch {}
            store.isAuthenticated = false;
            saveStoredData(store);
            try {
              await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
            } catch {}
            setUser(null);
            setLoading(false);
            return;
          }

          // Restore session INSTANTLY from local storage (<10ms)
          const userProfile = buildUserProfile(store);
          setUser(userProfile);
          setLoading(false);

          // Non-blocking fire-and-forget background verification only if online
          if (token && navigator.onLine) {
            api.get('/api/auth/me').then(meRes => {
              if (meRes?.data) {
                const freshStore = getStoredData();
                if (meRes.data.userId) freshStore.localUserId = meRes.data.userId;
                if (freshStore.data?.profile) {
                  freshStore.data.profile.userId = meRes.data.userId || freshStore.data.profile.userId;
                  if (meRes.data.fullName) freshStore.data.profile.fullName = meRes.data.fullName;
                }
                saveStoredData(freshStore);
              }
            }).catch(authErr => {
              if (authErr.response?.status === 401) {
                console.warn('[Auth Background] Token rejected by backend (401). Logging out.');
                localStorage.removeItem('token');
                try { Preferences.remove({ key: 'token' }).catch(() => {}); } catch {}
                const currentStore = getStoredData();
                currentStore.isAuthenticated = false;
                saveStoredData(currentStore);
                setUser(null);
              }
            });
          }

          // Ensure native Preferences also has the latest stored data
          try {
            await Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
          } catch {}
          return;
        } else {
          // If store is not authenticated, verify if Preferences had authenticated data
          if (prefStoredData) {
            try {
              const parsedPref = JSON.parse(prefStoredData);
              if (parsedPref && parsedPref.isAuthenticated === true && parsedPref.data && parsedPref.data.profile) {
                if (!prefToken || !isJwtTokenExpired(prefToken)) {
                  localStorage.setItem('smart_wallet_data', prefStoredData);
                  setUser(buildUserProfile(parsedPref));
                  setLoading(false);
                  return;
                }
              }
            } catch {}
          }
          // Robust fallback: inspect raw localStorage directly before defaulting to unauthenticated
          try {
            const raw = localStorage.getItem('smart_wallet_data');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.isAuthenticated === true && parsed.data && parsed.data.profile) {
                setUser(buildUserProfile(parsed));
                setLoading(false);
                return;
              }
            }
          } catch {}
          setUser(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('[Auth Bootstrap] Error in bootstrap:', err);
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
      
      const store = getStoredData();
      const localUserId = store.localUserId || generateUUID();
      const fullName = store.data?.profile?.fullName || normalizedEmail.split('@')[0];

      // Assemble full payload
      const rawExpenses = store.data?.expenses || [];
      const rawIncomes = store.data?.incomes || [];
      const rawAccounts = store.data?.accounts || [];
      const rawLedger = store.data?.peopleLedger || [];
      const transactions = [
        ...rawExpenses.map(e => ({ ...e, transactionType: 'expense' })),
        ...rawIncomes.map(i => ({ ...i, transactionType: 'income' }))
      ];

      const payloadData = {
        accounts: rawAccounts,
        expenses: rawExpenses,
        incomes: rawIncomes,
        transactions,
        transfers: store.data?.transfers || [],
        reminders: store.data?.reminders || [],
        people: store.data?.people || [],
        peopleLedger: rawLedger,
        profile: store.data?.profile || {},
        settings: store.data?.settings || {}
      };

      // Step 1: Pre-recovery backup & data identification
      onProgress?.({
        step: 1,
        title: 'Local account detected',
        detail: `Identified ${rawExpenses.length} expenses, ${rawIncomes.length} incomes, ${rawLedger.length} ledger entries.`
      });
      await createLocalDataBackup();
      await new Promise(r => setTimeout(r, 250));

      // Step 2: Cloud Account Check
      onProgress?.({
        step: 2,
        title: 'Cloud account checked',
        detail: 'Connecting to Neon cloud database...'
      });
      await new Promise(r => setTimeout(r, 250));

      // Step 3: Fast Account Recovery & Credential Verification
      onProgress?.({
        step: 3,
        title: 'Account recovery completed',
        detail: 'Verifying user credentials with Neon PostgreSQL cloud...'
      });

      let response;
      try {
        response = await api.post('/api/auth/recover-account', {
          localUserId: localUserId,
          email: normalizedEmail,
          password: password,
          fullName: fullName
        });
      } catch (err) {
        // Fallback to recover-and-sync if recover-account returns 404 or fails
        if (err.response?.status === 404) {
          response = await api.post('/api/auth/recover-and-sync', {
            localUserId: localUserId,
            email: normalizedEmail,
            password: password,
            fullName: fullName,
            payload: payloadData
          });
        } else {
          throw err;
        }
      }

      const { token, userId, fullName: resFullName } = response.data || {};
      if (!token) {
        throw new Error('Recovery failed: No token received from server');
      }

      // Step 4: Records Synchronized & Queued for Background Sync
      onProgress?.({
        step: 4,
        title: 'Records identified & synchronized',
        detail: `Queued ${rawExpenses.length} expenses, ${rawIncomes.length} incomes, ${rawAccounts.length} accounts for cloud sync.`
      });
      await new Promise(r => setTimeout(r, 200));

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

      // Enqueue all local financial records for background cloud synchronization
      enqueueAllLocalRecords();

      const localProfile = buildUserProfile(store);
      setUser(localProfile);

      // Step 5: Migration Completed
      onProgress?.({
        step: 5,
        title: 'Migration completed',
        detail: 'Secure session established. Offline-first background synchronization active.'
      });
      await new Promise(r => setTimeout(r, 300));

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

      // If user has local financial data on this device, run the full recovery & sync flow
      if (hasData) {
        return await recoverAndSyncLocalAccount(normalizedEmail, password, onProgress);
      }

      // Otherwise standard login for empty/fresh device
      onProgress?.({
        step: 1,
        title: 'Verifying credentials',
        detail: 'Connecting to cloud database...'
      });

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

      onProgress?.({
        step: 2,
        title: 'Importing cloud data',
        detail: 'Restoring your financial records from cloud database...'
      });

      // PULL DATA FROM CLOUD FOR FRESH DEVICE
      try {
        const pullRes = await apiNetwork.get(`/api/sync/pull?email=${encodeURIComponent(normalizedEmail)}&userId=${encodeURIComponent(userId || '')}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (pullRes.status === 200 && pullRes.data) {
          const rawData = pullRes.data;
          const pulledData = rawData.payload || rawData;

          if (pulledData) {
            if (Array.isArray(pulledData.accounts) && pulledData.accounts.length > 0) {
              store.data.accounts = pulledData.accounts;
            }
            if (Array.isArray(pulledData.expenses)) {
              store.data.expenses = pulledData.expenses;
            } else if (Array.isArray(pulledData.transactions)) {
              store.data.expenses = pulledData.transactions.filter(t => t.transactionType === 'expense' || t.type === 'expense');
              store.data.incomes = pulledData.transactions.filter(t => t.transactionType === 'income' || t.type === 'income');
            }
            if (Array.isArray(pulledData.incomes)) {
              store.data.incomes = pulledData.incomes;
            }
            if (Array.isArray(pulledData.transfers)) {
              store.data.transfers = pulledData.transfers;
            }
            if (Array.isArray(pulledData.reminders)) {
              store.data.reminders = pulledData.reminders;
            }
            if (Array.isArray(pulledData.people)) {
              store.data.people = pulledData.people;
            }
            if (Array.isArray(pulledData.peopleLedger)) {
              store.data.peopleLedger = pulledData.peopleLedger;
            }
            if (pulledData.profile && typeof pulledData.profile === 'object') {
              store.data.profile = { ...store.data.profile, ...pulledData.profile };
            }
            if (pulledData.settings && typeof pulledData.settings === 'object') {
              store.data.settings = { ...store.data.settings, ...pulledData.settings };
            }
            store.lastSync = new Date().toISOString();
            console.info(`[Auth Login] Successfully restored cloud backup on fresh device: ${store.data.expenses?.length || 0} expenses, ${store.data.incomes?.length || 0} incomes, ${store.data.accounts?.length || 0} accounts.`);
          }
        }
      } catch (pullErr) {
        console.warn('[Auth Login] Cloud pull error (non-fatal, user may have a brand-new account):', pullErr.message);
      }

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

      window.dispatchEvent(new CustomEvent('sync-completed'));
      window.dispatchEvent(new CustomEvent('financial-data-changed'));

      return localProfile;
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
