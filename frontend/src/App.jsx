import React, { useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { Toaster } from 'react-hot-toast';
import { getTheme } from './theme';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PushNotificationBridge from './components/PushNotificationBridge';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Expenses from './pages/Expenses';
import Income from './pages/Income';
import Reminders from './pages/Reminders';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import About from './pages/About';
import Calculator from './pages/Calculator';

const AppRoutes = ({ darkMode, toggleDarkMode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/onboarding" replace /> : <Register />} />

      {/* Onboarding route */}
      <Route
        path="/onboarding"
        element={
          user ? (
            user.onboardingCompleted === true ? <Navigate to="/dashboard" replace /> : <Onboarding />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Root route - redirect based on onboarding status */}
      <Route
        path="/"
        element={
          user ? (
            user.onboardingCompleted === true ? <Navigate to="/dashboard" replace /> : <Navigate to="/onboarding" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Protected routes - only accessible after onboarding */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Dashboard />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Accounts />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Expenses />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/income"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Income />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/reminders"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Reminders />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/calculator"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Calculator />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Reports />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            {user && user.onboardingCompleted === false ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
                <Profile />
              </Layout>
            )}
          </ProtectedRoute>
        }
      />

      {/* About page - public route */}
      <Route
        path="/about"
        element={
          <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
            <About />
          </Layout>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  const [darkMode, setDarkMode] = useState(true);
  const theme = useMemo(() => getTheme(darkMode ? 'dark' : 'light'), [darkMode]);
  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: darkMode ? '#1f2937' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#0f172a',
            borderRadius: '12px',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
          },
        }}
      />
      <AuthProvider>
        <PushNotificationBridge />
        <Router>
          <AppRoutes darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
