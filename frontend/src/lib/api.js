import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8081',
  headers: {
    'Content-Type': 'application/json',
  },
});

let isLoggingOut = false;

// Request interceptor to add the JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
