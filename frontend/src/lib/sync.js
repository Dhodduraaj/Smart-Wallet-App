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
  
  // Only sync if email is set and user is logged in
  if (!store.email || !store.isLoggedIn) {
    return;
  }

  isSyncing = true;
  console.info('[Sync Engine] Starting background sync...');
  
  try {
    const isNewSync = !store.lastSync;
    const url = isNewSync ? '/sync/register' : '/sync/update';
    
    const response = await apiNetwork.post(url, store);
    if (response.status === 200) {
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
