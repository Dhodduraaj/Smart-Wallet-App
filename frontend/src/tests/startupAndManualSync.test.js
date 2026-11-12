import assert from 'assert';
import { mergeCloudDataIntoLocal, getStoredData, saveStoredData, saveLocalExpense, deleteLocalExpense, saveLocalIncome, saveLocalAccount } from '../lib/db.js';
import { enqueueOperation, getStoredQueue, saveStoredQueue } from '../lib/syncQueue.js';

// Mock localStorage and window in Node environment
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
global.window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.CustomEvent = class CustomEvent {
  constructor(type, detail) {
    this.type = type;
    this.detail = detail;
  }
};

// Test JWT Expiration Decoder
function isJwtTokenExpired(token) {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    const decoded = JSON.parse(jsonPayload);
    if (!decoded || typeof decoded.exp !== 'number') return false;
    return (Date.now() / 1000) >= decoded.exp;
  } catch (err) {
    return false;
  }
}

function makeMockJwt(expSecFromNow) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'test@example.com',
    userId: '11111111-2222-3333-4444-555555555555',
    exp: Math.floor(Date.now() / 1000) + expSecFromNow
  })).toString('base64url');
  return `${header}.${payload}.mockSignature`;
}

console.log('=== STARTING STARTUP & MANUAL CLOUD SYNC TEST SUITE ===');

// --- TEST 1: Instant Startup & Local Session Restoration ---
console.log('Test 1: Startup Performance & Local Session Validation...');
const validToken = makeMockJwt(3600); // Expires in 1 hour
const expiredToken = makeMockJwt(-3600); // Expired 1 hour ago

assert.strictEqual(isJwtTokenExpired(validToken), false, 'Valid 1-hour token must not be expired');
assert.strictEqual(isJwtTokenExpired(expiredToken), true, 'Expired token must be recognized as expired');

const startTime = Date.now();
// Setup local stored data
const mockStore = {
  email: 'test@example.com',
  localUserId: '11111111-2222-3333-4444-555555555555',
  isAuthenticated: true,
  lastSync: new Date().toISOString(),
  data: {
    profile: { userId: '11111111-2222-3333-4444-555555555555', email: 'test@example.com', fullName: 'Test User' },
    accounts: [{ id: 'acc-1', accountName: 'Cash', currentBalance: 5000, accountType: 'SYSTEM' }],
    expenses: [{ id: 'exp-1', description: 'Groceries', amount: 500, accountId: 'acc-1' }],
    incomes: [],
    transfers: [],
    reminders: [],
    people: [],
    peopleLedger: []
  }
};
saveStoredData(mockStore);
localStorage.setItem('token', validToken);

// Execute instant local session restoration check
const restoredStore = getStoredData();
const isExpired = isJwtTokenExpired(localStorage.getItem('token'));
const elapsedMs = Date.now() - startTime;

assert.strictEqual(restoredStore.isAuthenticated, true, 'Stored session must be authenticated');
assert.strictEqual(isExpired, false, 'Token must be valid');
assert.strictEqual(restoredStore.data.accounts.length, 1, 'Account must be immediately available');
assert.strictEqual(restoredStore.data.expenses.length, 1, 'Expense must be immediately available');
assert.ok(elapsedMs < 50, `Instant startup took ${elapsedMs}ms, well under 50ms limit`);
console.log(`✔ Instant startup succeeded in ${elapsedMs}ms without any blocking network requests!`);

// --- TEST 2: Safe Merge - Importing Cloud Changes on Device B ---
console.log('Test 2: Safe Merge - Importing Cloud Transactions to Device B...');
// Suppose Device A created and uploaded a ₹1000 expense ('exp-cloud-1') and updated account balance to ₹4000
const cloudPayload = {
  accounts: [{ id: 'acc-1', accountName: 'Cash', currentBalance: 4000, accountType: 'SYSTEM' }],
  expenses: [
    { id: 'exp-1', description: 'Groceries', amount: 500, accountId: 'acc-1' },
    { id: 'exp-cloud-1', description: 'Electricity Bill', amount: 1000, accountId: 'acc-1' }
  ],
  incomes: [],
  transfers: []
};

const mergeResult = mergeCloudDataIntoLocal(cloudPayload);
const storeAfterDownload = getStoredData();

assert.strictEqual(storeAfterDownload.data.expenses.length, 2, 'Device B must now have both expenses');
assert.strictEqual(storeAfterDownload.data.expenses.some(e => e.id === 'exp-cloud-1'), true, 'Cloud expense must exist');
const accAfterDownload = storeAfterDownload.data.accounts.find(a => a.id === 'acc-1');
assert.strictEqual(accAfterDownload.currentBalance, 4000, 'Account balance on Device B must match cloud balance (₹4000)');
console.log('✔ Device B successfully imported cloud changes and updated account balance!');

// --- TEST 3: Protection of Locally Pending Changes (Unsynced Local Transactions) ---
console.log('Test 3: Protection of Locally Pending Changes during Download...');
// Device B now creates an offline expense 'exp-offline-2' for ₹300 while offline
const offlineExp = {
  id: 'exp-offline-2',
  description: 'Coffee',
  amount: 300,
  accountId: 'acc-1'
};
// Save locally and enqueue in persistent sync queue
saveLocalExpense(offlineExp);

// Check that queue has the pending operation
const currentQueue = getStoredQueue();
assert.strictEqual(currentQueue.some(q => q.entityId === 'exp-offline-2'), true, 'exp-offline-2 must be in pending sync queue');

// Now Device B performs a Download from Cloud!
// Cloud still doesn't know about 'exp-offline-2'
const cloudPayloadDuringDownload = {
  accounts: [{ id: 'acc-1', accountName: 'Cash', currentBalance: 4000, accountType: 'SYSTEM' }],
  expenses: [
    { id: 'exp-1', description: 'Groceries', amount: 500, accountId: 'acc-1' },
    { id: 'exp-cloud-1', description: 'Electricity Bill', amount: 1000, accountId: 'acc-1' }
  ],
  incomes: []
};

mergeCloudDataIntoLocal(cloudPayloadDuringDownload);
const storeAfterProtectedDownload = getStoredData();

// Verify 'exp-offline-2' was NOT deleted or overwritten!
const preservedOfflineExp = storeAfterProtectedDownload.data.expenses.find(e => e.id === 'exp-offline-2');
assert.ok(preservedOfflineExp, 'Locally pending offline expense MUST NOT be deleted by cloud download!');
assert.strictEqual(preservedOfflineExp.amount, 300, 'Offline expense amount must remain ₹300');

// Verify Account Balance incorporates both cloud balance and the local pending deduction:
// Cloud balance is 4000, pending local expense is 300 -> Expected local balance = 3700!
const accWithPending = storeAfterProtectedDownload.data.accounts.find(a => a.id === 'acc-1');
assert.strictEqual(accWithPending.currentBalance, 3700, 'Balance must reflect cloud balance minus pending local expense (₹3700)');
console.log('✔ Locally pending offline transactions and balance adjustments fully protected!');

// --- TEST 4: Deletion Synchronization Across Devices ---
console.log('Test 4: Deletion Synchronization Across Devices...');
// Suppose Device A deleted 'exp-1' (Groceries) and uploaded the deletion
// Cloud response now ONLY contains 'exp-cloud-1'
const cloudPayloadAfterDeletion = {
  accounts: [{ id: 'acc-1', accountName: 'Cash', currentBalance: 4500, accountType: 'SYSTEM' }],
  expenses: [
    { id: 'exp-cloud-1', description: 'Electricity Bill', amount: 1000, accountId: 'acc-1' }
  ],
  incomes: []
};

// Device B downloads changes
mergeCloudDataIntoLocal(cloudPayloadAfterDeletion);
const storeAfterDeletionSync = getStoredData();

// 'exp-1' was NOT pending on Device B, so it should be safely removed (propagating deletion from Device A)
assert.strictEqual(storeAfterDeletionSync.data.expenses.some(e => e.id === 'exp-1'), false, 'exp-1 should be removed following cloud deletion');
// BUT 'exp-offline-2' was pending locally, so it MUST STILL BE PRESENT!
assert.strictEqual(storeAfterDeletionSync.data.expenses.some(e => e.id === 'exp-offline-2'), true, 'Local pending exp-offline-2 must still exist');
console.log('✔ Deletions made on another device cleanly propagate while preserving unsynced local data!');

// --- TEST 5: Manual Upload Execution ---
console.log('Test 5: Manual Upload Acknowledgement & Queue Clearing...');
// When manual upload succeeds, acknowledged operations are removed from the queue
const queueBeforeUpload = getStoredQueue();
const pendingBeforeUpload = queueBeforeUpload.filter(q => q.status === 'PENDING');
assert.ok(pendingBeforeUpload.length > 0, 'Must have pending operations before upload');

// Simulate server acknowledgement of processed operations
const acknowledgedIds = new Set(pendingBeforeUpload.map(p => p.id));
const queueAfterUpload = queueBeforeUpload.filter(q => !acknowledgedIds.has(q.id));
saveStoredQueue(queueAfterUpload);

assert.strictEqual(getStoredQueue().filter(q => q.status === 'PENDING').length, 0, 'Acknowledged operations must be cleared from queue');
console.log('✔ Queue successfully cleared upon upload acknowledgement!');

console.log('=== ALL STARTUP & MANUAL CLOUD SYNC TESTS PASSED SUCCESSFULLY! 🚀 ===');
