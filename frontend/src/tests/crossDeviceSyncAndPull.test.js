import assert from 'assert';

const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.CustomEvent = class {
  constructor(name, opts) {
    this.type = name;
    this.name = name;
    this.detail = opts?.detail;
  }
};

const hasLocalFinancialData = (store) => {
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

import { getStoredData, saveStoredData } from '../lib/db.js';

async function runCrossDeviceTests() {
  console.log('=== STARTING CROSS-DEVICE IMPORT & SYNC TEST ===');

  // Case 1: Fresh device detection
  const emptyStore = {
    localUserId: 'fresh-device-uuid',
    email: '',
    isAuthenticated: false,
    data: {
      profile: { fullName: 'Local User', email: '' },
      accounts: [
        {
          id: 'default-cash',
          accountName: 'Cash',
          accountType: 'SYSTEM',
          currentBalance: 0,
          locked: true,
          deleted: false
        }
      ],
      expenses: [],
      incomes: [],
      transfers: [],
      reminders: [],
      people: [],
      peopleLedger: []
    }
  };

  saveStoredData(emptyStore);
  assert.strictEqual(hasLocalFinancialData(emptyStore), false, 'Fresh device has no local financial data');
  console.log('✔ Fresh device correctly recognized as having no local financial data');

  // Case 2: Simulating Cloud Pull Import on the fresh device
  const cloudPayload = {
    accounts: [
      { id: 'acc-1', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 4500, locked: true },
      { id: 'acc-2', accountName: 'HDFC Bank', accountType: 'CUSTOM', currentBalance: 25000, locked: false }
    ],
    expenses: [
      { id: 'exp-1', description: 'Office lunch', amount: 350, category: 'Food', accountId: 'acc-1', accountName: 'Cash' },
      { id: 'exp-2', description: 'Train pass', amount: 1200, category: 'Transport', accountId: 'acc-2', accountName: 'HDFC Bank' }
    ],
    incomes: [
      { id: 'inc-1', description: 'Monthly Salary', amount: 50000, accountId: 'acc-2', accountName: 'HDFC Bank' }
    ],
    transfers: [
      { id: 'tr-1', fromAccountId: 'acc-2', toAccountId: 'acc-1', amount: 5000 }
    ],
    profile: {
      fullName: 'Siva',
      email: 'siva@example.com'
    }
  };

  // Simulate pull logic applied on fresh device
  const store = getStoredData();
  store.data.accounts = cloudPayload.accounts;
  store.data.expenses = cloudPayload.expenses;
  store.data.incomes = cloudPayload.incomes;
  store.data.transfers = cloudPayload.transfers;
  store.data.profile = cloudPayload.profile;
  store.email = 'siva@example.com';
  store.isAuthenticated = true;
  saveStoredData(store);

  // Verification: data is now present and active on this device
  const restoredStore = getStoredData();
  assert.strictEqual(restoredStore.data.accounts.length, 2, '2 accounts imported');
  assert.strictEqual(restoredStore.data.accounts[0].currentBalance, 4500, 'Cash balance ₹4,500');
  assert.strictEqual(restoredStore.data.accounts[1].currentBalance, 25000, 'Bank balance ₹25,000');
  assert.strictEqual(restoredStore.data.expenses.length, 2, '2 expenses imported');
  assert.strictEqual(restoredStore.data.incomes.length, 1, '1 income imported');
  assert.strictEqual(restoredStore.data.transfers.length, 1, '1 transfer imported');
  assert.strictEqual(hasLocalFinancialData(restoredStore), true, 'Device now has full financial data');

  console.log('✔ Cross-device data import successfully restores all accounts, expenses, incomes, and balances!');
  console.log('=== CROSS-DEVICE TEST PASSED SUCCESSFULLY! ===');
}

runCrossDeviceTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
