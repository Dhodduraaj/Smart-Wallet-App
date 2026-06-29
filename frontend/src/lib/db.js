import Dexie from 'dexie';

// Helper to generate UUID v4
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const db = new Dexie('SmartWalletDB');

// Define database tables
db.version(1).stores({
  profile: 'id, updatedAt, syncStatus',
  accounts: 'id, updatedAt, syncStatus, deleted',
  expenses: 'id, updatedAt, syncStatus, deleted, [data.accountId], [data.expenseDate]',
  incomes: 'id, updatedAt, syncStatus, deleted, [data.accountId], [data.incomeDate]',
  reminders: 'id, updatedAt, syncStatus, deleted',
  transfers: 'id, updatedAt, syncStatus, deleted'
});

// ==========================================
// User Profile Helpers
// ==========================================
export async function getLocalProfile() {
  const record = await db.profile.get('current_user');
  return record ? record.data : null;
}

export async function saveLocalProfile(profileData, isSynced = false) {
  await db.profile.put({
    id: 'current_user',
    data: profileData,
    updatedAt: new Date().toISOString(),
    syncStatus: isSynced ? 'SYNCED' : 'PENDING'
  });
}

// ==========================================
// Account Helpers
// ==========================================
export async function getLocalAccounts() {
  const records = await db.accounts.filter(a => a.deleted !== true).toArray();
  return records.map(r => r.data);
}

export async function getLocalAccount(id) {
  const record = await db.accounts.get(id);
  if (!record || record.deleted) return null;
  return record.data;
}

export async function saveLocalAccount(accountData, isSynced = false) {
  const id = accountData.id || generateUUID();
  const existing = await db.accounts.get(id);
  
  const isNew = !existing;
  const syncOperation = isSynced ? undefined : (isNew ? 'CREATE' : 'UPDATE');
  const syncStatus = isSynced ? 'SYNCED' : 'PENDING';
  
  const updatedData = {
    ...accountData,
    id,
    currentBalance: parseFloat(accountData.currentBalance || 0)
  };

  await db.accounts.put({
    id,
    data: updatedData,
    updatedAt: new Date().toISOString(),
    syncStatus,
    syncOperation,
    deleted: false
  });

  return updatedData;
}

// Helper to modify local account balance directly
export async function adjustLocalAccountBalance(accountId, amountChange, isSynced = false) {
  const record = await db.accounts.get(accountId);
  if (record) {
    const updatedBalance = parseFloat(record.data.currentBalance || 0) + amountChange;
    record.data.currentBalance = updatedBalance;
    record.updatedAt = new Date().toISOString();
    if (!isSynced) {
      record.syncStatus = 'PENDING';
      if (record.syncOperation !== 'CREATE') {
        record.syncOperation = 'UPDATE';
      }
    }
    await db.accounts.put(record);
  }
}

export async function deleteLocalAccount(id, isSynced = false) {
  const existing = await db.accounts.get(id);
  if (!existing) return;

  if (isSynced || existing.syncOperation === 'CREATE') {
    // If it was never synced, we can delete completely
    await db.accounts.delete(id);
  } else {
    // Soft delete
    existing.deleted = true;
    existing.updatedAt = new Date().toISOString();
    existing.syncStatus = 'PENDING';
    existing.syncOperation = 'DELETE';
    await db.accounts.put(existing);
  }

  // Soft delete all dependent transactions in IndexedDB to keep data clean
  const expenses = await db.expenses.toArray();
  for (const exp of expenses) {
    if (exp.data.accountId === id) {
      if (exp.syncOperation === 'CREATE') {
        await db.expenses.delete(exp.id);
      } else {
        exp.deleted = true;
        exp.updatedAt = new Date().toISOString();
        exp.syncStatus = 'PENDING';
        exp.syncOperation = 'DELETE';
        await db.expenses.put(exp);
      }
    }
  }

  const incomes = await db.incomes.toArray();
  for (const inc of incomes) {
    if (inc.data.accountId === id) {
      if (inc.syncOperation === 'CREATE') {
        await db.incomes.delete(inc.id);
      } else {
        inc.deleted = true;
        inc.updatedAt = new Date().toISOString();
        inc.syncStatus = 'PENDING';
        inc.syncOperation = 'DELETE';
        await db.incomes.put(inc);
      }
    }
  }
}

// ==========================================
// Expense Helpers
// ==========================================
export async function getLocalExpenses(params = {}) {
  const { page = 0, size = 10, search = '', category = '', accountId = '' } = params;
  
  let records = await db.expenses.filter(e => e.deleted !== true).toArray();
  
  // Apply search (on description and notes)
  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r => 
      (r.data.description || '').toLowerCase().includes(q) || 
      (r.data.notes || '').toLowerCase().includes(q)
    );
  }

  // Apply category filter
  if (category) {
    records = records.filter(r => (r.data.category || '').toLowerCase() === category.toLowerCase());
  }

  // Apply account filter
  if (accountId) {
    records = records.filter(r => r.data.accountId === accountId);
  }

  // Sort by expenseDate desc, then createdAt desc
  records.sort((a, b) => {
    const dateA = new Date(a.data.expenseDate || 0);
    const dateB = new Date(b.data.expenseDate || 0);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.data.createdAt || 0) - new Date(a.data.createdAt || 0);
  });

  const content = records.slice(page * size, (page + 1) * size).map(r => r.data);
  return {
    content,
    totalElements: records.length,
    totalPages: Math.ceil(records.length / size),
    size,
    number: page
  };
}

export async function getLocalExpense(id) {
  const record = await db.expenses.get(id);
  if (!record || record.deleted) return null;
  return record.data;
}

export async function saveLocalExpense(expenseData, isSynced = false) {
  const id = expenseData.id || generateUUID();
  const existing = await db.expenses.get(id);
  const isNew = !existing;
  
  // Retrieve account name
  let accountName = expenseData.accountName || '';
  if (!accountName && expenseData.accountId) {
    const acc = await getLocalAccount(expenseData.accountId);
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

  const syncOperation = isSynced ? undefined : (isNew ? 'CREATE' : 'UPDATE');
  const syncStatus = isSynced ? 'SYNCED' : 'PENDING';

  await db.expenses.put({
    id,
    data: updatedData,
    updatedAt: new Date().toISOString(),
    syncStatus,
    syncOperation,
    deleted: false
  });

  // Adjust account balance
  if (!isSynced) {
    if (isNew) {
      // New expense subtracts from account balance
      await adjustLocalAccountBalance(expenseData.accountId, -updatedData.amount);
    } else {
      // Edited expense adjusts account balance by the difference
      const oldAmount = parseFloat(existing.data.amount || 0);
      const diff = updatedData.amount - oldAmount;
      await adjustLocalAccountBalance(expenseData.accountId, -diff);
    }
  }

  return updatedData;
}

export async function deleteLocalExpense(id, isSynced = false) {
  const existing = await db.expenses.get(id);
  if (!existing) return;

  if (isSynced || existing.syncOperation === 'CREATE') {
    await db.expenses.delete(id);
  } else {
    existing.deleted = true;
    existing.updatedAt = new Date().toISOString();
    existing.syncStatus = 'PENDING';
    existing.syncOperation = 'DELETE';
    await db.expenses.put(existing);
  }

  // Refund the amount to the account
  if (!isSynced) {
    await adjustLocalAccountBalance(existing.data.accountId, parseFloat(existing.data.amount || 0));
  }
}

// ==========================================
// Income Helpers
// ==========================================
export async function getLocalIncomes(params = {}) {
  const { page = 0, size = 10, search = '', accountId = '' } = params;
  
  let records = await db.incomes.filter(e => e.deleted !== true).toArray();
  
  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r => 
      (r.data.description || '').toLowerCase().includes(q) || 
      (r.data.notes || '').toLowerCase().includes(q)
    );
  }

  if (accountId) {
    records = records.filter(r => r.data.accountId === accountId);
  }

  // Sort by incomeDate desc, then createdAt desc
  records.sort((a, b) => {
    const dateA = new Date(a.data.incomeDate || 0);
    const dateB = new Date(b.data.incomeDate || 0);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.data.createdAt || 0) - new Date(a.data.createdAt || 0);
  });

  const content = records.slice(page * size, (page + 1) * size).map(r => r.data);
  return {
    content,
    totalElements: records.length,
    totalPages: Math.ceil(records.length / size),
    size,
    number: page
  };
}

export async function getLocalIncome(id) {
  const record = await db.incomes.get(id);
  if (!record || record.deleted) return null;
  return record.data;
}

export async function saveLocalIncome(incomeData, isSynced = false) {
  const id = incomeData.id || generateUUID();
  const existing = await db.incomes.get(id);
  const isNew = !existing;

  let accountName = incomeData.accountName || '';
  if (!accountName && incomeData.accountId) {
    const acc = await getLocalAccount(incomeData.accountId);
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

  const syncOperation = isSynced ? undefined : (isNew ? 'CREATE' : 'UPDATE');
  const syncStatus = isSynced ? 'SYNCED' : 'PENDING';

  await db.incomes.put({
    id,
    data: updatedData,
    updatedAt: new Date().toISOString(),
    syncStatus,
    syncOperation,
    deleted: false
  });

  // Adjust account balance
  if (!isSynced) {
    if (isNew) {
      await adjustLocalAccountBalance(incomeData.accountId, updatedData.amount);
    } else {
      const oldAmount = parseFloat(existing.data.amount || 0);
      const diff = updatedData.amount - oldAmount;
      await adjustLocalAccountBalance(incomeData.accountId, diff);
    }
  }

  return updatedData;
}

export async function deleteLocalIncome(id, isSynced = false) {
  const existing = await db.incomes.get(id);
  if (!existing) return;

  if (isSynced || existing.syncOperation === 'CREATE') {
    await db.incomes.delete(id);
  } else {
    existing.deleted = true;
    existing.updatedAt = new Date().toISOString();
    existing.syncStatus = 'PENDING';
    existing.syncOperation = 'DELETE';
    await db.incomes.put(existing);
  }

  // Deduct the amount from the account balance
  if (!isSynced) {
    await adjustLocalAccountBalance(existing.data.accountId, -parseFloat(existing.data.amount || 0));
  }
}

// ==========================================
// Reminder Helpers
// ==========================================
export async function getLocalDailyReminderConfig() {
  const record = await db.reminders.get('daily_config');
  return record ? record.data : { enabled: false, reminderTime: '21:00', reminderZoneId: 'UTC' };
}

export async function saveLocalDailyReminderConfig(config, isSynced = false) {
  await db.reminders.put({
    id: 'daily_config',
    data: config,
    updatedAt: new Date().toISOString(),
    syncStatus: isSynced ? 'SYNCED' : 'PENDING',
    syncOperation: 'UPDATE'
  });
}

export async function getLocalUpcomingPayments() {
  const records = await db.reminders.filter(r => r.id !== 'daily_config' && r.deleted !== true).toArray();
  return records.map(r => r.data);
}

export async function saveLocalUpcomingPayment(reminder, isSynced = false) {
  const id = reminder.id || generateUUID();
  const existing = await db.reminders.get(id);
  const isNew = !existing;

  const syncOperation = isSynced ? undefined : (isNew ? 'CREATE' : 'UPDATE');
  const syncStatus = isSynced ? 'SYNCED' : 'PENDING';

  const updatedData = {
    ...reminder,
    id,
    amount: parseFloat(reminder.amount || 0),
    completed: reminder.completed === true || reminder.completed === 'true'
  };

  await db.reminders.put({
    id,
    data: updatedData,
    updatedAt: new Date().toISOString(),
    syncStatus,
    syncOperation,
    deleted: false
  });

  return updatedData;
}

export async function deleteLocalUpcomingPayment(id, isSynced = false) {
  const existing = await db.reminders.get(id);
  if (!existing) return;

  if (isSynced || existing.syncOperation === 'CREATE') {
    await db.reminders.delete(id);
  } else {
    existing.deleted = true;
    existing.updatedAt = new Date().toISOString();
    existing.syncStatus = 'PENDING';
    existing.syncOperation = 'DELETE';
    await db.reminders.put(existing);
  }
}

export async function toggleUpcomingPaymentCompletedLocal(id, completed, isSynced = false) {
  const record = await db.reminders.get(id);
  if (record) {
    record.data.completed = completed;
    record.updatedAt = new Date().toISOString();
    if (!isSynced) {
      record.syncStatus = 'PENDING';
      if (record.syncOperation !== 'CREATE') {
        record.syncOperation = 'UPDATE';
      }
    }
    await db.reminders.put(record);
    return record.data;
  }
  return null;
}

// ==========================================
// Self Transfer Helpers
// ==========================================
export async function saveLocalTransfer(transferData, isSynced = false) {
  const id = transferData.id || generateUUID();
  
  const syncOperation = isSynced ? undefined : 'CREATE';
  const syncStatus = isSynced ? 'SYNCED' : 'PENDING';

  await db.transfers.put({
    id,
    data: { ...transferData, id },
    updatedAt: new Date().toISOString(),
    syncStatus,
    syncOperation,
    deleted: false
  });

  // Client-side self transfer splits into a local expense and income
  if (!isSynced) {
    const today = new Date().toISOString().split('T')[0];
    const amount = parseFloat(transferData.amount || 0);

    const sourceAcc = await getLocalAccount(transferData.fromAccountId);
    const destAcc = await getLocalAccount(transferData.toAccountId);

    if (sourceAcc && destAcc) {
      // 1. Create Expense
      await saveLocalExpense({
        accountId: transferData.fromAccountId,
        description: `Transfer to ${destAcc.accountName}`,
        amount,
        category: 'Others',
        paymentMode: 'Bank Transfer',
        expenseDate: today,
        notes: transferData.notes || 'Self Transfer'
      });

      // 2. Create Income
      await saveLocalIncome({
        accountId: transferData.toAccountId,
        description: `Transfer from ${sourceAcc.accountName}`,
        amount,
        incomeDate: today,
        notes: transferData.notes || 'Self Transfer'
      });
    }
  }

  return { ...transferData, id };
}

// ==========================================
// Dashboard statistics generation
// ==========================================
export async function getLocalDashboardSummary() {
  const accounts = await getLocalAccounts();
  const expenses = await db.expenses.filter(e => e.deleted !== true).toArray();
  const incomes = await db.incomes.filter(i => i.deleted !== true).toArray();

  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.currentBalance || 0), 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed

  // Today's Expenses
  const todayExpenses = expenses
    .filter(e => e.data.expenseDate === todayStr)
    .reduce((sum, e) => sum + parseFloat(e.data.amount || 0), 0);

  // Monthly Expenses (current calendar month)
  const monthlyExpenses = expenses
    .filter(e => {
      const d = new Date(e.data.expenseDate);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    })
    .reduce((sum, e) => sum + parseFloat(e.data.amount || 0), 0);

  // Monthly Income (current calendar month)
  const monthlyIncome = incomes
    .filter(inc => {
      const d = new Date(inc.data.incomeDate);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    })
    .reduce((sum, inc) => sum + parseFloat(inc.data.amount || 0), 0);

  // Category Expenses Breakdown
  const catMap = {};
  expenses.forEach(e => {
    const cat = e.data.category || 'Others';
    const amt = parseFloat(e.data.amount || 0);
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
        const d = new Date(e.data.expenseDate);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, e) => sum + parseFloat(e.data.amount || 0), 0);

    const monthInc = incomes
      .filter(inc => {
        const d = new Date(inc.data.incomeDate);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, inc) => sum + parseFloat(inc.data.amount || 0), 0);

    monthlyTrends.push({
      month: monthName,
      income: monthInc,
      expense: monthExp
    });
  }

  // Recent Expenses (Top 5)
  const sortedExpenses = [...expenses].sort((a, b) => {
    return new Date(b.data.createdAt || 0) - new Date(a.data.createdAt || 0);
  });
  const recentExpenses = sortedExpenses.slice(0, 5).map(e => e.data);

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

// ==========================================
// Reports Data generation
// ==========================================
export async function getLocalReportData(startDate, endDate) {
  const profile = await getLocalProfile() || {};
  const expenses = await db.expenses.filter(e => e.deleted !== true).toArray();
  const incomes = await db.incomes.filter(i => i.deleted !== true).toArray();

  const start = new Date(startDate);
  const end = new Date(endDate);
  // Ensure end date range covers the whole end day
  end.setHours(23, 59, 59, 999);

  const filteredExpenses = expenses.filter(e => {
    const d = new Date(e.data.expenseDate);
    return d >= start && d <= end;
  }).map(e => e.data);

  const filteredIncomes = incomes.filter(i => {
    const d = new Date(i.data.incomeDate);
    return d >= start && d <= end;
  }).map(i => i.data);

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
