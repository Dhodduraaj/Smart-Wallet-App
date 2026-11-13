import assert from 'assert';
import { 
  getStoredData, 
  saveStoredData, 
  saveLocalExpense, 
  saveLocalIncome, 
  saveLocalAccount, 
  deleteLocalAccount, 
  resolveAccount, 
  mergeCloudDataIntoLocal, 
  getLocalDashboardSummary 
} from '../lib/db.js';
import { enqueueOperation, getStoredQueue, saveStoredQueue } from '../lib/syncQueue.js';

// Setup mock storage and window in Node environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

if (typeof global.navigator === 'undefined') {
  global.navigator = { onLine: true };
} else {
  try {
    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true, writable: true });
  } catch {}
}

const dispatchedEvents = [];
global.window = {
  dispatchEvent: (e) => { dispatchedEvents.push(e.type); return true; },
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.CustomEvent = class CustomEvent {
  constructor(type, detail) {
    this.type = type;
    this.detail = detail;
  }
};

console.log('=== STARTING CASH DEDUPLICATION & UNIFIED SYNC TEST SUITE ===');

// --- TEST 1: Deduplication of Multiple Cash Accounts & Balance Recovery ---
console.log('Test 1: Multiple Cash Accounts Deduplication & Legitimate Balance Recovery...');
localStorage.clear();

// User previously had:
// 1. Original Cash account 'cash-original' with balance 50,000 and 2 transactions
// 2. Erroneous duplicate Cash account 'cash-empty' with balance 0
// 3. Another stray Cash account 'cash-stray' with an expense of 500
const multiCashStore = {
  email: 'user@example.com',
  localUserId: 'user-uuid-1',
  isAuthenticated: true,
  lastSync: '2026-11-01T10:00:00Z',
  data: {
    profile: { userId: 'user-uuid-1', email: 'user@example.com', fullName: 'User' },
    accounts: [
      { id: 'cash-empty', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 0, locked: true },
      { id: 'cash-original', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 50000, locked: true },
      { id: 'cash-stray', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: -500, locked: true },
      { id: 'bank-1', accountName: 'HDFC Bank', accountType: 'BANK', currentBalance: 25000, locked: false }
    ],
    expenses: [
      { id: 'exp-1', description: 'Groceries', amount: 1500, accountId: 'cash-original', accountName: 'Cash' },
      { id: 'exp-2', description: 'Fuel', amount: 500, accountId: 'cash-stray', accountName: 'Cash' }
    ],
    incomes: [
      { id: 'inc-1', description: 'Freelance', amount: 5000, accountId: 'cash-original', accountName: 'Cash' }
    ],
    transfers: [],
    reminders: [],
    people: [],
    peopleLedger: []
  }
};

saveStoredData(multiCashStore);

// Trigger getStoredData which performs active deduplication
const reconciledStore = getStoredData();

const remainingCash = reconciledStore.data.accounts.filter(a => 
  a.accountType === 'SYSTEM' || (a.accountName && a.accountName.toLowerCase() === 'cash')
);

assert.strictEqual(remainingCash.length, 1, 'Exactly ONE canonical Cash account must remain after deduplication');
const canonicalCash = remainingCash[0];
assert.strictEqual(canonicalCash.id, 'cash-original', 'The legitimate account with transactions must be chosen as canonical');
assert.strictEqual(canonicalCash.accountName, 'Cash');
assert.strictEqual(canonicalCash.accountType, 'SYSTEM');

// Check that transactions tied to duplicate 'cash-stray' were safely re-associated to 'cash-original'
const strayExp = reconciledStore.data.expenses.find(e => e.id === 'exp-2');
assert.strictEqual(strayExp.accountId, 'cash-original', 'Orphaned expense must be re-linked to canonical Cash account');

// Canonical balance must reflect the legitimate opening balance + any re-associated transactions without double-counting
// Initial 50000 - 500 (stray expense reassociated) = 49500
assert.strictEqual(canonicalCash.currentBalance, 49500, 'Recovered Cash balance must reflect actual records without double-counting');

// Check total balance in dashboard summary
const summary = await getLocalDashboardSummary();
// 49500 (Cash) + 25000 (Bank) = 74500
assert.strictEqual(summary.totalBalance, 74500, 'Total dashboard balance must accurately reflect recovered canonical accounts');
console.log('✔ Multiple Cash accounts cleanly deduplicated, transactions re-linked, and balance accurately recovered!');

// --- TEST 2: Creation Idempotency (Preventing New Duplicates) ---
console.log('Test 2: Prevention of Duplicate Cash Accounts during Creation...');
const attemptCreateCash = await saveLocalAccount({
  accountName: 'Cash',
  accountType: 'SYSTEM',
  currentBalance: 1000
});

const freshStoreAfterCreate = getStoredData();
const cashCountAfterCreate = freshStoreAfterCreate.data.accounts.filter(a => 
  a.accountType === 'SYSTEM' || (a.accountName && a.accountName.toLowerCase() === 'cash')
).length;

assert.strictEqual(cashCountAfterCreate, 1, 'Attempting to create another Cash account must not increase account count');
assert.strictEqual(attemptCreateCash.id, 'cash-original', 'Must reuse existing canonical Cash account');
console.log('✔ Account creation is strictly idempotent: no duplicate Cash accounts can be created!');

// --- TEST 3: Deletion Protection for SYSTEM Cash Account ---
console.log('Test 3: Protection of Default Cash Account from Deletion...');
let deleteThrew = false;
try {
  await deleteLocalAccount('cash-original');
} catch (err) {
  deleteThrew = true;
  assert.ok(err.message.includes('cannot be deleted'), 'Error message must specify default Cash cannot be deleted');
}
assert.strictEqual(deleteThrew, true, 'Deleting default Cash account must throw an error');
console.log('✔ Default Cash account is locked against deletion!');

// --- TEST 4: Safe Cloud Merge Deduplication ---
console.log('Test 4: Merging Cloud Payload Containing Redundant Cash Accounts...');
// Simulate cloud returning 2 Cash accounts (legacy bug in cloud snapshot)
const cloudPayloadWithDupes = {
  accounts: [
    { id: 'cloud-cash-0', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 0 },
    { id: 'cash-original', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 49500 },
    { id: 'bank-1', accountName: 'HDFC Bank', accountType: 'BANK', currentBalance: 30000 }
  ],
  expenses: [],
  incomes: []
};

const mergeResult = mergeCloudDataIntoLocal(cloudPayloadWithDupes);
const storeAfterMerge = getStoredData();
const cashAccountsAfterMerge = storeAfterMerge.data.accounts.filter(a => 
  a.accountType === 'SYSTEM' || (a.accountName && a.accountName.toLowerCase() === 'cash')
);

assert.strictEqual(cashAccountsAfterMerge.length, 1, 'Must never import a second Cash account from cloud');
assert.strictEqual(cashAccountsAfterMerge[0].currentBalance, 49500, 'Authoritative non-zero Cash balance must be preserved');
console.log('✔ Cloud merge engine cleanly filters duplicate Cash accounts!');

// --- TEST 5: Expense Addition & ACID Balance Consistency ---
console.log('Test 5: Expense Addition Updates Canonical Cash Balance End-to-End...');
await saveLocalExpense({
  id: 'exp-new-1',
  description: 'Dinner',
  amount: 500,
  accountId: 'cash-original'
});

const storeAfterExpense = getStoredData();
const updatedCash = storeAfterExpense.data.accounts.find(a => a.id === 'cash-original');
assert.strictEqual(updatedCash.currentBalance, 49000, 'Cash balance must be atomically deducted by expense amount');

const updatedSummary = await getLocalDashboardSummary();
// 49000 (Cash) + 30000 (Bank from merge) = 79000
assert.strictEqual(updatedSummary.totalBalance, 79000, 'Dashboard total balance must match canonical account balances');
console.log('✔ Expense addition updates Cash balance and Dashboard total balance consistently!');

console.log('=== ALL CASH DEDUPLICATION & UNIFIED SYNC TESTS PASSED SUCCESSFULLY! 🚀 ===');

