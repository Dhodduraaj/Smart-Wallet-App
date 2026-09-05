import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import {
  formatTransactionDateTime,
  createTransactionDateTime
} from '../lib/transactionSorter';
import {
  Box, Typography, Card, CardContent, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, CircularProgress, Grid,
  InputAdornment, useMediaQuery, useTheme, Avatar, Divider, Alert
} from '@mui/material';
import {
  AddOutlined, DeleteOutlineOutlined, SearchOutlined,
  ArrowBackOutlined, PersonOutlineOutlined
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const People = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // People list state
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Selected person sheet state
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Add Person dialog state
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [personName, setPersonName] = useState('');
  const [submittingPerson, setSubmittingPerson] = useState(false);

  // Add Ledger Entry dialog state
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({
    details: '',
    selectedDate: getLocalDateString(),
    incomingMoney: '',
    outgoingMoney: '',
  });
  const [submittingEntry, setSubmittingEntry] = useState(false);

  // Load people list
  const fetchPeople = async () => {
    try {
      const res = await api.get(`/api/people?search=${encodeURIComponent(search)}`);
      setPeople(res.data || []);
    } catch (err) {
      toast.error('Failed to load people ledger');
    } finally {
      setLoading(false);
    }
  };

  // Load selected person's ledger entries
  const fetchLedger = async (personId) => {
    setLedgerLoading(true);
    try {
      const res = await api.get(`/api/people/${personId}/ledger`);
      setLedgerEntries(res.data || []);

      // Refresh selected person summary
      const personRes = await api.get(`/api/people/${personId}`);
      if (personRes.data) {
        setSelectedPerson(personRes.data);
      }
    } catch (err) {
      toast.error('Failed to load ledger sheet');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    fetchPeople();
  }, [search]);

  useEffect(() => {
    if (selectedPerson?.id) {
      fetchLedger(selectedPerson.id);
    }
  }, [selectedPerson?.id]);

  // Handle Add Person
  const handleCreatePerson = async () => {
    const trimmed = personName.trim();
    if (!trimmed) {
      toast.error('Please enter a name');
      return;
    }

    setSubmittingPerson(true);
    try {
      const res = await api.post('/api/people', { name: trimmed });
      toast.success(`Added ${trimmed}`);
      setPersonName('');
      setAddPersonOpen(false);
      await fetchPeople();
      if (res.data) {
        setSelectedPerson(res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add person');
    } finally {
      setSubmittingPerson(false);
    }
  };

  // Handle Delete Person
  const handleDeletePerson = async (id, name, e) => {
    e?.stopPropagation();
    if (!window.confirm(`Delete ${name} and all their personal ledger entries? This will NOT affect your wallet or account balances.`)) {
      return;
    }
    try {
      await api.delete(`/api/people/${id}`);
      toast.success(`Deleted ${name}`);
      if (selectedPerson?.id === id) {
        setSelectedPerson(null);
      }
      fetchPeople();
    } catch (err) {
      toast.error('Failed to delete person');
    }
  };

  // Handle Add Ledger Entry
  const handleSaveEntry = async () => {
    if (!selectedPerson) return;

    const incoming = parseFloat(entryForm.incomingMoney || 0);
    const outgoing = parseFloat(entryForm.outgoingMoney || 0);

    if (isNaN(incoming) || incoming < 0) {
      toast.error('Incoming money must be a valid non-negative number');
      return;
    }
    if (isNaN(outgoing) || outgoing < 0) {
      toast.error('Outgoing money must be a valid non-negative number');
      return;
    }
    if (incoming === 0 && outgoing === 0) {
      toast.error('Enter at least Incoming or Outgoing money');
      return;
    }

    setSubmittingEntry(true);
    try {
      const transactionDateTime = createTransactionDateTime(entryForm.selectedDate);
      const payload = {
        details: entryForm.details.trim() || 'Record',
        date: transactionDateTime,
        selectedDate: entryForm.selectedDate,
        incomingMoney: incoming,
        outgoingMoney: outgoing,
      };

      await api.post(`/api/people/${selectedPerson.id}/ledger`, payload);
      toast.success('Ledger entry added');
      setEntryDialogOpen(false);
      setEntryForm({
        details: '',
        selectedDate: getLocalDateString(),
        incomingMoney: '',
        outgoingMoney: '',
      });
      await fetchLedger(selectedPerson.id);
      fetchPeople(); // update totals in list
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save entry');
    } finally {
      setSubmittingEntry(false);
    }
  };

  // Handle Delete Ledger Entry
  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this ledger record?')) return;
    try {
      await api.delete(`/api/people/ledger/${entryId}`);
      toast.success('Record deleted');
      await fetchLedger(selectedPerson.id);
      fetchPeople();
    } catch (err) {
      toast.error('Failed to delete entry');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  // ==========================================
  // VIEW 2: INDIVIDUAL PERSON LEDGER SHEET
  // ==========================================
  if (selectedPerson) {
    const netBalance = parseFloat(selectedPerson.balance || 0);
    const totalIncoming = parseFloat(selectedPerson.totalIncoming || 0);
    const totalOutgoing = parseFloat(selectedPerson.totalOutgoing || 0);

    return (
      <Box sx={{ position: 'relative' }}>
        {/* Top Navigation */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton onClick={() => setSelectedPerson(null)} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <ArrowBackOutlined />
            </IconButton>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                {selectedPerson.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Personal Memory Ledger (Isolated from Wallet)
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={() => setEntryDialogOpen(true)}
            sx={{ borderRadius: 2 }}
          >
            Add Entry
          </Button>
        </Box>

        {/* Balance Summary Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Net Balance
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700,
                    mt: 0.5,
                    color: netBalance > 0 ? 'success.main' : netBalance < 0 ? 'error.main' : 'text.secondary'
                  }}
                >
                  {netBalance > 0 ? `+₹${netBalance.toFixed(2)} (To Receive)` : netBalance < 0 ? `-₹${Math.abs(netBalance).toFixed(2)} (To Pay)` : '₹0.00 (Settled)'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Total Incoming
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main', mt: 0.5 }}>
                  +₹{totalIncoming.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={4}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Total Outgoing
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main', mt: 0.5 }}>
                  -₹{totalOutgoing.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Ledger Table */}
        {ledgerLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ledgerEntries.length === 0 ? (
              <Card sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No entries in {selectedPerson.name}'s ledger yet.</Typography>
              </Card>
            ) : (
              ledgerEntries.map((entry) => {
                const dt = formatTransactionDateTime(entry.date || entry.createdAt);
                const inc = parseFloat(entry.incomingMoney || 0);
                const out = parseFloat(entry.outgoingMoney || 0);
                const rowTotal = parseFloat(entry.total || 0);

                return (
                  <Card key={entry.id} sx={{ borderRadius: 2, p: 2, position: 'relative' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {entry.details || 'Record'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {dt.dateStr} • {dt.timeStr}
                        </Typography>
                      </Box>
                      <IconButton size="small" color="error" onClick={() => handleDeleteEntry(entry.id)}>
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        {inc > 0 && (
                          <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                            Incoming: +₹{inc.toFixed(2)}
                          </Typography>
                        )}
                        {out > 0 && (
                          <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>
                            Outgoing: -₹{out.toFixed(2)}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary">Balance Total</Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          ₹{rowTotal.toFixed(2)}
                        </Typography>
                      </Box>
                    </Box>
                  </Card>
                );
              })
            )}
          </Box>
        ) : (
          <Card sx={{ borderRadius: 2 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Incoming Money</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Outgoing Money</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ledgerEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">No entries recorded for {selectedPerson.name}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledgerEntries.map((entry) => {
                      const dt = formatTransactionDateTime(entry.date || entry.createdAt);
                      const inc = parseFloat(entry.incomingMoney || 0);
                      const out = parseFloat(entry.outgoingMoney || 0);
                      const rowTotal = parseFloat(entry.total || 0);

                      return (
                        <TableRow key={entry.id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{entry.details || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Typography variant="body2">{dt.dateStr}</Typography>
                            <Typography variant="caption" color="text.secondary">{dt.timeStr}</Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: inc > 0 ? 'success.main' : 'text.secondary' }}>
                            {inc > 0 ? `+₹${inc.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: out > 0 ? 'error.main' : 'text.secondary' }}>
                            {out > 0 ? `-₹${out.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            ₹{rowTotal.toFixed(2)}
                          </TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleDeleteEntry(entry.id)}>
                              <DeleteOutlineOutlined fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}

        {/* Add Ledger Entry Dialog */}
        <Dialog open={entryDialogOpen} onClose={() => setEntryDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
          <DialogTitle sx={{ fontWeight: 700 }}>Add Ledger Entry for {selectedPerson.name}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
            <Alert severity="info" sx={{ mb: 1 }}>
              Memory ledger only. This record will <strong>NOT</strong> modify your wallet or account balances.
            </Alert>
            <TextField
              label="Details / Description"
              value={entryForm.details}
              onChange={(e) => setEntryForm({ ...entryForm, details: e.target.value })}
              placeholder="e.g. Borrowed, Returned, Dinner share"
              fullWidth
              autoFocus
            />
            <TextField
              label="Date"
              type="date"
              value={entryForm.selectedDate}
              onChange={(e) => setEntryForm({ ...entryForm, selectedDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Incoming Money (₹)"
                  type="number"
                  value={entryForm.incomingMoney}
                  onChange={(e) => setEntryForm({ ...entryForm, incomingMoney: e.target.value })}
                  placeholder="0.00"
                  helperText="Increases personal ledger"
                  fullWidth
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Outgoing Money (₹)"
                  type="number"
                  value={entryForm.outgoingMoney}
                  onChange={(e) => setEntryForm({ ...entryForm, outgoingMoney: e.target.value })}
                  placeholder="0.00"
                  helperText="Decreases personal ledger"
                  fullWidth
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="outlined" onClick={() => setEntryDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSaveEntry} disabled={submittingEntry}>
              {submittingEntry ? <CircularProgress size={20} /> : 'Save Record'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // ==========================================
  // VIEW 1: PEOPLE LIST MAIN SCREEN
  // ==========================================
  return (
    <Box sx={{ position: 'relative' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
            People
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Personal memory ledger for money given or received (Memory purposes only)
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddOutlined />}
          onClick={() => setAddPersonOpen(true)}
          sx={{ borderRadius: 2 }}
        >
          Add Person
        </Button>
      </Box>

      {/* Search Bar */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search person name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> }}
          />
        </Grid>
      </Grid>

      {/* People Grid */}
      {people.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <PersonOutlineOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="h6" color="text.secondary">
            {search ? 'No people found matching your search' : 'No people added yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Keep track of who owes you or who you owe money to for personal memory.
          </Typography>
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setAddPersonOpen(true)}>
            Add Person
          </Button>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {people.map((p) => {
            const bal = parseFloat(p.balance || 0);
            return (
              <Grid item xs={12} sm={6} md={4} key={p.id}>
                <Card
                  onClick={() => setSelectedPerson(p)}
                  sx={{
                    borderRadius: 2,
                    cursor: 'pointer',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: theme.shadows[4]
                    },
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44, fontWeight: 700 }}>
                          {(p.name || 'P').charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            {p.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.entryCount || 0} {p.entryCount === 1 ? 'record' : 'records'}
                          </Typography>
                        </Box>
                      </Box>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeletePerson(p.id, p.name, e)}
                      >
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Box>

                    <Divider sx={{ my: 1.5 }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Memory Balance:
                      </Typography>
                      <Chip
                        label={
                          bal > 0
                            ? `+₹${bal.toFixed(2)} (To Receive)`
                            : bal < 0
                            ? `-₹${Math.abs(bal).toFixed(2)} (To Pay)`
                            : '₹0.00 (Settled)'
                        }
                        size="small"
                        sx={{
                          fontWeight: 700,
                          bgcolor: bal > 0 ? 'success.main' : bal < 0 ? 'error.main' : 'action.hover',
                          color: bal !== 0 ? '#ffffff' : 'text.primary'
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Add Person Dialog */}
      <Dialog open={addPersonOpen} onClose={() => setAddPersonOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Person</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            autoFocus
            label="Person Name"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreatePerson();
            }}
            placeholder="e.g. Arun, Priya, Kumar"
            fullWidth
            required
            helperText="Creates a personal memory ledger sheet"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setAddPersonOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreatePerson} disabled={submittingPerson}>
            {submittingPerson ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default People;
