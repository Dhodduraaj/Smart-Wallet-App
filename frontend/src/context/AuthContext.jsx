import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../lib/api';
import { getLocalProfile, saveLocalProfile } from '../lib/db';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Bootstrap (Runs once on app startup)
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        // Android WebView safety: fallback to local profile from IndexedDB if localStorage lacks it
        const dbProfile = await getLocalProfile();
        
        if (token && (storedUser || dbProfile)) {
          const userObj = storedUser ? JSON.parse(storedUser) : dbProfile;
          setUser(userObj);
        }
      } catch (err) {
        console.error('[Auth Bootstrap] Failed to load local profile:', err);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();

    // Listen for logout events
    const handleLogoutEvent = () => {
      setUser(null);
    };
    window.addEventListener('auth-logout', handleLogoutEvent);

    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  const login = async (email, password) => {
    window.__isLoggingIn = true;
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { token, ...userData } = response.data;
      
      // Save data locally
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      await saveLocalProfile(userData, true);
      
      setUser(userData);
      return userData;
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const register = async (fullName, email, password) => {
    window.__isLoggingIn = true;
    try {
      const response = await api.post('/api/auth/register', {
        fullName,
        email,
        password,
      });
      const { token, ...userData } = response.data;
      
      // Save data locally
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      await saveLocalProfile(userData, true);
      
      setUser(userData);
      return userData;
    } finally {
      window.__isLoggingIn = false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/api/auth/me');
      const userData = response.data;
      localStorage.setItem('user', JSON.stringify(userData));
      await saveLocalProfile(userData, true);
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
