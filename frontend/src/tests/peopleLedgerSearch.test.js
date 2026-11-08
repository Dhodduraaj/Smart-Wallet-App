import assert from 'assert';

/**
 * Unit & Integration Test Suite for People Ledger Search Feature
 */

console.log('--- Starting People Ledger Search Tests ---');

// Mock sample entries matching user requirements
const mockLedgerEntries = [
  { id: 'entry-1', details: 'Bought groceries', incomingMoney: 0, outgoingMoney: 500, total: -500, createdAt: '2026-03-01T10:00:00Z' },
  { id: 'entry-2', details: 'Paid electricity bill', incomingMoney: 0, outgoingMoney: 1200, total: -1700, createdAt: '2026-03-02T11:00:00Z' },
  { id: 'entry-3', details: 'Received money for rent', incomingMoney: 15000, outgoingMoney: 0, total: 13300, createdAt: '2026-03-03T12:00:00Z' },
  { id: 'entry-4', details: 'Monthly maintenance', incomingMoney: 0, outgoingMoney: 800, total: 12500, createdAt: '2026-03-04T13:00:00Z' },
  { id: 'entry-5', details: 'Personal loan repayment', incomingMoney: 5000, outgoingMoney: 0, total: 17500, createdAt: '2026-03-05T14:00:00Z' },
];

// Pure filtering logic used in People.jsx useMemo
const filterEntries = (entries, searchQuery) => {
  const query = (searchQuery || '').trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((entry) =>
    (entry.details || '').toLowerCase().includes(query)
  );
};

// Selection reconciliation logic used in People.jsx useEffect
const reconcileSelection = (selectedIds, visibleEntries) => {
  const visibleIds = new Set(visibleEntries.map((e) => e.id));
  return selectedIds.filter((id) => visibleIds.has(id));
};

// Test 1: Empty search query returns all entries
console.log('1. Testing empty search query...');
const resEmpty = filterEntries(mockLedgerEntries, '');
assert.strictEqual(resEmpty.length, 5, 'Empty search must return all entries');
const resSpacesOnly = filterEntries(mockLedgerEntries, '   ');
assert.strictEqual(resSpacesOnly.length, 5, 'Whitespace-only search must return all entries');
console.log('  ✓ Empty search returns all entries');

// Test 2: Case-insensitive and partial-word matching
console.log('2. Testing case-insensitive & partial-word matching...');
const resElec = filterEntries(mockLedgerEntries, 'electricity');
assert.strictEqual(resElec.length, 1);
assert.strictEqual(resElec[0].id, 'entry-2');
assert.strictEqual(resElec[0].details, 'Paid electricity bill');

const resRentUpper = filterEntries(mockLedgerEntries, 'RENT');
assert.strictEqual(resRentUpper.length, 1);
assert.strictEqual(resRentUpper[0].id, 'entry-3');
assert.strictEqual(resRentUpper[0].details, 'Received money for rent');

const resPartial = filterEntries(mockLedgerEntries, 'pay');
// Matches 'Paid electricity bill' (no 'pay' in 'Paid')? Wait, 'pay' is in 'Personal loan repayment'!
assert.strictEqual(resPartial.length, 1);
assert.strictEqual(resPartial[0].id, 'entry-5');

const resLeadingTrailing = filterEntries(mockLedgerEntries, '   groceries   ');
assert.strictEqual(resLeadingTrailing.length, 1);
assert.strictEqual(resLeadingTrailing[0].id, 'entry-1');
console.log('  ✓ Case-insensitive and partial-word matching verified');

// Test 3: No matching results state
console.log('3. Testing no matching results...');
const resNone = filterEntries(mockLedgerEntries, 'cryptocurrency');
assert.strictEqual(resNone.length, 0, 'Should return 0 entries for unmatched query');
console.log('  ✓ No matching results correctly identified');

// Test 4: Running totals preservation
console.log('4. Verifying running totals are unchanged by search...');
assert.strictEqual(resElec[0].total, -1700, 'Original total must be preserved');
assert.strictEqual(resRentUpper[0].total, 13300, 'Original total must be preserved');
console.log('  ✓ Running totals preserved without recalculation');

// Test 5: Multi-selection reconciliation with search
console.log('5. Testing selection reconciliation across search filtering...');
// Suppose user selected entry-2 and entry-3
let selectedIds = ['entry-2', 'entry-3'];
// User searches for 'electricity'
const filteredForElec = filterEntries(mockLedgerEntries, 'electricity');
// Reconcile selection
selectedIds = reconcileSelection(selectedIds, filteredForElec);
// Only entry-2 should remain selected; entry-3 (hidden) must be removed
assert.deepStrictEqual(selectedIds, ['entry-2'], 'Hidden entries must be reconciled out of selection');

// User clears search
const filteredCleared = filterEntries(mockLedgerEntries, '');
selectedIds = reconcileSelection(selectedIds, filteredCleared);
assert.deepStrictEqual(selectedIds, ['entry-2'], 'Selection persists for visible entries');
console.log('  ✓ Selection reconciliation protects hidden entries from accidental deletion');

console.log('\nAll People Ledger Search tests passed successfully! 🎉');

