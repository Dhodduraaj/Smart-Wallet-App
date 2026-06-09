import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Button, CircularProgress, Box
} from '@mui/material';
import { toast } from 'react-hot-toast';
import api from '../lib/api';

const SelfTransferDialog = ({ open, onClose }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('Self Transfer');

  useEffect(() => {
    if (open) {
      fetchAccounts();
      setAmount('');
      setNotes('Self Transfer');
    }
  }, [open]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/accounts');
      const data = res.data || [];
      setAccounts(data);
      if (data.length > 0) {
        setFromAccount(data[0].id);
        if (data.length > 1) {
          setToAccount(data[1].id);
        } else {
          setToAccount('');
        }
      }
    } catch (err) {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!fromAccount || !toAccount || !amount) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (fromAccount === toAccount) {
      toast.error('Source and destination accounts must be different');
      return;
    }
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const sourceAcc = accounts.find(a => a.id === fromAccount);
    if (sourceAcc && transferAmount > parseFloat(sourceAcc.currentBalance)) {
      toast.error('Insufficient funds in the source account');
      return;
    }

    setSubmitting(true);
    try {
      const destAcc = accounts.find(a => a.id === toAccount);
      const today = new Date().toISOString().split('T')[0];

      // 1. Post expense to source account
      await api.post('/api/expenses', {
        accountId: fromAccount,
        description: `Transfer to ${destAcc.accountName}`,
        amount: transferAmount,
        category: 'Others',
        paymentMode: 'Bank Transfer',
        expenseDate: today,
        notes: notes || 'Self Transfer',
        createdAt: new Date().toISOString()
      });

      // 2. Post income to destination account
      await api.post('/api/incomes', {
        accountId: toAccount,
        description: `Transfer from ${sourceAcc.accountName}`,
        amount: transferAmount,
        incomeDate: today,
        notes: notes || 'Self Transfer'
      });

      toast.success('Self transfer successful');
      onClose();
      // Reload page to refresh balances
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Self transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Self Transfer</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            <TextField
              select
              label="From Account"
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              fullWidth
              required
            >
              {accounts.map(a => (
                <MenuItem key={a.id} value={a.id}>
                  {a.accountName} (₹{parseFloat(a.currentBalance).toFixed(2)})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="To Account"
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
              fullWidth
              required
            >
              {accounts.map(a => (
                <MenuItem key={a.id} value={a.id}>
                  {a.accountName} (₹{parseFloat(a.currentBalance).toFixed(2)})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Amount (₹)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              required
            />

            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" color="error" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleTransfer} disabled={submitting || loading}>
          {submitting ? <CircularProgress size={20} /> : 'Transfer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SelfTransferDialog;
