import assert from 'assert';
import {
  APP_TIMEZONE,
  parseDateTime,
  getLocalDateString,
  getLocalDateAndTimeString,
  combineDateAndTime,
  formatTransactionDateTime,
  updateTransactionDateTime,
  sortTransactions
} from '../lib/transactionSorter.js';
import {
  getStoredData,
  saveStoredData,
  saveLocalExpense,
  deleteLocalExpense,
  saveLocalIncome,
  deleteLocalIncome,
  mergeCloudDataIntoLocal
} from '../lib/db.js';
import { enqueueOperation, getStoredQueue, saveStoredQueue } from '../lib/syncQueue.js';

// Setup mock storage and window environment
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

console.log('=== STARTING TIMEZONE & DELETION SYNC TEST SUITE (SCENARIOS A - G) ===');

// =========================================================================
// SCENARIO A: Website creates expense at 02:30 PM IST -> Sync to Mobile
// =========================================================================
console.log('\nScenario A: Expense created on website at 02:30 PM IST...');
{
  const selectedDate = '2026-11-13';
  const selectedTime = '14:30';

  // 1. Creation generates ISO 8601 UTC instant ending in Z
  const instant = combineDateAndTime(selectedDate, selectedTime);
  assert(instant.endsWith('Z'), 'Instant must be UTC ending in Z');
  assert.strictEqual(instant, '2026-11-13T09:00:00.000Z', '02:30 PM IST (+05:30) must be exactly 09:00:00.000Z');

  // 2. Format on mobile device
  const mobileDisplay = formatTransactionDateTime(instant);
  assert.strictEqual(mobileDisplay.dateStr, '13 Nov 2026', 'Date must be 13 Nov 2026 on mobile');
  assert.strictEqual(mobileDisplay.timeStr, '02:30 PM', 'Time must be exactly 02:30 PM (not shifted by 5:30)');

  // 3. Date-only field
  const { dateStr, timeStr } = getLocalDateAndTimeString(instant);
  assert.strictEqual(dateStr, '2026-11-13', 'Date-only string must match selected date');
  assert.strictEqual(timeStr, '14:30', 'Time-only string must match selected 24h time');

  console.log('  ✔ Scenario A Passed: 02:30 PM IST instant is preserved with 0h 0m drift');
}

// =========================================================================
// SCENARIO B: Mobile creates expense at 08:00 AM IST -> Pull on Website
// =========================================================================
console.log('\nScenario B: Expense created on mobile at 08:00 AM IST...');
{
  const mobileDate = '2026-11-13';
  const mobileTime = '08:00';

  const instant = combineDateAndTime(mobileDate, mobileTime);
  assert.strictEqual(instant, '2026-11-13T02:30:00.000Z', '08:00 AM IST must be 02:30:00.000Z');

  // Website parses and formats
  const webDisplay = formatTransactionDateTime(instant);
  assert.strictEqual(webDisplay.dateStr, '13 Nov 2026');
  assert.strictEqual(webDisplay.timeStr, '08:00 AM', 'Website must display 08:00 AM IST');

  // Simulate SQL timestamp format round-trip from backend "2026-11-13 02:30:00"
  const parsedFromSql = parseDateTime('2026-11-13 02:30:00');
  const formattedSql = formatTransactionDateTime(parsedFromSql);
  assert.strictEqual(formattedSql.timeStr, '08:00 AM', 'SQL format parsed without shifting');

  console.log('  ✔ Scenario B Passed: Mobile to website pull displays exact 08:00 AM without 5h 30m drift');
}

// =========================================================================
// SCENARIO C: Midnight Boundary (01:00 AM IST on Nov 13 = Nov 12 19:30 UTC)
// =========================================================================
console.log('\nScenario C: Midnight boundary transaction at 01:00 AM IST on Nov 13...');
{
  const boundaryDate = '2026-11-13';
  const boundaryTime = '01:00';

  const instant = combineDateAndTime(boundaryDate, boundaryTime);
  // 01:00 IST on Nov 13 is Nov 12, 19:30:00 UTC
  assert.strictEqual(instant, '2026-11-12T19:30:00.000Z');

  // Must display as Nov 13 on both platforms
  const display = formatTransactionDateTime(instant);
  assert.strictEqual(display.dateStr, '13 Nov 2026', 'Must display Nov 13, NOT Nov 12');
  assert.strictEqual(display.timeStr, '01:00 AM', 'Must display 01:00 AM');

  // Edit other fields (e.g. amount or notes) without touching date
  const updatedInstant = updateTransactionDateTime(instant, '2026-11-13', null);
  const updatedDisplay = formatTransactionDateTime(updatedInstant);
  assert.strictEqual(updatedDisplay.dateStr, '13 Nov 2026', 'Date must not shift upon edit');
  assert.strictEqual(updatedDisplay.timeStr, '01:00 AM', 'Time must remain 01:00 AM upon edit');

  console.log('  ✔ Scenario C Passed: Midnight boundary transactions strictly remain on Nov 13 IST');
}

// =========================================================================
// SCENARIO D: Delete on Website -> Sync to Mobile -> No Resurrection
// =========================================================================
console.log('\nScenario D: Delete on website, sync to mobile, verify no resurrection...');
localStorage.clear();
{
  const accountId = 'acc-main';
  const initialStore = {
    email: 'user@example.com',
    localUserId: 'user-1',
    isAuthenticated: true,
    lastSync: '2026-11-13T00:00:00Z',
    data: {
      profile: { id: 'user-1', email: 'user@example.com' },
      accounts: [
        { id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 5000, locked: true }
      ],
      expenses: [
        { id: 'exp-d1', description: 'Dinner', amount: 500, accountId, expenseDate: '2026-11-13', transactionDateTime: '2026-11-13T14:30:00.000Z' }
      ],
      incomes: [],
      reminders: [],
      transfers: [],
      tombstones: []
    }
  };
  saveStoredData(initialStore);

  // Cloud payload simulates that exp-d1 was deleted on website with tombstone recorded
  const cloudPayload = {
    accounts: [
      { id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 5500 }
    ],
    expenses: [],
    incomes: [],
    tombstones: [
      { id: 'exp-d1', entityType: 'EXPENSE', deletedAt: '2026-11-13T15:00:00.000Z' }
    ],
    deletedIds: ['exp-d1']
  };

  // Sync / pull on mobile
  const result = mergeCloudDataIntoLocal(cloudPayload);
  assert.strictEqual(result.deletedCount, 1, 'Should record 1 deletion');

  const afterPull = getStoredData();
  assert.strictEqual(afterPull.data.expenses.length, 0, 'exp-d1 must be removed from mobile store');
  assert.strictEqual(afterPull.data.accounts[0].currentBalance, 5500, 'Balance must be refunded to 5500');

  // Verify tombstone is recorded locally
  assert(afterPull.data.tombstones.some(t => t.id === 'exp-d1'), 'Local tombstone must be persisted');

  // Second sync: even if a stale cloud snapshot returns exp-d1, tombstone must block resurrection
  const staleCloudPayload = {
    accounts: [{ id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 5500 }],
    expenses: [
      { id: 'exp-d1', description: 'Dinner', amount: 500, accountId, expenseDate: '2026-11-13' }
    ],
    tombstones: [{ id: 'exp-d1', entityType: 'EXPENSE', deletedAt: '2026-11-13T15:00:00.000Z' }],
    deletedIds: ['exp-d1']
  };

  mergeCloudDataIntoLocal(staleCloudPayload);
  const afterSecondSync = getStoredData();
  assert.strictEqual(afterSecondSync.data.expenses.length, 0, 'exp-d1 must NOT resurrect!');

  console.log('  ✔ Scenario D Passed: Deleted transaction removed and protected against resurrection');
}

// =========================================================================
// SCENARIO E: Delete on Mobile -> Sync to Website -> No Resurrection
// =========================================================================
console.log('\nScenario E: Delete on mobile, sync to website, verify no resurrection...');
localStorage.clear();
{
  const accountId = 'acc-main';
  const storeWithExp = {
    email: 'user@example.com',
    localUserId: 'user-1',
    isAuthenticated: true,
    lastSync: '2026-11-13T00:00:00Z',
    data: {
      profile: { id: 'user-1', email: 'user@example.com' },
      accounts: [
        { id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 4000, locked: true }
      ],
      expenses: [
        { id: 'exp-e1', description: 'Groceries', amount: 1000, accountId, expenseDate: '2026-11-13' }
      ],
      incomes: [],
      reminders: [],
      transfers: [],
      tombstones: []
    }
  };
  saveStoredData(storeWithExp);

  // User deletes exp-e1 on mobile
  await deleteLocalExpense('exp-e1');

  const afterDelete = getStoredData();
  assert.strictEqual(afterDelete.data.expenses.length, 0, 'Expense deleted locally');
  assert.strictEqual(afterDelete.data.accounts[0].currentBalance, 5000, 'Account refunded to 5000');
  assert(afterDelete.data.tombstones.some(t => t.id === 'exp-e1'), 'Tombstone recorded in local store');

  // Verify sync queue has DELETE operation
  const queue = getStoredQueue();
  assert(queue.some(q => q.entityId === 'exp-e1' && q.operationType === 'DELETE'), 'Queue has DELETE operation');

  // Simulate pull from website with tombstone
  const cloudPayload = {
    accounts: [{ id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 5000 }],
    expenses: [],
    tombstones: [{ id: 'exp-e1', entityType: 'EXPENSE', deletedAt: new Date().toISOString() }],
    deletedIds: ['exp-e1']
  };

  mergeCloudDataIntoLocal(cloudPayload);
  const finalStore = getStoredData();
  assert.strictEqual(finalStore.data.expenses.length, 0, 'No expenses exist');

  console.log('  ✔ Scenario E Passed: Mobile deletion enqueues tombstone and synchronizes cleanly');
}

// =========================================================================
// SCENARIO F: Offline Deletion with Concurrent Remote Changes
// =========================================================================
console.log('\nScenario F: Offline deletion with concurrent changes on second device...');
localStorage.clear();
{
  const accountId = 'acc-main';
  const initialStore = {
    email: 'user@example.com',
    localUserId: 'user-1',
    isAuthenticated: true,
    lastSync: '2026-11-13T00:00:00Z',
    data: {
      profile: { id: 'user-1', email: 'user@example.com' },
      accounts: [
        { id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 10000, locked: true }
      ],
      expenses: [
        { id: 'exp-f1', description: 'Train Ticket', amount: 1200, accountId, expenseDate: '2026-11-13' }
      ],
      incomes: [],
      reminders: [],
      transfers: [],
      tombstones: []
    }
  };
  saveStoredData(initialStore);

  // Device A is OFFLINE and deletes exp-f1
  await deleteLocalExpense('exp-f1');

  // Device B created a new transaction exp-f2 and tried to edit exp-f1 concurrently
  const cloudPayloadFromDeviceB = {
    accounts: [{ id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 8800 }],
    expenses: [
      { id: 'exp-f1', description: 'Train Ticket (Edited on B)', amount: 1200, accountId, expenseDate: '2026-11-13' },
      { id: 'exp-f2', description: 'Coffee', amount: 200, accountId, expenseDate: '2026-11-13' }
    ],
    tombstones: [],
    deletedIds: []
  };

  // Device A comes online and merges cloud data
  mergeCloudDataIntoLocal(cloudPayloadFromDeviceB);

  const merged = getStoredData();
  // exp-f1 was tombstoned on Device A: local tombstone MUST reject exp-f1 from cloud!
  assert(!merged.data.expenses.some(e => e.id === 'exp-f1'), 'Tombstoned exp-f1 must NOT be accepted from cloud');
  // exp-f2 was newly created on Device B: must be accepted!
  assert(merged.data.expenses.some(e => e.id === 'exp-f2'), 'New transaction exp-f2 must be accepted');

  console.log('  ✔ Scenario F Passed: Local tombstone takes precedence over remote concurrent edit');
}

// =========================================================================
// SCENARIO G: End-to-End Account Balance & Transaction Consistency
// =========================================================================
console.log('\nScenario G: Balance consistency: ₹10,000 -> -₹500 -> -₹200 -> delete -₹500 -> ₹9,800...');
localStorage.clear();
{
  const accountId = 'acc-main';
  const startStore = {
    email: 'user@example.com',
    localUserId: 'user-1',
    isAuthenticated: true,
    lastSync: '2026-11-13T00:00:00Z',
    data: {
      profile: { id: 'user-1', email: 'user@example.com' },
      accounts: [
        { id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 10000, locked: true }
      ],
      expenses: [],
      incomes: [],
      reminders: [],
      transfers: [],
      tombstones: []
    }
  };
  saveStoredData(startStore);

  // 1. Mobile adds ₹500 expense
  await saveLocalExpense({
    id: 'exp-500',
    description: 'Shopping',
    amount: 500,
    accountId,
    expenseDate: '2026-11-13',
    expenseTime: '10:00'
  });
  let store = getStoredData();
  assert.strictEqual(store.data.accounts[0].currentBalance, 9500, 'Balance after ₹500 expense must be 9500');

  // 2. Website adds ₹200 expense
  await saveLocalExpense({
    id: 'exp-200',
    description: 'Snacks',
    amount: 200,
    accountId,
    expenseDate: '2026-11-13',
    expenseTime: '12:00'
  });
  store = getStoredData();
  assert.strictEqual(store.data.accounts[0].currentBalance, 9300, 'Balance after ₹200 expense must be 9300');

  // 3. Mobile deletes ₹500 expense
  await deleteLocalExpense('exp-500');
  store = getStoredData();
  assert.strictEqual(store.data.accounts[0].currentBalance, 9800, 'Balance after refund must be exactly 9800');

  // 4. Verify transaction list: only ₹200 expense remains
  assert.strictEqual(store.data.expenses.length, 1);
  assert.strictEqual(store.data.expenses[0].id, 'exp-200');
  assert.strictEqual(store.data.expenses[0].amount, 200);

  // 5. Cloud pull reconciliation test
  const reconciledPayload = {
    accounts: [{ id: accountId, accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 9800 }],
    expenses: [
      { id: 'exp-200', description: 'Snacks', amount: 200, accountId, expenseDate: '2026-11-13', transactionDateTime: store.data.expenses[0].transactionDateTime }
    ],
    tombstones: [{ id: 'exp-500', entityType: 'EXPENSE', deletedAt: new Date().toISOString() }],
    deletedIds: ['exp-500']
  };

  mergeCloudDataIntoLocal(reconciledPayload);
  const finalStore = getStoredData();

  assert.strictEqual(finalStore.data.accounts[0].currentBalance, 9800, 'Final reconciled balance must be ₹9,800');
  assert.strictEqual(finalStore.data.expenses.length, 1, 'Exactly one transaction remains');
  assert.strictEqual(finalStore.data.expenses[0].id, 'exp-200');

  const dtDisplay = formatTransactionDateTime(finalStore.data.expenses[0].transactionDateTime);
  assert.strictEqual(dtDisplay.dateStr, '13 Nov 2026');
  assert.strictEqual(dtDisplay.timeStr, '12:00 PM');

  console.log('  ✔ Scenario G Passed: Final balance ₹9,800 and single transaction ₹200 match across devices');
}

console.log('\n=== ALL TIMEZONE & DELETION SYNC SCENARIOS (A - G) PASSED SUCCESSFULLY! 🚀 ===\n');
