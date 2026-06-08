import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Grid,
  MenuItem,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  AddOutlined,
  DeleteOutlineOutlined,
  AccountBalanceWalletOutlined,
  ArrowForwardOutlined,
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const emptyAccount = { accountName: '', accountType: 'BANK', currentBalance: '0' };

const ONBOARDING_ACCOUNT_TYPES = [
  { value: 'BANK', label: 'Bank' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'OTHERS', label: 'Others' },
];

const Onboarding = () => {
  const [accounts, setAccounts] = useState([emptyAccount]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handleAddAccount = () => {
    setAccounts([...accounts, { ...emptyAccount }]);
  };

  const handleRemoveAccount = (index) => {
    if (accounts.length > 1) {
      setAccounts(accounts.filter((_, i) => i !== index));
    }
  };

  const handleAccountChange = (index, field, value) => {
    const updated = accounts.map((acc, i) => {
      if (i === index) {
        return { ...acc, [field]: value };
      }
      return acc;
    });
    setAccounts(updated);
  };

  const handleSkip = async () => {
    try {
      await api.post('/api/onboarding/complete');
      toast.success('Onboarding completed!');
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      toast.error('Failed to complete onboarding');
    }
  };

  const handleSubmit = async () => {
    const validAccounts = accounts.filter(acc => acc.accountName.trim() !== '');

    setSubmitting(true);
    try {
      const payload = validAccounts.map(acc => ({
        accountName: acc.accountName,
        accountType: acc.accountType,
        currentBalance: parseFloat(acc.currentBalance) || 0
      }));

      await api.post('/api/onboarding/complete', { accounts: payload });
      toast.success('Account setup completed!');
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save accounts');
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
        bgcolor: 'background.default',
        p: 2,
        py: 4,
      }}
    >
      <Card sx={{ maxWidth: 700, width: '100%', borderRadius: 2 }}>
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, textAlign: 'center' }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', mb: 2 }}>
              <AccountBalanceWalletOutlined sx={{ color: '#ffffff', fontSize: 32 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
              Set Up Your Accounts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              A Cash account is created for you automatically. Add bank or card accounts below (optional).
            </Typography>
          </Box>

          {/* Account Forms */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
            {accounts.map((acc, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <TextField
                  label="Account Name"
                  placeholder="e.g. SBI, Cash, HDFC"
                  value={acc.accountName}
                  onChange={(e) => handleAccountChange(index, 'accountName', e.target.value)}
                  sx={{ flexGrow: 2 }}
                  size="small"
                />
                <TextField
                  select
                  label="Type"
                  value={acc.accountType}
                  onChange={(e) => handleAccountChange(index, 'accountType', e.target.value)}
                  sx={{ width: 130 }}
                  size="small"
                >
                  {ONBOARDING_ACCOUNT_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Balance (₹)"
                  type="number"
                  value={acc.currentBalance}
                  onChange={(e) => handleAccountChange(index, 'currentBalance', e.target.value)}
                  sx={{ width: 130 }}
                  size="small"
                />
                {accounts.length > 1 && (
                  <IconButton onClick={() => handleRemoveAccount(index)} color="error" size="small">
                    <DeleteOutlineOutlined />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>

          <Button
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={handleAddAccount}
            sx={{ mb: 4, borderRadius: 1.5 }}
            fullWidth
          >
            Add Another Account
          </Button>

          <Divider sx={{ mb: 4 }} />

          {/* Actions */}
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Button
                variant="text"
                onClick={handleSkip}
                disabled={submitting}
                sx={{ borderRadius: 1.5 }}
                fullWidth
              >
                Skip for Now
              </Button>
            </Grid>
            <Grid item xs={6}>
              <Button
                variant="contained"
                endIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <ArrowForwardOutlined />}
                onClick={handleSubmit}
                disabled={submitting}
                sx={{ borderRadius: 1.5 }}
                fullWidth
              >
                {submitting ? 'Saving...' : 'Continue'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Onboarding;
