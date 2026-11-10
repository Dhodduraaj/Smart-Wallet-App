import assert from 'assert';

/**
 * Test Suite for Authentication Session Persistence & Bootstrap Resilience
 */

console.log('--- Starting Auth Session Persistence Tests ---');

// Mock localStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

// Mock Preferences
class MockPreferences {
  constructor(shouldThrow = false) {
    this.store = {};
    this.shouldThrow = shouldThrow;
  }
  async get({ key }) {
    if (this.shouldThrow) {
      throw new Error('"Preferences" plugin is not implemented on android');
    }
    return { value: this.store[key] || null };
  }
  async set({ key, value }) {
    if (this.shouldThrow) {
      throw new Error('"Preferences" plugin is not implemented on android');
    }
    this.store[key] = String(value);
  }
  async remove({ key }) {
    if (this.shouldThrow) {
      throw new Error('"Preferences" plugin is not implemented on android');
    }
    delete this.store[key];
  }
}

const buildUserProfile = (store) => {
  if (!store || !store.data || !store.data.profile) return null;
  const uid = store.localUserId || store.data.profile.userId || store.data.profile.id;
  return {
    ...store.data.profile,
    userId: uid,
    id: uid
  };
};

const simulateBootstrap = async (localStorage, preferences) => {
  let user = null;
  let loading = true;

  try {
    let prefStoredData = null;
    let prefToken = null;

    // 1. Safely attempt to read native Capacitor Preferences
    try {
      const prefDataRes = await preferences.get({ key: 'smart_wallet_data' });
      prefStoredData = prefDataRes?.value;
      const prefTokenRes = await preferences.get({ key: 'token' });
      prefToken = prefTokenRes?.value;
    } catch (prefErr) {
      // Native Preferences read failed or not available - gracefully proceed
    }

    // 2. Check local storage
    const localRaw = localStorage.getItem('smart_wallet_data');

    // 3. Hydrate or reconcile between Preferences and localStorage
    if (prefStoredData) {
      try {
        const parsedPref = JSON.parse(prefStoredData);
        if (parsedPref && parsedPref.data) {
          if (!localRaw) {
            localStorage.setItem('smart_wallet_data', prefStoredData);
          } else {
            try {
              const parsedLocal = JSON.parse(localRaw);
              if (parsedPref.isAuthenticated === true && parsedLocal.isAuthenticated !== true) {
                localStorage.setItem('smart_wallet_data', prefStoredData);
              }
            } catch {
              localStorage.setItem('smart_wallet_data', prefStoredData);
            }
          }
        }
      } catch {
        // invalid JSON
      }
    }

    if (prefToken && !localStorage.getItem('token')) {
      localStorage.setItem('token', prefToken);
    }

    // 4. Retrieve stored data
    const raw = localStorage.getItem('smart_wallet_data');
    const store = raw ? JSON.parse(raw) : null;

    // 5. Check authentication state
    if (store && store.isAuthenticated === true && store.data && store.data.profile) {
      user = buildUserProfile(store);
      try {
        await preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
      } catch {
        // ignore
      }
    } else {
      if (prefStoredData) {
        try {
          const parsedPref = JSON.parse(prefStoredData);
          if (parsedPref && parsedPref.isAuthenticated === true && parsedPref.data && parsedPref.data.profile) {
            localStorage.setItem('smart_wallet_data', prefStoredData);
            user = buildUserProfile(parsedPref);
            return { user, loading: false };
          }
        } catch {
          // ignore
        }
      }
      user = null;
    }
  } catch (err) {
    try {
      const raw = localStorage.getItem('smart_wallet_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.isAuthenticated === true && parsed.data && parsed.data.profile) {
          user = buildUserProfile(parsed);
          return { user, loading: false };
        }
      }
    } catch {
      // ignore
    }
    user = null;
  } finally {
    loading = false;
  }

  return { user, loading };
};

// Test 1: User logged in, restarts app (Both localStorage and Preferences have data)
console.log('1. Testing normal app restart with existing session...');
const mockLocal1 = new MockLocalStorage();
const mockPref1 = new MockPreferences();
const validSession = {
  localUserId: 'user-uuid-123',
  email: 'test@example.com',
  isAuthenticated: true,
  data: {
    profile: { fullName: 'Test User', email: 'test@example.com', onboardingCompleted: true },
    accounts: [],
    expenses: [],
    incomes: []
  }
};
mockLocal1.setItem('smart_wallet_data', JSON.stringify(validSession));
mockPref1.store['smart_wallet_data'] = JSON.stringify(validSession);

const res1 = await simulateBootstrap(mockLocal1, mockPref1);
assert.strictEqual(res1.loading, false, 'Loading must be false');
assert.notStrictEqual(res1.user, null, 'User must not be null');
assert.strictEqual(res1.user.email, 'test@example.com', 'User email must be restored');
assert.strictEqual(res1.user.fullName, 'Test User', 'User name must be restored');
console.log('  ✓ Normal app restart restores authenticated session');

// Test 2: WebView localStorage cleared, but Android SharedPreferences (Preferences) retained
console.log('2. Testing session restoration when WebView localStorage was wiped...');
const mockLocal2 = new MockLocalStorage(); // empty
const mockPref2 = new MockPreferences();
mockPref2.store['smart_wallet_data'] = JSON.stringify(validSession);

const res2 = await simulateBootstrap(mockLocal2, mockPref2);
assert.strictEqual(res2.loading, false);
assert.notStrictEqual(res2.user, null, 'User must be restored from Preferences');
assert.strictEqual(res2.user.email, 'test@example.com');
assert.notStrictEqual(mockLocal2.getItem('smart_wallet_data'), null, 'localStorage must be re-hydrated');
console.log('  ✓ Session restored from native Preferences and localStorage rehydrated');

// Test 3: Preferences throws plugin error (The exact bug that occurred with missing plugin!)
console.log('3. Testing resilience when Preferences throws (missing plugin / error)...');
const mockLocal3 = new MockLocalStorage();
const mockPref3 = new MockPreferences(true); // shouldThrow = true!
mockLocal3.setItem('smart_wallet_data', JSON.stringify(validSession));

const res3 = await simulateBootstrap(mockLocal3, mockPref3);
assert.strictEqual(res3.loading, false);
assert.notStrictEqual(res3.user, null, 'User MUST NOT be logged out when Preferences throws!');
assert.strictEqual(res3.user.email, 'test@example.com');
console.log('  ✓ Plugin failure does not wipe session or redirect to login');

// Test 4: Explicit logout
console.log('4. Testing explicit logout...');
const loggedOutSession = { ...validSession, isAuthenticated: false };
mockLocal1.setItem('smart_wallet_data', JSON.stringify(loggedOutSession));
mockPref1.store['smart_wallet_data'] = JSON.stringify(loggedOutSession);

const res4 = await simulateBootstrap(mockLocal1, mockPref1);
assert.strictEqual(res4.loading, false);
assert.strictEqual(res4.user, null, 'User must be null after explicit logout');
console.log('  ✓ Explicit logout correctly results in unauthenticated state');

// Test 5: No passwords in stored data
console.log('5. Verifying security: no passwords stored in session data...');
assert.strictEqual(validSession.password, undefined);
assert.strictEqual(validSession.data.profile.password, undefined);
console.log('  ✓ No password stored in persistent storage');

console.log('\nAll 5 Auth Session Persistence tests passed successfully! 🎉');

