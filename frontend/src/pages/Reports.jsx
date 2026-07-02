import React, { useState, useMemo, useEffect } from 'react';
import api from '../lib/api';
import { generatePdfReportLocal } from '../lib/pdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  Box, Typography, Card, CardContent, Button, TextField, Grid, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Divider,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { DownloadOutlined, AssessmentOutlined } from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Reports = () => {
  const today = new Date();
  const firstDay = getLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayStr = getLocalDateString(today);

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(todayStr);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [filterTransactionType, setFilterTransactionType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  // Fetch unfiltered report data for the selected date range
  const fetchReport = async () => {
    if (!startDate || !endDate) { toast.error('Select both dates'); return; }
    setLoading(true);
    try {
      const res = await api.get(`/api/reports/data?startDate=${startDate}&endDate=${endDate}`);
      setReportData(res.data);
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  // Run initial fetch on mount
  useEffect(() => {
    fetchReport();
  }, []);

  // Live client-side reactive filter calculation (Single Source of Truth)
  const filteredReportData = useMemo(() => {
    if (!reportData) return null;

    let expenses = [...(reportData.expenses || [])];
    let incomes = [...(reportData.incomes || [])];

    // Apply category filter to expenses
    if (filterCategory && filterCategory !== 'none' && filterCategory !== 'all') {
      expenses = expenses.filter(
        e => (e.category || '').toLowerCase() === filterCategory.toLowerCase()
      );
    }

    // Apply transaction type filter
    if (filterTransactionType === 'income') {
      expenses = [];
    } else if (filterTransactionType === 'expense') {
      incomes = [];
    }

    const totalIncome = incomes.reduce((sum, inc) => sum + parseFloat(inc.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    const netSavings = totalIncome - totalExpenses;

    return {
      ...reportData,
      expenses,
      incomes,
      totalIncome,
      totalExpenses,
      netSavings
    };
  }, [reportData, filterTransactionType, filterCategory]);

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Generate and download the PDF locally from the filtered data
  const downloadPdf = async () => {
    if (!filteredReportData) return;
    setDownloading(true);
    try {
      const omitCategory = filterCategory === 'none';
      const pdfBlob = generatePdfReportLocal(filteredReportData, omitCategory);

      if (Capacitor.getPlatform() === 'android') {
        const base64Result = await blobToBase64(pdfBlob);
        const base64Data = base64Result.split(',')[1];
        const filename = `financial_report_${startDate}_to_${endDate}.pdf`;

        const fileResult = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache
        });

        const PdfDownloader = registerPlugin('PdfDownloader');
        await PdfDownloader.downloadPdf({
          filePath: fileResult.uri,
          fileName: filename
        });

        toast.success('PDF saved to Downloads folder');
      } else {
        const blobUrl = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', `financial_report_${startDate}_to_${endDate}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
        toast.success('PDF downloaded!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  // Quick presets
  const setPreset = (type) => {
    const now = new Date();
    let s, e;
    if (type === 'today') { s = e = todayStr; }
    else if (type === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      s = getLocalDateString(d); e = todayStr;
    } else if (type === 'month') { s = firstDay; e = todayStr; }
    else if (type === 'year') {
      s = getLocalDateString(new Date(now.getFullYear(), 0, 1)); e = todayStr;
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

      {/* Date & Filter Controls (WYSIWYG Filters Panel) */}
      <Card sx={{ mb: 4, borderRadius: 1.5 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1.1rem' }}>Report Options</Typography>
          <Grid container spacing={2.5} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Grid>

            {/* Live Filter Dropdown 1 */}
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Transaction Type</InputLabel>
                <Select
                  value={filterTransactionType}
                  label="Transaction Type"
                  onChange={(e) => setFilterTransactionType(e.target.value)}
                >
                  <MenuItem value="all">All Transactions</MenuItem>
                  <MenuItem value="income">Income Only</MenuItem>
                  <MenuItem value="expense">Expenses Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Live Filter Dropdown 2 */}
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Expense Category</InputLabel>
                <Select
                  value={filterCategory}
                  label="Expense Category"
                  onChange={(e) => setFilterCategory(e.target.value)}
                  disabled={filterTransactionType === 'income'}
                >
                  <MenuItem value="none">None (No Category Col)</MenuItem>
                  <MenuItem value="all">All Categories</MenuItem>
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
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" onClick={() => setPreset('today')}>Today</Button>
                  <Button size="small" variant="outlined" onClick={() => setPreset('week')}>This Week</Button>
                  <Button size="small" variant="outlined" onClick={() => setPreset('month')}>This Month</Button>
                  <Button size="small" variant="outlined" onClick={() => setPreset('year')}>This Year</Button>
                </Box>
                <Button variant="contained" onClick={fetchReport} disabled={loading} startIcon={<AssessmentOutlined />}>
                  {loading ? <CircularProgress size={20} /> : 'Fetch Report Date Range'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Reactive Report Display */}
      {filteredReportData && (
        <>
          {/* Preview Summary */}
          <Box sx={summaryGridSx}>
            {[
              { label: 'Total Income', value: `₹${filteredReportData.totalIncome.toFixed(2)}`, color: '#059669' },
              { label: 'Total Expenses', value: `₹${filteredReportData.totalExpenses.toFixed(2)}`, color: '#dc2626' },
              { label: 'Net Balance', value: `₹${filteredReportData.netSavings.toFixed(2)}`, color: filteredReportData.netSavings >= 0 ? '#059669' : '#dc2626' },
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

          {/* Expenses Preview List */}
          {filterTransactionType !== 'income' && filteredReportData.expenses?.length > 0 && (
            <Card sx={{ mb: 4, borderRadius: 1.5 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1.1rem' }}>Expenses ({filteredReportData.expenses.length})</Typography>
                <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 480 }}>
                    <TableHead>
                      <TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell>Category</TableCell><TableCell align="right">Amount</TableCell></TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredReportData.expenses.map((e) => (
                        <TableRow key={e.id}><TableCell>{e.expenseDate}</TableCell><TableCell>{e.description}</TableCell><TableCell>{e.category}</TableCell><TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>₹{parseFloat(e.amount).toFixed(2)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Income Preview List */}
          {filterTransactionType !== 'expense' && filteredReportData.incomes?.length > 0 && (
            <Card sx={{ mb: 4, borderRadius: 1.5 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1.1rem' }}>Income ({filteredReportData.incomes.length})</Typography>
                <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 480 }}>
                    <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Description</TableCell><TableCell>Account</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
                    <TableBody>
                      {filteredReportData.incomes.map((inc) => (
                        <TableRow key={inc.id}><TableCell>{inc.incomeDate}</TableCell><TableCell>{inc.description}</TableCell><TableCell>{inc.accountName}</TableCell><TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>₹{parseFloat(inc.amount).toFixed(2)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Fallback if no transactions match filters */}
          {filteredReportData.expenses?.length === 0 && filteredReportData.incomes?.length === 0 && (
            <Card sx={{ p: 6, mb: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">No matching records found for the selected filters</Typography>
            </Card>
          )}

          {/* Export PDF Button */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Button variant="contained" size="large" startIcon={<DownloadOutlined />} onClick={downloadPdf} disabled={downloading}
              sx={{ px: 4, py: 1.5, borderRadius: 1.5 }}>
              {downloading ? <CircularProgress size={20} /> : 'Export PDF Report'}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default Reports;
