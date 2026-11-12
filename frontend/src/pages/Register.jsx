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
  Grid,
} from '@mui/material';
import {
  EmailOutlined,
  LockOutlined,
  PersonOutlineOutlined,
  AccountBalanceWalletOutlined,
  CloudSync,
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import PasswordField from '../components/PasswordField';

const Register = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localDataInfo, setLocalDataInfo] = useState(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const store = getStoredData();
      if (hasLocalFinancialData(store)) {
        const expenses = store.data?.expenses?.length || 0;
        const incomes = store.data?.incomes?.length || 0;
        const people = store.data?.people?.length || 0;
        const peopleLedger = store.data?.peopleLedger?.length || 0;
        const totalRecords = expenses + incomes + peopleLedger;

        const detectedEmail = store.email || store.data?.profile?.email || '';
        const detectedName = store.data?.profile?.fullName || '';

        setLocalDataInfo({
          totalRecords,
          expenses,
          incomes,
          people,
          email: detectedEmail,
          fullName: detectedName
        });

        if (detectedEmail && !email) setEmail(detectedEmail);
        if (detectedName && !fullName && detectedName !== 'Local User') setFullName(detectedName);
      }
    } catch (e) {
      console.warn('Failed to detect local data on Register mount:', e);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setError('Please fill in all user details');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await register(fullName, email, password);
      toast.success(localDataInfo?.totalRecords > 0 ? 'Account recovered & data synchronized!' : 'Registration successful! Welcome.');
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'Registration failed. Email might already be registered.'
      );
    } finally {
      setSubmitting(false);
    }
  };

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
        py: 4,
      }}
    >
      <Card sx={{ maxWidth: 650, width: '100%', borderRadius: 4, backdropFilter: 'blur(20px)', bgcolor: 'rgba(17, 24, 39, 0.85)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)' }}>
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'primary.main', mb: 2 }}>
              <AccountBalanceWalletOutlined sx={{ color: '#ffffff', fontSize: 32 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
              Create Account
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Start tracking your budgets with smart indicators
            </Typography>
          </Box>

          {/* Local records notification */}
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
                Local Financial Records Detected
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                Found <strong>{localDataInfo.totalRecords} records</strong> on this device. Submitting will link and synchronize your existing local data with your cloud account safely without loss.
              </Typography>
            </Alert>
          )}

          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Grid container spacing={2} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'left' }}>
              <Grid item xs={12} sm={6} sx={{ width: 400, maxWidth: '100%' }}>
                <TextField
                  fullWidth
                  label="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineOutlined />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
    
              <Grid item xs={12} sm={6} sx={{ width: 400, maxWidth: '100%' }}>
                <TextField
                  fullWidth
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailOutlined />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
                  
              <Grid item xs={12} sx={{ width: 400, maxWidth: '100%', overflow: 'visible' }}>
                <PasswordField 
                  fullWidth={true}
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  authPage
                  autoComplete="new-password"
                  startAdornment={<LockOutlined sx={{ color: 'rgba(255,255,255,0.55)' }} />}
                />
              </Grid>

              <Grid item xs={12} sx={{ width: 400, maxWidth: '100%', mt: 2 }}>
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitting}
                  sx={{ py: 1.5, fontWeight: 700, borderRadius: 2, textTransform: 'none', fontSize: '1rem' }}
                >
                  {submitting ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : localDataInfo && localDataInfo.totalRecords > 0 ? (
                    'Register & Sync Existing Data'
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </Grid>
            </Grid>
          </form>

          {/* Link to Login */}
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{' '}
              <Link to="/login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                Log In
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Register;
