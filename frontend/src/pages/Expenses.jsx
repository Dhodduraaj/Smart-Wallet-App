import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import api from '../lib/api';
import {
  Box, Typography, Card, CardContent, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, IconButton, Chip, CircularProgress, Grid,
  InputAdornment, useMediaQuery, useTheme
} from '@mui/material';
import {
  AddOutlined, EditOutlined, DeleteOutlineOutlined, SearchOutlined, FilterListOutlined,
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const categories = ['Food', 'Grocery', 'Transport', 'Shopping', 'Medical', 'Education', 'Entertainment', 'Bills', 'Fuel', 'Others'];
const paymentModes = ['Cash', 'GPay', 'PhonePe', 'Bank Transfer', 'Debit Card', 'Credit Card'];
const categoryColors = { Food: '#ef4444', Grocery: '#22c55e', Transport: '#3b82f6', Shopping: '#a855f7', Medical: '#10b981', Education: '#f59e0b', Entertainment: '#ec4899', Bills: '#6366f1', Fuel: '#14b8a6', Others: '#6b7280' };

const getCategoryColor = (category) => {
  return categoryColors[category] || '#6b7280';
};

const emptyForm = { accountId: '', description: '', amount: '', category: 'Food', expenseDate: new Date().toISOString().split('T')[0], notes: '' };

const Expenses = () => {
  const isAndroidApk = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    } catch {
      return '';
    }
  };

  const [expenses, setExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const isInitialMount = useRef(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchExpenses = async () => {
    try {
      const params = new URLSearchParams({ page, size: rowsPerPage, sort: 'expenseDate,desc' });
      if (search) params.append('search', search);
      if (filterCategory) params.append('category', filterCategory);
      const res = await api.get(`/api/expenses?${params}`);
      let fetched = res.data.content || [];
      if (isAndroidApk) {
        fetched = [...fetched].sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
      }
      setExpenses(fetched);
      setTotalElements(res.data.totalElements || 0);
    } catch {
      toast.error('Failed to load expenses');
      throw new Error('Failed to load expenses');
    }
  };

  const fetchAccounts = async () => {
    const res = await api.get('/api/accounts');
    setAccounts(res.data || []);
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const showPageLoader = isInitialMount.current;
      if (showPageLoader) {
        setLoading(true);
      } else {
        setListLoading(true);
      }

      try {
        if (showPageLoader) {
          await Promise.all([fetchAccounts(), fetchExpenses()]);
        } else {
          await fetchExpenses();
        }
      } catch {
        if (!cancelled) toast.error('Failed to load expenses');
      } finally {
        if (!cancelled) {
          if (showPageLoader) {
            setLoading(false);
            isInitialMount.current = false;
          } else {
            setListLoading(false);
          }
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [page, rowsPerPage, search, filterCategory]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm, accountId: accounts.length > 0 ? accounts[0].id : '' });
    setCustomCategory('');
    setDialogOpen(true);
  };
  const openEdit = (exp) => {
    setEditId(exp.id);
    const category = exp.category;
    setForm({ accountId: exp.accountId, description: exp.description, amount: String(exp.amount), category: category, expenseDate: exp.expenseDate, notes: exp.notes || '' });
    setCustomCategory(category === 'Others' ? '' : category);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.accountId) { toast.error('Fill required fields'); return; }
    if (form.category === 'Others' && !customCategory.trim()) { toast.error('Please specify custom category name'); return; }
    setSubmitting(true);
    try {
      const categoryToSave = form.category === 'Others' ? customCategory.trim() : form.category;
      const payload = {
        ...form,
        category: categoryToSave,
        amount: parseFloat(form.amount),
        paymentMode: editId ? (expenses.find(e => e.id === editId)?.paymentMode || 'Cash') : 'Cash'
      };
      if (editId) { await api.put(`/api/expenses/${editId}`, payload); toast.success('Expense updated'); }
      else { await api.post('/api/expenses', payload); toast.success('Expense added'); }
      setDialogOpen(false); fetchExpenses();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save expense'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense? The amount will be refunded to the account.')) return;
    try { await api.delete(`/api/expenses/${id}`); toast.success('Expense deleted & refunded'); fetchExpenses(); }
    catch { toast.error('Failed to delete'); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ position: 'relative' }}>
      {listLoading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', pt: 10, zIndex: 1, bgcolor: 'rgba(0,0,0,0.04)' }}>
          <CircularProgress size={28} />
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.25rem' } }}>Expenses</Typography>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate} sx={{ borderRadius: 2 }}>Add Expense</Button>
      </Box>

      {/* Filters */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField fullWidth size="small" placeholder="Search descriptions..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> }} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField fullWidth select size="small" label="Category" value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><FilterListOutlined /></InputAdornment> }}>
            <MenuItem value="">All Categories</MenuItem>
            {categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
        </Grid>
      </Grid>

      {/* Table or Mobile Cards */}
      {isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {expenses.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No expenses found</Typography>
            </Card>
          ) : (
            expenses.map((exp) => (
              <Card key={exp.id} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
                {/* Thin vertical category stripe */}
                <Box sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 5,
                  bgcolor: getCategoryColor(exp.category)
                }} />

                <CardContent sx={{ p: '16px !important', pl: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ maxWidth: '70%' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {exp.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {exp.expenseDate} {isAndroidApk ? `• ${formatTime(exp.createdAt)}` : `• ${exp.paymentMode}`}
                      </Typography>
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'error.main' }}>
                      -₹{parseFloat(exp.amount).toFixed(2)}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip
                        label={exp.category}
                        size="small"
                        sx={{
                          bgcolor: getCategoryColor(exp.category) + '20',
                          color: getCategoryColor(exp.category),
                          fontWeight: 600,
                          borderRadius: 1.5
                        }}
                      />
                      <Typography variant="caption" sx={{ bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, fontWeight: 500, color: 'text.secondary' }}>
                        {exp.accountName}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEdit(exp)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(exp.id)}>
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
          <TablePagination
            component="div"
            count={totalElements}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            sx={{
              '.MuiTablePagination-selectLabel, .MuiTablePagination-input': {
                display: { xs: 'none', sm: 'inline-block' }
              }
            }}
          />
        </Box>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No expenses found</Typography></TableCell></TableRow>
                ) : (
                  expenses.map((exp) => (
                    <TableRow key={exp.id} hover>
                      <TableCell>
                        {isAndroidApk ? `${exp.expenseDate} ${formatTime(exp.createdAt)}` : exp.expenseDate}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{exp.description}</TableCell>
                      <TableCell>
                        <Chip label={exp.category} size="small" sx={{ bgcolor: getCategoryColor(exp.category) + '20', color: getCategoryColor(exp.category), fontWeight: 600, borderRadius: 1.5 }} />
                      </TableCell>
                      <TableCell>{exp.accountName}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>-₹{parseFloat(exp.amount).toFixed(2)}</TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => openEdit(exp)}><EditOutlined fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(exp.id)}><DeleteOutlineOutlined fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={totalElements} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField select label="Account" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required fullWidth>
            {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.accountName} (₹{parseFloat(a.currentBalance).toFixed(2)})</MenuItem>)}
          </TextField>
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required fullWidth />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Amount (₹)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required fullWidth />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Date" type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <TextField select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} fullWidth>
            {categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          {form.category === 'Others' && (
            <TextField
              label="Custom Category Name"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              required
              fullWidth
              placeholder="Enter custom category name"
              helperText="Specify the actual category name"
            />
          )}
          <TextField label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline rows={2} fullWidth />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={submitting}>
            {submitting ? <CircularProgress size={20} /> : editId ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Expenses;
