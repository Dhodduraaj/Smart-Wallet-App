import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Button,
  Divider,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  AccountBalanceWalletOutlined,
  TrendingDownOutlined,
  CalendarTodayOutlined,
  TrendingUpOutlined,
  FastfoodOutlined,
  DirectionsCarOutlined,
  ShoppingBagOutlined,
  LocalHospitalOutlined,
  SchoolOutlined,
  HomeOutlined,
  ConfirmationNumberOutlined,
  CategoryOutlined,
  LocalGasStationOutlined,
  ReceiptOutlined
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'react-hot-toast';
import SkeletonDashboard from '../components/SkeletonDashboard';

const COLORS = ['#6366f1', '#a855f7', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#22c55e', '#6b7280'];

const categoryColors = { 
  Food: '#ef4444', 
  Groceries: '#22c55e',
  Transport: '#3b82f6', 
  Shopping: '#a855f7', 
  Medical: '#10b981', 
  Education: '#f59e0b', 
  Entertainment: '#ec4899', 
  Bills: '#6366f1', 
  Fuel: '#14b8a6', 
  Others: '#6b7280' 
};

const getCategoryIcon = (category) => {
  const cat = (category || '').toUpperCase();
  if (cat.includes('FOOD') || cat.includes('RESTAURANT') || cat.includes('GROCER')) return <FastfoodOutlined />;
  if (cat.includes('TRANS') || cat.includes('CAB') || cat.includes('TRAVEL')) return <DirectionsCarOutlined />;
  if (cat.includes('SHOP') || cat.includes('CLOTH')) return <ShoppingBagOutlined />;
  if (cat.includes('MED') || cat.includes('HEALTH') || cat.includes('HOSPITAL')) return <LocalHospitalOutlined />;
  if (cat.includes('EDU') || cat.includes('SCHOOL')) return <SchoolOutlined />;
  if (cat.includes('RENT') || cat.includes('HOUSE') || cat.includes('HOME')) return <HomeOutlined />;
  if (cat.includes('ENT') || cat.includes('MOVIE') || cat.includes('SHOW')) return <ConfirmationNumberOutlined />;
  if (cat.includes('FUEL') || cat.includes('GAS')) return <LocalGasStationOutlined />;
  if (cat.includes('BILL') || cat.includes('UTILITY')) return <ReceiptOutlined />;
  return <CategoryOutlined />;
};

const getCategoryColor = (category) => {
  return categoryColors[category] || '#6b7280';
};

const Dashboard = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [recentExpenses, setRecentExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // Income dialog state
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ accountId: '', description: '', amount: '', incomeDate: new Date().toISOString().split('T')[0], notes: '' });
  const [incomeSubmitting, setIncomeSubmitting] = useState(false);

  // Expense dialog state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ accountId: '', description: '', amount: '', category: 'Food', expenseDate: new Date().toISOString().split('T')[0], notes: '' });
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  const categories = ['Food', 'Groceries', 'Transport', 'Shopping', 'Medical', 'Education', 'Entertainment', 'Bills', 'Fuel', 'Others'];

  const refreshDashboard = async () => {
    const response = await api.get('/api/dashboard/summary');
    setData(response.data);
    setRecentExpenses(response.data.recentExpenses || []);
  };

  const loadAccountsIfNeeded = async () => {
    if (accounts.length > 0) return accounts;
    const accResponse = await api.get('/api/accounts');
    setAccounts(accResponse.data);
    return accResponse.data;
  };

  useEffect(() => {
    let cancelled = false;

    const fetchDashboardData = async () => {
      try {
        const response = await api.get('/api/dashboard/summary');
        if (cancelled) return;
        setData(response.data);
        setRecentExpenses(response.data.recentExpenses || []);
      } catch (err) {
        if (!cancelled) toast.error('Failed to load dashboard statistics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDashboardData();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <SkeletonDashboard />;

  if (!data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Typography color="text.secondary">Unable to load dashboard data.</Typography>
      </Box>
    );
  }

  const {
    totalBalance = 0,
    todayExpenses = 0,
    monthlyExpenses = 0,
    monthlyIncome = 0,
    categoryExpenses = [],
    monthlyTrends = [],
  } = data;

  const openIncomeDialog = async () => {
    try {
      const accs = await loadAccountsIfNeeded();
      setIncomeForm({ ...incomeForm, accountId: accs.length > 0 ? accs[0].id : '' });
      setIncomeDialogOpen(true);
    } catch {
      toast.error('Failed to load accounts');
    }
  };

  const openExpenseDialog = async () => {
    try {
      const accs = await loadAccountsIfNeeded();
      setExpenseForm({ ...expenseForm, accountId: accs.length > 0 ? accs[0].id : '' });
      setCustomCategory('');
      setExpenseDialogOpen(true);
    } catch {
      toast.error('Failed to load accounts');
    }
  };

  const handleSaveIncome = async () => {
    if (!incomeForm.description || !incomeForm.amount || !incomeForm.accountId) {
      toast.error('Fill required fields');
      return;
    }
    setIncomeSubmitting(true);
    try {
      const payload = { ...incomeForm, amount: parseFloat(incomeForm.amount) };
      await api.post('/api/incomes', payload);
      toast.success('Income added');
      setIncomeDialogOpen(false);
      await refreshDashboard();
      setIncomeForm({ accountId: '', description: '', amount: '', incomeDate: new Date().toISOString().split('T')[0], notes: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save income');
    } finally {
      setIncomeSubmitting(false);
    }
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount || !expenseForm.accountId) {
      toast.error('Fill required fields');
      return;
    }
    if (expenseForm.category === 'Others' && !customCategory.trim()) {
      toast.error('Please specify custom category name');
      return;
    }
    setExpenseSubmitting(true);
    try {
      const categoryToSave = expenseForm.category === 'Others' ? customCategory.trim() : expenseForm.category;
      const payload = { 
        ...expenseForm, 
        category: categoryToSave, 
        amount: parseFloat(expenseForm.amount),
        paymentMode: 'Cash'
      };
      await api.post('/api/expenses', payload);
      toast.success('Expense added');
      setExpenseDialogOpen(false);
      await refreshDashboard();
      setExpenseForm({ accountId: '', description: '', amount: '', category: 'Food', expenseDate: new Date().toISOString().split('T')[0], notes: '' });
      setCustomCategory('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save expense');
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const cardData = [
    { title: 'Total Balance', value: `₹${totalBalance}`, icon: <AccountBalanceWalletOutlined />, color: '#6366f1' },
    { title: 'Monthly Income', value: `₹${monthlyIncome}`, icon: <TrendingUpOutlined />, color: '#10b981' },
    { title: 'Monthly Expenses', value: `₹${monthlyExpenses}`, icon: <TrendingDownOutlined />, color: '#f59e0b' },
    { title: "Today's Expenses", value: `₹${todayExpenses}`, icon: <CalendarTodayOutlined />, color: '#ef4444' },
  ];

  // Matches Layout.jsx main padding so cards can extend edge-to-edge in the content area
  const layoutPad = { xs: 2, sm: 3, md: 4 };
  const fullBleedSx = {
    width: {
      xs: `calc(100% + ${layoutPad.xs * 2 * 8}px)`,
      sm: `calc(100% + ${layoutPad.sm * 2 * 8}px)`,
      md: `calc(100% + ${layoutPad.md * 2 * 8}px)`,
    },
    ml: { xs: -layoutPad.xs, sm: -layoutPad.sm, md: -layoutPad.md },
    boxSizing: 'border-box',
    overflow: 'hidden',
  };
  // CSS Grid rows: gap 0 so cards tile flush; columns sum to 100% width
  const gridRowSx = {
    display: 'grid',
    width: '100%',
    gap: 0,
    minWidth: 0,
  };
  const sectionCardSx = {
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  return (
    <Box sx={{ flexGrow: 1, width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 1.5, sm: 2 },
          mb: { xs: 1.5, sm: 2 },
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' } }}>
          Dashboard
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            '& .MuiButton-root': { flex: { xs: '1 1 auto', sm: '0 0 auto' } },
          }}
        >
          <Button
            variant="contained"
            startIcon={<TrendingUpOutlined />}
            onClick={openIncomeDialog}
            sx={{
              borderRadius: 1.5,
              px: { xs: 1.5, sm: 2 },
              py: 0.75,
              bgcolor: '#10b981',
              '&:hover': { bgcolor: '#059669' },
              fontSize: { xs: '0.75rem', sm: '0.85rem' },
            }}
          >
            Add Income
          </Button>
          <Button
            variant="contained"
            startIcon={<TrendingDownOutlined />}
            onClick={openExpenseDialog}
            sx={{
              borderRadius: 1.5,
              px: { xs: 1.5, sm: 2 },
              py: 0.75,
              bgcolor: '#ef4444',
              '&:hover': { bgcolor: '#dc2626' },
              fontSize: { xs: '0.75rem', sm: '0.85rem' },
            }}
          >
            Add Expense
          </Button>
        </Box>
      </Box>

      <Box sx={{ ...fullBleedSx, display: 'flex', flexDirection: 'column', gap: 0, flex: 1}}>
        <Box
          sx={{
            
            ...gridRowSx,
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(4, minmax(0, 1fr))',
            },
          }}
        >
        {cardData.map((card, i) => (
          <Card key={i} sx={{ ...sectionCardSx, display: 'flex', flexDirection: 'column', border: '1px solid darkblue' }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2 }, flexGrow: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 500,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {card.title}
                </Typography>
                <Avatar sx={{ bgcolor: `${card.color}15`, color: card.color, width: 32, height: 32, borderRadius: 1, flexShrink: 0 }}>
                  {card.icon}
                </Avatar>
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 400,
                  fontSize: { xs: '0.95rem', sm: '1rem', md: '1.1rem' },
                  wordBreak: 'break-word',
                }}
              >
                {card.value}
              </Typography>
            </CardContent>
          </Card>
        ))}
        </Box>

        <Box
          sx={{
            ...gridRowSx,
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr)' },
            flex: { md: 1 },
            minHeight: { xs: 'auto', md: 'min(38vh, 22rem)' },
          
          }}
        >
          <Card sx={{ ...sectionCardSx, p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', minWidth: 0 , border: '1px solid darkblue'}}>
            <CardContent sx={{ p: 0, width: '100%', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, fontSize: '0.95rem' }}>
                Monthly Trends
              </Typography>
              <Box sx={{ width: '100%', flex: 1, minHeight: { xs: '12rem', md: 0 } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrends} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                    <XAxis dataKey="month" tickLine={false} style={{ fontSize: '0.7rem' }} stroke={isDark ? '#94a3b8' : '#64748b'} />
                    <YAxis tickLine={false} axisLine={false} style={{ fontSize: '0.7rem' }} stroke={isDark ? '#94a3b8' : '#64748b'} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ borderRadius: 6, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                    <Bar dataKey="income" name="Income" fill="#059669" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="expense" name="Expense" fill="#dc2626" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ ...sectionCardSx, p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', minWidth: 0 , border: '1px solid darkblue'}}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', flex: 1, p: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.95rem' }}>
                Categories
              </Typography>
              {categoryExpenses.length === 0 ? (
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                  <Typography variant="caption" color="text.secondary">No expenses</Typography>
                </Box>
              ) : (
                <Box sx={{ width: '100%', flex: 1, minHeight: { xs: '12rem', md: 0 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryExpenses}
                        cx="50%"
                        cy="45%"
                        innerRadius="52%"
                        outerRadius="72%"
                        paddingAngle={2}
                        dataKey="amount"
                        nameKey="category"
                      >
                        {categoryExpenses.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ borderRadius: 6, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                      <Legend
                        layout="horizontal"
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={6}
                        wrapperStyle={{ fontSize: '0.7rem', paddingTop: 6 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        <Box
          sx={{
            ...gridRowSx,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            flex: { md: 1 },
            minHeight: { xs: 'auto', md: 'min(28vh, 16rem)' },
          }}
        >
          <Card sx={{ ...sectionCardSx, p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', minWidth: 0 , border: '1px solid darkblue'}}>
            <CardContent sx={{ p: 0, width: '100%', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.95rem' }}>
                Recent Transactions
              </Typography>
              {recentExpenses.length === 0 ? (
                <Typography variant="caption" color="text.secondary">No transactions</Typography>
              ) : (
                <List sx={{ py: 0, width: '100%' }}>
                  {recentExpenses.map((exp, i) => (
                    <React.Fragment key={exp.id}>
                      <ListItem
                        sx={{
                          py: 1,
                          px: 0,
                          alignItems: 'flex-start',
                          gap: 1,
                        }}
                      >
                        <ListItemAvatar sx={{ minWidth: 'auto', mt: 0.25 }}>
                          <Avatar
                            sx={{
                              bgcolor: `${getCategoryColor(exp.category)}15`,
                              color: getCategoryColor(exp.category),
                              borderRadius: 1,
                              width: 32,
                              height: 32,
                            }}
                          >
                            {getCategoryIcon(exp.category)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={exp.description}
                          secondary={`${exp.category}`}
                          primaryTypographyProps={{ fontWeight: 500, fontSize: '0.85rem', noWrap: true }}
                          secondaryTypographyProps={{ fontSize: '0.7rem', noWrap: true }}
                          sx={{ minWidth: 0, mr: 1 }}
                        />
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 600,
                            color: 'error.main',
                            fontSize: '0.85rem',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          -₹{exp.amount}
                        </Typography>
                      </ListItem>
                      {i < recentExpenses.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          <Card sx={{ ...sectionCardSx, p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', minWidth: 0 , border: '1px solid darkblue'}}>
            <CardContent sx={{ p: 0, width: '100%', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.95rem' }}>
                Overview
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, height: '100%' }}>
                <Box sx={{ p: 1.5, borderRadius: 0, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider', flex: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Savings Rate
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {monthlyIncome > 0 ? (
                      `${((monthlyIncome - monthlyExpenses) / monthlyIncome * 100).toFixed(0)}% saved this month`
                    ) : (
                      'Log income to see savings rate'
                    )
                  }
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 0, bgcolor: 'background.default', flex: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Monthly Balance
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    {monthlyIncome >= monthlyExpenses ? (
                      <span style={{ color: '#059669' }}>+₹{monthlyIncome - monthlyExpenses}</span>
                    ) : (
                      <span style={{ color: '#dc2626' }}>-₹{monthlyExpenses - monthlyIncome}</span>
                    )}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Income Dialog */}
      <Dialog open={incomeDialogOpen} onClose={() => setIncomeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Income</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            select
            label="Account"
            value={incomeForm.accountId}
            onChange={(e) => setIncomeForm({ ...incomeForm, accountId: e.target.value })}
            required
            fullWidth
          >
            {accounts.map(a => (
              <MenuItem key={a.id} value={a.id}>
                {a.accountName} (₹{parseFloat(a.currentBalance).toFixed(2)})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Description"
            value={incomeForm.description}
            onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })}
            required
            fullWidth
          />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="Amount (₹)"
                type="number"
                value={incomeForm.amount}
                onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Date"
                type="date"
                value={incomeForm.incomeDate}
                onChange={(e) => setIncomeForm({ ...incomeForm, incomeDate: e.target.value })}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
          <TextField
            label="Notes (optional)"
            value={incomeForm.notes}
            onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })}
            multiline
            rows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setIncomeDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveIncome} disabled={incomeSubmitting}>
            {incomeSubmitting ? <CircularProgress size={20} /> : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onClose={() => setExpenseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Expense</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            select
            label="Account"
            value={expenseForm.accountId}
            onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })}
            required
            fullWidth
          >
            {accounts.map(a => (
              <MenuItem key={a.id} value={a.id}>
                {a.accountName} (₹{parseFloat(a.currentBalance).toFixed(2)})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            required
            fullWidth
          />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="Amount (₹)"
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                required
                fullWidth
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Date"
                type="date"
                value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
          <TextField
            select
            label="Category"
            value={expenseForm.category}
            onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
            fullWidth
          >
            {categories.map(c => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          {expenseForm.category === 'Others' && (
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
          <TextField
            label="Notes (optional)"
            value={expenseForm.notes}
            onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
            multiline
            rows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleSaveExpense} disabled={expenseSubmitting}>
            {expenseSubmitting ? <CircularProgress size={20} /> : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
