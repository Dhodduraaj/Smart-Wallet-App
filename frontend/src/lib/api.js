import axios from 'axios';
import * as localDb from './db';
import { generatePdfReportLocal } from './pdf';
import { sync } from './sync';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8081',
  headers: {
    'Content-Type': 'application/json',
  },
});

let isLoggingOut = false;

// Custom Offline-First Axios Adapter
const defaultAdapter = axios.defaults.adapter;

const customOfflineAdapter = async (config) => {
  const url = config.url || '';
  const method = (config.method || 'GET').toUpperCase();
  const cleanUrl = url.split('?')[0];

  const queryParams = {};
  const urlParts = url.split('?');
  if (urlParts.length > 1) {
    const searchParams = new URLSearchParams(urlParts[1]);
    for (const [key, value] of searchParams.entries()) {
      queryParams[key] = value;
    }
  }
  if (config.params) {
    Object.assign(queryParams, config.params);
  }

  const mockResponse = (data, status = 200) => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config,
    request: {}
  });

  const isOnline = navigator.onLine;

  const isOnlineOnlyAction = 
    cleanUrl.includes('/api/auth/login') ||
    cleanUrl.includes('/api/auth/register') ||
    cleanUrl.includes('/api/user/change-password');

  if (!isOnline && isOnlineOnlyAction) {
    return Promise.reject({
      response: {
        data: { message: 'Internet connection is required for this action.' },
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config
      }
    });
  }

  try {
    // 1. Profile Avatar
    if (cleanUrl.includes('/api/user/profile-avatar') && method === 'PUT') {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const avatar = payload?.avatar;
      const profile = await localDb.getLocalProfile();
      if (profile) {
        profile.avatar = avatar;
        await localDb.saveLocalProfile(profile, false);
      }
      setTimeout(() => sync(), 100);
      return mockResponse({ avatar });
    }

    // 2. Auth /me (GET) - Offline only fallback
    if (cleanUrl.includes('/api/auth/me') && method === 'GET') {
      if (!isOnline) {
        const profile = await localDb.getLocalProfile();
        if (profile) {
          return mockResponse(profile);
        }
        return Promise.reject({
          response: {
            data: { message: 'Unauthorized (offline)' },
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config
          }
        });
      }
    }

    // 3. Accounts CRUD
    if (cleanUrl.endsWith('/api/accounts')) {
      if (method === 'GET') {
        const accounts = await localDb.getLocalAccounts();
        setTimeout(() => sync(), 100);
        return mockResponse(accounts);
      }
      if (method === 'POST') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const created = await localDb.saveLocalAccount(payload, false);
        setTimeout(() => sync(), 100);
        return mockResponse(created, 201);
      }
    }

    const accountIdMatch = cleanUrl.match(/\/api\/accounts\/([^/]+)$/);
    if (accountIdMatch) {
      const id = accountIdMatch[1];
      if (method === 'GET') {
        const acc = await localDb.getLocalAccount(id);
        if (!acc) throw { status: 404, message: 'Account not found' };
        return mockResponse(acc);
      }
      if (method === 'PUT') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const updated = await localDb.saveLocalAccount({ ...payload, id }, false);
        setTimeout(() => sync(), 100);
        return mockResponse(updated);
      }
      if (method === 'DELETE') {
        await localDb.deleteLocalAccount(id, false);
        setTimeout(() => sync(), 100);
        return mockResponse(null, 204);
      }
    }

    // 4. Expenses CRUD
    if (cleanUrl.endsWith('/api/expenses')) {
      if (method === 'GET') {
        const res = await localDb.getLocalExpenses(queryParams);
        setTimeout(() => sync(), 100);
        return mockResponse(res);
      }
      if (method === 'POST') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const created = await localDb.saveLocalExpense(payload, false);
        setTimeout(() => sync(), 100);
        return mockResponse(created, 201);
      }
    }

    const expenseIdMatch = cleanUrl.match(/\/api\/expenses\/([^/]+)$/);
    if (expenseIdMatch) {
      const id = expenseIdMatch[1];
      if (method === 'GET') {
        const exp = await localDb.getLocalExpense(id);
        if (!exp) throw { status: 404, message: 'Expense not found' };
        return mockResponse(exp);
      }
      if (method === 'PUT') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const updated = await localDb.saveLocalExpense({ ...payload, id }, false);
        setTimeout(() => sync(), 100);
        return mockResponse(updated);
      }
      if (method === 'DELETE') {
        await localDb.deleteLocalExpense(id, false);
        setTimeout(() => sync(), 100);
        return mockResponse(null, 204);
      }
    }

    // 5. Incomes CRUD
    if (cleanUrl.endsWith('/api/incomes')) {
      if (method === 'GET') {
        const res = await localDb.getLocalIncomes(queryParams);
        setTimeout(() => sync(), 100);
        return mockResponse(res);
      }
      if (method === 'POST') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const created = await localDb.saveLocalIncome(payload, false);
        setTimeout(() => sync(), 100);
        return mockResponse(created, 201);
      }
    }

    const incomeIdMatch = cleanUrl.match(/\/api\/incomes\/([^/]+)$/);
    if (incomeIdMatch) {
      const id = incomeIdMatch[1];
      if (method === 'GET') {
        const inc = await localDb.getLocalIncome(id);
        if (!inc) throw { status: 404, message: 'Income not found' };
        return mockResponse(inc);
      }
      if (method === 'PUT') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const updated = await localDb.saveLocalIncome({ ...payload, id }, false);
        setTimeout(() => sync(), 100);
        return mockResponse(updated);
      }
      if (method === 'DELETE') {
        await localDb.deleteLocalIncome(id, false);
        setTimeout(() => sync(), 100);
        return mockResponse(null, 204);
      }
    }

    // 6. Reminders CRUD
    if (cleanUrl.endsWith('/api/reminders/daily')) {
      if (method === 'GET') {
        const res = await localDb.getLocalDailyReminderConfig();
        return mockResponse(res);
      }
      if (method === 'PUT') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        await localDb.saveLocalDailyReminderConfig(payload, false);
        setTimeout(() => sync(), 100);
        return mockResponse(payload);
      }
    }

    if (cleanUrl.endsWith('/api/reminders/upcoming')) {
      if (method === 'GET') {
        const res = await localDb.getLocalUpcomingPayments();
        setTimeout(() => sync(), 100);
        return mockResponse(res);
      }
      if (method === 'POST') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const created = await localDb.saveLocalUpcomingPayment(payload, false);
        setTimeout(() => sync(), 100);
        return mockResponse(created, 201);
      }
    }

    const reminderIdMatch = cleanUrl.match(/\/api\/reminders\/upcoming\/([^/]+)$/);
    if (reminderIdMatch) {
      const id = reminderIdMatch[1];
      if (method === 'PUT') {
        const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        const updated = await localDb.saveLocalUpcomingPayment({ ...payload, id }, false);
        setTimeout(() => sync(), 100);
        return mockResponse(updated);
      }
      if (method === 'DELETE') {
        await localDb.deleteLocalUpcomingPayment(id, false);
        setTimeout(() => sync(), 100);
        return mockResponse(null, 204);
      }
    }

    const reminderCompletedMatch = cleanUrl.match(/\/api\/reminders\/upcoming\/([^/]+)\/completed$/);
    if (reminderCompletedMatch && method === 'PATCH') {
      const id = reminderCompletedMatch[1];
      const completed = queryParams.completed === 'true' || queryParams.completed === true;
      const updated = await localDb.toggleUpcomingPaymentCompletedLocal(id, completed, false);
      setTimeout(() => sync(), 100);
      return mockResponse(updated);
    }

    // 7. Dashboard statistics
    if (cleanUrl.endsWith('/api/dashboard/summary') && method === 'GET') {
      const summary = await localDb.getLocalDashboardSummary();
      setTimeout(() => sync(), 100);
      return mockResponse(summary);
    }

    // 8. Reports statistics & PDF
    if (cleanUrl.endsWith('/api/reports/data') && method === 'GET') {
      const { startDate, endDate } = queryParams;
      const res = await localDb.getLocalReportData(startDate, endDate);
      return mockResponse(res);
    }

    if (cleanUrl.endsWith('/api/reports/pdf') && method === 'GET') {
      const { startDate, endDate, omitCategory = 'false' } = queryParams;
      const reportDto = await localDb.getLocalReportData(startDate, endDate);
      const pdfBlob = generatePdfReportLocal(reportDto, omitCategory === 'true');
      return mockResponse(pdfBlob);
    }

    // 9. Onboarding completion
    if (cleanUrl.includes('/api/onboarding/complete') && method === 'POST') {
      const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const accounts = payload?.accounts || [];
      
      // Save all provided accounts
      for (const acc of accounts) {
        await localDb.saveLocalAccount(acc, false);
      }
      
      // Update onboarding status in profile
      const profile = await localDb.getLocalProfile();
      if (profile) {
        profile.onboardingCompleted = true;
        await localDb.saveLocalProfile(profile, false);
      }
      
      setTimeout(() => sync(), 100);
      return mockResponse({ success: true });
    }
  } catch (err) {
    console.error(`Error processing offline request for ${url}:`, err);
    return Promise.reject({
      response: {
        data: { message: err.message || 'Offline processing error' },
        status: err.status || 500,
        statusText: 'Internal Server Error',
        headers: {},
        config
      }
    });
  }

  // Fallback to network
  // To prevent infinite recursion, we MUST remove this adapter from config before calling defaultAdapter!
  const netConfig = { ...config };
  delete netConfig.adapter;

  if (typeof defaultAdapter === 'function') {
    return defaultAdapter(netConfig);
  } else if (Array.isArray(defaultAdapter)) {
    return defaultAdapter[0](netConfig);
  }
  return axios.defaults.adapter(netConfig);
};

// Request interceptor to add the JWT token and custom adapter
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.adapter = customOfflineAdapter;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401 Unauthorized errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      logOutUser(true);
    }
    return Promise.reject(error);
  }
);

function logOutUser(sessionExpired = false) {
  if (isLoggingOut) return;
  isLoggingOut = true;

  localStorage.removeItem('token');
  localStorage.removeItem('user');

  if (sessionExpired) {
    sessionStorage.setItem('authMessage', 'Session expired. Please login again.');
  }

  window.dispatchEvent(new Event('auth-logout'));

  if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
    window.location.href = '/login';
  }
}

export default api;
