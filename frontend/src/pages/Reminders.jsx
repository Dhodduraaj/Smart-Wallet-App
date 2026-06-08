import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import {
  Box, Typography, Card, CardContent, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Switch, FormControlLabel, IconButton,
  Chip, CircularProgress, Divider, List, ListItem, ListItemText, ListItemSecondaryAction,
  useMediaQuery, useTheme
} from '@mui/material';
import {
  AddOutlined, EditOutlined, DeleteOutlineOutlined,
  CheckCircleOutlineOutlined, RadioButtonUncheckedOutlined,
  NotificationsActiveOutlined, AccessTimeOutlined,
} from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import { getDeviceTimeZone } from '../lib/deviceTimezone';

const syncAndroidNotifications = async (enabled, reminderTime) => {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    if (enabled) {
      const [hour, minute] = (reminderTime || '21:00').split(':').map(Number);
      
      await LocalNotifications.createChannel({
        id: 'reminder-channel',
        name: 'Daily Reminders',
        description: 'Channel for daily expense entry reminders',
        importance: 5, // High
        visibility: 1, // Public
        vibration: true
      });

      await LocalNotifications.schedule({
        notifications: [
          {
            title: "Daily Expense Reminder",
            body: "Don't forget to log your expenses today!",
            id: 1,
            channelId: 'reminder-channel',
            schedule: {
              on: {
                hour: hour,
                minute: minute
              },
              repeats: true,
              allowWhileIdle: true
            }
          }
        ]
      });
    }
  } catch (err) {
    console.error('Error syncing notifications:', err);
  }
};

const formatTimeForInput = (time) => {
  if (!time) return '21:00';
  if (typeof time === 'string') return time.length >= 5 ? time.slice(0, 5) : time;
  if (typeof time === 'object' && time.hour != null) {
    return `${String(time.hour).padStart(2, '0')}:${String(time.minute ?? 0).padStart(2, '0')}`;
  }
  return '21:00';
};

const Reminders = () => {
  const [dailyConfig, setDailyConfig] = useState({
    enabled: false,
    reminderTime: '21:00',
    reminderZoneId: getDeviceTimeZone(),
  });
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', amount: '', dueDate: '', reminderDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchData = async () => {
    try {
      const [configRes, payRes] = await Promise.all([
        api.get('/api/reminders/daily'),
        api.get('/api/reminders/upcoming'),
      ]);
      const cfg = configRes.data;
      const updatedConfig = {
        ...cfg,
        reminderTime: formatTimeForInput(cfg.reminderTime),
        reminderZoneId: cfg.reminderZoneId || getDeviceTimeZone(),
      };
      setDailyConfig(updatedConfig);
      setPayments(payRes.data);

      if (Capacitor.getPlatform() === 'android') {
        await syncAndroidNotifications(updatedConfig.enabled, updatedConfig.reminderTime);
      }
    } catch { toast.error('Failed to load reminders'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDailyUpdate = async (field, value) => {
    const zoneId = getDeviceTimeZone();
    const updated = {
      ...dailyConfig,
      [field]: value,
      reminderZoneId: zoneId,
    };

    const isAndroid = Capacitor.getPlatform() === 'android';

    if (isAndroid && ((field === 'enabled' && value === true) || (field === 'reminderTime' && dailyConfig.enabled))) {
      try {
        const check = await LocalNotifications.checkPermissions();
        let status = check.display;
        if (status !== 'granted') {
          const req = await LocalNotifications.requestPermissions();
          status = req.display;
        }
        if (status !== 'granted') {
          toast.error('Notification permission denied. Cannot enable daily reminders.');
          return;
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
        toast.error('Failed to request notification permission');
        return;
      }
    }

    setDailyConfig(updated);
    try {
      await api.put('/api/reminders/daily', {
        enabled: updated.enabled,
        reminderTime: updated.reminderTime,
        reminderZoneId: zoneId,
      });
      toast.success('Daily reminder updated');
      if (isAndroid) {
        await syncAndroidNotifications(updated.enabled, updated.reminderTime);
      }
    } catch { toast.error('Failed to update'); }
  };

  const openCreate = () => {
    setEditId(null);
    const today = new Date().toISOString().split('T')[0];
    setForm({ title: '', description: '', amount: '', dueDate: '', reminderDate: today });
    setDialogOpen(true);
  };
  const openEdit = (p) => {
    setEditId(p.id);
    setForm({ title: p.title, description: p.description || '', amount: String(p.amount), dueDate: p.dueDate, reminderDate: p.reminderDate });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.amount || !form.dueDate || !form.reminderDate) { toast.error('Fill required fields'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editId) { await api.put(`/api/reminders/upcoming/${editId}`, payload); toast.success('Payment updated'); }
      else { await api.post('/api/reminders/upcoming', payload); toast.success('Payment reminder created'); }
      setDialogOpen(false); fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const toggleComplete = async (p) => {
    try {
      await api.patch(`/api/reminders/upcoming/${p.id}/completed?completed=${!p.completed}`);
      toast.success(p.completed ? 'Marked as pending' : 'Marked as completed');
      fetchData();
    } catch { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payment reminder?')) return;
    try { await api.delete(`/api/reminders/upcoming/${id}`); toast.success('Deleted'); fetchData(); }
    catch { toast.error('Failed to delete'); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}><CircularProgress /></Box>;

  const pendingPayments = payments.filter(p => !p.completed);
  const completedPayments = payments.filter(p => p.completed);

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 4, fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.25rem' } }}>Reminders</Typography>

      {/* Daily Expense Reminder Config */}
      <Card sx={{ mb: 4, borderRadius: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <NotificationsActiveOutlined color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Daily Expense Entry Reminder</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Get reminded every day to log your expenses. The system will send you an email at the configured time.
          </Typography>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm="auto">
              <FormControlLabel
                control={<Switch checked={dailyConfig.enabled} onChange={(e) => handleDailyUpdate('enabled', e.target.checked)} color="primary" />}
                label={dailyConfig.enabled ? 'Enabled' : 'Disabled'}
              />
            </Grid>
            <Grid item xs={12} sm="auto">
              <TextField
                label="Reminder Time"
                type="time"
                value={dailyConfig.reminderTime || '21:00'}
                onChange={(e) => handleDailyUpdate('reminderTime', e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: <AccessTimeOutlined sx={{ mr: 1, color: 'text.secondary' }} /> }}
                disabled={!dailyConfig.enabled}
                fullWidth={isMobile}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Upcoming Payments Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Upcoming Payments</Typography>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate} sx={{ borderRadius: 2 }}>
          Add Payment
        </Button>
      </Box>

      {/* Pending */}
      {pendingPayments.length > 0 && (
        <Card sx={{ mb: 3, borderRadius: 2 }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ px: 3, pt: 2, pb: 1 }}>
              <Typography variant="subtitle2" color="warning.main" sx={{ fontWeight: 700 }}>PENDING ({pendingPayments.length})</Typography>
            </Box>
            <List>
              {pendingPayments.map((p, i) => (
                <React.Fragment key={p.id}>
                  <ListItem 
                    sx={{ 
                      px: 3, 
                      py: 2,
                      flexDirection: isMobile ? 'column' : 'row',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      position: 'relative'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <IconButton onClick={() => toggleComplete(p)} sx={{ mr: 1, p: 0.5 }}>
                        <RadioButtonUncheckedOutlined color="warning" />
                      </IconButton>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: { xs: '0.95rem', sm: '1rem' } }}>{p.title}</Typography>
                        {p.description && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{p.description}</Typography>}
                      </Box>
                      {isMobile && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton size="small" onClick={() => openEdit(p)}><EditOutlined fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDelete(p.id)}><DeleteOutlineOutlined fontSize="small" /></IconButton>
                        </Box>
                      )}
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: isMobile ? 1.5 : 0, pl: isMobile ? 4.5 : 0, width: isMobile ? '100%' : 'auto', justifyContent: 'flex-start' }}>
                      <Chip label={`₹${p.amount}`} size="small" color="error" variant="outlined" sx={{ fontWeight: 700 }} />
                      <Chip label={`Due: ${p.dueDate}`} size="small" variant="outlined" />
                      <Chip label={`Remind: ${p.reminderDate}`} size="small" variant="outlined" />
                    </Box>

                    {!isMobile && (
                      <ListItemSecondaryAction>
                        <IconButton size="small" onClick={() => openEdit(p)}><EditOutlined fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(p.id)}><DeleteOutlineOutlined fontSize="small" /></IconButton>
                      </ListItemSecondaryAction>
                    )}
                  </ListItem>
                  {i < pendingPayments.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Completed */}
      {completedPayments.length > 0 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ px: 3, pt: 2, pb: 1 }}>
              <Typography variant="subtitle2" color="success.main" sx={{ fontWeight: 700 }}>COMPLETED ({completedPayments.length})</Typography>
            </Box>
            <List>
              {completedPayments.map((p, i) => (
                <React.Fragment key={p.id}>
                  <ListItem 
                    sx={{ 
                      px: 3, 
                      py: 2, 
                      opacity: 0.6,
                      flexDirection: isMobile ? 'column' : 'row',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      position: 'relative'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <IconButton onClick={() => toggleComplete(p)} sx={{ mr: 1, p: 0.5 }}>
                        <CheckCircleOutlineOutlined color="success" />
                      </IconButton>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography sx={{ fontWeight: 600, textDecoration: 'line-through', fontSize: { xs: '0.95rem', sm: '1rem' } }}>{p.title}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>₹{p.amount} • Due: {p.dueDate}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" color="error" onClick={() => handleDelete(p.id)}><DeleteOutlineOutlined fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  </ListItem>
                  {i < completedPayments.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {payments.length === 0 && (
        <Card sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', borderRadius: 2 }}>
          <NotificationsActiveOutlined sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No upcoming payments</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>Add reminders for rent, EMI, bills, etc.</Typography>
          <Button variant="contained" startIcon={<AddOutlined />} onClick={openCreate} sx={{ borderRadius: 2 }}>Add Payment Reminder</Button>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? 'Edit Payment' : 'Add Payment Reminder'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Title" placeholder="e.g. House Rent, EMI" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required fullWidth />
          <TextField label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth />
          <TextField label="Amount (₹)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required fullWidth />
          <Grid container spacing={2}>
            <Grid item xs={6}><TextField label="Due Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required fullWidth InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={6}><TextField label="Reminder Date" type="date" value={form.reminderDate} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} required fullWidth InputLabelProps={{ shrink: true }} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={submitting}>{submitting ? <CircularProgress size={20} /> : editId ? 'Update' : 'Create'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Reminders;
