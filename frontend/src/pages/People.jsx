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
  InputAdornment, useMediaQuery, useTheme, Avatar, Divider, Alert
} from '@mui/material';
import {
  AddOutlined, DeleteOutlineOutlined, SearchOutlined,
  ArrowBackOutlined, PersonOutlineOutlined, EditOutlined,
  CheckOutlined, CloseOutlined, NoteAltOutlined, ContentCopyOutlined,
  AccountBalanceWalletOutlined, TrendingUpOutlined, TrendingDownOutlined
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
  const isDark = theme.palette.mode === 'dark';

  // Dark bright blue line visible in both light and dark themes
  const sectionBorderColor = isDark ? '#2563eb' : '#1d4ed8';

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
      fetchPeople();
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

  // =========================================================================
  // VIEW 2: INDIVIDUAL PERSON DETAILS PAGE (Dashboard Structural Reference)
  // =========================================================================
  if (selectedPerson) {
    const netBalance = parseFloat(selectedPerson.balance || 0);
    const totalIncoming = parseFloat(selectedPerson.totalIncoming || 0);
    const totalOutgoing = parseFloat(selectedPerson.totalOutgoing || 0);

    // Matches Dashboard's responsive edge-to-edge layout styling
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

    // Summary cards data aligned in Dashboard structure
    const summaryCards = [
      {
        title: 'Total',
        value: netBalance > 0 ? `+₹${netBalance.toFixed(2)}` : netBalance < 0 ? `-₹${Math.abs(netBalance).toFixed(2)}` : '₹0.00',
        textColor: netBalance > 0 ? 'success.main' : netBalance < 0 ? 'error.main' : 'text.primary',
        icon: <AccountBalanceWalletOutlined sx={{ fontSize: 18 }} />,
        color: '#6366f1',
      },
      {
        title: 'Incoming Money',
        value: `+₹${totalIncoming.toFixed(2)}`,
        textColor: 'success.main',
        icon: <TrendingUpOutlined sx={{ fontSize: 18 }} />,
        color: '#10b981',
      },
      {
        title: 'Outgoing Money',
        value: `-₹${totalOutgoing.toFixed(2)}`,
        textColor: 'error.main',
        icon: <TrendingDownOutlined sx={{ fontSize: 18 }} />,
        color: '#ef4444',
      },
      {
        title: 'Notepad',
        value: (() => {
          const rawNote = (selectedPerson?.note || '').trim();
          if (!rawNote) return 'Personal Note';
          const words = rawNote.split(/\s+/);
          return words.slice(0, 2).join(' ');
        })(),
        icon: <NoteAltOutlined sx={{ fontSize: 18 }} />,
        color: '#3b82f6',
        subtitle: 'Click to open',
        tooltip: selectedPerson?.note ? selectedPerson.note : 'Personal Note',
        onClick: () => {
          setNoteText(selectedPerson.note || '');
          setNotepadOpen(true);
        },
      },
    ];

    return (
      <Box sx={{ flexGrow: 1, width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top Header - Structured like Dashboard header */}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton onClick={() => setSelectedPerson(null)} sx={{ border: '1px solid', borderColor: sectionBorderColor }}>
              <ArrowBackOutlined />
            </IconButton>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' } }}>
                {selectedPerson.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Personal Memory Ledger (Isolated from Wallet)
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setEntryDialogOpen(true)}
              sx={{ borderRadius: 1.5, px: 2, py: 0.75, fontSize: { xs: '0.75rem', sm: '0.85rem' } }}
            >
              Add Entry
            </Button>
          </Box>
        </Box>

        {/* Dashboard Connected Structure: Summary Cards connected directly to Ledger Section */}
        {/* Sections separated with dark bright blue lines visible in both light & dark themes */}
        <Box sx={{ ...fullBleedSx, display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
          {/* Row 1: Summary Cards Grid */}
          <Box
            sx={{
              ...gridRowSx,
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
            }}
          >
            {summaryCards.map((card, i) => (
              <Card
                key={i}
                onClick={card.onClick}
                title={card.tooltip || card.title}
                sx={{
                  ...sectionCardSx,
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid',
                  borderColor: sectionBorderColor,
                  cursor: card.onClick ? 'pointer' : 'default',
                  transition: card.onClick ? 'background-color 0.15s' : 'none',
                  '&:hover': card.onClick ? { bgcolor: 'action.hover' } : {},
                }}
              >
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
                      fontWeight: 600,
                      fontSize: { xs: '0.95rem', sm: '1rem', md: '1.1rem' },
                      wordBreak: 'break-word',
                      color: card.textColor || 'inherit'
                    }}
                  >
                    {card.value}
                  </Typography>
                  {card.subtitle && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      {card.subtitle}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Row 2: Ledger Section (Connected directly to Summary row below with dark bright blue border, eliminating empty gaps) */}
          <Box sx={{ ...gridRowSx, gridTemplateColumns: '1fr', flex: 1 }}>
            <Card sx={{ ...sectionCardSx, border: '1px solid', borderColor: sectionBorderColor, borderTop: 'none', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: '1px solid', borderColor: sectionBorderColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  Personal Ledger Records
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ledgerEntries.length} {ledgerEntries.length === 1 ? 'entry' : 'entries'}
                </Typography>
              </Box>

              {ledgerLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
              ) : isMobile ? (
                // Mobile layout with inline editing capability
                <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {ledgerEntries.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                      <Typography color="text.secondary" variant="body2">No entries in {selectedPerson.name}'s ledger yet.</Typography>
                    </Box>
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
                          <Card key={entry.id} sx={{ borderRadius: 1, p: 2, border: '1px solid', borderColor: sectionBorderColor, bgcolor: 'action.hover' }}>
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
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                                <Typography variant="body2" color="text.secondary">Calculated Total:</Typography>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                  ₹{calculatedTotal.toFixed(2)}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 0.5 }}>
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
                        <Card key={entry.id} sx={{ borderRadius: 1, p: 1.5, border: '1px solid', borderColor: sectionBorderColor }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
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
                          <Divider sx={{ my: 1, borderColor: isDark ? 'rgba(37, 99, 235, 0.3)' : 'rgba(29, 78, 216, 0.3)' }} />
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                              {inc > 0 && (
                                <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600, fontSize: '0.8rem' }}>
                                  Incoming: +₹{inc.toFixed(2)}
                                </Typography>
                              )}
                              {out > 0 && (
                                <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 600, fontSize: '0.8rem' }}>
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
                // Desktop / Tablet Clean Table
                // Required exact column order: Date | Details | Incoming | Outgoing | Total | Actions
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover', borderBottom: '1.5px solid', borderColor: sectionBorderColor }}>
                        <TableCell sx={{ fontWeight: 700, width: '18%', py: 1.5, pl: 2, borderColor: sectionBorderColor }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: '28%', py: 1.5, borderColor: sectionBorderColor }}>Details</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, width: '14%', py: 1.5, borderColor: sectionBorderColor }}>Incoming</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, width: '14%', py: 1.5, borderColor: sectionBorderColor }}>Outgoing</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, width: '14%', py: 1.5, borderColor: sectionBorderColor }}>Total</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, width: '12%', py: 1.5, pr: 2, borderColor: sectionBorderColor }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ledgerEntries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 6, borderColor: sectionBorderColor }}>
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
                              <TableRow key={entry.id} sx={{ bgcolor: 'action.selected', '& td': { borderColor: isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(29, 78, 216, 0.2)' } }}>
                                {/* 1. Date Input */}
                                <TableCell sx={{ pl: 2 }}>
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
                                <TableCell align="center" sx={{ whiteSpace: 'nowrap', pr: 2 }}>
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
                                    variant="contained"
                                    color="error"
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
                            <TableRow key={entry.id} hover sx={{ '& td': { borderColor: isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(29, 78, 216, 0.2)' } }}>
                              {/* 1. Date */}
                              <TableCell sx={{ whiteSpace: 'nowrap', pl: 2 }}>
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
                              <TableCell align="center" sx={{ whiteSpace: 'nowrap', pr: 2 }}>
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
              )}
            </Card>
          </Box>
        </Box>

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
            <Button variant="contained" color="error" onClick={() => setEntryDialogOpen(false)}>Cancel</Button>
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
              variant="contained"
              color="primary"
              startIcon={<ContentCopyOutlined />}
              onClick={() => copyTextToClipboard(noteText)}
            >
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" color="error" onClick={() => setNotepadOpen(false)}>
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

  // =========================================================================
  // VIEW 1: PEOPLE LIST MAIN SCREEN (Matching Card Size as Accounts Page)
  // =========================================================================
  return (
    <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.5px' }}>
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
        >
          Add Person
        </Button>
      </Box>

      {/* Search Bar */}
      <Box sx={{ mb: 3, maxWidth: { xs: '100%', sm: 360 } }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search person name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> }}
        />
      </Box>

      {/* People Grid (Exact Same Card Size and Grid Structure as Accounts Page) */}
      {people.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center' }}>
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
          {people.map((p) => {
            const bal = parseFloat(p.balance || 0);
            const color = '#6366f1';
            return (
              <Card
                key={p.id}
                onClick={() => setSelectedPerson(p)}
                sx={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderTop: `3px solid ${color}`,
                  width: '100%',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: theme.shadows[4],
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Avatar sx={{ bgcolor: `${color}20`, color, borderRadius: 2, width: 40, height: 40, fontWeight: 700 }}>
                      {(p.name || 'P').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeletePerson(p.id, p.name, e)}
                        aria-label="Delete person"
                      >
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, wordBreak: 'break-word' }}>
                    {p.name}
                  </Typography>
                  <Chip
                    label={`${p.entryCount || 0} ${p.entryCount === 1 ? 'record' : 'records'}`}
                    size="small"
                    sx={{ mb: 2, bgcolor: `${color}15`, color, fontWeight: 600, borderRadius: 1.5 }}
                  />
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 600,
                      color: bal > 0 ? 'success.main' : bal < 0 ? 'error.main' : 'text.primary',
                    }}
                  >
                    {bal > 0 ? `+₹${bal.toFixed(2)}` : bal < 0 ? `-₹${Math.abs(bal).toFixed(2)}` : '₹0.00'}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
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
            placeholder="Enter Name"
            fullWidth
            required
            helperText="Creates a personal memory ledger sheet"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setAddPersonOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreatePerson} disabled={submittingPerson}>
            {submittingPerson ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default People;
