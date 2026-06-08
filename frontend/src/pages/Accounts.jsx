import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Card, CardContent, Typography, Box, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, IconButton, CircularProgress,
  Chip, Avatar,
} from '@mui/material';
import {
  AddOutlined, EditOutlined, DeleteOutlineOutlined,
  AccountBalanceOutlined, CreditCardOutlined, WalletOutlined,
  MoreVertOutlined,
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const accountTypeIcons = {
  CASH: <WalletOutlined />,
  BANK: <AccountBalanceOutlined />,
  CREDIT_CARD: <CreditCardOutlined />,
  OTHERS: <MoreVertOutlined />,
};

const accountTypeColors = {
  CASH: '#10b981',
  BANK: '#6366f1',
  CREDIT_CARD: '#f59e0b',
  OTHERS: '#6b7280',
};

const MANUAL_ACCOUNT_TYPES = [
  { value: 'BANK', label: 'Bank' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'OTHERS', label: 'Others' },
];

const emptyForm = { accountName: '', accountType: 'BANK', currentBalance: '0' };

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/api/accounts');
      setAccounts(res.data);
    } catch { toast.error('Failed to load accounts'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (acc) => {
    setEditId(acc.id);
    setForm({
      accountName: acc.accountName,
      accountType: acc.accountType,
      currentBalance: String(acc.currentBalance),
    });
    setDialogOpen(true);
  };

  const isCashAccount = (acc) => acc.accountType === 'CASH';
  const editingCash = editId && form.accountType === 'CASH';

  const handleSave = async () => {
    if (!form.accountName.trim()) { toast.error('Account name is required'); return; }
    if (!editId && form.accountType === 'CASH') {
      toast.error('Cash account is created automatically');
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form, currentBalance: parseFloat(form.currentBalance) || 0 };
      if (editId) {
        await api.put(`/api/accounts/${editId}`, payload);
        toast.success('Account updated');
      } else {
        await api.post('/api/accounts', payload);
        toast.success('Account created');
      }
      setDialogOpen(false);
      fetchAccounts();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save account'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id, acc) => {
    if (isCashAccount(acc)) {
      toast.error('The default Cash account cannot be deleted');
      return;
    }
    if (!window.confirm('Delete this account? Related transactions may be affected.')) return;
    try { await api.delete(`/api/accounts/${id}`); toast.success('Account deleted'); fetchAccounts(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to delete account'); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}><CircularProgress /></Box>;

  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.currentBalance), 0);

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.5px' }}>Accounts</Typography>
          <Typography variant="body2" color="text.secondary">
            Total Balance: <strong>₹{totalBalance.toFixed(2)}</strong>
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate}>Add Account</Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))',
          },
          gap: { xs: 2, sm: 3 },
          width: '100%',
        }}
      >
        {accounts.map((acc) => {
          const color = accountTypeColors[acc.accountType] || '#6b7280';
          const cash = isCashAccount(acc);
          return (
            <Card key={acc.id} sx={{ position: 'relative', overflow: 'hidden', borderTop: `3px solid ${color}`, width: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Avatar sx={{ bgcolor: `${color}20`, color, borderRadius: 2 }}>
                    {accountTypeIcons[acc.accountType] || <AccountBalanceOutlined />}
                  </Avatar>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => openEdit(acc)} aria-label="Edit account">
                      <EditOutlined fontSize="small" />
                    </IconButton>
                    {!cash && (
                      <IconButton size="small" color="error" onClick={() => handleDelete(acc.id, acc)} aria-label="Delete account">
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, wordBreak: 'break-word' }}>{acc.accountName}</Typography>
                <Chip label={acc.accountType} size="small" sx={{ mb: 2, bgcolor: `${color}15`, color, fontWeight: 600, borderRadius: 1.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 400 }}>₹{parseFloat(acc.currentBalance).toFixed(2)}</Typography>
              </CardContent>
            </Card>
          );
        })}

        {accounts.length === 0 && (
          <Card sx={{ p: 6, textAlign: 'center', gridColumn: '1 / -1' }}>
            <AccountBalanceOutlined sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">No accounts yet</Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
              Your Cash account is created automatically. Add a bank or card account to get started.
            </Typography>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate}>Add Account</Button>
          </Card>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? 'Edit Account' : 'Create Account'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Account Name"
            value={form.accountName}
            onChange={(e) => setForm({ ...form, accountName: e.target.value })}
            required
            fullWidth
            disabled={editingCash}
          />
          {editingCash ? (
            <TextField
              label="Account Type"
              value="Cash (default)"
              fullWidth
              disabled
              helperText="Default cash account — type cannot be changed"
            />
          ) : (
            <TextField
              select
              label="Account Type"
              value={form.accountType}
              onChange={(e) => setForm({ ...form, accountType: e.target.value })}
              fullWidth
            >
              {MANUAL_ACCOUNT_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Current Balance (₹)"
            type="number"
            value={form.currentBalance}
            onChange={(e) => setForm({ ...form, currentBalance: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={submitting}>
            {submitting ? <CircularProgress size={20} /> : editId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Accounts;
