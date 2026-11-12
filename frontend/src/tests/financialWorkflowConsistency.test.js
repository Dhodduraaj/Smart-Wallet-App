import assert from 'assert';

// Mock browser environments
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

global.window = {
  dispatchEvent: (evt) => {
    dispatchedEvents.push(evt.name || evt.type);
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

const dispatchedEvents = [];

global.CustomEvent = class {
  constructor(name, opts) {
    this.type = name;
    this.name = name;
    this.detail = opts?.detail;
  }
};

// Import actual db methods
import {
  getStoredData,
  saveStoredData,
  resolveAccount,
  getLocalAccounts,
  saveLocalAccount,
  adjustLocalAccountBalance,
  saveLocalExpense,
  getLocalExpenses,
  deleteLocalExpense,
  saveLocalIncome,
  getLocalIncomes,
  deleteLocalIncome,
  saveLocalTransfer,
  getLocalDashboardSummary
} from '../lib/db.js';

import { getStoredQueue } from '../lib/syncQueue.js';

async function runFinancialWorkflowTests() {
  console.log('=== STARTING FINANCIAL WORKFLOW CONSISTENCY TEST SUITE ===');

  // SETUP: Initial state with a Cash account of ₹5,000 and a Bank account of ₹10,000
  const cashAccountId = 'acc-cash-1111';
  const bankAccountId = 'acc-bank-2222';

  const initialStore = {
    localUserId: 'user-test-uuid',
    email: 'test@example.com',
    isAuthenticated: true,
    data: {
      profile: { fullName: 'Test User', email: 'test@example.com' },
      accounts: [
        {
          id: cashAccountId,
          accountName: 'Cash',
          accountType: 'SYSTEM',
          locked: true,
          currentBalance: 5000,
          deleted: false
        },
        {
          id: bankAccountId,
          accountName: 'Bank',
          accountType: 'CUSTOM',
          locked: false,
          currentBalance: 10000,
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

  saveStoredData(initialStore);

  // Verification 0: Initial Dashboard total balance
  const initialSummary = await getLocalDashboardSummary();
  assert.strictEqual(initialSummary.totalBalance, 15000, 'Initial total balance should be ₹15,000');
  console.log('✔ Initial balance verified: ₹15,000');

  // TEST 1: Account Resolution with casing and default fallback
  const accounts = (await getLocalAccounts());
  const resolvedExact = resolveAccount(accounts, cashAccountId);
  assert.strictEqual(resolvedExact.id, cashAccountId, 'Exact account match');

  const resolvedUpper = resolveAccount(accounts, cashAccountId.toUpperCase());
  assert.strictEqual(resolvedUpper.id, cashAccountId, 'Case-insensitive account match');

  const resolvedByName = resolveAccount(accounts, null, 'Bank');
  assert.strictEqual(resolvedByName.id, bankAccountId, 'Name-based account match');

  const resolvedFallback = resolveAccount(accounts, 'non-existent-id');
  assert.strictEqual(resolvedFallback.accountName, 'Cash', 'Fallback to default system cash account');
  console.log('✔ Account resolution rules verified');

  // TEST 2: Add an Expense of ₹500 from Cash account
  const exp1 = await saveLocalExpense({
    description: 'Groceries at Supermarket',
    amount: 500,
    category: 'Grocery',
    accountId: cashAccountId,
    expenseDate: '2026-11-12',
    expenseTime: '10:30'
  });

  assert.strictEqual(exp1.amount, 500);
  assert.strictEqual(exp1.accountName, 'Cash', 'Expense accountName should be Cash');
  assert.strictEqual(exp1.accountId, cashAccountId);

  // Check account balance deducted
  const accountsAfterExp1 = await getLocalAccounts();
  const cashAccAfterExp1 = accountsAfterExp1.find(a => a.id === cashAccountId);
  assert.strictEqual(cashAccAfterExp1.currentBalance, 4500, 'Cash balance should be deducted from ₹5000 to ₹4500');

  // Check Dashboard total balance
  const summaryAfterExp1 = await getLocalDashboardSummary();
  assert.strictEqual(summaryAfterExp1.totalBalance, 14500, 'Total balance should be ₹14,500');
  console.log('✔ Expense creation: Account deducted to ₹4500, Total balance is ₹14,500');

  // TEST 3: Check getLocalExpenses pagination and content
  const pageResult = await getLocalExpenses({ page: '0', size: '10' });
  assert.strictEqual(pageResult.content.length, 1, 'Expense should appear on page 0');
  assert.strictEqual(pageResult.content[0].description, 'Groceries at Supermarket');
  assert.strictEqual(pageResult.content[0].accountName, 'Cash');
  assert.strictEqual(pageResult.totalElements, 1);
  console.log('✔ getLocalExpenses correctly lists the new expense on mobile/web');

  // TEST 4: Edit Expense - change amount from ₹500 to ₹800
  await saveLocalExpense({
    ...exp1,
    amount: 800
  });

  const accountsAfterEdit = await getLocalAccounts();
  const cashAccAfterEdit = accountsAfterEdit.find(a => a.id === cashAccountId);
  assert.strictEqual(cashAccAfterEdit.currentBalance, 4200, 'Cash balance should be ₹4,200 after increasing expense to ₹800');

  const summaryAfterEdit = await getLocalDashboardSummary();
  assert.strictEqual(summaryAfterEdit.totalBalance, 14200, 'Total balance should be ₹14,200');
  console.log('✔ Expense edit: Account balance accurately adjusted by difference to ₹4200');

  // TEST 5: Delete Expense - refund balance back
  await deleteLocalExpense(exp1.id);

  const accountsAfterDelete = await getLocalAccounts();
  const cashAccAfterDelete = accountsAfterDelete.find(a => a.id === cashAccountId);
  assert.strictEqual(cashAccAfterDelete.currentBalance, 5000, 'Cash balance should be refunded back to ₹5000');

  const summaryAfterDelete = await getLocalDashboardSummary();
  assert.strictEqual(summaryAfterDelete.totalBalance, 15000, 'Total balance restored to ₹15,000');

  const expensesAfterDelete = await getLocalExpenses({ page: 0, size: 10 });
  assert.strictEqual(expensesAfterDelete.content.length, 0, 'Expense removed from list');
  console.log('✔ Expense deletion: Refunded ₹800 back to Cash, total balance restored');

  // TEST 6: Add Income of ₹2,000 to Bank account
  const inc1 = await saveLocalIncome({
    description: 'Freelance Design Payment',
    amount: 2000,
    accountId: bankAccountId,
    incomeDate: '2026-11-12'
  });

  assert.strictEqual(inc1.amount, 2000);
  assert.strictEqual(inc1.accountName, 'Bank');

  const accountsAfterInc = await getLocalAccounts();
  const bankAccAfterInc = accountsAfterInc.find(a => a.id === bankAccountId);
  assert.strictEqual(bankAccAfterInc.currentBalance, 12000, 'Bank balance should be ₹12,000');

  const summaryAfterInc = await getLocalDashboardSummary();
  assert.strictEqual(summaryAfterInc.totalBalance, 17000, 'Total balance should be ₹17,000');
  console.log('✔ Income creation: Bank balance increased to ₹12,000, Total balance ₹17,000');

  // TEST 7: Delete Income
  await deleteLocalIncome(inc1.id);

  const accountsAfterIncDel = await getLocalAccounts();
  const bankAccAfterIncDel = accountsAfterIncDel.find(a => a.id === bankAccountId);
  assert.strictEqual(bankAccAfterIncDel.currentBalance, 10000, 'Bank balance should return to ₹10,000');

  const summaryAfterIncDel = await getLocalDashboardSummary();
  assert.strictEqual(summaryAfterIncDel.totalBalance, 15000, 'Total balance returned to ₹15,000');
  console.log('✔ Income deletion: Bank balance deducted back to ₹10,000');

  // TEST 8: Self Transfer ₹3,000 from Bank to Cash
  await saveLocalTransfer({
    fromAccountId: bankAccountId,
    toAccountId: cashAccountId,
    amount: 3000,
    date: '2026-11-12'
  });

  const accountsAfterTransfer = await getLocalAccounts();
  const bankAccTransfer = accountsAfterTransfer.find(a => a.id === bankAccountId);
  const cashAccTransfer = accountsAfterTransfer.find(a => a.id === cashAccountId);

  assert.strictEqual(bankAccTransfer.currentBalance, 7000, 'Bank balance reduced to ₹7,000');
  assert.strictEqual(cashAccTransfer.currentBalance, 8000, 'Cash balance increased to ₹8,000');

  const summaryAfterTransfer = await getLocalDashboardSummary();
  assert.strictEqual(summaryAfterTransfer.totalBalance, 15000, 'Total balance unchanged across transfer');
  console.log('✔ Transfer: Bank debited ₹3,000, Cash credited ₹3,000, Total balance constant');

  // TEST 9: Sync Queue has recorded operations
  const queue = getStoredQueue();
  assert.ok(queue.length > 0, 'Sync queue should have pending operations for cloud sync');
  const accountOps = queue.filter(q => q.entityType === 'ACCOUNT');
  assert.ok(accountOps.length > 0, 'Account balance update operations are enqueued');
  console.log(`✔ Sync Queue: ${queue.length} operations properly staged for background cloud sync`);

  console.log('=== ALL FINANCIAL WORKFLOW CONSISTENCY TESTS PASSED SUCCESSFULLY! ===');
}

runFinancialWorkflowTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
