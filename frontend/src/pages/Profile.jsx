import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Box, Typography, Card, CardContent, Avatar, Divider, Grid, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton
} from '@mui/material';
import {
  PersonOutlineOutlined, EmailOutlined, CalendarTodayOutlined, LogoutOutlined, LockOutlined, EditOutlined
} from '@mui/icons-material';
import api from '../lib/api';
import { toast } from 'react-hot-toast';
import PasswordField from '../components/PasswordField';

const AVATARS = [
  { id: 'po', name: 'Po' },
  { id: 'tigress', name: 'Tigress' },
  { id: 'shifu', name: 'Shifu' },
  { id: 'oogway', name: 'Oogway' },
  { id: 'sid', name: 'Sid' },
  { id: 'manny', name: 'Manny' },
  { id: 'diego', name: 'Diego' },
  { id: 'scrat', name: 'Scrat' }
];

const maskUserId = (id) => {
  if (!id) return '';
  const str = String(id);
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 5) {
      return `${parts[0]}-••••-${parts[4].slice(-4)}`;
    }
  }
  if (str.length > 12) {
    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  }
  return str;
};

const Profile = () => {
  const { user, logout, refreshUser } = useAuth();

  // Avatar selection state
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);

  // Change password state
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Logout confirmation state
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const handleOpenAvatarDialog = () => {
    setSelectedAvatar(user?.avatar || 'po');
    setAvatarDialogOpen(true);
  };

  const handleSaveAvatar = async () => {
    setAvatarSubmitting(true);
    try {
      await api.put('/api/user/profile-avatar', { avatar: selectedAvatar });
      toast.success('Profile image updated');
      setAvatarDialogOpen(false);
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update avatar');
    } finally {
      setAvatarSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('All fields are required');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New password and confirm password do not match');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await api.post('/api/user/change-password', passwordForm);
      toast.success('Password updated successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 4 }}>Profile</Typography>

      <Grid container spacing={4}>
        {/* User Info Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Box sx={{ position: 'relative', width: 100, height: 100, mx: 'auto', mb: 3 }}>
                <Avatar
                  src={user?.avatar ? `/avatars/${user.avatar}.png` : undefined}
                  sx={{
                    width: 100,
                    height: 100,
                    fontSize: 40,
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  }}
                >
                  {!user?.avatar && (user?.fullName?.charAt(0)?.toUpperCase() || 'U')}
                </Avatar>
                <IconButton
                  onClick={handleOpenAvatarDialog}
                  sx={{
                    position: 'absolute',
                    bottom: -6,
                    right: -6,
                    bgcolor: 'primary.main',
                    color: 'white',
                    width: 32,
                    height: 32,
                    border: '2px solid',
                    borderColor: 'background.paper',
                    '&:hover': { bgcolor: 'primary.dark' },
                  }}
                  size="small"
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Box>

              <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
                {user?.fullName || 'Unknown User'}
              </Typography>
              <Chip label="Active Member" color="success" size="small" sx={{ mb: 3, fontWeight: 600 }} />

              <Divider sx={{ my: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PersonOutlineOutlined color="primary" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Full Name</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{user?.fullName}</Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <EmailOutlined color="primary" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Email Address</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{user?.email}</Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CalendarTodayOutlined color="primary" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">User ID</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {maskUserId(user?.userId || user?.id)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Actions Card */}
        <Grid item xs={12} md={6}>
          {/* Change Password Card */}
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockOutlined color="primary" /> Change Password
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <PasswordField
                  label="Current Password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  size="small"
                />
                <PasswordField
                  label="New Password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  size="small"
                />
                <PasswordField
                  label="Confirm New Password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  size="small"
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleChangePassword}
                  disabled={passwordSubmitting}
                  sx={{ mt: 1, py: 1.25, fontWeight: 700, borderRadius: 2 }}
                >
                  {passwordSubmitting ? 'Updating...' : 'Update Password'}
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Button
            fullWidth
            variant="outlined"
            color="error"
            size="large"
            startIcon={<LogoutOutlined />}
            onClick={() => setLogoutDialogOpen(true)}
            sx={{ py: 1.5 }}
          >
            Log Out
          </Button>
        </Grid>
      </Grid>

      {/* Avatar Selection Dialog */}
      <Dialog open={avatarDialogOpen} onClose={() => setAvatarDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Choose Profile Image</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>PREVIEW</Typography>
              <Avatar
                src={`/avatars/${selectedAvatar}.png`}
                sx={{
                  width: 80,
                  height: 80,
                  mx: 'auto',
                  border: '3px solid',
                  borderColor: 'primary.main',
                  boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)',
                }}
              />
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                {AVATARS.find(a => a.id === selectedAvatar)?.name || ''}
              </Typography>
            </Box>
          </Box>
          <Grid container spacing={2}>
            {AVATARS.map((avatar) => {
              const isSelected = selectedAvatar === avatar.id;
              return (
                <Grid item xs={3} key={avatar.id}>
                  <Box
                    onClick={() => setSelectedAvatar(avatar.id)}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 3,
                      p: 1,
                      textAlign: 'center',
                      border: '2px solid',
                      borderColor: isSelected ? 'primary.main' : 'transparent',
                      bgcolor: isSelected ? 'action.selected' : 'transparent',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        transform: 'scale(1.1)',
                        boxShadow: '0 0 12px rgba(99, 102, 241, 0.3)',
                        borderColor: isSelected ? 'primary.main' : 'divider',
                      },
                      ...(isSelected && {
                        boxShadow: '0 0 16px rgba(99, 102, 241, 0.5)',
                      })
                    }}
                  >
                    <Avatar
                      src={`/avatars/${avatar.id}.png`}
                      sx={{ width: 50, height: 50, mx: 'auto' }}
                    />
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" color="error" onClick={() => setAvatarDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color='primary' onClick={handleSaveAvatar} disabled={avatarSubmitting}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Logout</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to log out?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLogoutDialogOpen(false)} variant="contained" color='error'>No</Button>
          <Button onClick={() => { setLogoutDialogOpen(false); logout(); }} variant="contained" color="primary">Yes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Profile;
