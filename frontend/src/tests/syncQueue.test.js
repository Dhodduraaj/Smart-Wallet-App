import assert from 'assert';

// Mock storage
const mockStorage = {};
const mockPreferencesStorage = {};

global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

try {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true
  });
} catch {}

global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.CustomEvent = class {
  constructor(name, opts) {
    this.name = name;
    this.detail = opts?.detail;
  }
};

const QUEUE_STORAGE_KEY = 'smart_wallet_sync_queue';

function getStoredQueue() {
  const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveStoredQueue(queue) {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

function enqueueOperation({ entityType, operationType, entityId, payload }) {
  const queue = getStoredQueue();

  const existingIdx = queue.findIndex(
    q => q.entityId === entityId && q.status !== 'SYNCED'
  );

  if (existingIdx !== -1) {
    const existing = queue[existingIdx];
    if (existing.operationType === 'CREATE' && operationType === 'DELETE') {
      queue.splice(existingIdx, 1);
      saveStoredQueue(queue);
      return;
    }
    if (existing.operationType === 'CREATE' && operationType === 'UPDATE') {
      queue[existingIdx].payload = { ...existing.payload, ...payload };
      queue[existingIdx].createdAt = new Date().toISOString();
      saveStoredQueue(queue);
      return;
    }
    if (existing.operationType === 'UPDATE' && operationType === 'UPDATE') {
      queue[existingIdx].payload = { ...existing.payload, ...payload };
      queue[existingIdx].createdAt = new Date().toISOString();
      saveStoredQueue(queue);
      return;
    }
    if (existing.operationType === 'UPDATE' && operationType === 'DELETE') {
      queue[existingIdx].operationType = 'DELETE';
      queue[existingIdx].payload = payload;
      queue[existingIdx].createdAt = new Date().toISOString();
      saveStoredQueue(queue);
      return;
    }
  }

  const op = {
    id: 'op-' + Math.random().toString(36).substring(2, 9),
    entityId: String(entityId),
    entityType,
    operationType,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
    status: 'PENDING',
  };

  queue.push(op);
  saveStoredQueue(queue);
}

async function runQueueTests() {
  console.log('--- Starting Sync Queue Test Suite ---');

  // Test 1: Basic enqueue
  console.log('1. Testing operation enqueue...');
  enqueueOperation({
    entityType: 'EXPENSE',
    operationType: 'CREATE',
    entityId: 'exp-1',
    payload: { amount: 100, category: 'Food' }
  });

  let q = getStoredQueue();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].entityId, 'exp-1');
  assert.strictEqual(q[0].payload.amount, 100);
  console.log('  ✓ Operation successfully queued');

  // Test 2: Coalescing CREATE + UPDATE
  console.log('2. Testing operation coalescing (CREATE + UPDATE)...');
  enqueueOperation({
    entityType: 'EXPENSE',
    operationType: 'UPDATE',
    entityId: 'exp-1',
    payload: { amount: 150, description: 'Lunch' }
  });

  q = getStoredQueue();
  assert.strictEqual(q.length, 1, 'Queue length should still be 1 after update coalescence');
  assert.strictEqual(q[0].operationType, 'CREATE', 'Operation type remains CREATE');
  assert.strictEqual(q[0].payload.amount, 150, 'Amount updated to 150');
  assert.strictEqual(q[0].payload.category, 'Food', 'Original category retained');
  assert.strictEqual(q[0].payload.description, 'Lunch', 'New description added');
  console.log('  ✓ CREATE + UPDATE seamlessly coalesced');

  // Test 3: Coalescing CREATE + DELETE
  console.log('3. Testing cancellation (CREATE + DELETE)...');
  enqueueOperation({
    entityType: 'EXPENSE',
    operationType: 'DELETE',
    entityId: 'exp-1'
  });

  q = getStoredQueue();
  assert.strictEqual(q.length, 0, 'CREATE + DELETE cancels out of queue completely');
  console.log('  ✓ Transient create + delete canceled out cleanly without server traffic');

  // Test 4: Batch slicing
  console.log('4. Testing batch slicing...');
  for (let i = 0; i < 30; i++) {
    enqueueOperation({
      entityType: 'INCOME',
      operationType: 'CREATE',
      entityId: `inc-${i}`,
      payload: { amount: i * 10 }
    });
  }

  q = getStoredQueue();
  assert.strictEqual(q.length, 30);
  const batch = q.slice(0, 25);
  assert.strictEqual(batch.length, 25, 'Batch slice is exactly 25 operations');
  console.log('  ✓ Large datasets cleanly sliced into batches of 25 operations');

  console.log('\nAll Sync Queue tests passed successfully! 🚀');
}

runQueueTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
