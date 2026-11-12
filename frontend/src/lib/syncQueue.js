import { Preferences } from '@capacitor/preferences';
import axios from 'axios';
import { getStoredData, saveStoredData, generateUUID } from './db.js';

const QUEUE_STORAGE_KEY = 'smart_wallet_sync_queue';
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:8081';

// Direct network client without offline mock adapter
export const syncClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30s timeout to prevent infinite hanging
});

// Attach JWT token to every request
syncClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isProcessing = false;
let retryTimeout = null;
let currentStatus = navigator.onLine ? 'SYNCED' : 'OFFLINE';
let lastSyncTimestamp = null;
let lastSyncError = null;

// Read queue from local storage
export function getStoredQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[SyncQueue] Failed to parse local sync queue:', err);
    return [];
  }
}

// Save queue to local storage and Preferences
export function saveStoredQueue(queue) {
  try {
    const raw = JSON.stringify(queue);
    localStorage.setItem(QUEUE_STORAGE_KEY, raw);
    Preferences.set({ key: QUEUE_STORAGE_KEY, value: raw }).catch(() => {});
  } catch (err) {
    console.error('[SyncQueue] Failed to save sync queue:', err);
  }
  dispatchStatusChange();
}

// Dispatch event so UI components can update their sync status indicator
function dispatchStatusChange() {
  const queue = getStoredQueue();
  const pendingCount = queue.filter(q => q.status !== 'SYNCED').length;

  if (!navigator.onLine) {
    currentStatus = 'OFFLINE';
  } else if (isProcessing) {
    currentStatus = 'SYNCING';
  } else if (lastSyncError && pendingCount > 0) {
    currentStatus = 'FAILED';
  } else if (pendingCount > 0) {
    currentStatus = 'PENDING';
  } else {
    currentStatus = 'SYNCED';
  }

  window.dispatchEvent(
    new CustomEvent('sync-status-changed', {
      detail: {
        status: currentStatus,
        pendingCount,
        lastSyncTimestamp,
        lastSyncError,
        isOnline: navigator.onLine,
      },
    })
  );
}

export function getSyncStatus() {
  const queue = getStoredQueue();
  const pendingCount = queue.filter(q => q.status !== 'SYNCED').length;
  return {
    status: currentStatus,
    pendingCount,
    lastSyncTimestamp,
    lastSyncError,
    isOnline: navigator.onLine,
  };
}

/**
 * Enqueue a financial operation into the persistent outbox
 */
export function enqueueOperation({ entityType, operationType, entityId, payload }) {
  const store = getStoredData();
  const userId = store.localUserId || generateUUID();
  const queue = getStoredQueue();

  // Deduplicate / Coalesce operations on the same entity
  const existingIdx = queue.findIndex(
    q => q.entityId === entityId && q.status !== 'SYNCED'
  );

  if (existingIdx !== -1) {
    const existing = queue[existingIdx];
    // If it was a CREATE and now a DELETE arrives, it was never synced to server: remove it
    if (existing.operationType === 'CREATE' && operationType === 'DELETE') {
      queue.splice(existingIdx, 1);
      saveStoredQueue(queue);
      return;
    }
    // If it was a CREATE and an UPDATE arrives, keep it as CREATE with updated payload
    if (existing.operationType === 'CREATE' && operationType === 'UPDATE') {
      queue[existingIdx].payload = { ...existing.payload, ...payload };
      queue[existingIdx].createdAt = new Date().toISOString();
      saveStoredQueue(queue);
      scheduleProcess(200);
      return;
    }
    // If it was an UPDATE and an UPDATE arrives, merge payloads
    if (existing.operationType === 'UPDATE' && operationType === 'UPDATE') {
      queue[existingIdx].payload = { ...existing.payload, ...payload };
      queue[existingIdx].createdAt = new Date().toISOString();
      saveStoredQueue(queue);
      scheduleProcess(200);
      return;
    }
    // If an UPDATE is followed by a DELETE, change to DELETE
    if (existing.operationType === 'UPDATE' && operationType === 'DELETE') {
      queue[existingIdx].operationType = 'DELETE';
      queue[existingIdx].payload = payload;
      queue[existingIdx].createdAt = new Date().toISOString();
      saveStoredQueue(queue);
      scheduleProcess(200);
      return;
    }
  }

  const op = {
    id: generateUUID(),
    entityId: String(entityId),
    entityType, // 'EXPENSE' | 'INCOME' | 'ACCOUNT' | 'TRANSFER' | 'REMINDER'
    operationType, // 'CREATE' | 'UPDATE' | 'DELETE'
    userId,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
    status: 'PENDING',
  };

  queue.push(op);
  saveStoredQueue(queue);
  scheduleProcess(200);
}

/**
 * Enqueue all local financial records for background migration/sync
 * (Used after account recovery or initial setup without blocking the UI)
 */
export function enqueueAllLocalRecords() {
  const store = getStoredData();
  if (!store || !store.data) return;

  const accounts = store.data.accounts || [];
  const expenses = store.data.expenses || [];
  const incomes = store.data.incomes || [];
  const transfers = store.data.transfers || [];
  const reminders = store.data.reminders || [];

  // Enqueue accounts first
  accounts.forEach(acc => {
    enqueueOperation({
      entityType: 'ACCOUNT',
      operationType: 'CREATE',
      entityId: acc.id,
      payload: acc,
    });
  });

  // Enqueue expenses
  expenses.forEach(exp => {
    if (!exp.deleted) {
      enqueueOperation({
        entityType: 'EXPENSE',
        operationType: 'CREATE',
        entityId: exp.id,
        payload: exp,
      });
    }
  });

  // Enqueue incomes
  incomes.forEach(inc => {
    if (!inc.deleted) {
      enqueueOperation({
        entityType: 'INCOME',
        operationType: 'CREATE',
        entityId: inc.id,
        payload: inc,
      });
    }
  });

  // Enqueue transfers
  transfers.forEach(tr => {
    enqueueOperation({
      entityType: 'TRANSFER',
      operationType: 'CREATE',
      entityId: tr.id,
      payload: tr,
    });
  });

  // Enqueue reminders
  reminders.forEach(rem => {
    enqueueOperation({
      entityType: 'REMINDER',
      operationType: 'CREATE',
      entityId: rem.id,
      payload: rem,
    });
  });

  scheduleProcess(300);
}

function scheduleProcess(delayMs = 500) {
  if (retryTimeout) clearTimeout(retryTimeout);
  retryTimeout = setTimeout(() => {
    processQueue().catch(() => {});
  }, delayMs);
}

/**
 * Process pending items in the sync queue independently in the background
 */
export async function processQueue() {
  if (isProcessing) return;
  if (!navigator.onLine) {
    currentStatus = 'OFFLINE';
    dispatchStatusChange();
    return;
  }

  const store = getStoredData();
  const token = localStorage.getItem('token');

  // Must be authenticated to sync with cloud
  if (!store || !store.isAuthenticated || !store.localUserId || !token) {
    dispatchStatusChange();
    return;
  }

  const queue = getStoredQueue();
  const pendingOps = queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');

  if (pendingOps.length === 0) {
    // If queue is empty, do a fast snapshot update of user_backup if needed
    lastSyncError = null;
    currentStatus = 'SYNCED';
    dispatchStatusChange();
    return;
  }

  isProcessing = true;
  currentStatus = 'SYNCING';
  dispatchStatusChange();

  // Take up to 25 operations in one batch to ensure fast HTTP request times
  const batch = pendingOps.slice(0, 25);
  const batchIds = new Set(batch.map(b => b.id));

  // Mark in-flight
  batch.forEach(b => {
    b.status = 'SYNCING';
  });
  saveStoredQueue(queue);

  try {
    const payload = {
      userId: store.localUserId,
      email: store.email,
      operations: batch.map(op => ({
        id: op.id,
        entityType: op.entityType,
        operationType: op.operationType,
        entityId: op.entityId,
        payload: op.payload,
        createdAt: op.createdAt,
      })),
    };

    const response = await syncClient.post('/api/sync/batch', payload);

    if (response.status === 200 && response.data) {
      const processedIds = new Set(response.data.processedIds || batch.map(b => b.id));

      // Remove successfully processed operations from the queue
      const remainingQueue = getStoredQueue().filter(q => !processedIds.has(q.id));
      saveStoredQueue(remainingQueue);

      lastSyncTimestamp = new Date().toISOString();
      lastSyncError = null;

      // Update store lastSync with fresh snapshot
      const freshStore = getStoredData();
      freshStore.lastSync = lastSyncTimestamp;
      saveStoredData(freshStore);

      window.dispatchEvent(new CustomEvent('sync-completed'));
      window.dispatchEvent(new CustomEvent('financial-data-changed'));

      // If more operations remain, schedule next batch immediately
      if (remainingQueue.some(q => q.status === 'PENDING' || q.status === 'FAILED')) {
        scheduleProcess(100);
      }
    }
  } catch (err) {
    console.warn('[SyncQueue] Batch sync failed:', err.message);
    lastSyncError = err.response?.data?.message || err.message || 'Network sync error';

    // If 401 Unauthorized, session token expired on server: do not hammer server
    if (err.response?.status === 401) {
      console.warn('[SyncQueue] 401 Unauthorized during sync. Pausing queue until user re-authenticates.');
      batch.forEach(b => {
        b.status = 'FAILED';
        b.lastError = 'Session expired';
      });
      saveStoredQueue(queue);
      isProcessing = false;
      dispatchStatusChange();
      return;
    }

    // Increment retry counts and mark failed
    batch.forEach(b => {
      b.status = 'FAILED';
      b.retryCount = (b.retryCount || 0) + 1;
      b.lastError = lastSyncError;
    });
    saveStoredQueue(queue);

    // Exponential backoff retry (min 5s, max 60s)
    const maxRetries = Math.max(...batch.map(b => b.retryCount || 0));
    const backoffDelay = Math.min(60000, Math.max(5000, Math.pow(2, maxRetries) * 1000));
    scheduleProcess(backoffDelay);
  } finally {
    isProcessing = false;
    dispatchStatusChange();
  }
}

// Background event hooks for auto-sync
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    scheduleProcess(500);
  });
  window.addEventListener('focus', () => {
    scheduleProcess(1000);
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleProcess(1000);
      }
    });
  }
}
