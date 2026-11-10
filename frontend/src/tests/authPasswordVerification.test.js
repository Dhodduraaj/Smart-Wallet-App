import assert from 'assert';

/**
 * Test Suite for Authentication Password Verification and Session Resilience
 */

console.log('--- Starting Auth Password Verification & Session Tests ---');

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

// Mock Backend API
class MockAuthApi {
  constructor() {
    this.users = new Map([
      ['john@example.com', { password: 'CorrectPassword123!', fullName: 'John Doe', userId: 'user-1' }]
    ]);
  }

  async login(email, password) {
    const user = this.users.get(email.toLowerCase());
    if (!user || user.password !== password) {
      const err = new Error('Invalid email or password');
      err.response = { status: 401, data: { message: 'Invalid email or password' } };
      throw err;
    }
    return {
      data: {
        token: 'mock-jwt-token-xyz-12345',
        userId: user.userId,
        email: email.toLowerCase(),
        fullName: user.fullName
      }
    };
  }

  async me(token) {
    if (!token || token !== 'mock-jwt-token-xyz-12345') {
      const err = new Error('Unauthorized');
      err.response = { status: 401, data: { message: 'Unauthorized' } };
      throw err;
    }
    return {
      data: {
        userId: 'user-1',
        email: 'john@example.com',
        fullName: 'John Doe'
      }
    };
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

// Simulate login logic
const simulateLogin = async (mockApi, localStorage, preferences, email, password, initialStore) => {
  let user = null;
  const store = initialStore || {
    isAuthenticated: false,
    email: '',
    localUserId: 'init-uuid',
    data: { profile: { fullName: '', email: '', onboardingCompleted: false } }
  };

  try {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Authenticate against API
    const response = await mockApi.login(normalizedEmail, password);
    const { token, userId, fullName } = response.data;
    if (!token) throw new Error('Missing token');

    // 2. Persist token
    localStorage.setItem('token', token);
    await preferences.set({ key: 'token', value: token });

    // 3. Update store
    store.email = normalizedEmail;
    store.localUserId = userId;
    store.isAuthenticated = true;
    store.data.profile = {
      fullName: fullName,
      email: normalizedEmail,
      userId: userId,
      onboardingCompleted: true
    };

    localStorage.setItem('smart_wallet_data', JSON.stringify(store));
    await preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });

    user = buildUserProfile(store);
    return { success: true, user, store };
  } catch (err) {
    // If login failed, user remains null, isAuthenticated remains false!
    return { success: false, error: err.response?.data?.message || err.message, user: null, store };
  }
};

// Simulate bootstrap logic
const simulateBootstrap = async (mockApi, localStorage, preferences, isOnline = true, forceApiError = null) => {
  let user = null;
  let loading = true;

  try {
    let prefStoredData = null;
    let prefToken = null;

    try {
      const pData = await preferences.get({ key: 'smart_wallet_data' });
      prefStoredData = pData?.value;
      const pToken = await preferences.get({ key: 'token' });
      prefToken = pToken?.value;
    } catch {}

    const localRaw = localStorage.getItem('smart_wallet_data');
    if (prefStoredData && !localRaw) {
      localStorage.setItem('smart_wallet_data', prefStoredData);
    }
    if (prefToken && !localStorage.getItem('token')) {
      localStorage.setItem('token', prefToken);
    }

    const raw = localStorage.getItem('smart_wallet_data');
    const store = raw ? JSON.parse(raw) : null;
    const token = localStorage.getItem('token') || prefToken;

    if (store && store.isAuthenticated === true && store.data && store.data.profile) {
      if (token && isOnline) {
        try {
          if (forceApiError) {
            throw forceApiError;
          }
          const meRes = await mockApi.me(token);
          if (meRes.data) {
            store.localUserId = meRes.data.userId;
            store.data.profile.userId = meRes.data.userId;
            store.data.profile.fullName = meRes.data.fullName;
            localStorage.setItem('smart_wallet_data', JSON.stringify(store));
          }
          user = buildUserProfile(store);
        } catch (authErr) {
          if (authErr.response?.status === 401) {
            // Token invalidated
            localStorage.removeItem('token');
            await preferences.remove({ key: 'token' });
            store.isAuthenticated = false;
            localStorage.setItem('smart_wallet_data', JSON.stringify(store));
            await preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
            user = null;
            return { user, loading: false };
          } else {
            // Cold start or network error: retain local session
            user = buildUserProfile(store);
          }
        }
      } else {
        // Offline or stored session
        user = buildUserProfile(store);
      }
      await preferences.set({ key: 'smart_wallet_data', value: JSON.stringify(store) });
    } else {
      user = null;
    }
  } catch (err) {
    user = null;
  } finally {
    loading = false;
  }

  return { user, loading };
};

// ------------------- TEST CASES -------------------

// Test 1: Reject incorrect password
console.log('1. Testing login with INCORRECT password...');
const mockApi = new MockAuthApi();
const local1 = new MockLocalStorage();
const pref1 = new MockPreferences();

const failRes1 = await simulateLogin(mockApi, local1, pref1, 'john@example.com', 'WrongPassword123');
assert.strictEqual(failRes1.success, false, 'Login must fail for incorrect password');
assert.strictEqual(failRes1.user, null, 'User must remain null on failed login');
assert.strictEqual(failRes1.store.isAuthenticated, false, 'isAuthenticated must remain false on failed login');
assert.strictEqual(local1.getItem('token'), null, 'No token must be stored on failed login');
console.log('  ✓ Incorrect password was rejected and unauthenticated state preserved');

// Test 2: Reject completely random password
console.log('2. Testing login with completely RANDOM password...');
const failRes2 = await simulateLogin(mockApi, local1, pref1, 'john@example.com', 'random_gibberish_987');
assert.strictEqual(failRes2.success, false);
assert.strictEqual(failRes2.user, null);
assert.strictEqual(failRes2.store.isAuthenticated, false);
console.log('  ✓ Random password was rejected');

// Test 3: Reject non-existent user
console.log('3. Testing login for NON-EXISTENT user...');
const failRes3 = await simulateLogin(mockApi, local1, pref1, 'nobody@example.com', 'SomePassword123');
assert.strictEqual(failRes3.success, false);
assert.strictEqual(failRes3.user, null);
assert.strictEqual(failRes3.store.isAuthenticated, false);
console.log('  ✓ Non-existent user was rejected');

// Test 4: Accept correct password
console.log('4. Testing login with CORRECT password...');
const passRes = await simulateLogin(mockApi, local1, pref1, 'john@example.com', 'CorrectPassword123!');
assert.strictEqual(passRes.success, true, 'Login must succeed with correct password');
assert.notStrictEqual(passRes.user, null, 'User must be populated');
assert.strictEqual(passRes.user.email, 'john@example.com');
assert.strictEqual(passRes.user.fullName, 'John Doe');
assert.strictEqual(passRes.store.isAuthenticated, true);
assert.strictEqual(local1.getItem('token'), 'mock-jwt-token-xyz-12345');
assert.strictEqual(pref1.store['token'], 'mock-jwt-token-xyz-12345');
console.log('  ✓ Correct password accepted, token stored in localStorage & Preferences');

// Test 5: App restart with persistent session (online)
console.log('5. Testing app restart with persistent session (online)...');
const restartRes1 = await simulateBootstrap(mockApi, local1, pref1, true);
assert.strictEqual(restartRes1.loading, false);
assert.notStrictEqual(restartRes1.user, null, 'User must remain authenticated across restart');
assert.strictEqual(restartRes1.user.email, 'john@example.com');
console.log('  ✓ App restart verified online session and restored authenticated user');

// Test 6: App restart when offline (offline-first persistence)
console.log('6. Testing app restart when offline (airplane mode)...');
const restartRes2 = await simulateBootstrap(mockApi, local1, pref1, false);
assert.strictEqual(restartRes2.loading, false);
assert.notStrictEqual(restartRes2.user, null, 'User must remain authenticated when offline');
assert.strictEqual(restartRes2.user.email, 'john@example.com');
console.log('  ✓ Offline app restart restored local authenticated session');

// Test 7: App restart when backend is cold-starting (network timeout / 503)
console.log('7. Testing app restart during backend cold-start / network timeout...');
const networkErr = new Error('Network timeout');
networkErr.response = { status: 504, data: { message: 'Gateway Timeout' } };
const restartRes3 = await simulateBootstrap(mockApi, local1, pref1, true, networkErr);
assert.strictEqual(restartRes3.loading, false);
assert.notStrictEqual(restartRes3.user, null, 'User must NOT be logged out during server cold start');
assert.strictEqual(restartRes3.user.email, 'john@example.com');
console.log('  ✓ Server cold-start resilience: local session maintained without logging out user');

// Test 8: App restart with expired/revoked token (401)
console.log('8. Testing app restart when token is expired/revoked on backend (401)...');
const tokenExpiredErr = new Error('Unauthorized');
tokenExpiredErr.response = { status: 401, data: { message: 'Token expired' } };
const restartRes4 = await simulateBootstrap(mockApi, local1, pref1, true, tokenExpiredErr);
assert.strictEqual(restartRes4.loading, false);
assert.strictEqual(restartRes4.user, null, 'User must be logged out if server rejects token with 401');
assert.strictEqual(local1.getItem('token'), null, 'Token must be removed from localStorage');
assert.strictEqual(pref1.store['token'], undefined, 'Token must be removed from Preferences');
console.log('  ✓ Expired token correctly invalidates session and prompts login');

console.log('\nAll 8 Password Verification & Session Resilience tests passed successfully! 🚀');

