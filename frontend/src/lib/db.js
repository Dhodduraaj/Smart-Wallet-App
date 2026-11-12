import { Preferences } from '@capacitor/preferences';
import { enqueueOperation } from './syncQueue.js';
import {
  createTransactionDateTime,
  updateTransactionDateTime,
  sortTransactions,
  aggregateCategoriesForChart,
  isDefaultCategory
} from './transactionSorter.js';

const STORAGE_KEY = 'smart_wallet_data';

// Helper to generate UUID v4
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper to get local date string YYYY-MM-DD
export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const isSelfTransfer = x => x && x.notes && (x.notes === 'Self Transfer' || x.notes.includes('Self Transfer'));

export function getStoredData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let store;
  if (!raw) {
    // Silently initialize local user with default auth state and SYSTEM Cash account
    store = {
      localUserId: generateUUID(),
      email: "",
      isAuthenticated: false,
      createdAt: new Date().toISOString(),
      lastSync: null,
      data: {
        profile: { fullName: "Local User", email: "", onboardingCompleted: false },
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
        people: [],
        peopleLedger: [],
        settings: {
          dailyReminderConfig: { enabled: false, reminderTime: '21:00', reminderZoneId: 'UTC' }
        }
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } else {
    store = JSON.parse(raw);
    if (store.data) {
      if (!store.data.people) store.data.people = [];
      if (!store.data.peopleLedger) store.data.peopleLedger = [];
    }
  }

  // Enforcement logic: Every user must always have exactly ONE default Cash account.
  // Reconcile and deduplicate any redundant Cash accounts safely without losing data.
  if (store.data && Array.isArray(store.data.accounts)) {
    const expenses = store.data.expenses || [];
    const incomes = store.data.incomes || [];
    const transfers = store.data.transfers || [];

    const cashCandidates = store.data.accounts.filter(a => 
      a && !a.deleted && (a.accountType === 'SYSTEM' || (a.accountName && a.accountName.trim().toLowerCase() === 'cash'))
    );

    if (cashCandidates.length > 1) {
      // Score each candidate: (expCount + incCount) * 1000 + (balance !== 0 ? 100 : 0)
      const scored = cashCandidates.map(c => {
        const idLower = String(c.id).trim().toLowerCase();
        const expCount = expenses.filter(e => e && !e.deleted && String(e.accountId).trim().toLowerCase() === idLower).length;
        const incCount = incomes.filter(i => i && !i.deleted && String(i.accountId).trim().toLowerCase() === idLower).length;
        const hasBalance = parseFloat(c.currentBalance || 0) !== 0 ? 100 : 0;
        return {
          account: c,
          score: (expCount + incCount) * 1000 + hasBalance,
          expCount,
          incCount,
          createdAt: c.createdAt ? new Date(c.createdAt).getTime() : 0
        };
      });

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.createdAt - b.createdAt;
      });

      const canonical = scored[0].account;
      canonical.accountName = 'Cash';
      canonical.accountType = 'SYSTEM';
      canonical.locked = true;

      const canonicalId = String(canonical.id).trim().toLowerCase();

      // For all other duplicates, reassociate any orphaned transactions to canonical
      scored.slice(1).forEach(({ account: dup }) => {
        const dupId = String(dup.id).trim().toLowerCase();
        
        let dupExpensesSum = 0;
        let dupIncomesSum = 0;

        expenses.forEach(e => {
          if (e && String(e.accountId).trim().toLowerCase() === dupId) {
            e.accountId = canonical.id;
            e.accountName = 'Cash';
            dupExpensesSum += parseFloat(e.amount || 0);
          }
        });

        incomes.forEach(i => {
          if (i && String(i.accountId).trim().toLowerCase() === dupId) {
            i.accountId = canonical.id;
            i.accountName = 'Cash';
            dupIncomesSum += parseFloat(i.amount || 0);
          }
        });

        transfers.forEach(t => {
          if (t && String(t.fromAccountId).trim().toLowerCase() === dupId) {
            t.fromAccountId = canonical.id;
          }
          if (t && String(t.toAccountId).trim().toLowerCase() === dupId) {
            t.toAccountId = canonical.id;
          }
        });

        // Adjust canonical balance if duplicate had transactions
        if (dupExpensesSum > 0 || dupIncomesSum > 0) {
          canonical.currentBalance = parseFloat(canonical.currentBalance || 0) + dupIncomesSum - dupExpensesSum;
        } else if (parseFloat(dup.currentBalance || 0) !== 0 && parseFloat(canonical.currentBalance || 0) === 0) {
          canonical.currentBalance = parseFloat(dup.currentBalance || 0);
        }

        const idx = store.data.accounts.findIndex(a => String(a.id).trim().toLowerCase() === dupId);
        if (idx !== -1) {
          store.data.accounts.splice(idx, 1);
        }
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } else if (cashCandidates.length === 0) {
      const otherCash = store.data.accounts.find(a => a.accountName && a.accountName.trim().toLowerCase() === 'cash');
      if (otherCash) {
        otherCash.accountName = 'Cash';
        otherCash.accountType = 'SYSTEM';
        otherCash.locked = true;
      } else {
        store.data.accounts.push({
          id: generateUUID(),
          accountName: "Cash",
          accountType: "SYSTEM",
          locked: true,
          currentBalance: 0,
          deleted: false
        });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } else {
      cashCandidates[0].accountName = 'Cash';
      cashCandidates[0].accountType = 'SYSTEM';
      cashCandidates[0].locked = true;
    }
  }

  return store;
}

export function saveStoredData(obj) {
  const raw = JSON.stringify(obj);
  localStorage.setItem(STORAGE_KEY, raw);
  try {
    Preferences.set({ key: STORAGE_KEY, value: raw }).catch(err => {
      console.warn('[Preferences] Failed to save stored data:', err);
    });
  } catch (err) {
    console.warn('[Preferences] Synchronous failure in saveStoredData:', err);
  }
}

// User Profile Helpers
export async function getLocalProfile() {
  const store = getStoredData();
  if (!store.data.profile) return null;
  const uid = store.localUserId || store.data.profile.userId || store.data.profile.id;
  return {
    ...store.data.profile,
    userId: uid,
    id: uid
  };
}

export async function saveLocalProfile(profileData, isSynced = false) {
  const store = getStoredData();
  store.data.profile = {
    ...store.data.profile,
    ...profileData
  };
  if (profileData && profileData.email) {
    store.email = profileData.email;
  }
  saveStoredData(store);
}

// Account Helpers
export async function getLocalAccounts() {
  const store = getStoredData();
  return (store.data.accounts || []).filter(a => a.deleted !== true);
}

export async function getLocalAccount(id) {
  const store = getStoredData();
  const acc = resolveAccount(store.data.accounts || [], id);
  if (!acc || acc.deleted) return null;
  return acc;
}

export async function saveLocalAccount(accountData, isSynced = false) {
  const store = getStoredData();
  const id = accountData.id || generateUUID();
  const targetId = String(id).trim().toLowerCase();
  const accounts = store.data.accounts || [];
  const index = accounts.findIndex(a => String(a.id).trim().toLowerCase() === targetId);

  // Enforcement: prevent creating duplicate Cash accounts
  const isCashOrSystem = (accountData.accountType === 'SYSTEM' || accountData.accountType === 'CASH' || (accountData.accountName && accountData.accountName.trim().toLowerCase() === 'cash'));
  if (isCashOrSystem && index === -1) {
    const existingCashIdx = accounts.findIndex(a => a && !a.deleted && (a.accountType === 'SYSTEM' || (a.accountName && a.accountName.trim().toLowerCase() === 'cash')));
    if (existingCashIdx !== -1) {
      accounts[existingCashIdx] = {
        ...accounts[existingCashIdx],
        currentBalance: parseFloat(accountData.currentBalance || accounts[existingCashIdx].currentBalance || 0),
        deleted: false
      };
      store.data.accounts = accounts;
      saveStoredData(store);
      return accounts[existingCashIdx];
    }
  }

  // Enforcement: default cash account cannot be renamed
  if (index !== -1) {
    const existing = accounts[index];
    if (existing.accountType === 'SYSTEM' || existing.locked === true) {
      accountData.accountName = existing.accountName; // lock name to original name
      accountData.accountType = 'SYSTEM';
      accountData.locked = true;
    }
  }

  const updatedData = {
    ...accountData,
    id,
    currentBalance: parseFloat(accountData.currentBalance || 0)
  };

  if (index !== -1) {
    accounts[index] = {
      ...accounts[index],
      ...updatedData,
      deleted: false
    };
  } else {
    accounts.push({
      ...updatedData,
      deleted: false
    });
  }

  store.data.accounts = accounts;
  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'ACCOUNT',
        operationType: index === -1 ? 'CREATE' : 'UPDATE',
        entityId: id,
        payload: updatedData,
      });
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('financial-data-changed'));
  }

  return updatedData;
}

// Canonical Account Resolution Helper
export function resolveAccount(accounts, accountId, accountName) {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;

  // 1. Match by normalized ID
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    const targetId = String(accountId).trim().toLowerCase();
    const matchedById = accounts.find(a => a && !a.deleted && String(a.id).trim().toLowerCase() === targetId);
    if (matchedById) return matchedById;
  }

  // 2. Match by normalized account name
  if (accountName && typeof accountName === 'string' && accountName.trim()) {
    const targetName = accountName.trim().toLowerCase();
    const matchedByName = accounts.find(a => a && !a.deleted && a.accountName && a.accountName.trim().toLowerCase() === targetName);
    if (matchedByName) return matchedByName;
  }

  // 3. Fallback to SYSTEM default Cash account, then any Cash account, then first non-deleted available
  const systemCash = accounts.find(a => a && !a.deleted && (a.accountType === 'SYSTEM' || (a.accountName && a.accountName.trim().toLowerCase() === 'cash')));
  if (systemCash) return systemCash;

  return accounts.find(a => a && !a.deleted) || accounts[0] || null;
}

export async function adjustLocalAccountBalance(accountId, amountChange, isSynced = false) {
  const store = getStoredData();
  const accounts = store.data.accounts || [];
  const targetAcc = resolveAccount(accounts, accountId);
  if (targetAcc) {
    const updatedBalance = parseFloat(targetAcc.currentBalance || 0) + amountChange;
    targetAcc.currentBalance = updatedBalance;
    store.data.accounts = accounts;
    saveStoredData(store);

    if (!isSynced) {
      try {
        enqueueOperation({
          entityType: 'ACCOUNT',
          operationType: 'UPDATE',
          entityId: targetAcc.id,
          payload: targetAcc,
        });
      } catch (e) {
        console.warn('[db] enqueueOperation error:', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('financial-data-changed'));
    }
  }
}

export async function deleteLocalAccount(id, isSynced = false) {
  const store = getStoredData();
  const accounts = store.data.accounts || [];
  const targetId = String(id).trim().toLowerCase();
  const acc = accounts.find(a => String(a.id).trim().toLowerCase() === targetId);
  
  // Enforcement: default cash account cannot be deleted
  if (acc && (acc.accountType === 'SYSTEM' || acc.locked === true || (acc.accountName && acc.accountName.toLowerCase() === 'cash'))) {
    throw new Error('Default Cash account cannot be deleted');
  }

  // Complete removal from array (local always wins)
  store.data.accounts = accounts.filter(a => String(a.id).trim().toLowerCase() !== targetId);

  // Complete removal of dependent transactions
  store.data.expenses = (store.data.expenses || []).filter(e => String(e.accountId).trim().toLowerCase() !== targetId);
  store.data.incomes = (store.data.incomes || []).filter(i => String(i.accountId).trim().toLowerCase() !== targetId);

  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'ACCOUNT',
        operationType: 'DELETE',
        entityId: id,
      });
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('financial-data-changed'));
  }
}

// Expense Helpers
export async function getLocalExpenses(params = {}) {
  const { page = 0, size = 10, search = '', category = '', accountId = '' } = params;
  const pageNum = Math.max(0, parseInt(page, 10) || 0);
  const sizeNum = Math.max(1, parseInt(size, 10) || 10);

  const store = getStoredData();
  let records = (store.data.expenses || []).filter(e => e.deleted !== true && !isSelfTransfer(e));

  if (search) {
    const q = search.trim().toLowerCase();
    records = records.filter(r => 
      (r.description || '').toLowerCase().includes(q) || 
      (r.notes || '').toLowerCase().includes(q)
    );
  }

  if (category) {
    const targetCat = category.trim().toLowerCase();
    if (targetCat === 'others') {
      records = records.filter(r => !isDefaultCategory(r.category) || (r.category || '').toLowerCase() === 'others');
    } else {
      records = records.filter(r => (r.category || '').toLowerCase() === targetCat);
    }
  }

  if (accountId) {
    const targetAccId = String(accountId).trim().toLowerCase();
    records = records.filter(r => String(r.accountId).trim().toLowerCase() === targetAccId);
  }

  // Deterministic sort: transactionDateTime DESC then id DESC BEFORE slicing
  records = sortTransactions(records);

  const content = records.slice(pageNum * sizeNum, (pageNum + 1) * sizeNum);
  return {
    content,
    totalElements: records.length,
    totalPages: Math.ceil(records.length / sizeNum),
    size: sizeNum,
    number: pageNum
  };
}

export async function getLocalExpense(id) {
  const store = getStoredData();
  const targetId = String(id).trim().toLowerCase();
  const exp = (store.data.expenses || []).find(e => String(e.id).trim().toLowerCase() === targetId);
  if (!exp || exp.deleted) return null;
  return exp;
}

export async function saveLocalExpense(expenseData, isSynced = false) {
  const store = getStoredData();
  const id = expenseData.id || generateUUID();
  const targetId = String(id).trim().toLowerCase();
  const expenses = store.data.expenses || [];
  const accounts = store.data.accounts || [];
  const index = expenses.findIndex(e => String(e.id).trim().toLowerCase() === targetId);

  // Robust canonical account resolution
  let targetAcc = resolveAccount(accounts, expenseData.accountId, expenseData.accountName);
  if (!targetAcc) {
    targetAcc = accounts.find(a => a && !a.deleted && (a.accountType === 'SYSTEM' || (a.accountName && a.accountName.toLowerCase() === 'cash')));
    if (!targetAcc) {
      targetAcc = {
        id: generateUUID(),
        accountName: 'Cash',
        accountType: 'SYSTEM',
        locked: true,
        currentBalance: 0,
        deleted: false
      };
      accounts.push(targetAcc);
    }
  }

  const resolvedAccountId = targetAcc.id;
  const resolvedAccountName = targetAcc.accountName;
  const amount = parseFloat(expenseData.amount || 0);

  const isNew = index === -1;
  let oldAmount = 0;
  let oldAccountId = null;

  if (!isNew) {
    oldAmount = parseFloat(expenses[index].amount || 0);
    oldAccountId = expenses[index].accountId;
  }

  // Atomically update account balances in store
  if (isNew) {
    const accIdx = accounts.findIndex(a => String(a.id).trim().toLowerCase() === String(resolvedAccountId).trim().toLowerCase());
    if (accIdx !== -1) {
      accounts[accIdx].currentBalance = parseFloat(accounts[accIdx].currentBalance || 0) - amount;
    }
  } else {
    const oldAccIdx = accounts.findIndex(a => String(a.id).trim().toLowerCase() === String(oldAccountId).trim().toLowerCase());
    const newAccIdx = accounts.findIndex(a => String(a.id).trim().toLowerCase() === String(resolvedAccountId).trim().toLowerCase());

    if (oldAccIdx !== -1 && oldAccIdx === newAccIdx) {
      const diff = amount - oldAmount;
      accounts[oldAccIdx].currentBalance = parseFloat(accounts[oldAccIdx].currentBalance || 0) - diff;
    } else {
      if (oldAccIdx !== -1) {
        accounts[oldAccIdx].currentBalance = parseFloat(accounts[oldAccIdx].currentBalance || 0) + oldAmount;
      }
      if (newAccIdx !== -1) {
        accounts[newAccIdx].currentBalance = parseFloat(accounts[newAccIdx].currentBalance || 0) - amount;
      }
    }
  }

  const existingExp = index !== -1 ? expenses[index] : null;
  const transactionDateTime = expenseData.transactionDateTime || updateTransactionDateTime(
    existingExp?.transactionDateTime || existingExp?.createdAt,
    expenseData.expenseDate,
    expenseData.expenseTime
  );
  const createdAt = expenseData.createdAt || existingExp?.createdAt || transactionDateTime;

  const updatedData = {
    ...expenseData,
    id,
    accountId: resolvedAccountId,
    accountName: resolvedAccountName,
    amount,
    expenseDate: expenseData.expenseDate || (transactionDateTime ? transactionDateTime.split('T')[0] : getLocalDateString()),
    transactionDateTime,
    createdAt,
    deleted: false
  };

  if (isNew) {
    expenses.push(updatedData);
  } else {
    expenses[index] = updatedData;
  }

  store.data.expenses = expenses;
  store.data.accounts = accounts;
  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'EXPENSE',
        operationType: isNew ? 'CREATE' : 'UPDATE',
        entityId: id,
        payload: updatedData,
      });

      const updatedAcc = accounts.find(a => String(a.id).trim().toLowerCase() === String(resolvedAccountId).trim().toLowerCase());
      if (updatedAcc) {
        enqueueOperation({
          entityType: 'ACCOUNT',
          operationType: 'UPDATE',
          entityId: updatedAcc.id,
          payload: updatedAcc,
        });
      }
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('financial-data-changed'));
  }

  return updatedData;
}

export async function deleteLocalExpense(id, isSynced = false) {
  const store = getStoredData();
  const expenses = store.data.expenses || [];
  const targetId = String(id).trim().toLowerCase();
  const index = expenses.findIndex(e => String(e.id).trim().toLowerCase() === targetId);
  if (index !== -1) {
    const exp = expenses[index];
    expenses.splice(index, 1);
    store.data.expenses = expenses;
    saveStoredData(store);

    if (!isSynced) {
      try {
        enqueueOperation({
          entityType: 'EXPENSE',
          operationType: 'DELETE',
          entityId: id,
        });
      } catch (e) {
        console.warn('[db] enqueueOperation error:', e);
      }
    }

    // Refund account balance
    await adjustLocalAccountBalance(exp.accountId, parseFloat(exp.amount || 0));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('financial-data-changed'));
    }
  }
}

// Income Helpers
export async function getLocalIncomes(params = {}) {
  const { page = 0, size = 10, search = '', accountId = '' } = params;
  const pageNum = Math.max(0, parseInt(page, 10) || 0);
  const sizeNum = Math.max(1, parseInt(size, 10) || 10);

  const store = getStoredData();
  let records = (store.data.incomes || []).filter(i => i.deleted !== true && !isSelfTransfer(i));

  if (search) {
    const q = search.trim().toLowerCase();
    records = records.filter(r => 
      (r.description || '').toLowerCase().includes(q) || 
      (r.notes || '').toLowerCase().includes(q)
    );
  }

  if (accountId) {
    const targetAccId = String(accountId).trim().toLowerCase();
    records = records.filter(r => String(r.accountId).trim().toLowerCase() === targetAccId);
  }

  // Deterministic sort: transactionDateTime DESC then id DESC BEFORE slicing
  records = sortTransactions(records);

  const content = records.slice(pageNum * sizeNum, (pageNum + 1) * sizeNum);
  return {
    content,
    totalElements: records.length,
    totalPages: Math.ceil(records.length / sizeNum),
    size: sizeNum,
    number: pageNum
  };
}

export async function getLocalIncome(id) {
  const store = getStoredData();
  const targetId = String(id).trim().toLowerCase();
  const inc = (store.data.incomes || []).find(i => String(i.id).trim().toLowerCase() === targetId);
  if (!inc || inc.deleted) return null;
  return inc;
}

export async function saveLocalIncome(incomeData, isSynced = false) {
  const store = getStoredData();
  const id = incomeData.id || generateUUID();
  const targetId = String(id).trim().toLowerCase();
  const incomes = store.data.incomes || [];
  const accounts = store.data.accounts || [];
  const index = incomes.findIndex(i => String(i.id).trim().toLowerCase() === targetId);

  // Robust canonical account resolution
  let targetAcc = resolveAccount(accounts, incomeData.accountId, incomeData.accountName);
  if (!targetAcc) {
    targetAcc = accounts.find(a => a && !a.deleted && (a.accountType === 'SYSTEM' || (a.accountName && a.accountName.toLowerCase() === 'cash')));
    if (!targetAcc) {
      targetAcc = {
        id: generateUUID(),
        accountName: 'Cash',
        accountType: 'SYSTEM',
        locked: true,
        currentBalance: 0,
        deleted: false
      };
      accounts.push(targetAcc);
    }
  }

  const resolvedAccountId = targetAcc.id;
  const resolvedAccountName = targetAcc.accountName;
  const amount = parseFloat(incomeData.amount || 0);

  const isNew = index === -1;
  let oldAmount = 0;
  let oldAccountId = null;

  if (!isNew) {
    oldAmount = parseFloat(incomes[index].amount || 0);
    oldAccountId = incomes[index].accountId;
  }

  // Atomically update account balances in store
  if (isNew) {
    const accIdx = accounts.findIndex(a => String(a.id).trim().toLowerCase() === String(resolvedAccountId).trim().toLowerCase());
    if (accIdx !== -1) {
      accounts[accIdx].currentBalance = parseFloat(accounts[accIdx].currentBalance || 0) + amount;
    }
  } else {
    const oldAccIdx = accounts.findIndex(a => String(a.id).trim().toLowerCase() === String(oldAccountId).trim().toLowerCase());
    const newAccIdx = accounts.findIndex(a => String(a.id).trim().toLowerCase() === String(resolvedAccountId).trim().toLowerCase());

    if (oldAccIdx !== -1 && oldAccIdx === newAccIdx) {
      const diff = amount - oldAmount;
      accounts[oldAccIdx].currentBalance = parseFloat(accounts[oldAccIdx].currentBalance || 0) + diff;
    } else {
      if (oldAccIdx !== -1) {
        accounts[oldAccIdx].currentBalance = parseFloat(accounts[oldAccIdx].currentBalance || 0) - oldAmount;
      }
      if (newAccIdx !== -1) {
        accounts[newAccIdx].currentBalance = parseFloat(accounts[newAccIdx].currentBalance || 0) + amount;
      }
    }
  }

  const existingInc = index !== -1 ? incomes[index] : null;
  const transactionDateTime = updateTransactionDateTime(
    incomeData.transactionDateTime || existingInc?.transactionDateTime || existingInc?.createdAt,
    incomeData.incomeDate
  );
  const createdAt = updateTransactionDateTime(
    incomeData.createdAt || existingInc?.createdAt,
    incomeData.incomeDate
  ) || transactionDateTime;

  const updatedData = {
    ...incomeData,
    id,
    accountId: resolvedAccountId,
    accountName: resolvedAccountName,
    amount,
    incomeDate: incomeData.incomeDate || (transactionDateTime ? transactionDateTime.split('T')[0] : getLocalDateString()),
    transactionDateTime,
    createdAt,
    deleted: false
  };

  if (isNew) {
    incomes.push(updatedData);
  } else {
    incomes[index] = updatedData;
  }

  store.data.incomes = incomes;
  store.data.accounts = accounts;
  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'INCOME',
        operationType: isNew ? 'CREATE' : 'UPDATE',
        entityId: id,
        payload: updatedData,
      });

      const updatedAcc = accounts.find(a => String(a.id).trim().toLowerCase() === String(resolvedAccountId).trim().toLowerCase());
      if (updatedAcc) {
        enqueueOperation({
          entityType: 'ACCOUNT',
          operationType: 'UPDATE',
          entityId: updatedAcc.id,
          payload: updatedAcc,
        });
      }
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('financial-data-changed'));
  }

  return updatedData;
}

export async function deleteLocalIncome(id, isSynced = false) {
  const store = getStoredData();
  const incomes = store.data.incomes || [];
  const targetId = String(id).trim().toLowerCase();
  const index = incomes.findIndex(i => String(i.id).trim().toLowerCase() === targetId);
  if (index !== -1) {
    const inc = incomes[index];
    incomes.splice(index, 1);
    store.data.incomes = incomes;
    saveStoredData(store);

    if (!isSynced) {
      try {
        enqueueOperation({
          entityType: 'INCOME',
          operationType: 'DELETE',
          entityId: id,
        });
      } catch (e) {
        console.warn('[db] enqueueOperation error:', e);
      }
    }

    // Deduct refunded amount
    await adjustLocalAccountBalance(inc.accountId, -parseFloat(inc.amount || 0));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('financial-data-changed'));
    }
  }
}

// Reminder Helpers
export async function getLocalDailyReminderConfig() {
  const store = getStoredData();
  if (store.data.settings && store.data.settings.dailyReminderConfig) {
    return store.data.settings.dailyReminderConfig;
  }
  return { enabled: false, reminderTime: '21:00', reminderZoneId: 'UTC' };
}

export async function saveLocalDailyReminderConfig(config, isSynced = false) {
  const store = getStoredData();
  if (!store.data.settings) store.data.settings = {};
  store.data.settings.dailyReminderConfig = config;
  saveStoredData(store);
}

export async function getLocalUpcomingPayments() {
  const store = getStoredData();
  return (store.data.reminders || []).filter(r => r.deleted !== true);
}

export async function saveLocalUpcomingPayment(reminder, isSynced = false) {
  const store = getStoredData();
  const id = reminder.id || generateUUID();
  const reminders = store.data.reminders || [];
  const index = reminders.findIndex(r => r.id === id);

  const updatedData = {
    ...reminder,
    id,
    amount: parseFloat(reminder.amount || 0),
    completed: reminder.completed === true || reminder.completed === 'true'
  };

  if (index !== -1) {
    reminders[index] = {
      ...reminders[index],
      ...updatedData,
      deleted: false
    };
  } else {
    reminders.push({
      ...updatedData,
      deleted: false
    });
  }

  store.data.reminders = reminders;
  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'REMINDER',
        operationType: index === -1 ? 'CREATE' : 'UPDATE',
        entityId: id,
        payload: updatedData,
      });
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }

  return updatedData;
}

export async function deleteLocalUpcomingPayment(id, isSynced = false) {
  const store = getStoredData();
  store.data.reminders = (store.data.reminders || []).filter(r => r.id !== id);
  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'REMINDER',
        operationType: 'DELETE',
        entityId: id,
      });
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }
}

export async function toggleUpcomingPaymentCompletedLocal(id, completed, isSynced = false) {
  const store = getStoredData();
  const reminders = store.data.reminders || [];
  const index = reminders.findIndex(r => r.id === id);
  if (index !== -1) {
    reminders[index].completed = completed;
    store.data.reminders = reminders;
    saveStoredData(store);

    if (!isSynced) {
      try {
        enqueueOperation({
          entityType: 'REMINDER',
          operationType: 'UPDATE',
          entityId: id,
          payload: reminders[index],
        });
      } catch (e) {
        console.warn('[db] enqueueOperation error:', e);
      }
    }

    return reminders[index];
  }
  return null;
}

// Self Transfer Helpers
export async function saveLocalTransfer(transferData, isSynced = false) {
  const store = getStoredData();
  const id = transferData.id || generateUUID();
  const transfers = store.data.transfers || [];
  const amount = parseFloat(transferData.amount || 0);
  const today = transferData.date || getLocalDateString();

  const fromAcc = resolveAccount(store.data.accounts || [], transferData.fromAccountId);
  const toAcc = resolveAccount(store.data.accounts || [], transferData.toAccountId);
  const fromId = fromAcc ? fromAcc.id : transferData.fromAccountId;
  const toId = toAcc ? toAcc.id : transferData.toAccountId;

  const updatedTransfer = {
    ...transferData,
    id,
    fromAccountId: fromId,
    toAccountId: toId,
    amount,
    date: today,
    deleted: false
  };

  transfers.push(updatedTransfer);
  store.data.transfers = transfers;
  saveStoredData(store);

  if (!isSynced) {
    try {
      enqueueOperation({
        entityType: 'TRANSFER',
        operationType: 'CREATE',
        entityId: id,
        payload: updatedTransfer,
      });
    } catch (e) {
      console.warn('[db] enqueueOperation error:', e);
    }
  }

  // Adjust account balances directly (without creating expenses/incomes)
  await adjustLocalAccountBalance(fromId, -amount);
  await adjustLocalAccountBalance(toId, amount);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('financial-data-changed'));
  }

  return updatedTransfer;
}

// Dashboard statistics generation
export async function getLocalDashboardSummary() {
  const store = getStoredData();
  const accounts = (store.data.accounts || []).filter(a => a.deleted !== true);
  const expenses = (store.data.expenses || []).filter(e => e.deleted !== true && !isSelfTransfer(e));
  const incomes = (store.data.incomes || []).filter(i => i.deleted !== true && !isSelfTransfer(i));

  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.currentBalance || 0), 0);

  const todayStr = getLocalDateString();
  
  // Derive current month/year from the latest transaction date
  const allDates = [
    ...expenses.map(e => e.expenseDate),
    ...incomes.map(i => i.incomeDate)
  ].filter(Boolean);

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0-indexed

  if (allDates.length > 0) {
    allDates.sort((a, b) => new Date(b) - new Date(a));
    const latestDate = new Date(allDates[0]);
    if (!isNaN(latestDate.getTime())) {
      currentYear = latestDate.getFullYear();
      currentMonth = latestDate.getMonth();
    }
  }

  // Today's Expenses
  const todayExpenses = expenses
    .filter(e => e.expenseDate === todayStr)
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  // Monthly Expenses (current calendar month)
  const monthlyExpenses = expenses
    .filter(e => {
      const d = new Date(e.expenseDate);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    })
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  // Monthly Income (current calendar month)
  const monthlyIncome = incomes
    .filter(inc => {
      const d = new Date(inc.incomeDate);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    })
    .reduce((sum, inc) => sum + parseFloat(inc.amount || 0), 0);

  // Category Expenses Breakdown (built-in categories + custom aggregated as Others)
  const chartAggregation = aggregateCategoriesForChart(expenses, currentYear, currentMonth);
  const categoryExpenses = chartAggregation.categoryExpenses;
  const othersBreakdown = chartAggregation.othersBreakdown;

  // Monthly Trends (Last 6 Months)
  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() - i);
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();
    const monthName = targetDate.toLocaleString('default', { month: 'short' });

    const monthExp = expenses
      .filter(e => {
        const dt = e.transactionDateTime || e.expenseDate;
        const d = new Date(dt);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    const monthInc = incomes
      .filter(inc => {
        const dt = inc.transactionDateTime || inc.incomeDate;
        const d = new Date(dt);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, inc) => sum + parseFloat(inc.amount || 0), 0);

    monthlyTrends.push({
      month: monthName,
      income: monthInc,
      expense: monthExp
    });
  }

  // Recent Expenses (Top 5 deterministically sorted newest -> oldest)
  const sortedExpenses = sortTransactions(expenses);
  const recentExpenses = sortedExpenses.slice(0, 5);

  return {
    totalBalance,
    todayExpenses,
    monthlyExpenses,
    monthlyIncome,
    categoryExpenses,
    othersBreakdown,
    monthlyTrends,
    recentExpenses
  };
}

// Reports Data generation
export async function getLocalReportData(startDate, endDate) {
  const store = getStoredData();
  const profile = store.data.profile || {};
  const expenses = (store.data.expenses || []).filter(e => e.deleted !== true && !isSelfTransfer(e));
  const incomes = (store.data.incomes || []).filter(i => i.deleted !== true && !isSelfTransfer(i));

  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const filteredExpenses = expenses.filter(e => {
    const d = new Date(e.expenseDate);
    return d >= start && d <= end;
  });

  const filteredIncomes = incomes.filter(i => {
    const d = new Date(i.incomeDate);
    return d >= start && d <= end;
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const totalIncome = filteredIncomes.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
  const netSavings = totalIncome - totalExpenses;

  // Category summary
  const catMap = {};
  filteredExpenses.forEach(e => {
    const cat = e.category || 'Others';
    const amt = parseFloat(e.amount || 0);
    catMap[cat] = (catMap[cat] || 0) + amt;
  });

  const categorySummary = Object.entries(catMap).map(([category, amount]) => {
    let percentage = 0;
    if (totalExpenses > 0) {
      percentage = parseFloat(((amount / totalExpenses) * 100).toFixed(2));
    }
    return { category, amount, percentage };
  }).sort((a, b) => b.amount - a.amount);

  const sortedExpenses = sortTransactions(filteredExpenses);
  const sortedIncomes = sortTransactions(filteredIncomes);

  return {
    startDate,
    endDate,
    fullName: profile.fullName || 'User',
    email: profile.email || '',
    expenses: sortedExpenses,
    incomes: sortedIncomes,
    totalExpenses,
    totalIncome,
    netSavings,
    categorySummary
  };
}

export async function clearLocalDb() {
  localStorage.removeItem(STORAGE_KEY);
  try {
    await Preferences.remove({ key: STORAGE_KEY });
  } catch (err) {
    console.warn('[Preferences] Failed to remove stored data:', err);
  }
}

export async function restoreDbFromBackup(backupObj) {
  if (!backupObj) return;
  const store = getStoredData();
  
  // Safely restore backend schema
  let restoredData = backupObj.payload || backupObj;
  if (restoredData.data) {
    restoredData = restoredData.data;
  }
  
  const merged = {
    ...store,
    localUserId: backupObj.localUserId || backupObj.userId || store.localUserId,
    email: backupObj.email || store.email,
    isAuthenticated: true,
    lastSync: backupObj.lastSync || store.lastSync,
    data: {
      ...store.data,
      ...restoredData
    }
  };
  
  if (restoredData.people) {
    merged.data.people = restoredData.people;
  }
  if (restoredData.peopleLedger) {
    merged.data.peopleLedger = restoredData.peopleLedger;
  }
  
  saveStoredData(merged);
}

// ==========================================================
// People & Memory Ledger Helpers (Financially Isolated)
// ==========================================================

export async function getLocalPeople(search = '') {
  const store = getStoredData();
  let people = (store.data.people || []).filter(p => p.deleted !== true);

  if (search) {
    const q = search.toLowerCase().trim();
    people = people.filter(p => (p.name || '').toLowerCase().includes(q));
  }

  const ledgerEntries = (store.data.peopleLedger || []).filter(e => e.deleted !== true);

  const peopleWithBalances = people.map(p => {
    const entries = ledgerEntries.filter(e => e.personId === p.id);
    const totalIncoming = entries.reduce((sum, e) => sum + parseFloat(e.incomingMoney || 0), 0);
    const totalOutgoing = entries.reduce((sum, e) => sum + parseFloat(e.outgoingMoney || 0), 0);
    const balance = totalIncoming - totalOutgoing; // Incoming increases balance, Outgoing decreases balance
    
    // Sort entries to find latest activity
    const sorted = sortTransactions(entries.map(e => ({ ...e, transactionDateTime: e.date || e.createdAt })));
    const lastEntryDate = sorted.length > 0 ? (sorted[0].date || sorted[0].createdAt) : p.createdAt;

    return {
      ...p,
      totalIncoming,
      totalOutgoing,
      balance,
      entryCount: entries.length,
      lastActive: lastEntryDate
    };
  });

  // Deterministic sort by name ASC, then id ASC
  peopleWithBalances.sort((a, b) => {
    const nameCmp = (a.name || '').localeCompare(b.name || '');
    if (nameCmp !== 0) return nameCmp;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return peopleWithBalances;
}

export async function getLocalPerson(id) {
  const store = getStoredData();
  const person = (store.data.people || []).find(p => p.id === id && p.deleted !== true);
  if (!person) return null;

  const ledgerEntries = (store.data.peopleLedger || []).filter(e => e.personId === id && e.deleted !== true);
  const totalIncoming = ledgerEntries.reduce((sum, e) => sum + parseFloat(e.incomingMoney || 0), 0);
  const totalOutgoing = ledgerEntries.reduce((sum, e) => sum + parseFloat(e.outgoingMoney || 0), 0);
  const balance = totalIncoming - totalOutgoing;

  return {
    ...person,
    note: person.note || '',
    totalIncoming,
    totalOutgoing,
    balance,
    entryCount: ledgerEntries.length
  };
}

export async function saveLocalPersonNote(personId, noteText) {
  const store = getStoredData();
  const people = store.data.people || [];
  const index = people.findIndex(p => p.id === personId);
  if (index === -1) {
    throw new Error('Person not found');
  }

  const now = new Date().toISOString();
  people[index] = {
    ...people[index],
    note: typeof noteText === 'string' ? noteText : '',
    updatedAt: now
  };

  store.data.people = people;
  saveStoredData(store);
  return people[index];
}

export async function saveLocalPerson(personData) {
  const store = getStoredData();
  const people = store.data.people || [];
  const name = (personData.name || '').trim();

  if (!name) {
    throw new Error('Person name is required');
  }

  const id = personData.id || generateUUID();
  const index = people.findIndex(p => p.id === id);
  const now = new Date().toISOString();

  const record = {
    ...personData,
    id,
    name,
    createdAt: index !== -1 ? (people[index].createdAt || now) : now,
    updatedAt: now,
    deleted: false
  };

  if (index !== -1) {
    people[index] = record;
  } else {
    people.push(record);
  }

  store.data.people = people;
  saveStoredData(store);
  return record;
}

export async function deleteLocalPerson(id) {
  const store = getStoredData();
  store.data.people = (store.data.people || []).filter(p => p.id !== id);
  // Also remove their ledger entries
  store.data.peopleLedger = (store.data.peopleLedger || []).filter(e => e.personId !== id);
  saveStoredData(store);
}

export async function getLocalPersonLedger(personId) {
  const store = getStoredData();
  const entries = (store.data.peopleLedger || []).filter(e => e.personId === personId && e.deleted !== true);

  // 1. Sort chronologically oldest -> newest to calculate running total
  const chronoEntries = [...entries].sort((a, b) => {
    const timeA = new Date(a.date || a.createdAt || 0).getTime();
    const timeB = new Date(b.date || b.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  let runningTotal = 0;
  const entriesWithRunningTotal = chronoEntries.map(e => {
    const inc = parseFloat(e.incomingMoney || 0);
    const out = parseFloat(e.outgoingMoney || 0);
    runningTotal += (inc - out);
    return {
      ...e,
      total: runningTotal,
      transactionDateTime: e.date || e.createdAt
    };
  });

  // 2. Return sorted newest -> oldest deterministically
  return sortTransactions(entriesWithRunningTotal);
}

export async function saveLocalPersonLedgerEntry(entryData) {
  const store = getStoredData();
  const ledger = store.data.peopleLedger || [];
  const id = entryData.id || generateUUID();
  const index = ledger.findIndex(e => e.id === id);

  const personId = entryData.personId || (index !== -1 ? ledger[index].personId : null);
  if (!personId) {
    throw new Error('personId is required for ledger entry');
  }

  const incomingMoney = parseFloat(entryData.incomingMoney || 0);
  const outgoingMoney = parseFloat(entryData.outgoingMoney || 0);

  if (isNaN(incomingMoney) || incomingMoney < 0) {
    throw new Error('Incoming money must be a valid non-negative amount');
  }
  if (isNaN(outgoingMoney) || outgoingMoney < 0) {
    throw new Error('Outgoing money must be a valid non-negative amount');
  }
  if (incomingMoney === 0 && outgoingMoney === 0) {
    throw new Error('Either incoming or outgoing money must be greater than 0');
  }

  const now = new Date().toISOString();
  const date = entryData.date || (entryData.selectedDate ? createTransactionDateTime(entryData.selectedDate) : (index !== -1 ? ledger[index].date : now));

  const record = {
    ...(index !== -1 ? ledger[index] : {}),
    ...entryData,
    id,
    personId,
    details: (entryData.details || '').trim(),
    incomingMoney,
    outgoingMoney,
    date,
    createdAt: index !== -1 ? (ledger[index].createdAt || now) : now,
    updatedAt: now,
    deleted: false
  };

  if (index !== -1) {
    ledger[index] = record;
  } else {
    ledger.push(record);
  }

  store.data.peopleLedger = ledger;
  saveStoredData(store);
  return record;
}

export async function deleteLocalPersonLedgerEntry(id) {
  const store = getStoredData();
  store.data.peopleLedger = (store.data.peopleLedger || []).filter(e => e.id !== id);
  saveStoredData(store);
}

export async function deleteAllLocalPersonLedgerEntries(personId) {
  const store = getStoredData();
  store.data.peopleLedger = (store.data.peopleLedger || []).filter(e => e.personId !== personId);
  saveStoredData(store);
}

export async function deleteSelectedLocalPersonLedgerEntries(personId, entryIds) {
  const store = getStoredData();
  const idSet = new Set(Array.isArray(entryIds) ? entryIds : [entryIds]);
  store.data.peopleLedger = (store.data.peopleLedger || []).filter(e => !(e.personId === personId && idSet.has(e.id)));
  saveStoredData(store);
}

/**
 * Safe Local-Cloud Merge Engine:
 * Imports and merges cloud database financial records into local storage without
 * destroying un-uploaded pending local changes or duplicating financial operations.
 */
export function mergeCloudDataIntoLocal(cloudPayload) {
  if (!cloudPayload || typeof cloudPayload !== 'object') {
    return { updatedCount: 0, deletedCount: 0 };
  }

  const store = getStoredData();
  if (!store || !store.data) return { updatedCount: 0, deletedCount: 0 };

  // Read local pending sync queue to protect locally unsynced changes
  let queue = [];
  try {
    const rawQueue = localStorage.getItem('smart_wallet_sync_queue');
    queue = rawQueue ? JSON.parse(rawQueue) : [];
  } catch (err) {
    queue = [];
  }

  const pendingOps = queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');

  // Identify all entity IDs with pending local changes
  const pendingExpenseIds = new Set(
    pendingOps.filter(q => q.entityType === 'EXPENSE').map(q => String(q.entityId).trim().toLowerCase())
  );
  const pendingIncomeIds = new Set(
    pendingOps.filter(q => q.entityType === 'INCOME').map(q => String(q.entityId).trim().toLowerCase())
  );
  const pendingAccountIds = new Set(
    pendingOps.filter(q => q.entityType === 'ACCOUNT').map(q => String(q.entityId).trim().toLowerCase())
  );
  const pendingTransferIds = new Set(
    pendingOps.filter(q => q.entityType === 'TRANSFER').map(q => String(q.entityId).trim().toLowerCase())
  );
  const pendingReminderIds = new Set(
    pendingOps.filter(q => q.entityType === 'REMINDER').map(q => String(q.entityId).trim().toLowerCase())
  );

  let updatedCount = 0;
  let deletedCount = 0;
  const wasPreviouslySynced = !!store.lastSync;

  // 1. MERGE ACCOUNTS & COMPUTE ATOMIC LIVE BALANCES
  const rawCloudAccounts = Array.isArray(cloudPayload.accounts) ? cloudPayload.accounts : [];
  if (rawCloudAccounts.length > 0) {
    const localAccounts = store.data.accounts || [];

    // Filter and deduplicate cloud accounts: ensure at most ONE default Cash account from cloud
    const nonCashCloud = [];
    const cashCloud = [];
    for (const acc of rawCloudAccounts) {
      if (acc && !acc.deleted) {
        if (acc.accountType === 'SYSTEM' || (acc.accountName && acc.accountName.trim().toLowerCase() === 'cash')) {
          cashCloud.push(acc);
        } else {
          nonCashCloud.push(acc);
        }
      }
    }
    const deduplicatedCloudAccounts = [...nonCashCloud];
    if (cashCloud.length > 0) {
      cashCloud.sort((a, b) => Math.abs(parseFloat(b.currentBalance || 0)) - Math.abs(parseFloat(a.currentBalance || 0)));
      deduplicatedCloudAccounts.push(cashCloud[0]);
    }

    for (const cloudAcc of deduplicatedCloudAccounts) {
      const cloudAccId = String(cloudAcc.id).trim().toLowerCase();
      let balance = parseFloat(cloudAcc.currentBalance || 0);

      // Adjust for this device's own pending offline operations that have not yet reached the cloud
      pendingOps.forEach(op => {
        if (op.entityType === 'EXPENSE' && op.payload) {
          const expAccId = String(op.payload.accountId).trim().toLowerCase();
          if (expAccId === cloudAccId || (op.payload.accountName && cloudAcc.accountName && op.payload.accountName.toLowerCase() === cloudAcc.accountName.toLowerCase())) {
            balance -= parseFloat(op.payload.amount || 0);
          }
        } else if (op.entityType === 'INCOME' && op.payload) {
          const incAccId = String(op.payload.accountId).trim().toLowerCase();
          if (incAccId === cloudAccId || (op.payload.accountName && cloudAcc.accountName && op.payload.accountName.toLowerCase() === cloudAcc.accountName.toLowerCase())) {
            balance += parseFloat(op.payload.amount || 0);
          }
        } else if (op.entityType === 'TRANSFER' && op.payload) {
          const fromId = String(op.payload.fromAccountId).trim().toLowerCase();
          const toId = String(op.payload.toAccountId).trim().toLowerCase();
          if (fromId === cloudAccId) {
            balance -= parseFloat(op.payload.amount || 0);
          }
          if (toId === cloudAccId) {
            balance += parseFloat(op.payload.amount || 0);
          }
        }
      });

      const isCash = cloudAcc.accountType === 'SYSTEM' || (cloudAcc.accountName && cloudAcc.accountName.trim().toLowerCase() === 'cash');

      const existingIdx = localAccounts.findIndex(a => {
        if (isCash) {
          return a.accountType === 'SYSTEM' || (a.accountName && a.accountName.trim().toLowerCase() === 'cash');
        }
        return String(a.id).trim().toLowerCase() === cloudAccId ||
          (a.accountName && cloudAcc.accountName && a.accountName.trim().toLowerCase() === cloudAcc.accountName.trim().toLowerCase());
      });

      if (existingIdx !== -1) {
        if (!pendingAccountIds.has(String(localAccounts[existingIdx].id).trim().toLowerCase())) {
          const oldLocalId = String(localAccounts[existingIdx].id).trim().toLowerCase();
          localAccounts[existingIdx] = {
            ...localAccounts[existingIdx],
            ...cloudAcc,
            accountName: isCash ? 'Cash' : (cloudAcc.accountName || localAccounts[existingIdx].accountName),
            accountType: isCash ? 'SYSTEM' : (cloudAcc.accountType || localAccounts[existingIdx].accountType),
            locked: isCash ? true : localAccounts[existingIdx].locked,
            currentBalance: balance,
            deleted: false
          };

          // If Cash account ID updated from server canonical ID, remap local transactions to prevent orphan
          if (isCash && oldLocalId !== cloudAccId) {
            (store.data.expenses || []).forEach(e => {
              if (e && String(e.accountId).trim().toLowerCase() === oldLocalId) {
                e.accountId = cloudAcc.id;
                e.accountName = 'Cash';
              }
            });
            (store.data.incomes || []).forEach(i => {
              if (i && String(i.accountId).trim().toLowerCase() === oldLocalId) {
                i.accountId = cloudAcc.id;
                i.accountName = 'Cash';
              }
            });
          }
          updatedCount++;
        }
      } else {
        localAccounts.push({
          ...cloudAcc,
          accountName: isCash ? 'Cash' : cloudAcc.accountName,
          accountType: isCash ? 'SYSTEM' : cloudAcc.accountType,
          locked: isCash ? true : cloudAcc.locked,
          currentBalance: balance,
          deleted: false
        });
        updatedCount++;
      }
    }
    store.data.accounts = localAccounts;
  }

  // 2. MERGE EXPENSES
  let cloudExpenses = Array.isArray(cloudPayload.expenses) ? cloudPayload.expenses : [];
  if (cloudExpenses.length === 0 && Array.isArray(cloudPayload.transactions)) {
    cloudExpenses = cloudPayload.transactions.filter(t => t.transactionType === 'expense' || t.type === 'expense');
  }

  if (Array.isArray(cloudExpenses)) {
    const localExpenses = store.data.expenses || [];
    const cloudExpMap = new Map();
    cloudExpenses.forEach(exp => {
      if (exp && exp.id) {
        cloudExpMap.set(String(exp.id).trim().toLowerCase(), exp);
      }
    });

    // Update or insert cloud expenses
    for (const [cloudId, cloudExp] of cloudExpMap.entries()) {
      const localIdx = localExpenses.findIndex(e => String(e.id).trim().toLowerCase() === cloudId);
      if (localIdx !== -1) {
        if (!pendingExpenseIds.has(cloudId)) {
          localExpenses[localIdx] = {
            ...localExpenses[localIdx],
            ...cloudExp,
            deleted: false
          };
          updatedCount++;
        }
      } else {
        localExpenses.push({
          ...cloudExp,
          deleted: false
        });
        updatedCount++;
      }
    }

    // Handle deletions: if local expense is not in cloud and not pending on this device, propagate deletion
    const retainedExpenses = [];
    for (const localExp of localExpenses) {
      const localId = String(localExp.id).trim().toLowerCase();
      if (cloudExpMap.has(localId)) {
        retainedExpenses.push(localExp);
      } else if (pendingExpenseIds.has(localId)) {
        // Keep unsynced local transaction!
        retainedExpenses.push(localExp);
      } else if (!wasPreviouslySynced) {
        // First sync on device, keep existing
        retainedExpenses.push(localExp);
      } else {
        // Deleted in cloud
        deletedCount++;
      }
    }
    store.data.expenses = retainedExpenses;
  }

  // 3. MERGE INCOMES
  let cloudIncomes = Array.isArray(cloudPayload.incomes) ? cloudPayload.incomes : [];
  if (cloudIncomes.length === 0 && Array.isArray(cloudPayload.transactions)) {
    cloudIncomes = cloudPayload.transactions.filter(t => t.transactionType === 'income' || t.type === 'income');
  }

  if (Array.isArray(cloudIncomes)) {
    const localIncomes = store.data.incomes || [];
    const cloudIncMap = new Map();
    cloudIncomes.forEach(inc => {
      if (inc && inc.id) {
        cloudIncMap.set(String(inc.id).trim().toLowerCase(), inc);
      }
    });

    for (const [cloudId, cloudInc] of cloudIncMap.entries()) {
      const localIdx = localIncomes.findIndex(i => String(i.id).trim().toLowerCase() === cloudId);
      if (localIdx !== -1) {
        if (!pendingIncomeIds.has(cloudId)) {
          localIncomes[localIdx] = {
            ...localIncomes[localIdx],
            ...cloudInc,
            deleted: false
          };
          updatedCount++;
        }
      } else {
        localIncomes.push({
          ...cloudInc,
          deleted: false
        });
        updatedCount++;
      }
    }

    const retainedIncomes = [];
    for (const localInc of localIncomes) {
      const localId = String(localInc.id).trim().toLowerCase();
      if (cloudIncMap.has(localId)) {
        retainedIncomes.push(localInc);
      } else if (pendingIncomeIds.has(localId)) {
        retainedIncomes.push(localInc);
      } else if (!wasPreviouslySynced) {
        retainedIncomes.push(localInc);
      } else {
        deletedCount++;
      }
    }
    store.data.incomes = retainedIncomes;
  }

  // 4. MERGE REMINDERS
  if (Array.isArray(cloudPayload.reminders)) {
    const localReminders = store.data.reminders || [];
    const cloudRemMap = new Map();
    cloudPayload.reminders.forEach(r => {
      if (r && r.id) cloudRemMap.set(String(r.id).trim().toLowerCase(), r);
    });

    for (const [cloudId, cloudRem] of cloudRemMap.entries()) {
      const localIdx = localReminders.findIndex(r => String(r.id).trim().toLowerCase() === cloudId);
      if (localIdx !== -1) {
        if (!pendingReminderIds.has(cloudId)) {
          localReminders[localIdx] = { ...localReminders[localIdx], ...cloudRem };
        }
      } else {
        localReminders.push(cloudRem);
      }
    }
    store.data.reminders = localReminders;
  }

  // 5. MERGE TRANSFERS
  if (Array.isArray(cloudPayload.transfers)) {
    const localTransfers = store.data.transfers || [];
    const cloudTrMap = new Map();
    cloudPayload.transfers.forEach(t => {
      if (t && t.id) cloudTrMap.set(String(t.id).trim().toLowerCase(), t);
    });

    for (const [cloudId, cloudTr] of cloudTrMap.entries()) {
      const localIdx = localTransfers.findIndex(t => String(t.id).trim().toLowerCase() === cloudId);
      if (localIdx !== -1) {
        if (!pendingTransferIds.has(cloudId)) {
          localTransfers[localIdx] = { ...localTransfers[localIdx], ...cloudTr };
        }
      } else {
        localTransfers.push(cloudTr);
      }
    }
    store.data.transfers = localTransfers;
  }

  // 6. MERGE PEOPLE & LEDGER
  if (Array.isArray(cloudPayload.people)) {
    const localPeople = store.data.people || [];
    const cloudPMap = new Map();
    cloudPayload.people.forEach(p => {
      if (p && p.id) cloudPMap.set(String(p.id).trim().toLowerCase(), p);
    });
    for (const [cloudId, cloudP] of cloudPMap.entries()) {
      const localIdx = localPeople.findIndex(p => String(p.id).trim().toLowerCase() === cloudId);
      if (localIdx !== -1) {
        localPeople[localIdx] = { ...localPeople[localIdx], ...cloudP };
      } else {
        localPeople.push(cloudP);
      }
    }
    store.data.people = localPeople;
  }

  if (Array.isArray(cloudPayload.peopleLedger)) {
    const localLedger = store.data.peopleLedger || [];
    const cloudLMap = new Map();
    cloudPayload.peopleLedger.forEach(l => {
      if (l && l.id) cloudLMap.set(String(l.id).trim().toLowerCase(), l);
    });
    for (const [cloudId, cloudL] of cloudLMap.entries()) {
      const localIdx = localLedger.findIndex(l => String(l.id).trim().toLowerCase() === cloudId);
      if (localIdx !== -1) {
        localLedger[localIdx] = { ...localLedger[localIdx], ...cloudL };
      } else {
        localLedger.push(cloudL);
      }
    }
    store.data.peopleLedger = localLedger;
  }

  // 7. MERGE PROFILE
  if (cloudPayload.profile && typeof cloudPayload.profile === 'object') {
    store.data.profile = {
      ...(store.data.profile || {}),
      ...cloudPayload.profile
    };
  }

  store.lastSync = new Date().toISOString();
  saveStoredData(store);

  try {
    Preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) }).catch(() => {});
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('financial-data-changed'));
    window.dispatchEvent(new CustomEvent('sync-completed'));
  }

  return { updatedCount, deletedCount };
}



