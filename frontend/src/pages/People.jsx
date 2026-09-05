import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  formatTransactionDateTime,
  createTransactionDateTime
} from '../lib/transactionSorter';
import {
  Box, Typography, Card, CardContent, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, CircularProgress, Grid,
  InputAdornment, useMediaQuery, useTheme, Avatar, Divider, Alert,
  List, ListItem, ListItemAvatar, ListItemText
} from '@mui/material';
import {
  AddOutlined, DeleteOutlineOutlined, SearchOutlined,
  ArrowBackOutlined, PersonOutlineOutlined, EditOutlined,
  CheckOutlined, CloseOutlined, NoteAltOutlined, ContentCopyOutlined,
  ChevronRightOutlined
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Universal clipboard copy helper with WebView fallback.
 * Preserves exact text formatting, line breaks, and whitespace.
 */
const copyTextToClipboard = async (text) => {
  if (!text) {
    toast.error('Note is empty');
    return false;
  }
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch {
      copied = false;
    }
  }
  if (copied) {
    toast.success('Copied!');
  } else {
    toast.error('Failed to copy text');
  }
  return copied;
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

  // Inline Row Editing state
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowForm, setEditRowForm] = useState({
    details: '',
    selectedDate: '',
    incomingMoney: '',
    outgoingMoney: '',
  });
  const [submittingEditRow, setSubmittingEditRow] = useState(false);

  // Notepad Modal state
  const [notepadOpen, setNotepadOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Load people list
  const fetchPeople = async () => {
    try {
      const res = await api.get(`/api/people?search=${encodeURIComponent(search)}`);
      setPeople(res.data || []);
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
      toast.error('Failed to delete entry');
    }
  };

  // Start Inline Editing for a specific row
  const handleStartEditRow = (entry) => {
    const rawDate = entry.date || entry.createdAt;
    const dateObj = new Date(rawDate);
    const dateStr = !isNaN(dateObj.getTime()) ? getLocalDateString(dateObj) : getLocalDateString();

    setEditingRowId(entry.id);
    setEditRowForm({
      details: entry.details || '',
      selectedDate: dateStr,
      incomingMoney: entry.incomingMoney !== undefined ? String(entry.incomingMoney) : '',
      outgoingMoney: entry.outgoingMoney !== undefined ? String(entry.outgoingMoney) : '',
    });
  };

  // Cancel Inline Editing
  const handleCancelEditRow = () => {
    setEditingRowId(null);
    setEditRowForm({
      details: '',
      selectedDate: '',
      incomingMoney: '',
      outgoingMoney: '',
    });
  };

  // Helper to get previous chronological total for inline preview
  const getChronologicalPreviousTotal = (entryId) => {
    const chrono = [...ledgerEntries].sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    const index = chrono.findIndex(e => e.id === entryId);
    if (index <= 0) return 0;
    return parseFloat(chrono[index - 1].total || 0);
  };

  // Save Inline Edited Row
  const handleSaveEditRow = async (entryId) => {
    const incoming = parseFloat(editRowForm.incomingMoney || 0);
    const outgoing = parseFloat(editRowForm.outgoingMoney || 0);

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

    setSubmittingEditRow(true);
    try {
      const existingEntry = ledgerEntries.find(e => e.id === entryId);
      const transactionDateTime = createTransactionDateTime(editRowForm.selectedDate);
      const payload = {
        details: editRowForm.details.trim() || 'Record',
        date: transactionDateTime,
        selectedDate: editRowForm.selectedDate,
        incomingMoney: incoming,
        outgoingMoney: outgoing,
        createdAt: existingEntry?.createdAt || transactionDateTime,
      };

      await api.put(`/api/people/ledger/${entryId}`, payload);
      toast.success('Entry updated');
      setEditingRowId(null);
      await fetchLedger(selectedPerson.id);
      fetchPeople();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update entry');
    } finally {
      setSubmittingEditRow(false);
    }
  };

  // Handle Save Notepad
  const handleSaveNote = async () => {
    if (!selectedPerson) return;
    setSavingNote(true);
    try {
      await api.put(`/api/people/${selectedPerson.id}/note`, { noteText });
      setSelectedPerson(prev => ({ ...prev, note: noteText }));
      toast.success('Note saved');
      setNotepadOpen(false);
      fetchPeople();
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSavingNote(false);
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
      <Box sx={{ flexGrow: 1, width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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

        {/* Summary Cards: Total | Incoming Money | Outgoing Money | Personal Note */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Total
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700,
                    mt: 0.5,
                    color: netBalance > 0 ? 'success.main' : netBalance < 0 ? 'error.main' : 'text.secondary'
                  }}
                >
                  {netBalance > 0 ? `+₹${netBalance.toFixed(2)}` : netBalance < 0 ? `-₹${Math.abs(netBalance).toFixed(2)}` : '₹0.00'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Incoming Money
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main', mt: 0.5 }}>
                  +₹{totalIncoming.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Outgoing Money
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main', mt: 0.5 }}>
                  -₹{totalOutgoing.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Card
              onClick={() => {
                setNoteText(selectedPerson.note || '');
                setNotepadOpen(true);
              }}
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: selectedPerson.note ? 'primary.main' : 'divider',
                height: '100%',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: theme.shadows[3]
                }
              }}
            >
              <CardContent sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <NoteAltOutlined color="primary" sx={{ fontSize: 22 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Personal Note
                    </Typography>
                  </Box>
                  {selectedPerson.note && (
                    <Chip label="Saved" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedPerson.note ? selectedPerson.note : 'Tap to add note'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Ledger Table: Column Order: Date | Details | Incoming | Outgoing | Total | Actions */}
        {ledgerLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ledgerEntries.length === 0 ? (
              <Card sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <Typography color="text.secondary">No entries in {selectedPerson.name}'s ledger yet.</Typography>
              </Card>
            ) : (
              ledgerEntries.map((entry) => {
                const dt = formatTransactionDateTime(entry.date || entry.createdAt);
                const inc = parseFloat(entry.incomingMoney || 0);
                const out = parseFloat(entry.outgoingMoney || 0);
                const rowTotal = parseFloat(entry.total || 0);
                const isEditing = editingRowId === entry.id;

                if (isEditing) {
                  const prevTotal = getChronologicalPreviousTotal(entry.id);
                  const editInc = parseFloat(editRowForm.incomingMoney || 0);
                  const editOut = parseFloat(editRowForm.outgoingMoney || 0);
                  const calculatedTotal = prevTotal + (isNaN(editInc) ? 0 : editInc) - (isNaN(editOut) ? 0 : editOut);

                  return (
                    <Card key={entry.id} sx={{ borderRadius: 2, p: 2, border: '2px solid', borderColor: 'primary.main' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                        Edit Ledger Entry
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <TextField
                          label="Date"
                          type="date"
                          size="small"
                          value={editRowForm.selectedDate}
                          onChange={(e) => setEditRowForm({ ...editRowForm, selectedDate: e.target.value })}
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                          label="Details"
                          size="small"
                          value={editRowForm.details}
                          onChange={(e) => setEditRowForm({ ...editRowForm, details: e.target.value })}
                          fullWidth
                        />
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <TextField
                              label="Incoming (₹)"
                              type="number"
                              size="small"
                              value={editRowForm.incomingMoney}
                              onChange={(e) => setEditRowForm({ ...editRowForm, incomingMoney: e.target.value })}
                              fullWidth
                              inputProps={{ min: 0, step: 'any' }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              label="Outgoing (₹)"
                              type="number"
                              size="small"
                              value={editRowForm.outgoingMoney}
                              onChange={(e) => setEditRowForm({ ...editRowForm, outgoingMoney: e.target.value })}
                              fullWidth
                              inputProps={{ min: 0, step: 'any' }}
                            />
                          </Grid>
                        </Grid>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                          <Typography variant="body2" color="text.secondary">Calculated Total:</Typography>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                            ₹{calculatedTotal.toFixed(2)}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                          <Button size="small" variant="outlined" color="inherit" onClick={handleCancelEditRow} disabled={submittingEditRow}>
                            Cancel
                          </Button>
                          <Button size="small" variant="contained" onClick={() => handleSaveEditRow(entry.id)} disabled={submittingEditRow}>
                            {submittingEditRow ? <CircularProgress size={16} /> : 'Save'}
                          </Button>
                        </Box>
                      </Box>
                    </Card>
                  );
                }

                return (
                  <Card key={entry.id} sx={{ borderRadius: 2, p: 2, position: 'relative' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {dt.dateStr} • {dt.timeStr}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {entry.details || 'Record'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" color="primary" onClick={() => handleStartEditRow(entry)} title="Edit">
                          <EditOutlined fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteEntry(entry.id)} title="Delete">
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      </Box>
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
                        <Typography variant="caption" color="text.secondary">Total</Typography>
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
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700, width: '18%' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: '28%' }}>Details</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: '14%' }}>Incoming</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: '14%' }}>Outgoing</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: '14%' }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, width: '12%' }}>Actions</TableCell>
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
                      const isEditing = editingRowId === entry.id;

                      if (isEditing) {
                        const prevTotal = getChronologicalPreviousTotal(entry.id);
                        const editInc = parseFloat(editRowForm.incomingMoney || 0);
                        const editOut = parseFloat(editRowForm.outgoingMoney || 0);
                        const calculatedTotal = prevTotal + (isNaN(editInc) ? 0 : editInc) - (isNaN(editOut) ? 0 : editOut);

                        return (
                          <TableRow key={entry.id} sx={{ bgcolor: 'action.selected' }}>
                            {/* 1. Date Input */}
                            <TableCell>
                              <TextField
                                type="date"
                                size="small"
                                value={editRowForm.selectedDate}
                                onChange={(e) => setEditRowForm({ ...editRowForm, selectedDate: e.target.value })}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                              />
                            </TableCell>

                            {/* 2. Details Input */}
                            <TableCell>
                              <TextField
                                size="small"
                                value={editRowForm.details}
                                onChange={(e) => setEditRowForm({ ...editRowForm, details: e.target.value })}
                                fullWidth
                                placeholder="Details"
                              />
                            </TableCell>

                            {/* 3. Incoming Input */}
                            <TableCell align="right">
                              <TextField
                                type="number"
                                size="small"
                                value={editRowForm.incomingMoney}
                                onChange={(e) => setEditRowForm({ ...editRowForm, incomingMoney: e.target.value })}
                                placeholder="0.00"
                                inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
                                fullWidth
                              />
                            </TableCell>

                            {/* 4. Outgoing Input */}
                            <TableCell align="right">
                              <TextField
                                type="number"
                                size="small"
                                value={editRowForm.outgoingMoney}
                                onChange={(e) => setEditRowForm({ ...editRowForm, outgoingMoney: e.target.value })}
                                placeholder="0.00"
                                inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
                                fullWidth
                              />
                            </TableCell>

                            {/* 5. Calculated Total (Read-only) */}
                            <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                              ₹{calculatedTotal.toFixed(2)}
                            </TableCell>

                            {/* 6. Actions (Save / Cancel) */}
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleSaveEditRow(entry.id)}
                                disabled={submittingEditRow}
                                title="Save"
                              >
                                {submittingEditRow ? <CircularProgress size={16} /> : <CheckOutlined fontSize="small" />}
                              </IconButton>
                              <IconButton
                                size="small"
                                color="inherit"
                                onClick={handleCancelEditRow}
                                disabled={submittingEditRow}
                                title="Cancel"
                              >
                                <CloseOutlined fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return (
                        <TableRow key={entry.id} hover>
                          {/* 1. Date */}
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{dt.dateStr}</Typography>
                            <Typography variant="caption" color="text.secondary">{dt.timeStr}</Typography>
                          </TableCell>

                          {/* 2. Details */}
                          <TableCell sx={{ fontWeight: 600 }}>{entry.details || '—'}</TableCell>

                          {/* 3. Incoming */}
                          <TableCell align="right" sx={{ fontWeight: 600, color: inc > 0 ? 'success.main' : 'text.secondary' }}>
                            {inc > 0 ? `+₹${inc.toFixed(2)}` : '—'}
                          </TableCell>

                          {/* 4. Outgoing */}
                          <TableCell align="right" sx={{ fontWeight: 600, color: out > 0 ? 'error.main' : 'text.secondary' }}>
                            {out > 0 ? `-₹${out.toFixed(2)}` : '—'}
                          </TableCell>

                          {/* 5. Total */}
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            ₹{rowTotal.toFixed(2)}
                          </TableCell>

                          {/* 6. Actions */}
                          <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                            <IconButton size="small" color="primary" onClick={() => handleStartEditRow(entry)} title="Edit">
                              <EditOutlined fontSize="small" />
                            </IconButton>
                            <IconButton size="small" color="error" onClick={() => handleDeleteEntry(entry.id)} title="Delete">
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
                  inputProps={{ min: 0, step: 'any' }}
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
                  inputProps={{ min: 0, step: 'any' }}
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

        {/* Notepad Modal */}
        <Dialog
          open={notepadOpen}
          onClose={() => setNotepadOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Notepad</Typography>
              <Typography variant="caption" color="text.secondary">{selectedPerson.name}'s Personal Note</Typography>
            </Box>
            <IconButton size="small" onClick={() => setNotepadOpen(false)}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ pt: 2 }}>
            <TextField
              multiline
              rows={8}
              fullWidth
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type personal notes here...&#10;&#10;Example:&#10;Need to collect money from Arun.&#10;He said he will return it next Monday.&#10;Contact him after 6 PM."
              variant="outlined"
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  lineHeight: 1.5,
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              startIcon={<ContentCopyOutlined />}
              onClick={() => copyTextToClipboard(noteText)}
            >
              Copy Text
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" color="inherit" onClick={() => setNotepadOpen(false)}>
                Close
              </Button>
              <Button variant="contained" color="primary" onClick={handleSaveNote} disabled={savingNote}>
                {savingNote ? <CircularProgress size={20} /> : 'Save'}
              </Button>
            </Box>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // ==========================================
  // VIEW 1: PEOPLE LIST MAIN SCREEN (Dashboard Responsive Style)
  // ==========================================
  return (
    <Box sx={{ flexGrow: 1, width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 1.5, sm: 2 },
          mb: { xs: 2, sm: 2.5 },
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' } }}>
            People
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Personal memory ledger for money given or received (Memory purposes only)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={() => setAddPersonOpen(true)}
            sx={{ borderRadius: 2, px: 2.5 }}
          >
            Add Person
          </Button>
        </Box>
      </Box>

      {/* Search Bar */}
      <Box sx={{ mb: 2.5, maxWidth: { xs: '100%', sm: 360 } }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search person..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> }}
        />
      </Box>

      {/* People List / Table (Dashboard Style Responsive Layout) */}
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
      ) : isMobile ? (
        // Mobile compact list
        <Card sx={{ borderRadius: 2 }}>
          <List sx={{ py: 0 }}>
            {people.map((p, idx) => {
              const bal = parseFloat(p.balance || 0);
              return (
                <React.Fragment key={p.id}>
                  <ListItem
                    onClick={() => setSelectedPerson(p)}
                    sx={{
                      cursor: 'pointer',
                      py: 1.5,
                      px: 2,
                      display: 'flex',
                      alignItems: 'center',
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'primary.main', width: 38, height: 38, fontWeight: 700, fontSize: '0.9rem' }}>
                        {(p.name || 'P').charAt(0).toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {p.name}
                          </Typography>
                          {p.note && <NoteAltOutlined sx={{ fontSize: 14, color: 'primary.main' }} />}
                        </Box>
                      }
                      secondary={`${p.entryCount || 0} ${p.entryCount === 1 ? 'record' : 'records'}`}
                      sx={{ mr: 1 }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 800,
                          color: bal > 0 ? 'success.main' : bal < 0 ? 'error.main' : 'text.secondary',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {bal > 0 ? `+₹${bal.toFixed(2)}` : bal < 0 ? `-₹${Math.abs(bal).toFixed(2)}` : '₹0.00'}
                      </Typography>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeletePerson(p.id, p.name, e)}
                      >
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItem>
                  {idx < people.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </List>
        </Card>
      ) : (
        // Desktop / Tablet Clean Table
        <Card sx={{ borderRadius: 2 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Person</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Records</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, width: 140 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {people.map((p) => {
                  const bal = parseFloat(p.balance || 0);
                  return (
                    <TableRow
                      key={p.id}
                      hover
                      onClick={() => setSelectedPerson(p)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontWeight: 700, fontSize: '0.85rem' }}>
                            {(p.name || 'P').charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {p.name}
                              </Typography>
                              {p.note && <NoteAltOutlined sx={{ fontSize: 16, color: 'primary.main' }} titleAccess="Has personal note" />}
                            </Box>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 800,
                            color: bal > 0 ? 'success.main' : bal < 0 ? 'error.main' : 'text.secondary'
                          }}
                        >
                          {bal > 0 ? `+₹${bal.toFixed(2)}` : bal < 0 ? `-₹${Math.abs(bal).toFixed(2)}` : '₹0.00'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {p.entryCount || 0} {p.entryCount === 1 ? 'record' : 'records'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => setSelectedPerson(p)}
                            title="Open Ledger"
                          >
                            <ChevronRightOutlined fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => handleDeletePerson(p.id, p.name, e)}
                            title="Delete"
                          >
                            <DeleteOutlineOutlined fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
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
