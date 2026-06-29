import { db, getLocalAccount, saveLocalAccount, saveLocalExpense, saveLocalIncome, saveLocalUpcomingPayment, saveLocalDailyReminderConfig, saveLocalProfile } from './db';
import axios from 'axios';

// Network-only axios client for sync operations to bypass adapter
export const apiNetwork = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8081',
  headers: {
    'Content-Type': 'application/json',
  },
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

export async function sync() {
  if (isSyncing) return;
  if (!navigator.onLine) return;
  const token = localStorage.getItem('token');
  const isAuthenticated = !!token;
  const isLoggingIn = window.__isLoggingIn === true;

  if (!isAuthenticated || isLoggingIn) {
    return; // Gate sync
  }

  isSyncing = true;
  console.info('[Sync Engine] Starting background sync...');
  
  try {
    // 1. Push local changes upwards
    await pushLocalChanges();

    // 2. Pull server changes downwards
    await pullServerChanges();
    
    console.info('[Sync Engine] Background sync completed successfully.');
  } catch (err) {
    console.error('[Sync Engine] Background sync failed:', err);
  } finally {
    isSyncing = false;
  }
}

// Push local changes (Upward Sync)
async function pushLocalChanges() {
  await pushProfileChanges();
  await pushAccountChanges();
  await pushExpenseChanges();
  await pushIncomeChanges();
  await pushReminderChanges();
  await pushTransferChanges();
}

async function pushProfileChanges() {
  const record = await db.profile.get('current_user');
  if (record && record.syncStatus === 'PENDING') {
    try {
      if (record.data.avatar) {
        await apiNetwork.put('/api/user/profile-avatar', { avatar: record.data.avatar });
      }
      record.syncStatus = 'SYNCED';
      await db.profile.put(record);
    } catch (err) {
      console.error('Failed to sync profile avatar:', err);
      record.syncStatus = 'FAILED';
      await db.profile.put(record);
    }
  }
}

async function pushAccountChanges() {
  const pending = await db.accounts.filter(a => a.syncStatus !== 'SYNCED').toArray();
  for (const record of pending) {
    try {
      if (record.deleted) {
        await apiNetwork.delete(`/api/accounts/${record.id}`);
        await db.accounts.delete(record.id);
      } else if (record.syncOperation === 'CREATE') {
        const res = await apiNetwork.post('/api/accounts', record.data);
        const serverAcc = res.data;
        const oldId = record.id;
        const newId = serverAcc.id;

        // ID Rewriting: If server returned a different UUID, update references
        if (oldId !== newId) {
          console.info(`[Sync Engine] Rewriting account ID reference: ${oldId} -> ${newId}`);
          
          // Update local expenses referencing old accountId
          const expenses = await db.expenses.toArray();
          for (const exp of expenses) {
            if (exp.data.accountId === oldId) {
              exp.data.accountId = newId;
              exp.data.accountName = serverAcc.accountName;
              await db.expenses.put(exp);
            }
          }

          // Update local incomes referencing old accountId
          const incomes = await db.incomes.toArray();
          for (const inc of incomes) {
            if (inc.data.accountId === oldId) {
              inc.data.accountId = newId;
              inc.data.accountName = serverAcc.accountName;
              await db.incomes.put(inc);
            }
          }

          // Update local transfers referencing old accountId
          const transfers = await db.transfers.toArray();
          for (const tr of transfers) {
            let trUpdated = false;
            if (tr.data.fromAccountId === oldId) {
              tr.data.fromAccountId = newId;
              trUpdated = true;
            }
            if (tr.data.toAccountId === oldId) {
              tr.data.toAccountId = newId;
              trUpdated = true;
            }
            if (trUpdated) {
              await db.transfers.put(tr);
            }
          }

          // Delete old account record, save new one
          await db.accounts.delete(oldId);
        }

        await db.accounts.put({
          id: newId,
          data: serverAcc,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      } else if (record.syncOperation === 'UPDATE') {
        const res = await apiNetwork.put(`/api/accounts/${record.id}`, record.data);
        await db.accounts.put({
          id: record.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      }
    } catch (err) {
      console.error(`Failed to push account change ${record.id}:`, err);
      record.syncStatus = 'FAILED';
      await db.accounts.put(record);
    }
  }
}

async function pushExpenseChanges() {
  const pending = await db.expenses.filter(e => e.syncStatus !== 'SYNCED').toArray();
  for (const record of pending) {
    // Skip if referencing an account that hasn't synced yet
    const acc = await db.accounts.get(record.data.accountId);
    if (acc && acc.syncStatus !== 'SYNCED') {
      console.warn(`[Sync Engine] Postponing expense ${record.id} sync: Account ${record.data.accountId} is not yet synced.`);
      continue;
    }

    try {
      if (record.deleted) {
        await apiNetwork.delete(`/api/expenses/${record.id}`);
        await db.expenses.delete(record.id);
      } else if (record.syncOperation === 'CREATE') {
        // Post payload (exclude temporary ID if the backend generates it, or keep it if backend accepts it)
        const payload = { ...record.data };
        delete payload.id;
        const res = await apiNetwork.post('/api/expenses', payload);
        
        // Delete local temporary ID and save official server object
        await db.expenses.delete(record.id);
        await db.expenses.put({
          id: res.data.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      } else if (record.syncOperation === 'UPDATE') {
        const res = await apiNetwork.put(`/api/expenses/${record.id}`, record.data);
        await db.expenses.put({
          id: record.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      }
    } catch (err) {
      console.error(`Failed to push expense change ${record.id}:`, err);
      record.syncStatus = 'FAILED';
      await db.expenses.put(record);
    }
  }
}

async function pushIncomeChanges() {
  const pending = await db.incomes.filter(i => i.syncStatus !== 'SYNCED').toArray();
  for (const record of pending) {
    const acc = await db.accounts.get(record.data.accountId);
    if (acc && acc.syncStatus !== 'SYNCED') {
      console.warn(`[Sync Engine] Postponing income ${record.id} sync: Account ${record.data.accountId} is not yet synced.`);
      continue;
    }

    try {
      if (record.deleted) {
        await apiNetwork.delete(`/api/incomes/${record.id}`);
        await db.incomes.delete(record.id);
      } else if (record.syncOperation === 'CREATE') {
        const payload = { ...record.data };
        delete payload.id;
        const res = await apiNetwork.post('/api/incomes', payload);
        await db.incomes.delete(record.id);
        await db.incomes.put({
          id: res.data.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      } else if (record.syncOperation === 'UPDATE') {
        const res = await apiNetwork.put(`/api/incomes/${record.id}`, record.data);
        await db.incomes.put({
          id: record.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      }
    } catch (err) {
      console.error(`Failed to push income change ${record.id}:`, err);
      record.syncStatus = 'FAILED';
      await db.incomes.put(record);
    }
  }
}

async function pushReminderChanges() {
  // 1. Daily Config
  const daily = await db.reminders.get('daily_config');
  if (daily && daily.syncStatus === 'PENDING') {
    try {
      await apiNetwork.put('/api/reminders/daily', daily.data);
      daily.syncStatus = 'SYNCED';
      await db.reminders.put(daily);
    } catch (err) {
      console.error('Failed to sync daily reminder config:', err);
      daily.syncStatus = 'FAILED';
      await db.reminders.put(daily);
    }
  }

  // 2. Upcoming Payment Reminders
  const pending = await db.reminders.filter(r => r.id !== 'daily_config' && r.syncStatus !== 'SYNCED').toArray();
  for (const record of pending) {
    try {
      if (record.deleted) {
        await apiNetwork.delete(`/api/reminders/upcoming/${record.id}`);
        await db.reminders.delete(record.id);
      } else if (record.syncOperation === 'CREATE') {
        const payload = { ...record.data };
        delete payload.id;
        const res = await apiNetwork.post('/api/reminders/upcoming', payload);
        await db.reminders.delete(record.id);
        await db.reminders.put({
          id: res.data.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      } else if (record.syncOperation === 'UPDATE') {
        const res = await apiNetwork.put(`/api/reminders/upcoming/${record.id}`, record.data);
        await db.reminders.put({
          id: record.id,
          data: res.data,
          updatedAt: new Date().toISOString(),
          syncStatus: 'SYNCED'
        });
      }
    } catch (err) {
      console.error(`Failed to push reminder change ${record.id}:`, err);
      record.syncStatus = 'FAILED';
      await db.reminders.put(record);
    }
  }
}

async function pushTransferChanges() {
  const pending = await db.transfers.filter(t => t.syncStatus !== 'SYNCED').toArray();
  for (const record of pending) {
    // Note: Since transfers are locally split into local expenses and local incomes,
    // they are synced through those tables. Here we just mark the transfer record itself as SYNCED.
    try {
      record.syncStatus = 'SYNCED';
      await db.transfers.put(record);
    } catch (err) {
      console.error(`Failed to sync transfer status for ${record.id}:`, err);
    }
  }
}

// Pull changes from server (Downward Sync)
async function pullServerChanges() {
  let changed = false;

  // 1. Pull User Profile
  try {
    const res = await apiNetwork.get('/api/auth/me');
    const serverUser = res.data;
    const localProfile = await db.profile.get('current_user');
    
    if (!localProfile || localProfile.syncStatus === 'SYNCED') {
      await saveLocalProfile(serverUser, true);
      localStorage.setItem('user', JSON.stringify(serverUser));
      changed = true;
    }
  } catch (err) {
    console.error('[Sync Engine] Downward profile sync failed:', err);
  }

  // 2. Pull Accounts
  try {
    const res = await apiNetwork.get('/api/accounts');
    const serverAccounts = res.data || [];
    const localAccounts = await db.accounts.toArray();
    const localMap = new Map(localAccounts.map(a => [a.id, a]));

    for (const serverAcc of serverAccounts) {
      const localAcc = localMap.get(serverAcc.id);
      if (!localAcc || localAcc.syncStatus === 'SYNCED') {
        await saveLocalAccount(serverAcc, true);
        changed = true;
      }
    }

    // Delete local accounts that do not exist on server (meaning they were deleted elsewhere)
    const serverAccIds = new Set(serverAccounts.map(a => a.id));
    for (const localAcc of localAccounts) {
      if (localAcc.syncStatus === 'SYNCED' && !serverAccIds.has(localAcc.id) && !localAcc.deleted) {
        await db.accounts.delete(localAcc.id);
        changed = true;
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Downward accounts sync failed:', err);
  }

  // 3. Pull Expenses
  try {
    const res = await apiNetwork.get('/api/expenses?size=1000');
    const serverExpenses = res.data.content || [];
    const localExpenses = await db.expenses.toArray();
    const localMap = new Map(localExpenses.map(e => [e.id, e]));

    for (const serverExp of serverExpenses) {
      const localExp = localMap.get(serverExp.id);
      if (!localExp || localExp.syncStatus === 'SYNCED') {
        await saveLocalExpense(serverExp, true);
        changed = true;
      }
    }

    const serverExpIds = new Set(serverExpenses.map(e => e.id));
    for (const localExp of localExpenses) {
      if (localExp.syncStatus === 'SYNCED' && !serverExpIds.has(localExp.id) && !localExp.deleted) {
        await db.expenses.delete(localExp.id);
        changed = true;
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Downward expenses sync failed:', err);
  }

  // 4. Pull Incomes
  try {
    const res = await apiNetwork.get('/api/incomes?size=1000');
    const serverIncomes = res.data.content || [];
    const localIncomes = await db.incomes.toArray();
    const localMap = new Map(localIncomes.map(i => [i.id, i]));

    for (const serverInc of serverIncomes) {
      const localInc = localMap.get(serverInc.id);
      if (!localInc || localInc.syncStatus === 'SYNCED') {
        await saveLocalIncome(serverInc, true);
        changed = true;
      }
    }

    const serverIncIds = new Set(serverIncomes.map(i => i.id));
    for (const localInc of localIncomes) {
      if (localInc.syncStatus === 'SYNCED' && !serverIncIds.has(localInc.id) && !localInc.deleted) {
        await db.incomes.delete(localInc.id);
        changed = true;
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Downward incomes sync failed:', err);
  }

  // 5. Pull Reminders (Daily + Upcoming)
  try {
    const dailyRes = await apiNetwork.get('/api/reminders/daily');
    const serverDaily = dailyRes.data;
    const localDaily = await db.reminders.get('daily_config');

    if (!localDaily || localDaily.syncStatus === 'SYNCED') {
      await saveLocalDailyReminderConfig(serverDaily, true);
      changed = true;
    }

    const upcomingRes = await apiNetwork.get('/api/reminders/upcoming');
    const serverUpcoming = upcomingRes.data || [];
    const localReminders = await db.reminders.toArray();
    const localUpcoming = localReminders.filter(r => r.id !== 'daily_config');
    const localMap = new Map(localUpcoming.map(r => [r.id, r]));

    for (const serverRem of serverUpcoming) {
      const localRem = localMap.get(serverRem.id);
      if (!localRem || localRem.syncStatus === 'SYNCED') {
        await saveLocalUpcomingPayment(serverRem, true);
        changed = true;
      }
    }

    const serverRemIds = new Set(serverUpcoming.map(r => r.id));
    for (const localRem of localUpcoming) {
      if (localRem.syncStatus === 'SYNCED' && !serverRemIds.has(localRem.id) && !localRem.deleted) {
        await db.reminders.delete(localRem.id);
        changed = true;
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Downward reminders sync failed:', err);
  }

  if (changed) {
    console.info('[Sync Engine] Local database updated. Dispatching sync-completed event.');
    window.dispatchEvent(new Event('sync-completed'));
  }
}

// Clean up database on logout
window.addEventListener('auth-logout', async () => {
  console.info('[Sync Engine] Logging out. Clearing all local IndexedDB tables.');
  try {
    await db.profile.clear();
    await db.accounts.clear();
    await db.expenses.clear();
    await db.incomes.clear();
    await db.reminders.clear();
    await db.transfers.clear();
  } catch (err) {
    console.error('Failed to clear IndexedDB tables on logout:', err);
  }
});
