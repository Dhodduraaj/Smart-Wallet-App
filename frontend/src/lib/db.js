const STORAGE_KEY = 'smart_wallet_data';

// Helper to generate UUID v4
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
        settings: {
          dailyReminderConfig: { enabled: false, reminderTime: '21:00', reminderZoneId: 'UTC' }
        }
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } else {
    store = JSON.parse(raw);
  }

  // Enforcement logic: Every user must always have a default Cash account
  if (store.data && store.data.accounts) {
    const hasSystemAccount = store.data.accounts.some(a => a.accountType === 'SYSTEM');
    if (!hasSystemAccount) {
      // Find if there is an existing cash account we can upgrade, or create a new one
      const cashIndex = store.data.accounts.findIndex(a => a.accountType === 'CASH' || a.accountName === 'Cash');
      if (cashIndex !== -1) {
        store.data.accounts[cashIndex].accountType = 'SYSTEM';
        store.data.accounts[cashIndex].locked = true;
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
    }
  }

  return store;
}

export function saveStoredData(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// User Profile Helpers
export async function getLocalProfile() {
  const store = getStoredData();
  return store.data.profile || null;
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
  const acc = (store.data.accounts || []).find(a => a.id === id);
  if (!acc || acc.deleted) return null;
  return acc;
}

export async function saveLocalAccount(accountData, isSynced = false) {
  const store = getStoredData();
  const id = accountData.id || generateUUID();
  const accounts = store.data.accounts || [];
  const index = accounts.findIndex(a => a.id === id);

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
  return updatedData;
}

export async function adjustLocalAccountBalance(accountId, amountChange, isSynced = false) {
  const store = getStoredData();
  const accounts = store.data.accounts || [];
  const index = accounts.findIndex(a => a.id === accountId);
  if (index !== -1) {
    const updatedBalance = parseFloat(accounts[index].currentBalance || 0) + amountChange;
    accounts[index].currentBalance = updatedBalance;
    store.data.accounts = accounts;
    saveStoredData(store);
  }
}

export async function deleteLocalAccount(id, isSynced = false) {
  const store = getStoredData();
  const accounts = store.data.accounts || [];
  const acc = accounts.find(a => a.id === id);
  
  // Enforcement: default cash account cannot be deleted
  if (acc && (acc.accountType === 'SYSTEM' || acc.locked === true || acc.accountName === 'Cash')) {
    throw new Error('Default Cash account cannot be deleted');
  }

  // Complete removal from array (local always wins)
  store.data.accounts = accounts.filter(a => a.id !== id);

  // Complete removal of dependent transactions
  store.data.expenses = (store.data.expenses || []).filter(e => e.accountId !== id);
  store.data.incomes = (store.data.incomes || []).filter(i => i.accountId !== id);

  saveStoredData(store);
}

// Expense Helpers
export async function getLocalExpenses(params = {}) {
  const { page = 0, size = 10, search = '', category = '', accountId = '' } = params;
  const store = getStoredData();
  let records = (store.data.expenses || []).filter(e => e.deleted !== true);

  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r => 
      (r.description || '').toLowerCase().includes(q) || 
      (r.notes || '').toLowerCase().includes(q)
    );
  }

  if (category) {
    records = records.filter(r => (r.category || '').toLowerCase() === category.toLowerCase());
  }

  if (accountId) {
    records = records.filter(r => r.accountId === accountId);
  }

  // Sort by expenseDate desc, then createdAt desc
  records.sort((a, b) => {
    const dateA = new Date(a.expenseDate || 0);
    const dateB = new Date(b.expenseDate || 0);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const content = records.slice(page * size, (page + 1) * size);
  return {
    content,
    totalElements: records.length,
    totalPages: Math.ceil(records.length / size),
    size,
    number: page
  };
}

export async function getLocalExpense(id) {
  const store = getStoredData();
  const exp = (store.data.expenses || []).find(e => e.id === id);
  if (!exp || exp.deleted) return null;
  return exp;
}

export async function saveLocalExpense(expenseData, isSynced = false) {
  const store = getStoredData();
  const id = expenseData.id || generateUUID();
  const expenses = store.data.expenses || [];
  const index = expenses.findIndex(e => e.id === id);

  let accountName = expenseData.accountName || '';
  if (!accountName && expenseData.accountId) {
    const acc = (store.data.accounts || []).find(a => a.id === expenseData.accountId);
    if (acc) {
      accountName = acc.accountName;
    }
  }

  const updatedData = {
    ...expenseData,
    id,
    accountName,
    amount: parseFloat(expenseData.amount || 0),
    createdAt: expenseData.createdAt || new Date().toISOString()
  };

  const isNew = index === -1;
  let oldAmount = 0;
  if (!isNew) {
    oldAmount = parseFloat(expenses[index].amount || 0);
    expenses[index] = {
      ...expenses[index],
      ...updatedData,
      deleted: false
    };
  } else {
    expenses.push({
      ...updatedData,
      deleted: false
    });
  }

  store.data.expenses = expenses;
  saveStoredData(store);

  // Adjust account balance
  if (isNew) {
    await adjustLocalAccountBalance(expenseData.accountId, -updatedData.amount);
  } else {
    const diff = updatedData.amount - oldAmount;
    await adjustLocalAccountBalance(expenseData.accountId, -diff);
  }

  return updatedData;
}

export async function deleteLocalExpense(id, isSynced = false) {
  const store = getStoredData();
  const expenses = store.data.expenses || [];
  const index = expenses.findIndex(e => e.id === id);
  if (index !== -1) {
    const exp = expenses[index];
    expenses.splice(index, 1);
    store.data.expenses = expenses;
    saveStoredData(store);

    // Refund
    await adjustLocalAccountBalance(exp.accountId, parseFloat(exp.amount || 0));
  }
}

// Income Helpers
export async function getLocalIncomes(params = {}) {
  const { page = 0, size = 10, search = '', accountId = '' } = params;
  const store = getStoredData();
  let records = (store.data.incomes || []).filter(i => i.deleted !== true);

  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r => 
      (r.description || '').toLowerCase().includes(q) || 
      (r.notes || '').toLowerCase().includes(q)
    );
  }

  if (accountId) {
    records = records.filter(r => r.accountId === accountId);
  }

  // Sort by incomeDate desc, then createdAt desc
  records.sort((a, b) => {
    const dateA = new Date(a.incomeDate || 0);
    const dateB = new Date(b.incomeDate || 0);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const content = records.slice(page * size, (page + 1) * size);
  return {
    content,
    totalElements: records.length,
    totalPages: Math.ceil(records.length / size),
    size,
    number: page
  };
}

export async function getLocalIncome(id) {
  const store = getStoredData();
  const inc = (store.data.incomes || []).find(i => i.id === id);
  if (!inc || inc.deleted) return null;
  return inc;
}

export async function saveLocalIncome(incomeData, isSynced = false) {
  const store = getStoredData();
  const id = incomeData.id || generateUUID();
  const incomes = store.data.incomes || [];
  const index = incomes.findIndex(i => i.id === id);

  let accountName = incomeData.accountName || '';
  if (!accountName && incomeData.accountId) {
    const acc = (store.data.accounts || []).find(a => a.id === incomeData.accountId);
    if (acc) {
      accountName = acc.accountName;
    }
  }

  const updatedData = {
    ...incomeData,
    id,
    accountName,
    amount: parseFloat(incomeData.amount || 0),
    createdAt: incomeData.createdAt || new Date().toISOString()
  };

  const isNew = index === -1;
  let oldAmount = 0;
  if (!isNew) {
    oldAmount = parseFloat(incomes[index].amount || 0);
    incomes[index] = {
      ...incomes[index],
      ...updatedData,
      deleted: false
    };
  } else {
    incomes.push({
      ...updatedData,
      deleted: false
    });
  }

  store.data.incomes = incomes;
  saveStoredData(store);

  // Adjust account balance
  if (isNew) {
    await adjustLocalAccountBalance(incomeData.accountId, updatedData.amount);
  } else {
    const diff = updatedData.amount - oldAmount;
    await adjustLocalAccountBalance(incomeData.accountId, diff);
  }

  return updatedData;
}

export async function deleteLocalIncome(id, isSynced = false) {
  const store = getStoredData();
  const incomes = store.data.incomes || [];
  const index = incomes.findIndex(i => i.id === id);
  if (index !== -1) {
    const inc = incomes[index];
    incomes.splice(index, 1);
    store.data.incomes = incomes;
    saveStoredData(store);

    // Deduct
    await adjustLocalAccountBalance(inc.accountId, -parseFloat(inc.amount || 0));
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
  return updatedData;
}

export async function deleteLocalUpcomingPayment(id, isSynced = false) {
  const store = getStoredData();
  store.data.reminders = (store.data.reminders || []).filter(r => r.id !== id);
  saveStoredData(store);
}

export async function toggleUpcomingPaymentCompletedLocal(id, completed, isSynced = false) {
  const store = getStoredData();
  const reminders = store.data.reminders || [];
  const index = reminders.findIndex(r => r.id === id);
  if (index !== -1) {
    reminders[index].completed = completed;
    store.data.reminders = reminders;
    saveStoredData(store);
    return reminders[index];
  }
  return null;
}

// Self Transfer Helpers
export async function saveLocalTransfer(transferData, isSynced = false) {
  const store = getStoredData();
  const id = transferData.id || generateUUID();
  const transfers = store.data.transfers || [];
  transfers.push({
    ...transferData,
    id,
    deleted: false
  });
  store.data.transfers = transfers;
  saveStoredData(store);

  // Client-side self transfer splits into local expense and income
  const today = new Date().toISOString().split('T')[0];
  const amount = parseFloat(transferData.amount || 0);

  const sourceAcc = (store.data.accounts || []).find(a => a.id === transferData.fromAccountId);
  const destAcc = (store.data.accounts || []).find(a => a.id === transferData.toAccountId);

  if (sourceAcc && destAcc) {
    await saveLocalExpense({
      accountId: transferData.fromAccountId,
      description: `Transfer to ${destAcc.accountName}`,
      amount,
      category: 'Others',
      paymentMode: 'Bank Transfer',
      expenseDate: today,
      notes: transferData.notes || 'Self Transfer'
    });

    await saveLocalIncome({
      accountId: transferData.toAccountId,
      description: `Transfer from ${sourceAcc.accountName}`,
      amount,
      incomeDate: today,
      notes: transferData.notes || 'Self Transfer'
    });
  }

  return { ...transferData, id };
}

// Dashboard statistics generation
export async function getLocalDashboardSummary() {
  const store = getStoredData();
  const accounts = (store.data.accounts || []).filter(a => a.deleted !== true);
  const expenses = (store.data.expenses || []).filter(e => e.deleted !== true);
  const incomes = (store.data.incomes || []).filter(i => i.deleted !== true);

  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.currentBalance || 0), 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed

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

  // Category Expenses Breakdown
  const catMap = {};
  expenses.forEach(e => {
    const cat = e.category || 'Others';
    const amt = parseFloat(e.amount || 0);
    catMap[cat] = (catMap[cat] || 0) + amt;
  });

  const categoryExpenses = Object.entries(catMap).map(([category, amount]) => {
    let percentage = 0;
    if (monthlyExpenses > 0) {
      percentage = parseFloat(((amount / monthlyExpenses) * 100).toFixed(2));
    }
    return { category, amount, percentage };
  }).sort((a, b) => b.amount - a.amount);

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
        const d = new Date(e.expenseDate);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

    const monthInc = incomes
      .filter(inc => {
        const d = new Date(inc.incomeDate);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, inc) => sum + parseFloat(inc.incomeDate || 0), 0);

    monthlyTrends.push({
      month: monthName,
      income: monthInc,
      expense: monthExp
    });
  }

  // Recent Expenses (Top 5)
  const sortedExpenses = [...expenses].sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  const recentExpenses = sortedExpenses.slice(0, 5);

  return {
    totalBalance,
    todayExpenses,
    monthlyExpenses,
    monthlyIncome,
    categoryExpenses,
    monthlyTrends,
    recentExpenses
  };
}

// Reports Data generation
export async function getLocalReportData(startDate, endDate) {
  const store = getStoredData();
  const profile = store.data.profile || {};
  const expenses = (store.data.expenses || []).filter(e => e.deleted !== true);
  const incomes = (store.data.incomes || []).filter(i => i.deleted !== true);

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

  return {
    startDate,
    endDate,
    fullName: profile.fullName || 'User',
    email: profile.email || '',
    expenses: filteredExpenses,
    incomes: filteredIncomes,
    totalExpenses,
    totalIncome,
    netSavings,
    categorySummary
  };
}

export async function clearLocalDb() {
  localStorage.removeItem(STORAGE_KEY);
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
    email: backupObj.email || store.email,
    isAuthenticated: true,
    data: {
      ...store.data,
      ...restoredData
    }
  };
  
  saveStoredData(merged);
}
