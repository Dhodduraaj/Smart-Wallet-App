import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import {
  Box, Typography, Card, CardContent, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, IconButton, CircularProgress, Grid,
  InputAdornment, useMediaQuery, useTheme
} from '@mui/material';
import { AddOutlined, EditOutlined, DeleteOutlineOutlined, SearchOutlined } from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const emptyForm = { accountId: '', description: '', amount: '', incomeDate: new Date().toISOString().split('T')[0], notes: '' };

const Income = () => {
  const [incomes, setIncomes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const isInitialMount = useRef(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchIncomes = async () => {
    try {
      const params = new URLSearchParams({ page, size: rowsPerPage, sort: 'incomeDate,desc' });
      if (search) params.append('search', search);
      const res = await api.get(`/api/incomes?${params}`);
      setIncomes(res.data.content || []);
      setTotalElements(res.data.totalElements || 0);
    } catch {
      toast.error('Failed to load income records');
      throw new Error('Failed to load income records');
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
          await Promise.all([fetchAccounts(), fetchIncomes()]);
        } else {
          await fetchIncomes();
        }
      } catch {
        if (!cancelled) toast.error('Failed to load income records');
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
  }, [page, rowsPerPage, search]);

  const openCreate = () => { setEditId(null); setForm({ ...emptyForm, accountId: accounts[0]?.id || '' }); setDialogOpen(true); };
  const openEdit = (inc) => { setEditId(inc.id); setForm({ accountId: inc.accountId, description: inc.description, amount: String(inc.amount), incomeDate: inc.incomeDate, notes: inc.notes || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.accountId) { toast.error('Fill required fields'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editId) { await api.put(`/api/incomes/${editId}`, payload); toast.success('Income updated'); }
      else { await api.post('/api/incomes', payload); toast.success('Income added'); }
      setDialogOpen(false); fetchIncomes();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this income? The amount will be deducted from the account.')) return;
    try { await api.delete(`/api/incomes/${id}`); toast.success('Income deleted'); fetchIncomes(); }
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
        <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.25rem' } }}>Income</Typography>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate} sx={{ borderRadius: 2 }}>Add Income</Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField fullWidth size="small" placeholder="Search descriptions..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> }} />
        </Grid>
      </Grid>

      {/* Table or Mobile Cards */}
      {isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {incomes.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No income records found</Typography>
            </Card>
          ) : (
            incomes.map((inc) => (
              <Card key={inc.id} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
                {/* Thin vertical green stripe for positive income */}
                <Box sx={{ 
                  position: 'absolute', 
                  left: 0, 
                  top: 0, 
                  bottom: 0, 
                  width: 5, 
                  bgcolor: 'success.main' 
                }} />
                
                <CardContent sx={{ p: '16px !important', pl: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ maxWidth: '70%' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {inc.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {inc.incomeDate}
                      </Typography>
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'success.main' }}>
                      +₹{parseFloat(inc.amount).toFixed(2)}
                    </Typography>
                  </Box>

                  {inc.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic', fontSize: '0.85rem' }}>
                      Note: {inc.notes}
                    </Typography>
                  )}
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                    <Typography variant="caption" sx={{ bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, fontWeight: 500, color: 'text.secondary' }}>
                      {inc.accountName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEdit(inc)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(inc.id)}>
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
                  <TableCell>Account</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incomes.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}><Typography color="text.secondary">No income records</Typography></TableCell></TableRow>
                ) : (
                  incomes.map((inc) => (
                    <TableRow key={inc.id} hover>
                      <TableCell>{inc.incomeDate}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{inc.description}</TableCell>
                      <TableCell>{inc.accountName}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.notes || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>+₹{parseFloat(inc.amount).toFixed(2)}</TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => openEdit(inc)}><EditOutlined fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(inc.id)}><DeleteOutlineOutlined fontSize="small" /></IconButton>
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
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? 'Edit Income' : 'Add Income'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField select label="Account" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required fullWidth>
            {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.accountName} (₹{parseFloat(a.currentBalance).toFixed(2)})</MenuItem>)}
          </TextField>
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required fullWidth />
          <Grid container spacing={2}>
            <Grid item xs={6}><TextField label="Amount (₹)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required fullWidth /></Grid>
            <Grid item xs={6}><TextField label="Date" type="date" value={form.incomeDate} onChange={(e) => setForm({ ...form, incomeDate: e.target.value })} required fullWidth InputLabelProps={{ shrink: true }} /></Grid>
          </Grid>
          <TextField label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline rows={2} fullWidth />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={submitting}>{submitting ? <CircularProgress size={20} /> : editId ? 'Update' : 'Add'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Income;
