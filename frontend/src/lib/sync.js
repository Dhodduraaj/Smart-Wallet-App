import { getStoredData, saveStoredData } from './db';
import axios from 'axios';

// Network-only axios client for sync operations to bypass adapter
export const apiNetwork = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8081',
  headers: {
    'Content-Type': 'application/json',
  },
});

let isSyncing = false;

export async function sync() {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  const store = getStoredData();
  
  // Only sync if email is set, localUserId exists, and user is authenticated
  if (!store.email || !store.isAuthenticated || !store.localUserId) {
    return;
  }

  isSyncing = true;
  console.info('[Sync Engine] Starting background sync...');
  
  try {
    const isNewSync = !store.lastSync;
    const url = isNewSync ? '/sync/register' : '/sync/update';
    
    // Construct transaction payload
    const rawExpenses = store.data.expenses || [];
    const rawIncomes = store.data.incomes || [];
    const transactions = [
      ...rawExpenses.map(e => ({ ...e, transactionType: 'expense' })),
      ...rawIncomes.map(i => ({ ...i, transactionType: 'income' }))
    ];
    
    // Construct categories payload
    const categories = [...new Set(rawExpenses.map(e => e.category).filter(Boolean))];
    
    // Conforms to sync payload schema
    const payload = {
      localUserId: store.localUserId, // for backward-compatible routing in SyncController
      email: store.email,
      userId: store.localUserId,
      syncedAt: new Date().toISOString(),
      payload: {
        accounts: store.data.accounts || [],
        transactions,
        categories,
        reminders: store.data.reminders || [],
        transfers: store.data.transfers || [],
        profile: store.data.profile || {},
        settings: store.data.settings || {}
      }
    };
    
    const response = await apiNetwork.post(url, payload);
    if (response.status === 200) {
      if (response.data && response.data.status === 'exists' && response.data.userId) {
        console.warn(`[Sync Engine] Email already registered under ID ${response.data.userId}. Updating localUserId to match.`);
        store.localUserId = response.data.userId;
        saveStoredData(store);
        isSyncing = false; // Reset sync flag
        return sync(); // Retry sync with the correct ID
      }
      store.lastSync = new Date().toISOString();
      saveStoredData(store);
      console.info('[Sync Engine] Background sync completed successfully.');
    }
  } catch (err) {
    console.error('[Sync Engine] Background sync failed:', err);
  } finally {
    isSyncing = false;
  }
}

// Clear sync status on logout
window.addEventListener('auth-logout', () => {
  console.info('[Sync Engine] User logged out.');
});
