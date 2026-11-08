import assert from 'node:assert';

// Mock localStorage and window for Node environment if needed
if (!globalThis.window) {
  globalThis.window = globalThis;
}
if (!globalThis.localStorage) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear()
  };
}

import {
  getStoredData,
  saveStoredData,
  saveLocalPerson,
  getLocalPeople,
  getLocalPerson,
  saveLocalPersonNote,
  saveLocalPersonLedgerEntry,
  getLocalPersonLedger,
  deleteLocalPersonLedgerEntry,
  deleteAllLocalPersonLedgerEntries,
  deleteSelectedLocalPersonLedgerEntries
} from '../lib/db.js';

console.log('--- Starting People Ledger Bulk Deletion & Integrity Tests ---');

// Setup clean test data
localStorage.clear();
const initialStore = getStoredData();

// Add wallet data to verify regression protection
initialStore.data.accounts = [
  { id: 'acc-1', accountName: 'Cash', accountType: 'SYSTEM', currentBalance: 5000, locked: true },
  { id: 'acc-2', accountName: 'Bank', accountType: 'BANK', currentBalance: 12000, locked: false }
];
initialStore.data.expenses = [
  { id: 'exp-1', title: 'Groceries', amount: 800, category: 'Grocery', date: '2026-11-01T10:00:00.000Z' }
];
initialStore.data.incomes = [
  { id: 'inc-1', title: 'Salary', amount: 50000, category: 'Salary', date: '2026-11-01T09:00:00.000Z' }
];
initialStore.data.transfers = [];
saveStoredData(initialStore);

// Test 1: Setup two distinct people with ledger entries
let personA, personB;
{
  console.log('1. Setting up Person A and Person B...');
  personA = await saveLocalPerson({ name: 'Alice' });
  personB = await saveLocalPerson({ name: 'Bob' });
  await saveLocalPersonNote(personA.id, 'Alice note: owes me for lunch');
  await saveLocalPersonNote(personB.id, 'Bob note: promised repayment Friday');

  assert.ok(personA.id);
  assert.ok(personB.id);
  console.log('  ✓ People created successfully');
}

// Test 2: Add chronological entries for Person A and Person B
let entryA1, entryA2, entryA3, entryB1;
{
  console.log('2. Adding ledger entries...');
  // Entry A1: Oldest - Incoming 1000
  entryA1 = await saveLocalPersonLedgerEntry({
    personId: personA.id,
    details: 'Loan 1',
    date: '2026-11-01T10:00:00.000Z',
    incomingMoney: 1000,
    outgoingMoney: 0
  });

  // Entry A2: Middle - Outgoing 400
  entryA2 = await saveLocalPersonLedgerEntry({
    personId: personA.id,
    details: 'Repayment part 1',
    date: '2026-11-02T10:00:00.000Z',
    incomingMoney: 0,
    outgoingMoney: 400
  });

  // Entry A3: Newest - Incoming 500
  entryA3 = await saveLocalPersonLedgerEntry({
    personId: personA.id,
    details: 'Additional loan',
    date: '2026-11-03T10:00:00.000Z',
    incomingMoney: 500,
    outgoingMoney: 0
  });

  // Entry B1: Bob entry
  entryB1 = await saveLocalPersonLedgerEntry({
    personId: personB.id,
    details: 'Bob Dinner',
    date: '2026-11-02T12:00:00.000Z',
    incomingMoney: 200,
    outgoingMoney: 0
  });

  const ledgerA = await getLocalPersonLedger(personA.id);
  assert.strictEqual(ledgerA.length, 3);
  // Verify newest-to-oldest order
  assert.strictEqual(ledgerA[0].id, entryA3.id);
  assert.strictEqual(ledgerA[1].id, entryA2.id);
  assert.strictEqual(ledgerA[2].id, entryA1.id);

  // Verify running totals:
  // Chronological order: A1 (+1000) -> total 1000
  //                      A2 (-400)  -> total 600
  //                      A3 (+500)  -> total 1100
  assert.strictEqual(ledgerA[2].total, 1000);
  assert.strictEqual(ledgerA[1].total, 600);
  assert.strictEqual(ledgerA[0].total, 1100);

  const personASummary = await getLocalPerson(personA.id);
  assert.strictEqual(personASummary.totalIncoming, 1500);
  assert.strictEqual(personASummary.totalOutgoing, 400);
  assert.strictEqual(personASummary.balance, 1100);
  assert.strictEqual(personASummary.entryCount, 3);
  assert.strictEqual(personASummary.note, 'Alice note: owes me for lunch');

  console.log('  ✓ Chronological running totals and person summary verified');
}

// Test 3: Delete Selected Entries (Multi-selection deletion)
{
  console.log('3. Testing Delete Selected Entries (entryA2 removed)...');
  // Delete middle entry A2
  await deleteSelectedLocalPersonLedgerEntries(personA.id, [entryA2.id]);

  const ledgerA = await getLocalPersonLedger(personA.id);
  assert.strictEqual(ledgerA.length, 2);
  assert.strictEqual(ledgerA[0].id, entryA3.id);
  assert.strictEqual(ledgerA[1].id, entryA1.id);

  // Verify running totals recalculate correctly:
  // Chronological order now:
  // A1 (+1000) -> total 1000
  // A3 (+500)  -> total 1500
  assert.strictEqual(ledgerA[1].total, 1000);
  assert.strictEqual(ledgerA[0].total, 1500);

  // Bob's entry must remain untouched
  const ledgerB = await getLocalPersonLedger(personB.id);
  assert.strictEqual(ledgerB.length, 1);
  assert.strictEqual(ledgerB[0].id, entryB1.id);

  // Alice's summary updated
  const personASummary = await getLocalPerson(personA.id);
  assert.strictEqual(personASummary.totalIncoming, 1500);
  assert.strictEqual(personASummary.totalOutgoing, 0);
  assert.strictEqual(personASummary.balance, 1500);
  assert.strictEqual(personASummary.entryCount, 2);

  console.log('  ✓ Delete Selected: running totals recalculated correctly and Bob unaffected');
}

// Test 4: Delete All Entries for Person A
{
  console.log('4. Testing Delete All Entries for Person A...');
  await deleteAllLocalPersonLedgerEntries(personA.id);

  const ledgerA = await getLocalPersonLedger(personA.id);
  assert.strictEqual(ledgerA.length, 0, 'Person A ledger must be empty');

  // Person A record itself must remain completely intact
  const personASummary = await getLocalPerson(personA.id);
  assert.ok(personASummary, 'Person A must still exist');
  assert.strictEqual(personASummary.name, 'Alice');
  assert.strictEqual(personASummary.note, 'Alice note: owes me for lunch');
  assert.strictEqual(personASummary.balance, 0);
  assert.strictEqual(personASummary.totalIncoming, 0);
  assert.strictEqual(personASummary.totalOutgoing, 0);
  assert.strictEqual(personASummary.entryCount, 0);

  // Bob's entry and person info must remain completely intact
  const ledgerB = await getLocalPersonLedger(personB.id);
  assert.strictEqual(ledgerB.length, 1);
  assert.strictEqual(ledgerB[0].id, entryB1.id);
  const personBSummary = await getLocalPerson(personB.id);
  assert.strictEqual(personBSummary.entryCount, 1);
  assert.strictEqual(personBSummary.balance, 200);

  console.log('  ✓ Delete All: Alice ledger is empty, Alice person preserved, Bob entries untouched');
}

// Test 5: Verify Persistence Across Reloads
{
  console.log('5. Testing Persistence across reloads...');
  const reloadedStore = getStoredData();
  const aliceEntries = reloadedStore.data.peopleLedger.filter(e => e.personId === personA.id);
  const bobEntries = reloadedStore.data.peopleLedger.filter(e => e.personId === personB.id);
  assert.strictEqual(aliceEntries.length, 0);
  assert.strictEqual(bobEntries.length, 1);
  console.log('  ✓ Persistence verified: deleted entries do not reappear');
}

// Test 6: Financial Isolation / Regression Protection Verification
{
  console.log('6. Verifying Financial Isolation / Regression Protection...');
  const currentStore = getStoredData();

  // Accounts untouched
  assert.strictEqual(currentStore.data.accounts.length, 2);
  assert.strictEqual(currentStore.data.accounts[0].currentBalance, 5000);
  assert.strictEqual(currentStore.data.accounts[1].currentBalance, 12000);

  // Expenses untouched
  assert.strictEqual(currentStore.data.expenses.length, 1);
  assert.strictEqual(currentStore.data.expenses[0].id, 'exp-1');

  // Incomes untouched
  assert.strictEqual(currentStore.data.incomes.length, 1);
  assert.strictEqual(currentStore.data.incomes[0].id, 'inc-1');

  console.log('  ✓ Financial Isolation verified: Wallets, accounts, incomes, expenses 100% untouched');
}

console.log('\nAll 6 test suites passed successfully! 🎉');
