import React, { useState } from 'react';
import api from '../lib/api';
import {
  Box, Typography, Card, CardContent, Button, TextField, Grid, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { DownloadOutlined, AssessmentOutlined, FilterListOutlined } from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const Reports = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [filterTransactionType, setFilterTransactionType] = useState('');
  const [filterCategory, setFilterCategory] = useState('none');

  const fetchReport = async () => {
    if (!startDate || !endDate) { toast.error('Select both dates'); return; }
    setLoading(true);
    try {
      const res = await api.get(`/api/reports/data?startDate=${startDate}&endDate=${endDate}`);
      setReportData(res.data);
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      let url = `/api/reports/pdf?startDate=${startDate}&endDate=${endDate}`;
      if (filterTransactionType) url += `&transactionType=${filterTransactionType}`;
      if (filterCategory && filterCategory !== 'none') url += `&category=${filterCategory}`;
      if (filterCategory === 'none') url += `&omitCategory=true`;
      
      const res = await api.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `financial_report_${startDate}_to_${endDate}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success('PDF downloaded!');
    } catch { toast.error('Failed to download PDF'); }
    finally { setDownloading(false); }
  };

  // Quick presets
  const setPreset = (type) => {
    const now = new Date();
    let s, e;
    if (type === 'today') { s = e = todayStr; }
    else if (type === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      s = d.toISOString().split('T')[0]; e = todayStr;
    } else if (type === 'month') { s = firstDay; e = todayStr; }
    else if (type === 'year') {
      s = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]; e = todayStr;
    }
    setStartDate(s); setEndDate(e);
  };

  const summaryGridSx = {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
    gap: { xs: 1.5, sm: 2 },
    width: '100%',
    minWidth: 0,
    mb: 3,
  };

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: { xs: 2, sm: 4 }, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
        Reports
      </Typography>

      {/* Date Controls */}
      <Card sx={{ mb: 4, borderRadius: 1.5 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1.1rem' }}>Generate Financial Report</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={() => setPreset('today')}>Today</Button>
                <Button size="small" variant="outlined" onClick={() => setPreset('week')}>This Week</Button>
                <Button size="small" variant="outlined" onClick={() => setPreset('month')}>This Month</Button>
                <Button size="small" variant="outlined" onClick={() => setPreset('year')}>This Year</Button>
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                <Button variant="outlined" startIcon={<FilterListOutlined />} onClick={() => setFilterDialogOpen(true)}>
                  Filters
                </Button>
                <Button variant="contained" onClick={fetchReport} disabled={loading} startIcon={<AssessmentOutlined />}>
                  {loading ? <CircularProgress size={20} /> : 'View Report'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Report Display */}
      {reportData && (
        <>
          <Box sx={summaryGridSx}>
            {[
              { label: 'Total Income', value: `₹${reportData.totalIncome}`, color: '#059669' },
              { label: 'Total Expenses', value: `₹${reportData.totalExpenses}`, color: '#dc2626' },
              { label: 'Net Savings', value: `₹${reportData.netSavings}`, color: reportData.netSavings >= 0 ? '#059669' : '#dc2626' },
            ].map((c, i) => (
              <Card key={i} sx={{ borderRadius: 1.5, width: '100%', minWidth: 0 }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {c.label}
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 600,
                      color: c.color,
                      mt: 0.5,
                      fontSize: { xs: '1.15rem', sm: '1.5rem' },
                      wordBreak: 'break-word',
                    }}
                  >
                    {c.value}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Expenses Table */}
          {reportData.expenses?.length > 0 && (
            <Card sx={{ mb: 4, borderRadius: 1.5 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1.1rem' }}>Expenses ({reportData.expenses.length})</Typography>
                <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 480 }}>
                    <TableHead>
                      <TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell>Category</TableCell><TableCell align="right">Amount</TableCell></TableRow>
                    </TableHead>
                    <TableBody>
                      {reportData.expenses.map((e) => (
                        <TableRow key={e.id}><TableCell>{e.expenseDate}</TableCell><TableCell>{e.description}</TableCell><TableCell>{e.category}</TableCell><TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>₹{e.amount}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Income Table */}
          {reportData.incomes?.length > 0 && (
            <Card sx={{ mb: 4, borderRadius: 1.5 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1.1rem' }}>Income ({reportData.incomes.length})</Typography>
                <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 480 }}>
                    <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell>Account</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
                    <TableBody>
                      {reportData.incomes.map((inc) => (
                        <TableRow key={inc.id}><TableCell>{inc.incomeDate}</TableCell><TableCell>{inc.description}</TableCell><TableCell>{inc.accountName}</TableCell><TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>₹{inc.amount}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Download PDF */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Button variant="contained" size="large" startIcon={<DownloadOutlined />} onClick={downloadPdf} disabled={downloading}
              sx={{ px: 4, py: 1.5, borderRadius: 1.5 }}>
              {downloading ? <CircularProgress size={20} /> : 'Download PDF Report'}
            </Button>
          </Box>
        </>
      )}

      {/* Filter Dialog */}
      <Dialog open={filterDialogOpen} onClose={() => setFilterDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>PDF Filter Options</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl fullWidth size="small">
            <InputLabel>Transaction Type</InputLabel>
            <Select
              value={filterTransactionType}
              label="Transaction Type"
              onChange={(e) => setFilterTransactionType(e.target.value)}
            >
              <MenuItem value="">All Transactions</MenuItem>
              <MenuItem value="income">Income Only</MenuItem>
              <MenuItem value="expense">Expenses Only</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel>Expense Category</InputLabel>
            <Select
              value={filterCategory}
              label="Expense Category"
              onChange={(e) => setFilterCategory(e.target.value)}
              disabled={filterTransactionType === 'income'}
            >
              <MenuItem value="none">None (No Category Column)</MenuItem>
              <MenuItem value="">All Categories</MenuItem>
              <MenuItem value="Food">Food</MenuItem>
              <MenuItem value="Transport">Transport</MenuItem>
              <MenuItem value="Shopping">Shopping</MenuItem>
              <MenuItem value="Medical">Medical</MenuItem>
              <MenuItem value="Education">Education</MenuItem>
              <MenuItem value="Entertainment">Entertainment</MenuItem>
              <MenuItem value="Bills">Bills</MenuItem>
              <MenuItem value="Fuel">Fuel</MenuItem>
              <MenuItem value="Others">Others</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFilterDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setFilterDialogOpen(false);
              toast.success('Filters applied to PDF download');
            }}
          >
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Reports;
