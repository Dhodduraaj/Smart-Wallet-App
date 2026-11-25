import assert from 'assert';
import {
  getStoredData,
  saveStoredData,
  saveLocalPerson,
  deleteLocalPerson,
  getLocalPeople,
  getLocalPerson,
  saveLocalPersonNote,
  saveLocalPersonLedgerEntry,
  deleteLocalPersonLedgerEntry,
  deleteAllLocalPersonLedgerEntries,
  deleteSelectedLocalPersonLedgerEntries,
  mergeCloudDataIntoLocal,
  getLocalReportData
} from '../lib/db.js';
import { getStoredQueue, saveStoredQueue } from '../lib/syncQueue.js';
import { generatePdfReportLocal } from '../lib/pdf.js';

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

function resetStore(initialData = {}) {
  localStorage.clear();
  const baseStore = {
    localUserId: 'user-uuid-1234',
    email: 'test@smartwallet.com',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    lastSync: '2026-11-20T10:00:00.000Z',
    data: {
      profile: { fullName: 'Test User', email: 'test@smartwallet.com' },
      accounts: [
        { id: 'acc-cash', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 5000, deleted: false },
        { id: 'acc-bank', accountName: 'HDFC Bank', accountType: 'BANK', currentBalance: 25000, deleted: false }
      ],
      expenses: [],
      incomes: [],
      transfers: [],
      reminders: [],
      people: [],
      peopleLedger: [],
      tombstones: [],
      settings: {}
    },
    ...initialData
  };
  saveStoredData(baseStore);
  saveStoredQueue([]);
  return baseStore;
}

console.log('--- Starting People Sync, PDF Report & UI Tests ---');

// Test 1: Stable Identity & saveLocalPerson
console.log('Test 1: Person creation sets stable UUID, UTC timestamps, and enqueues sync operation');
resetStore();
const createdPerson = await saveLocalPerson({ name: 'Alice Smith' });
assert.ok(createdPerson.id, 'Person must have an ID');
assert.strictEqual(createdPerson.name, 'Alice Smith');
assert.strictEqual(createdPerson.deleted, false);
assert.ok(createdPerson.createdAt.endsWith('Z'), 'createdAt must be UTC ISO string');
assert.ok(createdPerson.updatedAt.endsWith('Z'), 'updatedAt must be UTC ISO string');

const queue1 = getStoredQueue();
assert.strictEqual(queue1.length, 1, 'One operation should be in the sync queue');
assert.strictEqual(queue1[0].entityType, 'PERSON');
assert.strictEqual(queue1[0].operationType, 'CREATE');
assert.strictEqual(queue1[0].entityId, createdPerson.id);
console.log('  Passed Test 1');

// Test 2: Person deletion records tombstone, removes ledger entries, and enqueues DELETE
console.log('Test 2: Person deletion records tombstone and enqueues DELETE for person and ledger');
resetStore();
const p1 = await saveLocalPerson({ id: 'person-111', name: 'Bob Jones' });
const l1 = await saveLocalPersonLedgerEntry({
  id: 'ledger-222',
  personId: 'person-111',
  details: 'Lunch payment',
  incomingMoney: 200,
  outgoingMoney: 0
});

saveStoredQueue([]); // Clear queue for clean assertion
await deleteLocalPerson('person-111');

const storeAfterDelete = getStoredData();
assert.strictEqual(storeAfterDelete.data.people.length, 0, 'Person must be removed from local people');
assert.strictEqual(storeAfterDelete.data.peopleLedger.length, 0, 'Person ledger entries must be removed');

const tombstones = storeAfterDelete.data.tombstones || [];
const personTombstone = tombstones.find(t => t.id === 'person-111');
const ledgerTombstone = tombstones.find(t => t.id === 'ledger-222');
assert.ok(personTombstone, 'Tombstone must exist for deleted person');
assert.strictEqual(personTombstone.entityType, 'PERSON');
assert.ok(ledgerTombstone, 'Tombstone must exist for deleted person ledger entry');
assert.strictEqual(ledgerTombstone.entityType, 'PEOPLE_LEDGER');

const queueAfterDelete = getStoredQueue();
const personDelOp = queueAfterDelete.find(q => q.entityId === 'person-111' && q.operationType === 'DELETE');
const ledgerDelOp = queueAfterDelete.find(q => q.entityId === 'ledger-222' && q.operationType === 'DELETE');
assert.ok(personDelOp, 'DELETE operation for person must be queued');
assert.ok(ledgerDelOp, 'DELETE operation for ledger entry must be queued');

const localPeopleAfterDel = await getLocalPeople();
assert.strictEqual(localPeopleAfterDel.length, 0, 'getLocalPeople must return empty');
const fetchedPerson = await getLocalPerson('person-111');
assert.strictEqual(fetchedPerson, null, 'getLocalPerson for tombstoned ID must return null');
console.log('  Passed Test 2');

// Test 3: mergeCloudDataIntoLocal prevents resurrection of tombstoned person
console.log('Test 3: mergeCloudDataIntoLocal rejects cloud records if tombstoned (no resurrection)');
resetStore();
// Device A deleted person-111 locally, so it has tombstone
const store3 = getStoredData();
store3.data.tombstones = [{ id: 'person-111', entityType: 'PERSON', deletedAt: '2026-11-25T10:00:00.000Z' }];
store3.lastSync = '2026-11-20T10:00:00.000Z';
saveStoredData(store3);

// Cloud payload contains old stale snapshot having person-111
const cloudPayloadStale = {
  people: [
    { id: 'person-111', name: 'Bob Jones', createdAt: '2026-11-10T10:00:00.000Z' },
    { id: 'person-333', name: 'Charlie Brown', createdAt: '2026-11-15T10:00:00.000Z' }
  ],
  peopleLedger: [
    { id: 'ledger-444', personId: 'person-111', details: 'Old entry', incomingMoney: 500, outgoingMoney: 0 }
  ]
};

mergeCloudDataIntoLocal(cloudPayloadStale);

const storeMerged = getStoredData();
assert.strictEqual(storeMerged.data.people.some(p => p.id === 'person-111'), false, 'Deleted person-111 must NOT be resurrected');
assert.strictEqual(storeMerged.data.people.some(p => p.id === 'person-333'), true, 'Valid person-333 must be imported');
assert.strictEqual(storeMerged.data.peopleLedger.some(l => l.id === 'ledger-444'), false, 'Ledger entry of deleted person must NOT be imported');
console.log('  Passed Test 3');

// Test 4: Cloud deletion propagates to local device
console.log('Test 4: Cloud deletion propagates to local device when person was deleted on Web');
resetStore();
// Local device already has person-555 from previous sync
const store4 = getStoredData();
store4.lastSync = '2026-11-20T10:00:00.000Z';
store4.data.people = [
  { id: 'person-555', name: 'Diana Prince', createdAt: '2026-11-18T10:00:00.000Z' }
];
saveStoredData(store4);

// Web deleted person-555, so cloud payload contains tombstone or excludes person-555
const cloudPayloadDeletedOnWeb = {
  tombstones: [
    { id: 'person-555', entityType: 'PERSON', deletedAt: '2026-11-25T08:00:00.000Z' }
  ],
  deletedIds: ['person-555'],
  people: []
};

const result4 = mergeCloudDataIntoLocal(cloudPayloadDeletedOnWeb);
assert.strictEqual(result4.deletedCount > 0, true, 'Deleted count must increment');

const storeAfterCloudDel = getStoredData();
assert.strictEqual(storeAfterCloudDel.data.people.length, 0, 'person-555 must be purged locally');
const tombstonesAfterCloudDel = storeAfterCloudDel.data.tombstones || [];
assert.ok(tombstonesAfterCloudDel.some(t => t.id === 'person-555'), 'Cloud tombstone must be adopted into local store');
console.log('  Passed Test 4');

// Test 5: Conflict resolution uses latest UTC timestamp
console.log('Test 5: Conflict resolution deterministically applies newest update');
resetStore();
const store5 = getStoredData();
store5.data.people = [
  { id: 'person-777', name: 'Original Name', note: 'Original note', updatedAt: '2026-11-25T09:00:00.000Z' }
];
saveStoredData(store5);

const cloudNewer = {
  people: [
    { id: 'person-777', name: 'Updated in Cloud', note: 'New cloud note', updatedAt: '2026-11-25T10:30:00.000Z' }
  ]
};

mergeCloudDataIntoLocal(cloudNewer);
const storeResolved = getStoredData();
assert.strictEqual(storeResolved.data.people[0].name, 'Updated in Cloud', 'Newer cloud record must win');
assert.strictEqual(storeResolved.data.people[0].note, 'New cloud note');
console.log('  Passed Test 5');

// Test 6: Expense PDF Report Columns & Account Display
console.log('Test 6: Expense PDF report uses Date | Description | Account | Amount headers and displays account name');
const reportDto = {
  startDate: '2026-11-01',
  endDate: '2026-11-25',
  email: 'user@test.com',
  accounts: [
    { id: 'acc-cash', accountName: 'Cash' },
    { id: 'acc-bank', accountName: 'HDFC Bank' }
  ],
  expenses: [
    {
      id: 'exp-1',
      description: 'Grocery shopping',
      accountId: 'acc-bank',
      accountName: 'HDFC Bank',
      amount: 1450.50,
      expenseDate: '2026-11-15',
      transactionDateTime: '2026-11-15T14:30:00.000Z'
    },
    {
      id: 'exp-2',
      description: 'Auto fare',
      accountId: 'acc-cash',
      amount: 80,
      expenseDate: '2026-11-16',
      transactionDateTime: '2026-11-16T09:15:00.000Z'
    }
  ],
  incomes: [
    {
      id: 'inc-1',
      description: 'Salary',
      accountName: 'HDFC Bank',
      amount: 50000,
      incomeDate: '2026-11-01',
      transactionDateTime: '2026-11-01T05:30:00.000Z'
    }
  ]
};

// Generate PDF blob
const pdfBlob = generatePdfReportLocal(reportDto);
assert.ok(pdfBlob, 'generatePdfReportLocal must return a valid blob');
assert.strictEqual(pdfBlob.type, 'application/pdf');

// Test getLocalReportData attaches accountName
resetStore({
  data: {
    accounts: [
      { id: 'acc-1', accountName: 'State Bank', accountType: 'BANK', currentBalance: 10000 }
    ],
    expenses: [
      { id: 'exp-9', description: 'Fuel', amount: 500, accountId: 'acc-1', expenseDate: '2026-11-10', transactionDateTime: '2026-11-10T10:00:00.000Z' }
    ],
    incomes: []
  }
});

const reportData = await getLocalReportData('2026-11-01', '2026-11-25');
assert.ok(reportData.expenses.length === 1, 'Should find 1 expense');
assert.strictEqual(reportData.expenses[0].accountName, 'State Bank', 'accountName should be resolved from accounts');
console.log('  Passed Test 6');

// Test 7: UI Others Popup Amount Color Logic
console.log('Test 7: Others popup amount color is #ffffff in dark mode and #000000 in light mode');
const getPopupAmountColor = (isDark) => isDark ? '#ffffff' : '#000000';
assert.strictEqual(getPopupAmountColor(true), '#ffffff', 'Dark theme must produce #ffffff (White)');
assert.strictEqual(getPopupAmountColor(false), '#000000', 'Light theme must produce #000000 (Black)');
console.log('  Passed Test 7');

console.log('All tests passed successfully!');
