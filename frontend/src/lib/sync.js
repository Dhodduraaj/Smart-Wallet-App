import { getStoredData, saveStoredData, mergeCloudDataIntoLocal } from './db';
import { getStoredQueue, processQueue, getSyncStatus } from './syncQueue';
import axios from 'axios';

// Network-only axios client for sync operations to bypass adapter
export const apiNetwork = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8081',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000, // 20s timeout to prevent hanging on cold starts
});

apiNetwork.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isSyncing = false;
let isManualUploading = false;
let isManualDownloading = false;
let isUnifiedSyncing = false;

export async function sync() {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  const store = getStoredData();
  
  // Only sync if email is set, localUserId exists, and user is authenticated
  if (!store.email || !store.isAuthenticated || !store.localUserId) {
    return;
  }

  isSyncing = true;
  console.info('[Sync Engine] Starting background snapshot sync...');
  
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
        expenses: rawExpenses,
        incomes: rawIncomes,
        transactions,
        categories,
        reminders: store.data.reminders || [],
        transfers: store.data.transfers || [],
        people: store.data.people || [],
        peopleLedger: store.data.peopleLedger || [],
        profile: store.data.profile || {},
        settings: store.data.settings || {}
      }
    };
    
    const response = await apiNetwork.post(url, payload);
    if (response.status === 200) {
      if (response.data && response.data.status === 'exists' && response.data.userId) {
        console.warn(`[Sync Engine] Email already registered under ID ${response.data.userId}. Updating localUserId to match.`);
        const freshStore = getStoredData();
        freshStore.localUserId = response.data.userId;
        saveStoredData(freshStore);
        isSyncing = false; // Reset sync flag
        return sync(); // Retry sync with the correct ID
      }
      const freshStore = getStoredData();
      freshStore.lastSync = new Date().toISOString();
      saveStoredData(freshStore);
      console.info('[Sync Engine] Background snapshot sync completed successfully.');
      window.dispatchEvent(new CustomEvent('sync-completed'));
      window.dispatchEvent(new CustomEvent('financial-data-changed'));
    }
  } catch (err) {
    console.error('[Sync Engine] Background snapshot sync failed:', err);
  } finally {
    isSyncing = false;
  }
}

/**
 * MANUAL ACTION 1: UPLOAD TO CLOUD (DEVICE TO CLOUD)
 * Uploads all pending local operations from the persistent queue to Neon PostgreSQL,
 * transactionally updates cloud records & balances, and refreshes cloud backup snapshot.
 */
export async function manualUploadToCloud() {
  if (isManualUploading) return { inProgress: true };
  if (!navigator.onLine) {
    throw new Error('You are currently offline. Please connect to internet to upload.');
  }

  const token = localStorage.getItem('token');
  const store = getStoredData();
  if (!token || !store.isAuthenticated || !store.localUserId) {
    throw new Error('Please log in before uploading to the cloud.');
  }

  isManualUploading = true;
  window.dispatchEvent(new CustomEvent('sync-status-changed', {
    detail: { status: 'UPLOADING', isOnline: true }
  }));

  try {
    const queue = getStoredQueue();
    const pendingOps = queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');
    const initialPendingCount = pendingOps.length;

    // Process all pending batches if operations exist
    if (initialPendingCount > 0) {
      await processQueue();
      const updatedQueue = getStoredQueue();
      const remainingPending = updatedQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;
      if (remainingPending > 0) {
        throw new Error(`${remainingPending} operation(s) could not be uploaded. Check connection.`);
      }
    }

    // Refresh cloud snapshot backup
    await sync();

    return {
      success: true,
      uploadedCount: initialPendingCount,
      message: initialPendingCount > 0 
        ? `Successfully uploaded ${initialPendingCount} pending change(s) to cloud.` 
        : 'Cloud is already up to date with this device.'
    };
  } finally {
    isManualUploading = false;
    window.dispatchEvent(new CustomEvent('sync-status-changed', {
      detail: getSyncStatus()
    }));
  }
}

/**
 * MANUAL ACTION 2: DOWNLOAD FROM CLOUD (CLOUD TO DEVICE)
 * Retrieves latest synchronized records from Neon PostgreSQL cloud for this account,
 * safely merges them without destroying locally pending changes, updates balances,
 * and refreshes the application UI.
 */
export async function manualDownloadFromCloud() {
  if (isManualDownloading) return { inProgress: true };
  if (!navigator.onLine) {
    throw new Error('You are currently offline. Please connect to internet to download.');
  }

  const token = localStorage.getItem('token');
  const store = getStoredData();
  if (!token || !store.isAuthenticated) {
    throw new Error('Please log in before downloading from the cloud.');
  }

  isManualDownloading = true;
  window.dispatchEvent(new CustomEvent('sync-status-changed', {
    detail: { status: 'DOWNLOADING', isOnline: true }
  }));

  try {
    const userId = store.localUserId || store.data?.profile?.userId || store.data?.profile?.id;
    const email = store.email || store.data?.profile?.email;

    const response = await apiNetwork.get('/api/sync/pull', {
      params: {
        userId,
        email
      }
    });

    if (response.status === 200 && response.data?.payload) {
      const { updatedCount, deletedCount } = mergeCloudDataIntoLocal(response.data.payload);
      return {
        success: true,
        updatedCount,
        deletedCount,
        message: updatedCount > 0 || deletedCount > 0
          ? `Imported latest changes: ${updatedCount} updated, ${deletedCount} removed.`
          : 'Your device already has the latest cloud records.'
      };
    } else {
      throw new Error('No cloud records found for this account.');
    }
  } finally {
    isManualDownloading = false;
    window.dispatchEvent(new CustomEvent('sync-status-changed', {
      detail: getSyncStatus()
    }));
  }
}

/**
 * UNIFIED SYNC CYCLE:
 * Performs complete bidirectional synchronization in a single user action:
 * 1. Upload: Push pending local queue operations & snapshot to cloud
 * 2. Download / Pull: Fetch latest records from Neon PostgreSQL
 * 3. Reconcile: Merge cloud data with local store safely
 * 4. Verify & Notify: Refresh UI & dispatch data-change events
 */
export async function manualUnifiedSync() {
  if (isUnifiedSyncing) return { inProgress: true };
  if (!navigator.onLine) {
    throw new Error('You are currently offline. Please connect to internet to sync.');
  }

  const token = localStorage.getItem('token');
  const store = getStoredData();
  if (!token || !store.isAuthenticated) {
    throw new Error('Please log in before syncing with the cloud.');
  }

  isUnifiedSyncing = true;
  window.dispatchEvent(new CustomEvent('sync-status-changed', {
    detail: { status: 'SYNCING', isOnline: true }
  }));

  try {
    // Step 1: Upload pending local operations (including local DELETEs)
    const queue = getStoredQueue();
    const pendingOps = queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');
    const initialPendingCount = pendingOps.length;

    if (initialPendingCount > 0) {
      await processQueue();
      const updatedQueue = getStoredQueue();
      const remainingPending = updatedQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED').length;
      if (remainingPending > 0) {
        throw new Error(`${remainingPending} operation(s) could not be uploaded. Check connection.`);
      }
    }

    // Step 2 & 3: Pull cloud updates and reconcile FIRST so local store has latest cloud tombstones and state
    const userId = store.localUserId || store.data?.profile?.userId || store.data?.profile?.id;
    const email = store.email || store.data?.profile?.email;

    let mergeResult = { updatedCount: 0, deletedCount: 0 };
    try {
      const pullRes = await apiNetwork.get('/api/sync/pull', {
        params: { userId, email }
      });
      if (pullRes.status === 200 && pullRes.data?.payload) {
        mergeResult = mergeCloudDataIntoLocal(pullRes.data.payload);
      }
    } catch (pullErr) {
      console.warn('[Sync Engine] Pull step encountered issue:', pullErr.message);
    }

    // Step 4: Refresh cloud snapshot backup with clean reconciled local store
    await sync();

    // Step 5: Verify and notify application
    window.dispatchEvent(new CustomEvent('sync-completed'));
    window.dispatchEvent(new CustomEvent('financial-data-changed'));

    const summaryParts = [];
    if (initialPendingCount > 0) summaryParts.push(`${initialPendingCount} uploaded`);
    if (mergeResult.updatedCount > 0) summaryParts.push(`${mergeResult.updatedCount} imported`);
    if (mergeResult.deletedCount > 0) summaryParts.push(`${mergeResult.deletedCount} removed`);

    return {
      success: true,
      uploadedCount: initialPendingCount,
      updatedCount: mergeResult.updatedCount,
      deletedCount: mergeResult.deletedCount,
      message: summaryParts.length > 0 
        ? `Sync complete: ${summaryParts.join(', ')}.` 
        : 'All data is synchronized and up to date.'
    };
  } finally {
    isUnifiedSyncing = false;
    window.dispatchEvent(new CustomEvent('sync-status-changed', {
      detail: getSyncStatus()
    }));
  }
}

// Clear sync status on logout
window.addEventListener('auth-logout', () => {
  console.info('[Sync Engine] User logged out.');
});

