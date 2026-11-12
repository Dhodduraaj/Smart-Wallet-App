import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, hasLocalFinancialData } from '../context/AuthContext';
import { getStoredData } from '../lib/db';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  InputAdornment,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip
} from '@mui/material';
import {
  EmailOutlined,
  LockOutlined,
  AccountBalanceWalletOutlined,
  CheckCircle,
  RadioButtonUnchecked,
  CloudSync,
  Storage,
  VpnKey,
  CloudDone
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import PasswordField from '../components/PasswordField';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localDataInfo, setLocalDataInfo] = useState(null);

  // Migration status state
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationStep, setMigrationStep] = useState(0);
  const [migrationStatusText, setMigrationStatusText] = useState('');
  const [migrationError, setMigrationError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const authMessage = sessionStorage.getItem('authMessage');
    if (authMessage) {
      setError(authMessage);
      sessionStorage.removeItem('authMessage');
    }

    try {
      const store = getStoredData();
      if (hasLocalFinancialData(store)) {
        const expenses = store.data?.expenses?.length || 0;
        const incomes = store.data?.incomes?.length || 0;
        const people = store.data?.people?.length || 0;
        const peopleLedger = store.data?.peopleLedger?.length || 0;
        const accounts = store.data?.accounts?.length || 0;
        const transfers = store.data?.transfers?.length || 0;
        const totalRecords = expenses + incomes + peopleLedger + transfers;

        const detectedEmail = store.email || store.data?.profile?.email || '';
        setLocalDataInfo({
          expenses,
          incomes,
          people,
          peopleLedger,
          accounts,
          transfers,
          totalRecords,
          email: detectedEmail
        });
        if (detectedEmail) {
          setEmail(detectedEmail);
        }
      }
    } catch (e) {
      console.warn('Failed to detect local data on Login mount:', e);
    }
  }, []);

  const handleMigrationProgress = (progress) => {
    setMigrationStep(progress.step);
    setMigrationStatusText(progress.detail || progress.title || '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setError('');
    setMigrationError('');
    setSubmitting(true);

    const hasData = localDataInfo && localDataInfo.totalRecords > 0;
    if (hasData) {
      setMigrationOpen(true);
      setMigrationStep(1);
      setMigrationStatusText('Local account detected. Starting synchronization...');
    }

    try {
      await login(email, password, handleMigrationProgress);
      
      if (hasData) {
        setMigrationStep(5);
        setMigrationStatusText('Migration completed successfully!');
        setTimeout(() => {
          setMigrationOpen(false);
          toast.success('Account recovered and data synchronized!');
          navigate('/');
        }, 1200);
      } else {
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Invalid email or password. Please try again.';
      if (hasData) {
        setMigrationError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { title: 'Local account detected', desc: localDataInfo ? `${localDataInfo.totalRecords} records found on this device` : 'Local device records' },
    { title: 'Cloud account checked', desc: 'Connecting to Neon cloud database' },
    { title: 'Account recovery completed', desc: 'User credentials verified with cloud' },
    { title: 'Records identified & synchronized', desc: 'Migrated records into cloud database' },
    { title: 'Migration completed', desc: 'Secure 30-day session established' },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 45%), radial-gradient(circle at 90% 80%, rgba(168, 85, 247, 0.15) 0%, transparent 45%)',
        bgcolor: '#0b0f19',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 460, width: '100%', borderRadius: 4, backdropFilter: 'blur(20px)', bgcolor: 'rgba(17, 24, 39, 0.85)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' }}>
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'primary.main', display: 'flex', mb: 2 }}>
              <AccountBalanceWalletOutlined sx={{ color: '#ffffff', fontSize: 32 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              Welcome Back
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Log in to manage your finances
            </Typography>
          </Box>

          {/* Offline Data Detected Notification */}
          {localDataInfo && localDataInfo.totalRecords > 0 && (
            <Alert
              severity="info"
              icon={<CloudSync fontSize="inherit" />}
              sx={{
                mb: 3,
                borderRadius: 2,
                bgcolor: 'rgba(99, 102, 241, 0.12)',
                color: '#c7d2fe',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                '& .MuiAlert-icon': { color: '#818cf8' }
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Offline Account Detected
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.82rem', mb: 1 }}>
                Found <strong>{localDataInfo.totalRecords} records</strong> ({localDataInfo.expenses} expenses, {localDataInfo.incomes} incomes, {localDataInfo.people} contacts) saved locally on this device.
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)' }}>
                Enter your password to recover your account and synchronize all data with the cloud database.
              </Typography>
            </Alert>
          )}

          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, textAlign: 'left' }}>
              <TextField
                label="Email Address"
                type="email"
                variant="outlined"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlined color="action" />
                    </InputAdornment>
                  ),
                }}
              />

              <PasswordField
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                authPage
                autoComplete="current-password"
                startAdornment={<LockOutlined sx={{ color: 'rgba(255,255,255,0.55)' }} />}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                sx={{
                  mt: 1,
                  py: 1.5,
                  fontWeight: 700,
                  textTransform: 'none',
                  fontSize: '1rem',
                  borderRadius: 2
                }}
              >
                {submitting ? (
                  <CircularProgress size={24} color="inherit" />
                ) : localDataInfo && localDataInfo.totalRecords > 0 ? (
                  'Log In & Sync Data'
                ) : (
                  'Log In'
                )}
              </Button>
            </Box>
          </form>

          {/* Link to Register */}
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Don't have an account?{' '}
              <Link to="/register" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                Sign Up
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Migration Status Dialog */}
      <Dialog
        open={migrationOpen}
        onClose={() => {
          if (migrationError) setMigrationOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: '#111827',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            p: 1
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CloudSync sx={{ color: '#818cf8', fontSize: 28 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
              Account Recovery & Migration
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Synchronizing mobile data with Neon PostgreSQL
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {migrationError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {migrationError}
            </Alert>
          ) : (
            <Box sx={{ mb: 2.5 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (migrationStep / 5) * 100)}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: '#6366f1'
                  }
                }}
              />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'rgba(255, 255, 255, 0.8)', fontStyle: 'italic' }}>
                {migrationStatusText}
              </Typography>
            </Box>
          )}

          <List sx={{ pt: 0 }}>
            {steps.map((st, idx) => {
              const stepNum = idx + 1;
              const isCompleted = migrationStep > stepNum || (migrationStep === 5 && stepNum === 5);
              const isCurrent = migrationStep === stepNum && !migrationError;

              return (
                <ListItem key={idx} sx={{ px: 0, py: 0.8 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {isCompleted ? (
                      <CheckCircle sx={{ color: '#10b981', fontSize: 22 }} />
                    ) : isCurrent ? (
                      <CircularProgress size={18} sx={{ color: '#818cf8' }} />
                    ) : (
                      <RadioButtonUnchecked sx={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: 22 }} />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isCurrent ? 700 : isCompleted ? 600 : 400,
                          color: isCompleted ? '#ffffff' : isCurrent ? '#818cf8' : 'rgba(255, 255, 255, 0.5)'
                        }}
                      >
                        {st.title}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '0.75rem' }}>
                        {st.desc}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>

        {migrationError && (
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setMigrationOpen(false)}
              variant="outlined"
              color="inherit"
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Close & Check Credentials
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
};

export default Login;
